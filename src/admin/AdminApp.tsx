import { useCallback, useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Client API admin (même origine, token en mémoire — jamais localStorage :
// un XSS ne peut pas voler un token qui n'existe pas sur le disque)
// ---------------------------------------------------------------------------

let accessToken: string | null = null;

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* noop */
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; message?: string };
    if (res.status === 401) {
      accessToken = null;
      setSession(null);
    }
    const error = new Error(err.message || err.error || `HTTP ${res.status}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

const SESSION_KEY = "ruga-admin-email";

function setSession(email: string | null) {
  if (email) sessionStorage.setItem(SESSION_KEY, email);
  else sessionStorage.removeItem(SESSION_KEY);
}

function getSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderRow = {
  code: string;
  customer_name: string;
  customer_phone: string;
  pickup_at: string;
  status: "new" | "preparing" | "ready" | "picked_up" | "cancelled";
  total_cents: number;
  payment_status: string;
  note: string | null;
  order_items: { name: string; qty: number; line_cents: number; path: string[] }[];
};

type Stats = {
  revenue_cents: number;
  order_count: number;
  average_cents: number;
  top_items: { name: string; qty: number }[];
};

type MenuItemRow = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  price_cents: number | null;
  is_active: boolean;
  sold_out: boolean;
};

type Settings = {
  ordering_enabled: boolean;
  ordering_message: string | null;
  slot_minutes: number;
  prep_delay_minutes: number;
  open_minutes: number;
  close_minutes: number;
  capacity_per_slot: number;
  closed_weekdays: number[];
  admin_notify_email: string | null;
};

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const euros = (c: number) => EUR.format(c / 100);

const STATUS_LABELS: Record<OrderRow["status"], string> = {
  new: "Nouvelle",
  preparing: "En préparation",
  ready: "Prête",
  picked_up: "Récupérée",
  cancelled: "Annulée",
};

const NEXT_ACTIONS: Record<OrderRow["status"], OrderRow["status"][]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------

function LoginView({ onLoggedIn }: { onLoggedIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        access_token?: string;
        email?: string;
        message?: string;
      };
      if (!res.ok || !body.access_token) {
        throw new Error(body.message || "Connexion refusée.");
      }
      accessToken = body.access_token;
      setSession(body.email ?? email);
      onLoggedIn(body.email ?? email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[2rem] border border-ink/10 bg-white p-8 shadow-[0_26px_60px_-34px_rgba(43,26,16,0.5)]"
      >
        <img src="/images/logo-emblem.png" alt="" width="202" height="152" className="mx-auto h-14 w-auto" />
        <h1 className="h-serif mt-4 text-center text-2xl font-black">Espace gérant</h1>
        <label className="mt-6 block">
          <span className="text-sm font-extrabold tracking-wide text-ink/70 uppercase">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-2xl border-2 border-ink/12 bg-white px-4 py-3 outline-none transition-colors focus:border-tomato"
            placeholder="gerant@ruga-pasta.fr"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-extrabold tracking-wide text-ink/70 uppercase">Mot de passe</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-2xl border-2 border-ink/12 bg-white px-4 py-3 outline-none transition-colors focus:border-tomato"
          />
        </label>
        {error && (
          <p className="mt-4 rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-3 text-sm font-semibold text-tomato-deep" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full disabled:opacity-50">
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

function OrderCard({
  order,
  onStatus,
  busy,
}: {
  order: OrderRow;
  onStatus: (code: string, status: OrderRow["status"]) => void;
  busy: boolean;
}) {
  const when = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.pickup_at));

  const tone =
    order.status === "new"
      ? "border-tomato/40 bg-tomato/5"
      : order.status === "ready"
        ? "border-olive/40 bg-olive/5"
        : order.status === "cancelled"
          ? "border-ink/10 bg-ink/5 opacity-60"
          : "border-ink/10 bg-white";

  return (
    <article className={`rounded-3xl border-2 p-5 shadow-sm ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-black tracking-wide">{order.code}</p>
          <p className="text-sm font-bold text-ink/80">
            {order.customer_name} ·{" "}
            <a href={`tel:${order.customer_phone}`} className="text-tomato underline decoration-tomato/40 underline-offset-2">
              {order.customer_phone}
            </a>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-black text-tomato">{when}</p>
          <p className="text-xs font-extrabold tracking-wide uppercase text-ink/50">
            {STATUS_LABELS[order.status]}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-ink/80">
        {order.order_items.map((item, i) => (
          <li key={i} className="flex justify-between gap-3 border-b border-dashed border-ink/10 pb-1 last:border-0">
            <span>
              <strong>{item.qty}×</strong> {item.path.filter(Boolean).join(" › ")}
            </span>
            <span className="shrink-0 font-semibold">{euros(item.line_cents)}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mt-2 rounded-xl bg-sun/15 px-3 py-2 text-sm font-semibold text-[#8a5b0a]">
          📝 {order.note}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-display text-lg font-black">{euros(order.total_cents)}</p>
        <div className="flex gap-2">
          {NEXT_ACTIONS[order.status].map((next) => (
            <button
              key={next}
              type="button"
              disabled={busy}
              onClick={() => onStatus(order.code, next)}
              className={`rounded-full px-4 py-2 text-xs font-extrabold tracking-wide uppercase transition-colors ${
                next === "cancelled"
                  ? "border-2 border-ink/15 text-ink/60 hover:border-tomato hover:text-tomato"
                  : next === "picked_up"
                    ? "bg-olive text-cream hover:bg-olive-2"
                    : "bg-tomato text-cream hover:bg-tomato-deep"
              }`}
            >
              {next === "preparing"
                ? "Préparer"
                : next === "ready"
                  ? "Prête !"
                  : next === "picked_up"
                    ? "Récupérée"
                    : "Annuler"}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

type Tab = "orders" | "history" | "stats" | "menu" | "settings";

export function AdminApp() {
  const [email, setEmail] = useState<string | null>(getSession());
  const [tab, setTab] = useState<Tab>("orders");
  const [day, setDay] = useState(() =>
    new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date()),
  );
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItemRow[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const logout = useCallback(() => {
    accessToken = null;
    setSession(null);
    setEmail(null);
  }, []);

  // Commandes du jour sélectionné — rafraîchies toutes les 30 s (polling léger,
  // suffisant pour une boutique ; pas de websocket à maintenir).
  useEffect(() => {
    if (!email || tab !== "orders") return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await adminFetch<{ orders: OrderRow[] }>(
          `/api/admin/orders?day=${encodeURIComponent(day)}`,
        );
        if (!cancelled) {
          setOrders(data.orders);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [email, tab, day, reloadKey]);

  // Stats
  useEffect(() => {
    if (!email || tab !== "stats") return;
    (async () => {
      try {
        setStats(await adminFetch<Stats>("/api/admin/stats?days=7"));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      }
    })();
  }, [email, tab, reloadKey]);

  // Menu
  useEffect(() => {
    if (!email || tab !== "menu") return;
    (async () => {
      try {
        const data = await adminFetch<{ items: MenuItemRow[] }>("/api/admin/menu-get");
        setMenuItems(data.items);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      }
    })();
  }, [email, tab, reloadKey]);

  // Réglages
  useEffect(() => {
    if (!email || tab !== "settings") return;
    (async () => {
      try {
        const data = await adminFetch<{ settings: Settings }>("/api/admin/settings-get");
        setSettings(data.settings);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      }
    })();
  }, [email, tab, reloadKey]);

  const changeStatus = async (code: string, status: OrderRow["status"]) => {
    setBusy(true);
    try {
      await adminFetch("/api/admin/order-status", {
        method: "POST",
        body: JSON.stringify({ code, status }),
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const patchMenu = async (patch: { id: string } & Record<string, unknown>) => {
    setBusy(true);
    try {
      await adminFetch("/api/admin/menu", { method: "POST", body: JSON.stringify(patch) });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const patchSettings = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await adminFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(patch) });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const dayOrders = useMemo(() => {
    if (!orders) return null;
    const live = orders.filter((o) => o.status !== "cancelled");
    return {
      live,
      newCount: live.filter((o) => o.status === "new").length,
      revenue: live.reduce((s, o) => s + o.total_cents, 0),
    };
  }, [orders]);

  if (!email) return <LoginView onLoggedIn={setEmail} />;

  const tabs: { key: Tab; label: string }[] = [
    { key: "orders", label: "Commandes" },
    { key: "stats", label: "Stats" },
    { key: "menu", label: "Carte" },
    { key: "settings", label: "Réglages" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/images/logo-emblem.png" alt="" width="202" height="152" className="h-10 w-auto" />
          <div>
            <h1 className="h-serif text-xl font-black leading-none">Tableau de bord</h1>
            <p className="text-xs text-ink/50">{email}</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="btn-outline btn-sm">
          Déconnexion
        </button>
      </header>

      <nav className="mt-5 flex gap-1.5 overflow-x-auto" aria-label="Sections du dashboard">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide transition-colors ${
              tab === t.key ? "bg-ink text-cream" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
            }`}
          >
            {t.label}
            {t.key === "orders" && dayOrders && dayOrders.newCount > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-tomato text-[11px] text-cream">
                {dayOrders.newCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && (
        <p className="mt-4 rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-3 text-sm font-semibold text-tomato-deep" role="alert">
          {error}
        </p>
      )}

      {/* ---------- Commandes ---------- */}
      {tab === "orders" && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              Jour :
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="rounded-xl border-2 border-ink/12 px-3 py-1.5"
              />
            </label>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn-outline btn-sm">
              Rafraîchir
            </button>
            {dayOrders && (
              <span className="ml-auto text-sm font-bold text-ink/60">
                {dayOrders.live.length} commande{dayOrders.live.length > 1 ? "s" : ""} · {euros(dayOrders.revenue)}
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {orders === null ? (
              <p className="text-sm text-ink/50">Chargement…</p>
            ) : orders.length === 0 ? (
              <p className="rounded-2xl bg-cream-2 p-5 text-sm text-ink/60">
                Aucune commande ce jour-là.
              </p>
            ) : (
              orders.map((order) => (
                <OrderCard key={order.code} order={order} onStatus={changeStatus} busy={busy} />
              ))
            )}
          </div>
        </section>
      )}

      {/* ---------- Stats ---------- */}
      {tab === "stats" && (
        <section className="mt-6">
          {!stats ? (
            <p className="text-sm text-ink/50">Chargement…</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-ink/10 bg-white p-6">
                  <p className="text-xs font-extrabold tracking-wide uppercase text-ink/50">CA (7 jours)</p>
                  <p className="font-display mt-2 text-3xl font-black text-tomato">{euros(stats.revenue_cents)}</p>
                </div>
                <div className="rounded-3xl border border-ink/10 bg-white p-6">
                  <p className="text-xs font-extrabold tracking-wide uppercase text-ink/50">Commandes</p>
                  <p className="font-display mt-2 text-3xl font-black">{stats.order_count}</p>
                </div>
                <div className="rounded-3xl border border-ink/10 bg-white p-6">
                  <p className="text-xs font-extrabold tracking-wide uppercase text-ink/50">Panier moyen</p>
                  <p className="font-display mt-2 text-3xl font-black">{euros(stats.average_cents)}</p>
                </div>
              </div>
              <div className="mt-4 rounded-3xl border border-ink/10 bg-white p-6">
                <h2 className="font-display text-lg font-black">Top ventes (7 jours)</h2>
                <ol className="mt-3 space-y-2">
                  {stats.top_items.length === 0 && (
                    <li className="text-sm text-ink/50">Pas encore de données.</li>
                  )}
                  {stats.top_items.map((item, i) => (
                    <li key={item.name} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-tomato font-display text-sm font-black text-cream">
                        {i + 1}
                      </span>
                      <span className="flex-1 font-bold">{item.name}</span>
                      <span className="font-display text-lg font-black text-tomato">{item.qty}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------- Carte ---------- */}
      {tab === "menu" && (
        <section className="mt-6">
          {!menuItems ? (
            <p className="text-sm text-ink/50">Chargement…</p>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-cream-2 text-left text-xs font-extrabold tracking-wide uppercase text-ink/60">
                  <tr>
                    <th className="px-4 py-3">Article</th>
                    <th className="px-4 py-3">Prix</th>
                    <th className="px-4 py-3 text-center">Rupture</th>
                    <th className="px-4 py-3 text-center">Actif</th>
                  </tr>
                </thead>
                <tbody>
                  {menuItems
                    .filter((item) => item.price_cents !== null)
                    .map((item) => (
                      <tr key={item.id} className="border-t border-ink/8">
                        <td className="px-4 py-2.5 font-semibold">{item.name}</td>
                        <td className="px-4 py-2.5">
                          {item.price_cents === 0 ? (
                            <span className="text-ink/40">Inclus</span>
                          ) : (
                            <input
                              type="number"
                              min={50}
                              max={10000}
                              step={50}
                              defaultValue={item.price_cents!}
                              onBlur={(e) => {
                                const cents = Number(e.target.value);
                                if (cents !== item.price_cents && cents >= 50 && cents <= 10000) {
                                  void patchMenu({ id: item.id, price_cents: cents });
                                }
                              }}
                              className="w-24 rounded-lg border-2 border-ink/12 px-2 py-1"
                              aria-label={`Prix de ${item.name} en centimes`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.sold_out}
                            onChange={(e) => void patchMenu({ id: item.id, sold_out: e.target.checked })}
                            className="h-5 w-5 accent-tomato"
                            aria-label={`Rupture pour ${item.name}`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.is_active}
                            onChange={(e) => void patchMenu({ id: item.id, is_active: e.target.checked })}
                            className="h-5 w-5 accent-olive"
                            aria-label={`Activation de ${item.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-ink/50">
            Le prix se modifie en centimes (650 = 6,50 €). Une rupture masque
            l'article du tunnel immédiatement.
          </p>
        </section>
      )}

      {/* ---------- Réglages ---------- */}
      {tab === "settings" && settings && (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-ink/10 bg-white p-6">
            <h2 className="font-display text-lg font-black">Commande en ligne</h2>
            <label className="mt-4 flex items-center justify-between gap-3 font-bold">
              Ouverte
              <input
                type="checkbox"
                checked={settings.ordering_enabled}
                onChange={(e) => void patchSettings({ ordering_enabled: e.target.checked })}
                className="h-6 w-6 accent-tomato"
              />
            </label>
            <label className="mt-3 block text-sm font-bold">
              Message quand fermée
              <input
                type="text"
                value={settings.ordering_message ?? ""}
                maxLength={200}
                onChange={(e) => setSettings({ ...settings, ordering_message: e.target.value })}
                onBlur={(e) => void patchSettings({ ordering_message: e.target.value })}
                className="mt-1.5 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
              />
            </label>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white p-6">
            <h2 className="font-display text-lg font-black">Créneaux</h2>
            <label className="mt-4 block text-sm font-bold">
              Capacité par créneau
              <input
                type="number"
                min={1}
                max={100}
                value={settings.capacity_per_slot}
                onChange={(e) => setSettings({ ...settings, capacity_per_slot: Number(e.target.value) })}
                onBlur={(e) => void patchSettings({ capacity_per_slot: Number(e.target.value) })}
                className="mt-1.5 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-bold">
              Délai de préparation (minutes)
              <input
                type="number"
                min={0}
                max={240}
                value={settings.prep_delay_minutes}
                onChange={(e) => setSettings({ ...settings, prep_delay_minutes: Number(e.target.value) })}
                onBlur={(e) => void patchSettings({ prep_delay_minutes: Number(e.target.value) })}
                className="mt-1.5 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
              />
            </label>
            <p className="mt-3 text-xs text-ink/50">
              Ouverture {Math.floor(settings.open_minutes / 60)}h{String(settings.open_minutes % 60).padStart(2, "0")} — fermeture{" "}
              {Math.floor(settings.close_minutes / 60)}h{String(settings.close_minutes % 60).padStart(2, "0")} (modifiable sur demande).
            </p>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white p-6 md:col-span-2">
            <h2 className="font-display text-lg font-black">Jours de fermeture</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {DAY_LABELS.map((label, index) => {
                const checked = settings.closed_weekdays.includes(index);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const next = checked
                        ? settings.closed_weekdays.filter((d) => d !== index)
                        : [...settings.closed_weekdays, index];
                      void patchSettings({ closed_weekdays: next });
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide transition-colors ${
                      checked ? "bg-tomato text-cream" : "border-2 border-ink/15 text-ink/60 hover:border-tomato"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white p-6 md:col-span-2">
            <h2 className="font-display text-lg font-black">Notification</h2>
            <label className="mt-3 block text-sm font-bold">
              Email de notification (une nouvelle commande = un email avec le détail)
              <input
                type="email"
                value={settings.admin_notify_email ?? ""}
                onChange={(e) => setSettings({ ...settings, admin_notify_email: e.target.value })}
                onBlur={(e) => void patchSettings({ admin_notify_email: e.target.value })}
                className="mt-1.5 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
                placeholder="gerant@ruga-pasta.fr"
              />
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
