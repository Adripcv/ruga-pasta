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
  formatEuros,
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
  type PricedLine,
  type StoreSettings,
} from "./domain";
import {
  clientKeyFromIp,
  getSettings,
  getMenuTree,
  invalidateMenuCache,
  isDbConfigured,
  serviceRole,
} from "./db";

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
    // Mode démonstration (DEV_MOCK_MENU=1, uniquement en dev) : valide le
    // panier avec la VRAIE logique de prix mais ne persiste rien.
    if (process.env.DEV_MOCK_MENU === "1") {
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

  // Emails : hors chemin critique — une panne Resend ne doit pas invalider
  // une commande déjà validée par la base.
  void notifyNewOrder({
    code: data.code,
    name: customer.name,
    phone: customer.phone,
    pickupMs,
    total_cents: data.total_cents,
    lines: priced.lines,
    note,
  }).catch((err) => console.error("notifyNewOrder:", err));

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
        admin_notify_email: null,
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
  if (process.env.DEV_MOCK_MENU !== "1") return [];
  const item = (id: string, name: string, price_cents: number, max_qty = 1): MenuNode =>
    ({ id, name, price_cents, max_qty, children: [] });
  return [
    {
      id: "menu", name: "Menu", price_cents: null, max_qty: 1,
      children: [
        {
          id: "box", name: "Compose ta box", price_cents: null, max_qty: 1,
          children: [
            {
              id: "box-s", name: "Box S", price_cents: 650, max_qty: 10,
              children: [
                { id: "pates", name: "Pâtes", price_cents: null, max_qty: 1, children: [item("pates-fusilli", "Fusilli", 0), item("pates-penne", "Penne", 0), item("pates-farfalle", "Farfalle", 0)] },
                { id: "sauces", name: "Sauces", price_cents: null, max_qty: 1, children: [item("sauce-tomate", "Tomate", 0), item("sauce-bolo", "Bolognaise", 0), item("sauce-carbo", "Carbonara", 0), item("sauce-pesto", "Pesto", 0)] },
              ],
            },
            { id: "box-m", name: "Box M", price_cents: 850, max_qty: 10, children: [] },
          ],
        },
        {
          id: "formules", name: "Formules", price_cents: null, max_qty: 1,
          children: [item("f-classique-s", "Formule Classique S", 790, 10), item("f-classique-m", "Formule Classique M", 990, 10), item("f-gourmande-s", "Formule Gourmande S", 990, 10), item("f-gourmande-m", "Formule Gourmande M", 1190, 10)],
        },
        item("salade", "Salade de pâtes de la semaine", 950, 5),
        {
          id: "boissons", name: "Boissons", price_cents: null, max_qty: 1,
          children: [item("boisson-eau", "Cristalline / San Pellegrino 50cL", 150, 5), item("boisson-coca", "Coca-Cola / Zéro 33cL", 200, 5), item("boisson-soda", "Orangina / Fuze Tea / Oasis 33cL", 200, 5)],
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
// Emails (Resend) — le gérant reçoit chaque commande. Le client, lui, n'a
// pas d'email à donner (nom + téléphone seulement, RGPD minimal) : sa
// confirmation est l'écran de fin de tunnel avec son numéro de commande.
// ---------------------------------------------------------------------------

type OrderNotification = {
  code: string;
  name: string;
  phone: string;
  pickupMs: number;
  total_cents: number;
  lines: PricedLine[];
  note?: string;
};

function pickupLabel(pickupMs: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(pickupMs));
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "Ruga Pasta <onboarding@resend.dev>";
  if (!key) {
    console.log(`[email sauté — pas de RESEND_API_KEY] à=${to} sujet=${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function notifyNewOrder(order: OrderNotification): Promise<void> {
  const settings = await getSettings();
  const lines = order.lines
    .map((l) => `<li>${l.qty} × ${l.path.join(" › ")} — ${formatEuros(l.line_cents)}</li>`)
    .join("");
  const noteHtml = order.note
    ? `<p><em>Note : ${order.note.replace(/</g, "&lt;")}</em></p>`
    : "";

  // 1. Le gérant.
  const to = settings.admin_notify_email ?? process.env.ADMIN_EMAILS?.split(",")[0];
  if (to) {
    await sendEmail(
      to,
      `🍽️ Commande ${order.code} — ${formatEuros(order.total_cents)} — retrait ${pickupLabel(order.pickupMs)}`,
      `<h2>Commande ${order.code}</h2>
       <p><strong>${order.name}</strong> — <a href="tel:${order.phone}">${order.phone}</a></p>
       <p>Retrait : <strong>${pickupLabel(order.pickupMs)}</strong></p>
       <ul>${lines}</ul>
       <p><strong>Total : ${formatEuros(order.total_cents)}</strong> — à régler en boutique au retrait.</p>
       ${noteHtml}`,
    );
  }

}

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

/**
 * Vérifie le JWT côté serveur via `auth.getUser(token)` (validation
 * cryptographique par Supabase, pas un simple décodage base64 falsifiable),
 * puis l'email allowlist. Fail-closed : sans configuration, tout est refusé.
 */
export async function requireAdmin(
  ctx: AdminContext,
): Promise<{ ok: true; email: string } | { ok: false; response: ApiResponse }> {
  if (!isDbConfigured()) {
    return { ok: false, response: bad(503, "ORDERING_UNAVAILABLE") };
  }
  if (!ctx.token) return { ok: false, response: bad(401, "UNAUTHORIZED") };

  const { data, error } = await serviceRole().auth.getUser(ctx.token);
  if (error || !data?.user) {
    return { ok: false, response: bad(401, "UNAUTHORIZED") };
  }
  const email = (data.user.email ?? "").toLowerCase();
  if (!ALLOWED_EMAILS().includes(email)) {
    return { ok: false, response: bad(403, "FORBIDDEN") };
  }
  return { ok: true, email };
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

  // Rate limit IP (mémoire d'instance : un filet de plus, Supabase limite aussi).
  const key = ip ?? "unknown";
  const nowMs = Date.now();
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

  // Allowlist AVANT tout contact avec Supabase : un email hors liste ne
  // produit aucun indice (même message et même délai qu'un mauvais mot de passe).
  if (!ALLOWED_EMAILS().includes(email)) {
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

  // Re-vérifie l'email du JWT (défense en profondeur).
  const { data: userData, error: userErr } = await serviceRole()
    .auth.getUser(session.access_token);
  const tokenEmail = (userData?.user?.email ?? "").toLowerCase();
  if (userErr || !tokenEmail || !ALLOWED_EMAILS().includes(tokenEmail)) {
    return bad(403, "FORBIDDEN");
  }

  return ok({
    ok: true,
    access_token: session.access_token,
    expires_in: session.expires_in ?? 3600,
    email: tokenEmail,
  });
}

/** GET /api/admin/menu — liste plate du menu pour le dashboard. */
export async function handleAdminMenuGet(ctx: AdminContext): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth.response;
  const { data, error } = await serviceRole()
    .from("menu_nodes")
    .select("id, parent_id, name, kind, price_cents, max_qty, is_active, sold_out")
    .order("sort_order");
  if (error) return bad(500, "DB_ERROR");
  return ok({ items: data ?? [] });
}

/** GET /api/admin/settings — réglages courants pour le dashboard. */
export async function handleAdminSettingsGet(
  ctx: AdminContext,
): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth.response;
  const settings = await getSettings();
  return ok({ settings });
}

/** GET /api/admin/orders?day=YYYY-MM-DD — commandes du jour (ou d'une date). */
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
  return ok({ day: target, orders: data ?? [], slotCapacity: settings.capacity_per_slot });
}

/** POST /api/admin/orders — changer le statut (machine à états vérifiée). */
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
    !/^RUGA-[2-9A-HJ-NP-Z]{4}$/.test(payload.code) ||
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

/** GET /api/admin/stats?days=N — CA, commandes, top ventes. */
export async function handleAdminStats(
  ctx: AdminContext,
  daysParam: string | null,
): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth.response;

  const days = Math.min(Math.max(Number(daysParam ?? 7) || 7, 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await serviceRole()
    .from("orders")
    .select("total_cents, status, created_at, order_items(name, qty, line_cents)")
    .gte("created_at", since)
    .neq("status", "cancelled");

  if (error) return bad(500, "DB_ERROR");
  const orders = data ?? [];

  const revenue = orders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
  const itemCount = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.order_items ?? []) {
      itemCount.set(item.name, (itemCount.get(item.name) ?? 0) + item.qty);
    }
  }
  const top = [...itemCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  return ok({
    days,
    revenue_cents: revenue,
    order_count: orders.length,
    average_cents: orders.length ? Math.round(revenue / orders.length) : 0,
    top_items: top,
  });
}

/** POST /api/admin/menu — prix / rupture / activation d'un produit. */
export async function handleAdminMenuUpdate(
  ctx: AdminContext,
  body: unknown,
): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
  if (!auth.ok) return auth.response;

  const payload = body as {
    id?: unknown;
    price_cents?: unknown;
    sold_out?: unknown;
    is_active?: unknown;
  } | null;

  if (!payload || typeof payload.id !== "string" || payload.id.length > 60) {
    return bad(400, "BAD_PAYLOAD");
  }
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
    .eq("id", payload.id);
  if (error) return bad(500, "DB_ERROR");

  invalidateMenuCache();
  return ok({ ok: true });
}

/** POST /api/admin/settings — réglages opérationnels. */
export async function handleAdminSettingsUpdate(
  ctx: AdminContext,
  body: unknown,
): Promise<ApiResponse> {
  const auth = await requireAdmin(ctx);
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
  > & { admin_notify_email?: unknown } | null;

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
  if (payload.admin_notify_email !== undefined) {
    if (typeof payload.admin_notify_email !== "string" || payload.admin_notify_email.length > 120) {
      return bad(400, "BAD_SETTING");
    }
    patch.admin_notify_email = payload.admin_notify_email.trim() || null;
  }

  const { error } = await serviceRole()
    .from("store_settings")
    .update(patch)
    .eq("id", 1);
  if (error) return bad(500, "DB_ERROR");
  return ok({ ok: true });
}
