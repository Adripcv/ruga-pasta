/**
 * 🔐 Accès base de données côté SERVEUR uniquement.
 *
 * - `serviceRole()` : client admin (contourne le RLS par design) — ne JAMAIS
 *   importer depuis le front. Vercel injecte les variables d'environnement
 *   serveur ; en local, le `.env` fait le travail.
 * - Le navigateur ne parle JAMAIS à Supabase directement : grâce au RLS
 *   deny-all (voir supabase/schema.sql), il passe par nos fonctions API,
 *   qui font la médiation et valident tout.
 *
 * ⚠️ Aucune clé n'est lue depuis `import.meta.env` (exposé au client) :
 * uniquement `process.env`, absent du bundle front.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MenuNode, StoreSettings } from "./domain.js";

let cachedService: SupabaseClient | null = null;

/** Client `service_role` (singleton). Lance une erreur claire si mal configuré. */
export function serviceRole(): SupabaseClient {
  if (cachedService) return cachedService;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase non configuré : définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY " +
        "(voir .env.example).",
    );
  }
  cachedService = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedService;
}

/** Vrai si les variables Supabase sont présentes (mode dégradé sinon). */
export function isDbConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// ---------------------------------------------------------------------------
// Réglages du magasin
// ---------------------------------------------------------------------------

/** Réglages par défaut — utilisés si la base n'est pas encore configurée. */
export const DEFAULT_SETTINGS: StoreSettings = {
  ordering_enabled: false, // fail-closed : jusqu'à configuration, pas de commande
  ordering_message:
    "La commande en ligne arrive très bientôt ! En attendant : Uber Eats ou 04 42 23 37 08.",
  slot_minutes: 15,
  prep_delay_minutes: 20,
  open_minutes: 660,
  close_minutes: 1260,
  capacity_per_slot: 6,
  closed_weekdays: [0],
};

/** Lit les réglages ; retombe sur les défauts (commande fermée) si absents. */
export async function getSettings(): Promise<StoreSettings> {
  if (!isDbConfigured()) return DEFAULT_SETTINGS;
  const { data, error } = await serviceRole()
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return {
    ordering_enabled: data.ordering_enabled,
    ordering_message: data.ordering_message,
    slot_minutes: data.slot_minutes,
    prep_delay_minutes: data.prep_delay_minutes,
    open_minutes: data.open_minutes,
    close_minutes: data.close_minutes,
    capacity_per_slot: data.capacity_per_slot,
    closed_weekdays: data.closed_weekdays ?? [],
  };
}

// ---------------------------------------------------------------------------
// Menu — arbre complet (cache mémoire de 60 s : le menu change rarement,
// et chaque requête API ne doit pas payer un aller-retour base)
// ---------------------------------------------------------------------------

let menuCache: { tree: MenuNode[]; at: number } | null = null;
const MENU_TTL_MS = 60_000;

export function invalidateMenuCache(): void {
  menuCache = null;
}

type DbNode = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  price_cents: number | null;
  max_qty: number;
  sort_order: number;
  is_active: boolean;
  sold_out: boolean;
};

/** Reconstruit l'arbre à plat → récursif (les enfants suivent sort_order). */
function buildTree(rows: DbNode[]): MenuNode[] {
  const byParent = new Map<string, DbNode[]>();
  for (const row of rows) {
    const key = row.parent_id ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(row);
  }
  const sort = (nodes: DbNode[]) =>
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const walk = (parentId: string | null): MenuNode[] =>
    sort(byParent.get(parentId ?? "") ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      price_cents: row.price_cents,
      max_qty: row.max_qty,
      children: walk(row.id),
    }));

  return walk(null);
}

/** Arbre du menu ACTIF (is_active, et parents actifs). Cache 60 s. */
export async function getMenuTree(): Promise<MenuNode[]> {
  if (menuCache && Date.now() - menuCache.at < MENU_TTL_MS) {
    return menuCache.tree;
  }
  const { data, error } = await serviceRole()
    .from("menu_nodes")
    .select(
      "id, parent_id, name, kind, price_cents, max_qty, sort_order, is_active, sold_out",
    );
  if (error || !data) throw new Error("Lecture du menu impossible.");
  const tree = buildTree(data as DbNode[]);
  menuCache = { tree, at: Date.now() };
  return tree;
}

// ---------------------------------------------------------------------------
// Anti-spam : empreinte client
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

/**
 * Empreinte IP hachée avec sel serveur : permet de compter les commandes par
 * client réseau (anti-spam) sans stocker d'IP lisible (RGPD : donnée
 * pseudonymisée, jamais réversible sans le sel — qui ne quitte pas le serveur).
 */
export function clientKeyFromIp(ip: string | null): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "ruga-dev-salt";
  return createHash("sha256").update(`${salt}:${ip ?? "unknown"}`).digest("hex");
}
