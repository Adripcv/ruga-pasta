/**
 * 🇫🇷 Logique métier pure du click & collect — AUCUNE dépendance (ni Supabase,
 * ni Node) : tout est calculé à partir de données en entrée. C'est ce qui
 * permet de la tester à 100 % avec Vitest sans mocks, et de la partager entre
 * l'API serveur et le front.
 *
 * Règle d'or : le client n'envoie que des {id, qty}. Les PRIX sont recalculés
 * ici, côté serveur, à partir de l'arbre du menu fourni par la base — un
 * client falsifié ne peut rien changer au montant.
 */

// ---------------------------------------------------------------------------
// Types partagés
// ---------------------------------------------------------------------------

/** Noeud du menu (produit OU groupe). Récursif : une formule contient des choix. */
export type MenuNode = {
  id: string;
  name: string;
  /** Prix unitaire en centimes ; `null` = noeud de regroupement (non commandable). */
  price_cents: number | null;
  /** Quantité maximale par ligne (1 = option binaire type « sauce »). */
  max_qty: number;
  children: MenuNode[];
};

/** Ligne de panier envoyée par le client : uniquement des références. */
export type CartLineInput = { id: string; qty: number };

/** Ligne prix calculée côté serveur. */
export type PricedLine = {
  id: string;
  /** Chemin lisible pour le ticket : ex. ["Compose ta box", "Sauce", "Pesto"]. */
  path: string[];
  unit_cents: number;
  qty: number;
  line_cents: number;
};

/** Réglages opérationnels du click & collect (table `settings`, 1 ligne). */
export type StoreSettings = {
  /** Le click & collect est-il ouvert à la prise de commande ? */
  ordering_enabled: boolean;
  /** Motif d'affichage quand `ordering_enabled = false` (vacances, panne…). */
  ordering_message: string | null;
  /** Durée d'un créneau de retrait, en minutes. */
  slot_minutes: number;
  /** Délai minimum avant le premier créneau réservable (préparation), en minutes. */
  prep_delay_minutes: number;
  /** Ouverture de la boutique, minutes depuis minuit (heure de Paris). */
  open_minutes: number;
  /** Fermeture de la boutique, minutes depuis minuit (heure de Paris). */
  close_minutes: number;
  /** Commandes acceptées simultanément sur un créneau. */
  capacity_per_slot: number;
  /** Jours de fermeture hebdomadaire — index JS of `Date.getDay()` (0 = dimanche). */
  closed_weekdays: number[];
  /** Email de notification du gérant (facultatif, lu pour les emails). */
  admin_notify_email: string | null;
};

export type PriceResult =
  | { ok: true; lines: PricedLine[]; total_cents: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Argent
// ---------------------------------------------------------------------------

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

/** 650 → « 6,50 € » (centimes → texte affichable). */
export function formatEuros(cents: number): string {
  return EUR.format(cents / 100);
}

// ---------------------------------------------------------------------------
// Créneaux — fuseau Europe/Paris
// ---------------------------------------------------------------------------

/**
 * Décalage de Paris par rapport à UTC, en minutes, pour l'instant donné.
 * Règles UE : dernier dimanche de mars à 01:00 UTC → +120 (CEST) ;
 * dernier dimanche d'octobre à 01:00 UTC → +60 (CET). Testé avec des dates
 * autour des transitions (voir domain.test.ts) — jamais de dérive d'une heure.
 */
export function parisOffsetMinutes(date: Date): number {
  const year = date.getUTCFullYear();

  // Dernier dimanche de mars : 31 mars moins son index de jour (0=dimanche).
  const marchRef = new Date(Date.UTC(year, 2, 31));
  const lastSundayMarch = 31 - marchRef.getUTCDay();
  const summerStart = Date.UTC(year, 2, lastSundayMarch, 1, 0);

  const octRef = new Date(Date.UTC(year, 9, 31));
  const lastSundayOctober = 31 - octRef.getUTCDay();
  const winterStart = Date.UTC(year, 9, lastSundayOctober, 1, 0);

  const t = date.getTime();
  return t >= summerStart && t < winterStart ? 120 : 60;
}

/** `true` si `dateISO` respecte strictement le format « YYYY-MM-DD ». */
export function isDateISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Convertit « minuit à Paris le `dateISO`, plus `minutes` » en instant UTC.
 * `null` si la date est mal formée ou impossible (2024-02-31…).
 */
export function parisDateToUtc(
  dateISO: string,
  minutes: number,
): Date | null {
  if (!isDateISO(dateISO)) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  // Garde-fous calendaires : 31/02, mois 13, etc. seraient silencieusement
  // normalisés par Date — on refuse au lieu de décaler la commande d'un mois.
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  const offset = parisOffsetMinutes(probe);
  return new Date(probe.getTime() - offset * 60_000 + minutes * 60_000);
}

/**
 * Jour de la semaine (index `getDay()`, 0 = dimanche) du `dateISO` — c'est le
 * jour CALENDRIER à Paris, indépendant de l'heure système du serveur (qui est
 * en UTC sur Vercel).
 */
export function parisWeekday(dateISO: string): number | null {
  if (!isDateISO(dateISO)) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Date « YYYY-MM-DD » du jour à Paris pour l'instant `now`. */
export function todayParisISO(now: Date): string {
  const offset = parisOffsetMinutes(now);
  const shifted = new Date(now.getTime() + offset * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Date « YYYY-MM-DD » de demain à Paris (passe correctement les fins de mois). */
export function tomorrowParisISO(now: Date): string {
  const offset = parisOffsetMinutes(now);
  const shifted = new Date(now.getTime() + offset * 60_000 + 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

export type Slot = {
  /** « HH:MM » heure de Paris — affiché tel quel au client. */
  label: string;
  dateISO: string;
  startUtc: string;
  endUtc: string;
  available: boolean;
  reason: "past" | "prep-delay" | "closed-day" | "closed-now" | null;
};

function labelFromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Tous les créneaux théoriques d'une journée, avec leur disponibilité.
 * La capacité temps réel est recoupée ensuite par l'API (base de données) —
 * cette fonction ne voit que le temps et les réglages, elle reste pure.
 */
export function slotsForDate(
  settings: StoreSettings,
  dateISO: string,
  now: Date,
): Slot[] | null {
  if (!isDateISO(dateISO)) return null;

  const weekday = parisWeekday(dateISO);
  if (weekday === null) return null;

  const closedDay = settings.closed_weekdays.includes(weekday);

  const slots: Slot[] = [];
  for (
    let start = settings.open_minutes;
    start + settings.slot_minutes <= settings.close_minutes;
    start += settings.slot_minutes
  ) {
    const startUtc = parisDateToUtc(dateISO, start);
    const endUtc = parisDateToUtc(dateISO, start + settings.slot_minutes);
    if (!startUtc || !endUtc) continue;

    let available = true;
    let reason: Slot["reason"] = null;

    if (closedDay) {
      available = false;
      reason = "closed-day";
    } else if (endUtc.getTime() <= now.getTime()) {
      available = false;
      reason = "past";
    } else if (
      startUtc.getTime() - now.getTime() <
      settings.prep_delay_minutes * 60_000
    ) {
      // Délai de préparation : on ne promet pas un retrait plus tôt que le
      // temps nécessaire en cuisine.
      available = false;
      reason = "prep-delay";
    }

    slots.push({
      label: labelFromMinutes(start),
      dateISO,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      available,
      reason,
    });
  }
  return slots;
}

/**
 * Le click & collect accepte-t-il des commandes À CET INSTANT ?
 * Combine : interrupteur manuel, jour de fermeture, fenêtre d'ouverture.
 * Les boutons du site s'appuient dessus pour se griser avec le bon message.
 */
export function orderingStatus(
  settings: StoreSettings,
  now: Date,
): { open: boolean; message: string } {
  if (!settings.ordering_enabled) {
    return {
      open: false,
      message: settings.ordering_message?.trim() ||
        "La commande en ligne est momentanément fermée.",
    };
  }
  const today = todayParisISO(now);
  const weekday = parisWeekday(today);
  if (weekday !== null && settings.closed_weekdays.includes(weekday)) {
    return {
      open: false,
      message: "Fermé aujourd'hui — la commande en ligne reprend au prochain service.",
    };
  }
  const openAt = parisDateToUtc(today, settings.open_minutes);
  const closeAt = parisDateToUtc(today, settings.close_minutes);
  if (!openAt || !closeAt) {
    return { open: false, message: "Horaires indisponibles." };
  }
  if (now < openAt) {
    return {
      open: false,
      message: `La commande en ligne ouvre à ${labelFromMinutes(settings.open_minutes)}.`,
    };
  }
  if (now >= closeAt) {
    return { open: false, message: "Service terminé — à demain !" };
  }
  return { open: true, message: "" };
}

// ---------------------------------------------------------------------------
// Panier & prix — recalculés côté serveur
// ---------------------------------------------------------------------------

/** Indexe l'arbre du menu par id, avec le chemin de groupes pour le ticket. */
function indexMenu(
  nodes: MenuNode[],
  ancestry: string[],
  index: Map<string, { node: MenuNode; path: string[] }>,
): void {
  for (const node of nodes) {
    index.set(node.id, { node, path: [...ancestry, node.name] });
    if (node.children.length > 0) {
      indexMenu(node.children, [...ancestry, node.name], index);
    }
  }
}

/**
 * Recalcule le panier complet depuis le menu de référence.
 * Refuse (avec une erreur claire) : id inconnu, noeud non commandable,
 * quantité invalide, ou dépassement de `max_qty`.
 */
export function priceCart(
  menuTree: MenuNode[],
  cart: unknown,
): PriceResult {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { ok: false, error: "Panier vide." };
  }
  if (cart.length > 40) {
    return { ok: false, error: "Panier trop volumineux." };
  }

  const index = new Map<string, { node: MenuNode; path: string[] }>();
  indexMenu(menuTree, [], index);

  const lines: PricedLine[] = [];
  for (const raw of cart) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("id" in raw) ||
      !("qty" in raw)
    ) {
      return { ok: false, error: "Ligne de panier invalide." };
    }
    const { id, qty } = raw as { id: unknown; qty: unknown };
    if (typeof id !== "string" || typeof qty !== "number" ||
      !Number.isInteger(qty) || qty < 1 || qty > 20) {
      return { ok: false, error: "Ligne de panier invalide." };
    }
    const entry = index.get(id);
    if (!entry) {
      return { ok: false, error: `Article inconnu : ${id.slice(0, 40)}.` };
    }
    if (entry.node.price_cents === null) {
      return { ok: false, error: `Article non commandable : ${entry.node.name}.` };
    }
    if (qty > entry.node.max_qty) {
      return {
        ok: false,
        error: `Quantité maximale atteinte pour ${entry.node.name} (${entry.node.max_qty}).`,
      };
    }
    lines.push({
      id: entry.node.id,
      path: entry.path,
      unit_cents: entry.node.price_cents,
      qty,
      line_cents: entry.node.price_cents * qty,
    });
  }

  const total_cents = lines.reduce((sum, line) => sum + line.line_cents, 0);
  // Garde-fou anti-erreur : un panier à 0 € n'a pas de sens (article gratuit
  // mal configuré) — on refuse plutôt que d'émettre une commande fantôme.
  if (total_cents <= 0) {
    return { ok: false, error: "Total invalide." };
  }
  return { ok: true, lines, total_cents };
}

// ---------------------------------------------------------------------------
// Coordonnées client
// ---------------------------------------------------------------------------

/**
 * Normalise un numéro FR : « 06 12 34 56 78 », « +33612345678 »,
 * « 0033612345678 » → « +33612345678 ». `null` si ce n'est pas un numéro
 * français valide (mobile ou fixe — le gérant rappelle peut-être un fixe).
 */
export function normalizeFrenchPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s.\-()]/g, "");
  let national: string | null = null;

  if (/^0\d{9}$/.test(digits)) {
    national = digits;
  } else if (/^\+33\d{9}$/.test(digits)) {
    national = "0" + digits.slice(3);
  } else if (/^0033\d{9}$/.test(digits)) {
    national = "0" + digits.slice(4);
  }
  if (!national || !/^[1-9]/.test(national[1])) return null;
  return "+33" + national.slice(1);
}

const NAME_RE = /^[\p{L}\p{M}' -]{2,60}$/u;

/** Valide nom + téléphone ; renvoie la version propre ou une erreur lisible. */
export function validateCustomer(
  name: unknown,
  phone: unknown,
): { ok: true; name: string; phone: string } | { ok: false; error: string } {
  if (typeof name !== "string") return { ok: false, error: "Nom manquant." };
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(cleanName)) {
    return { ok: false, error: "Nom invalide (2 à 60 lettres)." };
  }
  const cleanPhone = normalizeFrenchPhone(phone);
  if (!cleanPhone) {
    return { ok: false, error: "Numéro de téléphone français invalide." };
  }
  return { ok: true, name: cleanName, phone: cleanPhone };
}

// ---------------------------------------------------------------------------
// Statuts de commande — machine à états
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "new",
  "preparing",
  "ready",
  "picked_up",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Transitions autorisées. Une fois une commande « récupérée », elle est
 * figée ; une commande annulée ne repart jamais. Toute autre transition est
 * refusée côté serveur (l'interface ne montre que les boutons légaux, mais on
 * ne fait JAMAIS confiance à l'interface).
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O/1/I/L : lisibles dictées au téléphone

/**
 * Code commande lisible (ex. « RUGA-7K2M ») — le gérant l'appelle au moment
 * du retrait. `rand` injecté : les tests sont déterministes.
 */
export function generateOrderCode(rand: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return `RUGA-${suffix}`;
}
