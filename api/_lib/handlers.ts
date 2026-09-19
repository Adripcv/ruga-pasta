/**
 * 🧠 Handlers d'API purs : prennent un contexte en entrée, renvoient une
 * réponse JSON en sortie. Aucune dépendance à Vercel — les fichiers sous
 * `api/` racine ne sont que de fins adaptateurs.
 *
 * Sécurité transversale :
 * - validation stricte de tous les payloads (structure, tailles, types) ;
 * - anti-spam : honeypot + limite par empreinte IP et par téléphone ;
 * - idempotence : une clé idempotente empêche les doublons (double-clic,
 *   réseau capricieux) ;
 * - rate limit global de secours par empreinte IP sur /api/*.
 */
import {
  canTransition,
  generateOrderCode,
  isDateISO,
  isOrderStatus,
  orderingStatus,
  parisDateToUtc,
  priceCart,
  slotsForDate,
  todayParisISO,
  tomorrowParisISO,
  validateCustomer,
  type CartLineInput,
  type MenuNode,
  type StoreSettings,
} from "./domain.js";
import {
  clientKeyFromIp,
  getSettings,
  getMenuTree,
  invalidateMenuCache,
  isDbConfigured,
  serviceRole,
} from "./db.js";
import { aggregateStats } from "./stats.js";

// ---------------------------------------------------------------------------
// Réponses
// ---------------------------------------------------------------------------

export type ApiResponse = { status: number; body: unknown };

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const bad = (status: number, error: string, extra?: object): ApiResponse => ({
  status,
  body: { error, ...(extra ?? {}) },
});

// ---------------------------------------------------------------------------
// Limites anti-spam (compteurs en base — partagés entre toutes les instances)
// ---------------------------------------------------------------------------

const MAX_PER_PHONE_PER_DAY = 5;
const MAX_PER_IP_PER_HOUR = 10;
const MAX_PER_IP_PER_DAY = 30;

/** Nombre de commandes du même téléphone depuis minuit Paris. */
async function countRecentByPhone(phone: string): Promise<number> {
  const { count, error } = await serviceRole()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_phone", phone)
    .neq("status", "cancelled")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return error ? Number.MAX_SAFE_INTEGER : (count ?? 0);
}

async function countRecentByClientKey(clientKey: string, hours: number): Promise<number> {
  const { count, error } = await serviceRole()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("client_key", clientKey)
    .gte("created_at", new Date(Date.now() - hours * 3600_000).toISOString());
  return error ? Number.MAX_SAFE_INTEGER : (count ?? 0);
}

// ---------------------------------------------------------------------------
// POST /api/orders — créer une commande
// ---------------------------------------------------------------------------

export type CreateOrderInput = {
  body: unknown;
  ip: string | null;
};

export async function handleCreateOrder(
  input: CreateOrderInput,
): Promise<ApiResponse> {
  if (!isDbConfigured()) {
    // Mode démonstration (DEV_MOCK_MENU=1, uniquement en dev — jamais en
    // production, voir devMockTree) : valide le panier avec la VRAIE logique
    // de prix mais ne persiste rien.
    if (process.env.DEV_MOCK_MENU === "1" && process.env.VERCEL_ENV !== "production") {
      const mockBody = input.body as { cart?: unknown; name?: unknown } | null;
      const mockCart = Array.isArray(mockBody?.cart) ? mockBody!.cart : [];
      const priced = priceCart(devMockTree(), mockCart);
      if (!priced.ok) return bad(400, "BAD_CART", { message: priced.error });
      return ok({
        ok: true,
        code: generateOrderCode(),
        total_cents: priced.total_cents,
        pickup_at: typeof (mockBody as { pickup?: unknown })?.pickup === "string"
          ? (mockBody as { pickup: string }).pickup
          : new Date().toISOString(),
      });
    }
    return bad(503, "ORDERING_UNAVAILABLE",
      { message: "La commande en ligne arrive bientôt !" });
  }

  // Payload : taille bornée (attaques par gonflement) et forme validée.
  const body = input.body as {
    cart?: unknown;
    name?: unknown;
    phone?: unknown;
    pickup?: unknown;
    note?: unknown;
    idempotency_key?: unknown;
    website?: unknown; // honeypot
  } | null;

  if (!body || typeof body !== "object") {
    return bad(400, "BAD_PAYLOAD");
  }
  // Honeypot : champ invisible pour les humains. Rempli = robot.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    // Réponse volontairement identique à un succès pour ne rien révéler.
    return ok({ ok: true, code: generateOrderCode(), dup: true });
  }
  if (body.idempotency_key !== undefined &&
      (typeof body.idempotency_key !== "string" ||
        body.idempotency_key.length > 64 ||
        !/^[A-Za-z0-9_-]+$/.test(body.idempotency_key))) {
    return bad(400, "BAD_IDEMPOTENCY_KEY");
  }
  if (typeof body.pickup !== "string" || !isDateISO(body.pickup.slice(0, 10))) {
    return bad(400, "BAD_PICKUP");
  }

  const customer = validateCustomer(body.name, body.phone);
  if (!customer.ok) {
    return bad(400, "BAD_CUSTOMER", { message: customer.error });
  }

  // Normalisation du panier AVANT la base : structure + limites.
  if (!Array.isArray(body.cart) || body.cart.length === 0 || body.cart.length > 40) {
    return bad(400, "BAD_CART");
  }
  const cart: CartLineInput[] = [];
  for (const line of body.cart) {
    if (typeof line !== "object" || line === null) return bad(400, "BAD_CART");
    const { id, qty } = line as Record<string, unknown>;
    if (typeof id !== "string" || id.length > 60 || id.length === 0) {
      return bad(400, "BAD_CART");
    }
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      return bad(400, "BAD_CART");
    }
    cart.push({ id, qty });
  }

  // Note client : facultative, propre, bornée.
  const note =
    typeof body.note === "string"
      ? body.note.trim().slice(0, 280) || undefined
      : undefined;

  const clientKey = clientKeyFromIp(input.ip);

  // Idempotence : si cette clé a déjà produit une commande, renvoyer la même
  // réponse (jamais de doublon, jamais d'erreur déroutante).
  if (typeof body.idempotency_key === "string" && body.idempotency_key) {
    const { data: existing } = await serviceRole()
      .from("orders")
      .select("code, total_cents")
      .eq("client_key", clientKey)
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();
    if (existing) {
      return ok({ ok: true, code: existing.code, total_cents: existing.total_cents });
    }
  }

  // Anti-spam — par téléphone (les vrais clients, même IP partagée)…
  const perPhone = await countRecentByPhone(customer.phone);
  if (perPhone >= MAX_PER_PHONE_PER_DAY) {
    return bad(429, "TOO_MANY_ORDERS",
      { message: "Tu as déjà passé plusieurs commandes aujourd'hui — appelle la boutique pour en faire plus : 04 42 23 37 08." });
  }
  // …et par empreinte réseau, en filet de secours (IP partagées type 4G).
  const perHour = await countRecentByClientKey(clientKey, 1);
  if (perHour >= MAX_PER_IP_PER_HOUR) {
    return bad(429, "TOO_MANY_ORDERS", { message: "Trop de tentatives — réessaie dans une heure." });
  }
  const perDay = await countRecentByClientKey(clientKey, 24);
  if (perDay >= MAX_PER_IP_PER_DAY) {
    return bad(429, "TOO_MANY_ORDERS", { message: "Trop de tentatives — réessaie demain." });
  }

  // Créneau : l'instant exact est revalidé par la fonction SQL atomique
  // (capacité, jour fermé, délai prep) — ici on borne seulement le domaine.
  const pickupMs = Date.parse(body.pickup);
  if (!Number.isFinite(pickupMs)) return bad(400, "BAD_PICKUP");
  const now = new Date();
  if (pickupMs < now.getTime() - 60_000) return bad(400, "BAD_PICKUP", { message: "Ce créneau est déjà passé." });
  const horizon = new Date(now.getTime() + 2 * 86_400_000); // J+2 max
  if (pickupMs > horizon.getTime()) return bad(400, "BAD_PICKUP", { message: "On ne prend les commandes que pour aujourd'hui et demain." });

  // Prix : recalculés ici depuis l'arbre du menu (le client n'a pas voix au chapitre).
  const menuTree = await getMenuTree();
  const priced = priceCart(menuTree, cart);
  if (!priced.ok) {
    return bad(400, "BAD_CART", { message: priced.error });
  }

  // Dernière étape : la fonction SQL atomique (verrou de créneau + ré-insertion
  // des prix depuis la base). Tout se joue dans UNE transaction.
  const { data, error } = await serviceRole().rpc("create_order", {
    p_customer_name: customer.name,
    p_customer_phone: customer.phone,
    p_pickup_at: new Date(pickupMs).toISOString(),
    p_items: cart,
    p_note: note ?? null,
    p_client_key: clientKey,
  });

  if (error || !data) {
    console.error("create_order rpc error:", error);
    return bad(500, "ORDER_FAILED", { message: "Une erreur est survenue — réessaie ou appelle la boutique." });
  }
  if (data.error) {
    const map: Record<string, number> = {
      ORDERING_CLOSED: 409,
      CLOSED_DAY: 409,
      BAD_SLOT: 400,
      SLOT_TOO_SOON: 409,
      SLOT_FULL: 409,
      UNKNOWN_ITEM: 400,
      QTY_LIMIT: 400,
      BAD_ITEM: 400,
      EMPTY_TOTAL: 400,
      CART_TOO_BIG: 400,
      STORE_NOT_CONFIGURED: 503,
    };
    return bad(map[data.error] ?? 400, data.error, { message: data.message });
  }

  // Persistance de la clé d'idempotence (post-traitement best effort).
  if (typeof body.idempotency_key === "string" && body.idempotency_key) {
    await serviceRole()
      .from("orders")
      .update({ idempotency_key: body.idempotency_key })
      .eq("code", data.code)
      .then(null, () => undefined);
  }

  return ok({
    ok: true,
    code: data.code,
    total_cents: data.total_cents,
    pickup_at: new Date(pickupMs).toISOString(),
  });
}

// ---------------------------------------------------------------------------
// GET /api/slots?date=YYYY-MM-DD — créneaux avec capacité temps réel
// ---------------------------------------------------------------------------

export async function handleSlots(
  dateParam: string | null,
): Promise<ApiResponse> {
  if (!isDbConfigured()) {
    // Mode démo : créneaux théoriques sans capacité temps réel.
    if (process.env.DEV_MOCK_MENU === "1" && dateParam && isDateISO(dateParam)) {
      const settings: StoreSettings = {
        ordering_enabled: true,
        ordering_message: null,
        slot_minutes: 15,
        prep_delay_minutes: 20,
        open_minutes: 660,
        close_minutes: 1260,
        capacity_per_slot: 6,
        closed_weekdays: [0],
      };
      const now = new Date();
      const slots = slotsForDate(settings, dateParam, now) ?? [];
      return ok({
        date: dateParam,
        slots: slots.map((s) => ({ ...s, remaining: s.available ? 6 : 0 })),
        ordering: { open: true, message: "Mode démonstration." },
      });
    }
    return bad(503, "ORDERING_UNAVAILABLE");
  }
  if (!dateParam || !isDateISO(dateParam)) {
    return bad(400, "BAD_DATE");
  }
  const now = new Date();
  const today = todayParisISO(now);
  const tomorrow = tomorrowParisISO(now);
  if (dateParam !== today && dateParam !== tomorrow) {
    return bad(400, "DATE_OUT_OF_RANGE",
      { message: "On ne prend les commandes que pour aujourd'hui et demain." });
  }

  const settings = await getSettings();
  const slots = slotsForDate(settings, dateParam, now);
  if (!slots) return bad(400, "BAD_DATE");

  // Capacité restante par créneau (une requête, filtrée sur la fenêtre du jour).
  const dayStart = slots[0]?.startUtc;
  const dayEnd = slots[slots.length - 1]?.endUtc;
  let taken = new Map<string, number>();
  if (dayStart && dayEnd) {
    const { data, error } = await serviceRole()
      .from("orders")
      .select("pickup_at")
      .neq("status", "cancelled")
      .gte("pickup_at", dayStart)
      .lte("pickup_at", dayEnd);
    if (!error && data) {
      taken = data.reduce((map, row) => {
        const key = new Date(row.pickup_at).toISOString();
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }
  }

  const withCapacity = slots.map((slot) => {
    const used = taken.get(new Date(slot.startUtc).toISOString()) ?? 0;
    return {
      ...slot,
      available:
        slot.available && used < settings.capacity_per_slot,
      remaining: Math.max(0, settings.capacity_per_slot - used),
    };
  });

  const status = orderingStatus(settings, now);
  return ok({ date: dateParam, slots: withCapacity, ordering: status });
}

// ---------------------------------------------------------------------------
// GET /api/menu — menu public (arbre actif) + réglages affichables
// ---------------------------------------------------------------------------

/**
 * Jeu de données de développement uniquement — permet de tester le tunnel en
 * local sans Supabase. Jamais activé en production (la variable n'existe pas
 * sur Vercel ; même si elle y était, l'écriture des commandes reste bloquée
 * par `isDbConfigured()` dans `handleCreateOrder`).
 */
function devMockTree(): MenuNode[] {
  // Durcissement : le mock est réservé au développement. Sur Vercel, aucune
  // variable d'environnement n'est censée l'activer — et même si c'était le
  // cas (erreur de configuration), la production refuse ce mode.
  if (process.env.DEV_MOCK_MENU !== "1" || process.env.VERCEL_ENV === "production") {
    return [];
  }
  const item = (id: string, name: string, price_cents: number, max_qty = 1): MenuNode =>
    ({ id, name, price_cents, max_qty, children: [] });
  const group = (id: string, name: string, children: MenuNode[]): MenuNode =>
    ({ id, name, price_cents: null, max_qty: 1, children });

  // Miroir du seed SQL (la vraie carte) : sert aux tests du tunnel sans base.
  const boxChoices = (prefix: string): MenuNode[] => [
    group(`${prefix}-pates`, "Pâtes", [
      item(`${prefix}-p-fusilli`, "Fusilli", 0), item(`${prefix}-p-penne`, "Penne", 0), item(`${prefix}-p-farfalle`, "Farfalle", 0),
    ]),
    group(`${prefix}-sauces`, "Sauces", [
      item(`${prefix}-s-tomate`, "Tomate", 0), item(`${prefix}-s-bolo`, "Bolognaise", 0), item(`${prefix}-s-poulet`, "Poulet Curry", 0), item(`${prefix}-s-carbo`, "Carbonara", 0), item(`${prefix}-s-pesto`, "Pesto", 0),
    ]),
    group(`${prefix}-fromage`, "Ton fromage", [
      item(`${prefix}-f-parmesan`, "Parmesan", 0), item(`${prefix}-f-gruyere`, "Gruyère", 0), item(`${prefix}-f-mozza`, "Mozzarella râpée", 0),
    ]),
    group(`${prefix}-tops`, "Tes toppings", [
      item(`${prefix}-t-croute`, "Croûtons", 0), item(`${prefix}-t-olives`, "Olives", 0), item(`${prefix}-t-oignons`, "Oignons frits", 0),
    ]),
  ];
  const drinkDessert = (prefix: string, names: [string, string]): MenuNode[] => [
    group(`${prefix}-${names[0]}`, names[1], [
      item(`${prefix}-b-eau`, "Cristalline / San Pellegrino 50 cL", 0),
      item(`${prefix}-b-coca`, "Coca-Cola / Zéro 33 cL", 0),
      item(`${prefix}-b-soda`, "Orangina / Fuze Tea / Oasis 33 cL", 0),
      item(`${prefix}-d-cookies`, "Cookies", 0),
      item(`${prefix}-d-donut`, "Donuts", 0),
      item(`${prefix}-d-fromage`, "Fromage blanc", 0),
    ]),
  ];

  return [
    {
      id: "menu", name: "Menu", price_cents: null, max_qty: 1,
      children: [
        {
          id: "box", name: "Compose ta box", price_cents: null, max_qty: 1,
          children: [
            { id: "box-s", name: "Box S", price_cents: 650, max_qty: 10, children: boxChoices("box-s") },
            { id: "box-m", name: "Box M", price_cents: 850, max_qty: 10, children: boxChoices("box-m") },
          ],
        },
        {
          id: "formules", name: "Formules", price_cents: null, max_qty: 1,
          children: [
            { id: "f-classique-s", name: "Formule Classique S", price_cents: 790, max_qty: 10, children: [...drinkDessert("fcs", ["choix", "Boisson ou dessert inclus"]), ...boxChoices("fcs")] },
            { id: "f-classique-m", name: "Formule Classique M", price_cents: 990, max_qty: 10, children: [...drinkDessert("fcm", ["choix", "Boisson ou dessert inclus"]), ...boxChoices("fcm")] },
            { id: "f-gourmande-s", name: "Formule Gourmande S", price_cents: 990, max_qty: 10, children: [...drinkDessert("fgs", ["boisson", "Ta boisson incluse"]), ...drinkDessert("fgs2", ["dessert", "Ton dessert inclus"]), ...boxChoices("fgs")] },
            { id: "f-gourmande-m", name: "Formule Gourmande M", price_cents: 1190, max_qty: 10, children: [...drinkDessert("fgm", ["boisson", "Ta boisson incluse"]), ...drinkDessert("fgm2", ["dessert", "Ton dessert inclus"]), ...boxChoices("fgm")] },
          ],
        },
        item("salade", "Salade de pâtes de la semaine", 950, 5),
        {
          id: "boissons", name: "Boissons", price_cents: null, max_qty: 1,
          children: [item("boisson-eau", "Cristalline / San Pellegrino 50 cL", 150, 5), item("boisson-coca", "Coca-Cola / Zéro 33 cL", 200, 5), item("boisson-soda", "Orangina / Fuze Tea / Oasis 33 cL", 200, 5)],
        },
        {
          id: "desserts", name: "Desserts", price_cents: null, max_qty: 1,
          children: [item("dess-cookie", "Cookies", 300, 5), item("dess-donut", "Donuts", 300, 5), item("dess-fb", "Fromage blanc", 300, 5), item("dess-tiramisu", "Tiramisu", 400, 5)],
        },
      ],
    },
  ];
}

export async function handleMenu(): Promise<ApiResponse> {
  if (!isDbConfigured()) {
    const mock = devMockTree();
    if (mock.length > 0) {
      return ok({
        configured: true,
        tree: mock,
        ordering: { open: true, message: "Mode démonstration (DEV_MOCK_MENU) — aucune commande réelle n'est enregistrée." },
      });
    }
    return ok({ configured: false, tree: [], ordering: { open: false, message: "Bientôt disponible !" } });
  }
  const [tree, settings] = await Promise.all([getMenuTree(), getSettings()]);
  return ok({
    configured: true,
    tree,
    ordering: {
      open: settings.ordering_enabled,
      message: settings.ordering_message,
    },
  });
}

// ---------------------------------------------------------------------------
// (Intégration cuisine à venir : l'appli de gestion des commandes du
// restaurant lira directement la base — pas d'email par commande. La
// cuisine suit tout en temps réel depuis l'onglet Service du dashboard.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ADMIN — dashboard gérant (auth vérifiée côté serveur)
// ---------------------------------------------------------------------------

export type AdminContext = {
  /** JWT Supabase transmis par le front, ou null. */
  token: string | null;
};

const ALLOWED_EMAILS = (): string[] =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export type AdminRole = "admin" | "staff";

/**
 * Rôle d'un email : « admin » pour l'allowlist env (le gérant), sinon la
 * table admin_users (comptes staff créés depuis le dashboard), sinon null.
 * La base est l'autorité — jamais le client.
 */
async function resolveRole(email: string): Promise<AdminRole | null> {
  if (ALLOWED_EMAILS().includes(email)) return "admin";
  const { data, error } = await serviceRole()
    .from("admin_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();
  if (error || !data) return null;
  return data.role === "admin" ? "admin" : "staff";
}

/**
 * Vérifie le JWT côté serveur via `auth.getUser(token)` (validation
 * cryptographique par Supabase, pas un simple décodage base64 falsifiable),
 * puis résout le rôle (gérant env → admin, table admin_users sinon).
 * Fail-closed : sans configuration, tout est refusé.
 */
export async function requireAdmin(
  ctx: AdminContext,
): Promise<{ ok: true; email: string; role: AdminRole } | { ok: false; response: ApiResponse }> {
  if (!isDbConfigured()) {
    return { ok: false, response: bad(503, "ORDERING_UNAVAILABLE") };
  }
  if (!ctx.token) return { ok: false, response: bad(401, "UNAUTHORIZED") };

  const { data, error } = await serviceRole().auth.getUser(ctx.token);
  if (error || !data?.user) {
    return { ok: false, response: bad(401, "UNAUTHORIZED") };
  }
  const email = (data.user.email ?? "").toLowerCase();
  const role = await resolveRole(email);
  if (!role) {
    return { ok: false, response: bad(403, "FORBIDDEN") };
  }
  return { ok: true, email, role };
}

/** Comme requireAdmin, mais exige le rôle « admin » (gérant ou admin délégué). */
export async function requireFullAdmin(
  ctx: AdminContext,
): Promise<{ ok: true; email: string } | { ok: false; response: ApiResponse }> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth;
  if (auth.role !== "admin") {
    return { ok: false, response: bad(403, "FORBIDDEN", { message: "Réservé au gérant." }) };
  }
  return { ok: true, email: auth.email };
}

/**
 * POST /api/admin/login — connexion gérant.
 *
 * Proxy d'authentification : le navigateur ne parle JAMAIS à Supabase
 * directement (CSP `connect-src 'self'` intacte). Ordre des vérifications :
 *   1. email dans l'allowlist serveur (sinon rejet immédiat, sans fuite) ;
 *   2. mot de passe vérifié par Supabase Auth (POST /auth/v1/token) ;
 *   3. l'email du JWT renvoyé est re-vérifié côté allowlist.
 * Les tentatives par IP sont limitées en mémoire d'instance + par les rate
 * limits natifs de Supabase Auth.
 */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60_000;

/**
 * Second compteur, PAR EMAIL : bloque le martèlement d'un compte précis
 * même si l'attaquant fait tourner ses adresses IP (botnets, fermes de
 * proxies). Plafond mémoire : les clés sont des emails allowlistés ou non,
 * on purge au-delà d'un seuil raisonnable.
 */
const loginAttemptsByEmail = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS_EMAIL = 10;

export async function handleAdminLogin(
  body: unknown,
  ip: string | null,
): Promise<ApiResponse> {
  if (!isDbConfigured()) return bad(503, "ORDERING_UNAVAILABLE");

  const payload = body as { email?: unknown; password?: unknown } | null;
  if (
    !payload ||
    typeof payload.email !== "string" ||
    typeof payload.password !== "string" ||
    payload.email.length > 120 ||
    payload.password.length > 200
  ) {
    return bad(400, "BAD_PAYLOAD");
  }
  const email = payload.email.trim().toLowerCase();
  const nowMs = Date.now();

  // Rate limit IP (mémoire d'instance : un filet de plus, Supabase limite aussi).
  const key = ip ?? "unknown";
  const entry = loginAttempts.get(key);
  if (entry && entry.resetAt > nowMs && entry.count >= MAX_LOGIN_ATTEMPTS) {
    return bad(429, "TOO_MANY_ATTEMPTS",
      { message: "Trop de tentatives — réessaie dans un quart d'heure." });
  }
  if (!entry || entry.resetAt <= nowMs) {
    loginAttempts.set(key, { count: 1, resetAt: nowMs + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
  if (loginAttempts.size > 5_000) loginAttempts.clear(); // bornes mémoire

  // Rate limit par EMAIL : indépendant de l'IP (voir commentaire ci-dessus).
  // Même message que pour l'IP : aucune information utile à l'attaquant.
  const emailEntry = loginAttemptsByEmail.get(email);
  if (emailEntry && emailEntry.resetAt > nowMs && emailEntry.count >= MAX_LOGIN_ATTEMPTS_EMAIL) {
    return bad(429, "TOO_MANY_ATTEMPTS",
      { message: "Trop de tentatives — réessaie dans un quart d'heure." });
  }
  if (!emailEntry || emailEntry.resetAt <= nowMs) {
    loginAttemptsByEmail.set(email, { count: 1, resetAt: nowMs + LOGIN_WINDOW_MS });
  } else {
    emailEntry.count += 1;
  }
  if (loginAttemptsByEmail.size > 1_000) loginAttemptsByEmail.clear();

  // Rôle AVANT tout contact avec Supabase : un email sans compte (ni allowlist
  // gérant, ni ligne admin_users) ne produit aucun indice — même message et
  // même délai qu'un mauvais mot de passe.
  const preRole = await resolveRole(email);
  if (!preRole) {
    return bad(401, "INVALID_CREDENTIALS",
      { message: "Email ou mot de passe incorrect." });
  }

  const res = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: payload.password }),
    },
  );
  if (!res.ok) {
    return bad(401, "INVALID_CREDENTIALS",
      { message: "Email ou mot de passe incorrect." });
  }
  const session = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!session.access_token) return bad(502, "AUTH_FAILED");

  // Re-vérifie l'email du JWT (défense en profondeur) et résout le rôle :
  // gérant (allowlist env) → « admin », compte staff (table) → son rôle.
  const { data: userData, error: userErr } = await serviceRole()
    .auth.getUser(session.access_token);
  const tokenEmail = (userData?.user?.email ?? "").toLowerCase();
  if (userErr || !tokenEmail) {
    return bad(403, "FORBIDDEN");
  }
  const role = await resolveRole(tokenEmail);
  if (!role) {
    return bad(403, "FORBIDDEN");
  }

  return ok({
    ok: true,
    access_token: session.access_token,
    expires_in: session.expires_in ?? 3600,
    email: tokenEmail,
    role,
  });
}

/**
 * POST /api/admin/users — gestion des comptes staff (rôle admin requis).
 *   action "list"    → comptes + rôle
 *   action "create"  → { email, password, role, label? } : crée le compte
 *                      Auth (auto-confirmé) + la ligne admin_users
 *   action "delete"  → supprime compte Auth + ligne admin_users
 * Un seul endpoint : on reste sous la limite de fonctions Vercel Hobby.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function handleAdminUsers(
  ctx: AdminContext,
  body: unknown,
): Promise<ApiResponse> {
  const auth = await requireFullAdmin(ctx);
  if (!auth.ok) return auth.response;

  const payload = body as {
    action?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
    label?: unknown;
  } | null;
  if (!payload || typeof payload.action !== "string") return bad(400, "BAD_PAYLOAD");

  // ---- LIST -------------------------------------------------------------
  if (payload.action === "list") {
    const { data, error } = await serviceRole()
      .from("admin_users")
      .select("email, role, label, created_at")
      .order("created_at");
    if (error) return bad(500, "DB_ERROR");
    return ok({ users: data ?? [] });
  }

  // ---- CREATE -----------------------------------------------------------
  if (payload.action === "create") {
    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    const role = payload.role === "admin" ? "admin" : "staff";
    const label =
      typeof payload.label === "string" && payload.label.trim()
        ? payload.label.trim().slice(0, 60)
        : null;

    if (!EMAIL_RE.test(email) || email.length > 120) {
      return bad(400, "BAD_EMAIL", { message: "Adresse email invalide." });
    }
    if (password.length < 8 || password.length > 200) {
      return bad(400, "BAD_PASSWORD", {
        message: "Le mot de passe doit faire au moins 8 caractères.",
      });
    }
    // Le gérant ne se crée pas en double, un compte staff actif ne peut pas
    // être réutilisé (évite d'écraser un rôle existant par erreur).
    if (ALLOWED_EMAILS().includes(email)) {
      return bad(409, "ALREADY_EXISTS", {
        message: "Ce compte existe déjà (gérant).",
      });
    }
    const { data: existing } = await serviceRole()
      .from("admin_users")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return bad(409, "ALREADY_EXISTS", { message: "Ce compte existe déjà." });
    }

    // Compte Auth auto-confirmé (pas d'email d'activation : le mot de passe
    // est communiqué de gérant à salarié en personne).
    const created = await serviceRole().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data?.user) {
      return bad(502, "AUTH_FAILED", {
        message: "Création du compte impossible (email déjà pris côté auth ?).",
      });
    }

    const { error: insertErr } = await serviceRole()
      .from("admin_users")
      .insert({ email, role, label, created_by: auth.email });
    if (insertErr) {
      // Cohérence : si la ligne n'a pas pu être écrite, on ne laisse pas un
      // compte Auth orphelin capable de se connecter sans rôle.
      await serviceRole().auth.admin.deleteUser(created.data.user.id);
      return bad(500, "DB_ERROR");
    }
    return ok({ ok: true, email, role, label });
  }

  // ---- DELETE -----------------------------------------------------------
  if (payload.action === "delete") {
    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return bad(400, "BAD_PAYLOAD");

    // Le compte Auth porte l'id : on le retrouve pour supprimer les deux.
    let userId: string | null = null;
    let page = 1;
    for (;;) {
      const listed = await serviceRole().auth.admin.listUsers({ page, perPage: 200 });
      const found = listed.data?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === email,
      );
      if (found) {
        userId = found.id;
        break;
      }
      if (listed.data?.users && listed.data.users.length < 200) break;
      page += 1;
      if (page > 20) break; // garde-fou : 4 000 comptes max
    }
    if (userId) {
      const del = await serviceRole().auth.admin.deleteUser(userId);
      if (del.error) return bad(502, "AUTH_FAILED", { message: "Suppression du compte impossible." });
    }
    // La ligne admin_users saute aussi (le trigger ne couvre que auth.users).
    await serviceRole().from("admin_users").delete().eq("email", email);
    return ok({ ok: true });
  }

  return bad(400, "BAD_ACTION");
}

/**
 * GET (ou POST) /api/admin/menu — liste plate du menu pour le dashboard.
 * Rôle admin requis : le staff ne voit ni la carte ni les prix.
 */
export async function handleAdminMenuGet(ctx: AdminContext): Promise<ApiResponse> {
  const auth = await requireFullAdmin(ctx);
  if (!auth.ok) return auth.response;
  const { data, error } = await serviceRole()
    .from("menu_nodes")
    .select("id, parent_id, name, kind, price_cents, max_qty, is_active, sold_out")
    .order("sort_order");
  if (error) return bad(500, "DB_ERROR");
  return ok({ items: data ?? [] });
}

/**
 * GET (ou POST) /api/admin/settings — réglages courants pour le dashboard.
 * Rôle admin requis (le staff n'a pas besoin des réglages opérationnels).
 */
export async function handleAdminSettingsGet(
  ctx: AdminContext,
): Promise<ApiResponse> {
  const auth = await requireFullAdmin(ctx);
  if (!auth.ok) return auth.response;
  const settings = await getSettings();
  return ok({ settings });
}

/**
 * GET /api/admin/orders?day=YYYY-MM-DD — commandes du jour (ou d'une date).
 * Accessible au staff : c'est l'écran de service (commandes + statuts).
 * Pour le rôle staff, les montants (total + lignes) sont masqués : le CA
 * ne concerne pas la cuisine ni la salle.
 */
export async function handleAdminOrders(
  ctx: AdminContext,
  day: string | null,
): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth.response;

  const settings = await getSettings();
  const now = new Date();
  const target = day && isDateISO(day) ? day : todayParisISO(now);

  // Fenêtre [00:00, 24:00) de la date à Paris → bornes UTC.
  const start = parisDateToUtc(target, 0);
  const end = parisDateToUtc(target, 24 * 60);
  if (!start || !end) return bad(400, "BAD_DATE");

  const { data, error } = await serviceRole()
    .from("orders")
    .select("id, code, customer_name, customer_phone, pickup_at, pickup_end_at, status, total_cents, payment_status, note, created_at, order_items(name, qty, line_cents, path)")
    .gte("pickup_at", start.toISOString())
    .lt("pickup_at", end.toISOString())
    .order("pickup_at", { ascending: true });

  if (error) return bad(500, "DB_ERROR");

  // Staff : montants retirés côté serveur (pas juste cachés côté client).
  const orders =
    auth.role === "staff"
      ? (data ?? []).map((o) => ({
          ...o,
          total_cents: null,
          order_items: (o.order_items ?? []).map((it) => ({ ...it, line_cents: null })),
        }))
      : (data ?? []);

  return ok({ day: target, orders, slotCapacity: settings.capacity_per_slot, role: auth.role });
}

/** POST /api/admin/order-status — changer le statut (machine à états vérifiée). Staff OK. */
export async function handleAdminUpdateOrder(
  ctx: AdminContext,
  body: unknown,
): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth.response;

  const payload = body as { code?: unknown; status?: unknown } | null;
  if (
    !payload ||
    typeof payload.code !== "string" ||
    // Alphabets tolérés : le schéma SQL strict (sans 0/1/O/I/L) ET l'ancienne
    // fonction create_order encore présente dans certaines bases (base64 →
    // A-Z0-9). La base reste l'autorité sur le format réel des codes.
    !/^RUGA-[A-Z0-9]{4}$/.test(payload.code) ||
    !isOrderStatus(payload.status)
  ) {
    return bad(400, "BAD_PAYLOAD");
  }
  const next = payload.status;

  // Lit le statut actuel, vérifie la transition AVANT d'écrire.
  const { data: current, error: readErr } = await serviceRole()
    .from("orders")
    .select("id, status")
    .eq("code", payload.code)
    .maybeSingle();
  if (readErr || !current) return bad(404, "NOT_FOUND");
  if (!canTransition(current.status, next)) {
    return bad(409, "ILLEGAL_TRANSITION",
      { message: `Impossible : ${current.status} → ${next}.` });
  }

  const { error: writeErr } = await serviceRole()
    .from("orders")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("code", payload.code);
  if (writeErr) return bad(500, "DB_ERROR");
  return ok({ ok: true, code: payload.code, status: next });
}

/** GET /api/admin/stats?days=N — analytics riches (rôle admin uniquement). */
export async function handleAdminStats(
  ctx: AdminContext,
  daysParam: string | null,
): Promise<ApiResponse> {
  const auth = await requireFullAdmin(ctx);
  if (!auth.ok) return auth.response;

  const days = Math.min(Math.max(Number(daysParam ?? 7) || 7, 1), 90);
  const now = new Date();
  // Deux périodes (courante + précédente) en une requête : les tendances
  // ↗ ↘ comparent toujours des durées identiques.
  const since = new Date(now.getTime() - 2 * days * 86_400_000).toISOString();

  const { data, error } = await serviceRole()
    .from("orders")
    .select("created_at, pickup_at, status, total_cents, order_items(name, qty, line_cents)")
    .gte("created_at", since);

  if (error) return bad(500, "DB_ERROR");

  return ok(
    aggregateStats(
      (data ?? []) as never,
      days,
      now,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*  CARTE — CRUD complet (prix/rupture/activation, création, renommage,       */
/*  réordonnancement, suppression). Une seule endpoint POST /api/admin/menu   */
/*  avec un champ `action` : reste sous la limite de fonctions Vercel.        */
/* -------------------------------------------------------------------------- */

/** Identifiant technique dérivé du nom (slug ASCII) + suffixe unique court. */
function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "noeud"}-${suffix}`;
}

/**
 * POST /api/admin/menu
 * actions :
 *  - { action?: "update", id, price_cents?, sold_out?, is_active? }
 *  - { action: "create", parent_id, name, price_cents, max_qty? }
 *  - { action: "rename", id, name }
 *  - { action: "delete", id }            (refusé si des commandes y réfèrent)
 *  - { action: "reorder", id, sort_order }
 *  - { action: "toggle_sold_out_section", id, sold_out }  (section + descendants)
 */
export async function handleAdminMenuUpdate(
  ctx: AdminContext,
  body: unknown,
): Promise<ApiResponse> {
  const auth = await requireFullAdmin(ctx);
  if (!auth.ok) return auth.response;

  const payload = body as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") return bad(400, "BAD_PAYLOAD");
  const action = typeof payload.action === "string" ? payload.action : "update";
  const id = typeof payload.id === "string" ? payload.id.slice(0, 60) : "";

  // ---- update (prix / rupture / activation) -------------------------------
  if (action === "update") {
    if (!id) return bad(400, "BAD_PAYLOAD");
    const patch: Record<string, unknown> = {};
    if (payload.price_cents !== undefined) {
      if (
        typeof payload.price_cents !== "number" ||
        !Number.isInteger(payload.price_cents) ||
        payload.price_cents < 0 ||
        payload.price_cents > 10_000
      ) {
        return bad(400, "BAD_PRICE");
      }
      patch.price_cents = payload.price_cents;
    }
    if (payload.sold_out !== undefined) {
      if (typeof payload.sold_out !== "boolean") return bad(400, "BAD_PAYLOAD");
      patch.sold_out = payload.sold_out;
    }
    if (payload.is_active !== undefined) {
      if (typeof payload.is_active !== "boolean") return bad(400, "BAD_PAYLOAD");
      patch.is_active = payload.is_active;
    }
    if (Object.keys(patch).length === 0) return bad(400, "NOTHING_TO_UPDATE");

    const { error } = await serviceRole()
      .from("menu_nodes")
      .update(patch)
      .eq("id", id);
    if (error) return bad(500, "DB_ERROR");
    invalidateMenuCache();
    return ok({ ok: true });
  }

  // ---- create (nouveau produit ou groupe) ---------------------------------
  if (action === "create") {
    const parent = typeof payload.parent_id === "string" ? payload.parent_id.slice(0, 60) : "";
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 80) : "";
    const price = payload.price_cents;
    const maxQty = payload.max_qty;
    if (!parent || name.length < 2) return bad(400, "BAD_PAYLOAD");
    if (
      typeof price !== "number" ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > 10_000
    ) {
      return bad(400, "BAD_PRICE");
    }
    if (
      typeof maxQty !== "undefined" &&
      (typeof maxQty !== "number" || !Number.isInteger(maxQty) || maxQty < 1 || maxQty > 20)
    ) {
      return bad(400, "BAD_PAYLOAD");
    }

    // Le parent doit exister ; position = max(sort_order) des frères + 10.
    const { data: parentRow, error: parentErr } = await serviceRole()
      .from("menu_nodes")
      .select("id, kind")
      .eq("id", parent)
      .maybeSingle();
    if (parentErr) return bad(500, "DB_ERROR");
    if (!parentRow) return bad(404, "PARENT_NOT_FOUND");

    const { data: siblings } = await serviceRole()
      .from("menu_nodes")
      .select("sort_order")
      .eq("parent_id", parent)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((siblings?.[0]?.sort_order as number) ?? 0) + 10;

    const kind = price === 0 || typeof price === "number" ? "item" : "item";
    const { error } = await serviceRole().from("menu_nodes").insert({
      id: slugify(name),
      parent_id: parent,
      name,
      kind,
      price_cents: price,
      max_qty: typeof maxQty === "number" ? maxQty : 5,
      sort_order: nextOrder,
    });
    if (error) return bad(500, "DB_ERROR", { message: error.message });
    invalidateMenuCache();
    return ok({ ok: true });
  }

  // ---- rename -------------------------------------------------------------
  if (action === "rename") {
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 80) : "";
    if (!id || name.length < 2) return bad(400, "BAD_PAYLOAD");
    const { error } = await serviceRole()
      .from("menu_nodes")
      .update({ name })
      .eq("id", id);
    if (error) return bad(500, "DB_ERROR");
    invalidateMenuCache();
    return ok({ ok: true });
  }

  // ---- reorder (flèches ↑ ↓ du dashboard) ---------------------------------
  if (action === "reorder") {
    const sortOrder = payload.sort_order;
    if (!id || typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9_999) {
      return bad(400, "BAD_PAYLOAD");
    }
    const { error } = await serviceRole()
      .from("menu_nodes")
      .update({ sort_order: sortOrder })
      .eq("id", id);
    if (error) return bad(500, "DB_ERROR");
    invalidateMenuCache();
    return ok({ ok: true });
  }

  // ---- toggle rupture d'une SECTION entière (ex. tous les desserts) -------
  if (action === "toggle_sold_out_section") {
    const soldOut = payload.sold_out;
    if (!id || typeof soldOut !== "boolean") return bad(400, "BAD_PAYLOAD");
    // RLS n'est pas en jeu (service_role) : mise à jour récursive via une
    // lecture des descendants puis update in (...).
    const { data: all, error: readErr } = await serviceRole()
      .from("menu_nodes")
      .select("id, parent_id");
    if (readErr || !all) return bad(500, "DB_ERROR");
    const childrenOf = new Map<string | null, string[]>();
    for (const row of all as { id: string; parent_id: string | null }[]) {
      const key = row.parent_id ?? "";
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), row.id]);
    }
    const descendants: string[] = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      descendants.push(current);
      for (const child of childrenOf.get(current) ?? []) stack.push(child);
    }
    const { error } = await serviceRole()
      .from("menu_nodes")
      .update({ sold_out: soldOut })
      .in("id", descendants);
    if (error) return bad(500, "DB_ERROR");
    invalidateMenuCache();
    return ok({ ok: true, affected: descendants.length });
  }

  // ---- delete (refusé si l'historique des commandes y réfère) -------------
  if (action === "delete") {
    if (!id) return bad(400, "BAD_PAYLOAD");
    if (id === "menu") return bad(400, "PROTECTED_NODE");
    const { count, error: countErr } = await serviceRole()
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("node_id", id);
    if (countErr) return bad(500, "DB_ERROR");
    if ((count ?? 0) > 0) {
      return bad(409, "IN_USE",
        { message: "Des commandes passées référencent cet article — désactive-le plutôt (il disparaîtra du tunnel)." });
    }
    // Enfants d'abord (cascade SQL existe, mais on garde le contrôle).
    await serviceRole().from("menu_nodes").delete().eq("parent_id", id);
    const { error } = await serviceRole().from("menu_nodes").delete().eq("id", id);
    if (error) return bad(500, "DB_ERROR");
    invalidateMenuCache();
    return ok({ ok: true });
  }

  return bad(400, "UNKNOWN_ACTION");
}

/** POST /api/admin/settings — réglages opérationnels. */
export async function handleAdminSettingsUpdate(
  ctx: AdminContext,
  body: unknown,
): Promise<ApiResponse> {
  const auth = await requireFullAdmin(ctx);
  if (!auth.ok) return auth.response;

  const payload = body as Partial<
    Pick<
      StoreSettings,
      | "ordering_enabled"
      | "ordering_message"
      | "slot_minutes"
      | "prep_delay_minutes"
      | "open_minutes"
      | "close_minutes"
      | "capacity_per_slot"
      | "closed_weekdays"
    >
  > | null;

  if (!payload || typeof payload !== "object") return bad(400, "BAD_PAYLOAD");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const intChecks: [string, number, number][] = [
    ["slot_minutes", 5, 60],
    ["prep_delay_minutes", 0, 240],
    ["open_minutes", 0, 1439],
    ["close_minutes", 1, 1440],
    ["capacity_per_slot", 1, 100],
  ];
  for (const [key, min, max] of intChecks) {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        return bad(400, "BAD_SETTING");
      }
      patch[key] = value;
    }
  }
  if (payload.ordering_enabled !== undefined) {
    if (typeof payload.ordering_enabled !== "boolean") return bad(400, "BAD_SETTING");
    patch.ordering_enabled = payload.ordering_enabled;
  }
  if (payload.ordering_message !== undefined) {
    if (typeof payload.ordering_message !== "string" || payload.ordering_message.length > 200) {
      return bad(400, "BAD_SETTING");
    }
    patch.ordering_message = payload.ordering_message.trim() || null;
  }
  if (payload.closed_weekdays !== undefined) {
    if (
      !Array.isArray(payload.closed_weekdays) ||
      !payload.closed_weekdays.every(
        (d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
      ) ||
      payload.closed_weekdays.length > 7
    ) {
      return bad(400, "BAD_SETTING");
    }
    patch.closed_weekdays = payload.closed_weekdays;
  }

  const { error } = await serviceRole()
    .from("store_settings")
    .update(patch)
    .eq("id", 1);
  if (error) return bad(500, "DB_ERROR");
  return ok({ ok: true });
}
