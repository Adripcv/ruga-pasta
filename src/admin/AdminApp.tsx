import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  BarChart,
  DonutChart,
  Sparkline,
  TrendBadge,
  euros,
} from "./charts";
import { describeGroups, groupOrderItems } from "./orderDisplay";

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
      // Prévient l'UI (toutes les vues affichent le login, les erreurs 401
      // polluantes sont éteintes) et re-synchronise l'état React.
      window.dispatchEvent(new Event("ruga-admin-unauthorized"));
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

const SESSION_KEY = "ruga-admin-session";

type SessionInfo = { email: string; role: "admin" | "staff" };

function setSession(session: SessionInfo | null) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

function getSession(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionInfo;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
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
  /** null pour le rôle staff : le CA ne le concerne pas. */
  total_cents: number | null;
  payment_status: string;
  note: string | null;
  order_items: { name: string; qty: number; line_cents: number | null; path: string[] }[];
};

type RichStats = {
  days: number;
  kpis: {
    revenue_cents: number;
    order_count: number;
    average_cents: number;
    cancelled_count: number;
    cancellation_rate: number;
    prev_revenue_cents: number;
    prev_order_count: number;
  };
  daily: { date: string; revenue_cents: number; orders: number; cancelled: number }[];
  hourly: { hour: number; orders: number; revenue_cents: number }[];
  top_items: { name: string; qty: number; revenue_cents: number }[];
  statuses: { status: string; count: number }[];
};

type MenuItemRow = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  price_cents: number | null;
  max_qty: number;
  is_active: boolean;
  sold_out: boolean;
  sort_order: number;
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
};

const STATUS_LABELS: Record<OrderRow["status"], string> = {
  new: "Nouvelle",
  preparing: "En préparation",
  ready: "Prête",
  picked_up: "Récupérée",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<OrderRow["status"], string> = {
  new: "bg-tomato/10 text-tomato-deep",
  preparing: "bg-sun/20 text-[#8a5b0a]",
  ready: "bg-olive/15 text-olive",
  picked_up: "bg-ink/8 text-ink/60",
  cancelled: "bg-ink/5 text-ink/40 line-through",
};

const NEXT_ACTIONS: Record<OrderRow["status"], OrderRow["status"][]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

const ACTION_LABELS: Partial<Record<OrderRow["status"], string>> = {
  preparing: "Préparer",
  ready: "Prête !",
  picked_up: "Récupérée",
  cancelled: "Annuler",
};

const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const parisToday = () =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------

function LoginView({
  onLoggedIn,
}: {
  onLoggedIn: (session: SessionInfo) => void;
}) {
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
        role?: "admin" | "staff";
        message?: string;
      };
      if (!res.ok || !body.access_token) {
        throw new Error(body.message || "Connexion refusée.");
      }
      const session = { email: body.email ?? email, role: body.role ?? "staff" };
      accessToken = body.access_token;
      setSession(session);
      onLoggedIn(session);
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
        <h1 className="h-serif mt-4 text-center text-2xl font-black">Espace équipe</h1>
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

/* -------------------------------------------------------------------------- */
/*  KPI cards                                                                 */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  badge,
  spark,
  accent = false,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
  spark?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 ${
        accent ? "border-tomato/25 bg-tomato/[0.04]" : "border-ink/10 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">{label}</p>
        {badge}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className={`font-display text-2xl font-black sm:text-3xl ${accent ? "text-tomato" : ""}`}>
          {value}
        </p>
        {spark}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Carte commande                                                            */
/* -------------------------------------------------------------------------- */

function OrderCard({
  order,
  onStatus,
  busy,
  onPrint,
}: {
  order: OrderRow;
  onStatus: (code: string, status: OrderRow["status"]) => void;
  busy: boolean;
  onPrint: (order: OrderRow) => void;
}) {
  const groups = useMemo(() => groupOrderItems(order.order_items), [order.order_items]);

  const when = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.pickup_at));

  const tone =
    order.status === "new"
      ? "border-tomato/40 bg-tomato/[0.04]"
      : order.status === "ready"
        ? "border-olive/40 bg-olive/[0.04]"
        : order.status === "cancelled"
          ? "border-ink/10 bg-ink/[0.03] opacity-60"
          : "border-ink/10 bg-white";

  return (
    <article className={`rounded-3xl border-2 p-5 shadow-sm transition-shadow hover:shadow-md ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-black tracking-wide">{order.code}</p>
          <p className="text-sm font-bold text-ink/80">
            {order.customer_name} ·{" "}
            <a
              href={`tel:${order.customer_phone}`}
              className="text-tomato underline decoration-tomato/40 underline-offset-2"
            >
              {order.customer_phone}
            </a>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-black text-tomato">{when}</p>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {groups.map((group, i) => (
          <li key={i}>
            <p className="font-black text-ink">
              {group.qty > 1 ? `${group.qty}× ` : ""}{group.title} :
            </p>
            {group.extras.length > 0 && (
              <ul className="mt-0.5 ml-4 list-disc text-ink/75">
                {group.extras.map((extra, j) => (
                  <li key={j}>{extra}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mt-2 rounded-xl bg-sun/15 px-3 py-2 text-sm font-semibold text-[#8a5b0a]">
          📝 {order.note}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {order.total_cents !== null ? (
          <p className="font-display text-lg font-black">{euros(order.total_cents)}</p>
        ) : (
          <span />)
        }
        <div className="flex flex-wrap gap-2">
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
              {ACTION_LABELS[next]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPrint(order)}
            className="rounded-full border-2 border-ink/15 px-3 py-2 text-xs font-extrabold text-ink/70 uppercase transition-colors hover:border-ink hover:text-ink"
            title="Imprimer l'étiquette cuisine"
            aria-label={`Imprimer l'étiquette cuisine de ${order.code}`}
          >
            🖨️ Étiquette
          </button>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Vue ANALYTICS                                                             */
/* -------------------------------------------------------------------------- */

const RANGE_CHOICES = [
  { days: 7, label: "7 j" },
  { days: 14, label: "14 j" },
  { days: 30, label: "30 j" },
  { days: 90, label: "90 j" },
];

function AnalyticsView({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  const [stats, setStats] = useState<RichStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminFetch<RichStats>(`/api/admin/stats?days=${days}`);
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error) {
    return (
      <p className="mt-6 rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-4 text-sm font-semibold text-tomato-deep" role="alert">
        {error}
      </p>
    );
  }
  if (!stats) {
    return <p className="mt-6 text-sm text-ink/50">Chargement des statistiques…</p>;
  }

  const dailyPoints = stats.daily.map((d) => ({ label: d.date, value: metric === "revenue" ? d.revenue_cents : d.orders }));
  const hourlyPoints = stats.hourly
    .filter((h) => h.hour >= 10 && h.hour <= 22)
    .map((h) => ({ label: `${h.hour}h`, value: h.orders }));
  const sparkRevenue = stats.daily.map((d) => d.revenue_cents);
  const sparkOrders = stats.daily.map((d) => d.orders);
  const statusItems = stats.statuses.map((s) => ({
    label: STATUS_LABELS[s.status as OrderRow["status"]] ?? s.status,
    value: s.count,
  }));

  return (
    <section className="mt-6 space-y-5">
      {/* Sélecteur de période */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_CHOICES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={days === r.days}
            className={`rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide transition-colors ${
              days === r.days ? "bg-ink text-cream" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink/40">Comparé aux {days} jours précédents</span>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`CA ${stats.days} j`}
          value={euros(stats.kpis.revenue_cents)}
          badge={<TrendBadge current={stats.kpis.revenue_cents} previous={stats.kpis.prev_revenue_cents} />}
          spark={<Sparkline values={sparkRevenue} />}
          accent
        />
        <KpiCard
          label="Commandes"
          value={String(stats.kpis.order_count)}
          badge={<TrendBadge current={stats.kpis.order_count} previous={stats.kpis.prev_order_count} />}
          spark={<Sparkline values={sparkOrders} color="#7a8450" />}
        />
        <KpiCard label="Panier moyen" value={euros(stats.kpis.average_cents)} />
        <KpiCard
          label="Annulations"
          value={`${stats.kpis.cancelled_count}`}
          badge={
            <span className="rounded-full bg-ink/8 px-2 py-0.5 text-xs font-extrabold text-ink/50">
              {Math.round(stats.kpis.cancellation_rate * 100)} %
            </span>
          }
        />
      </div>

      {/* Graphique principal + bascule CA / commandes */}
      <div className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-black">
            {metric === "revenue" ? "Chiffre d'affaires par jour" : "Commandes par jour"}
          </h2>
          <div className="flex rounded-full bg-ink/5 p-1">
            {(
              [
                ["revenue", "CA"],
                ["orders", "Commandes"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMetric(key)}
                aria-pressed={metric === key}
                className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition-colors ${
                  metric === key ? "bg-white text-ink shadow-sm" : "text-ink/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 text-ink">
          <AreaChart
            points={dailyPoints}
            ariaLabel={`Évolution ${metric === "revenue" ? "du chiffre d'affaires" : "des commandes"} sur ${stats.days} jours`}
            formatValue={metric === "revenue" ? euros : (v) => String(v)}
            color={metric === "revenue" ? "#c93227" : "#7a8450"}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Affluence */}
        <div className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-black">Affluence par heure de retrait</h2>
          <p className="mt-0.5 text-xs text-ink/45">
            Anticipe la production : les barres sombres = commandes à l'heure indiquée.
          </p>
          <div className="mt-4 text-ink">
            <BarChart points={hourlyPoints} ariaLabel="Nombre de commandes par heure de retrait" />
          </div>
        </div>

        {/* Répartition statuts */}
        <div className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-black">Répartition des commandes</h2>
          <div className="mt-4 text-ink">
            <DonutChart items={statusItems} ariaLabel="Répartition des commandes par statut" />
          </div>
        </div>
      </div>

      {/* Top produits */}
      <div className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-black">Top produits ({stats.days} jours)</h2>
        {stats.top_items.length === 0 ? (
          <p className="mt-3 text-sm text-ink/50">Pas encore de données.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {stats.top_items.map((item, i) => {
              const max = stats.top_items[0].revenue_cents || 1;
              return (
                <li key={item.name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tomato font-display text-sm font-black text-cream">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-bold">{item.name}</span>
                      <span className="shrink-0 font-display font-black text-tomato">{euros(item.revenue_cents)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/6">
                      <div
                        className="h-full rounded-full bg-tomato/70"
                        style={{ width: `${Math.max((item.revenue_cents / max) * 100, 3)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-ink/45">{item.qty} vendus</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Vue CARTE — CRUD complet                                                  */
/* -------------------------------------------------------------------------- */

function MenuView() {
  const [items, setItems] = useState<MenuItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<{ parentId: string; parentName: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ items: MenuItemRow[] }>("/api/admin/menu");
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (payload: Record<string, unknown>, noticeAfter?: string) => {
      setBusy(true);
      setError(null);
      try {
        await adminFetch("/api/admin/menu", { method: "POST", body: JSON.stringify(payload) });
        setNotice(noticeAfter ?? null);
        await load();
        setTimeout(() => setNotice(null), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!items) return <p className="mt-6 text-sm text-ink/50">Chargement…</p>;

  const byParent = new Map<string | null, MenuItemRow[]>();
  for (const it of items) {
    byParent.set(it.parent_id, [...(byParent.get(it.parent_id) ?? []), it]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const move = (item: MenuItemRow, dir: -1 | 10 | -10) =>
    void act({ action: "reorder", id: item.id, sort_order: Math.max(0, item.sort_order + dir) });

  /** Rend récursif d'une branche (profondeur bornée par la carte). */
  const renderNode = (node: MenuItemRow, depth: number): React.ReactNode => {
    const children = byParent.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(node.id);
    const isItem = node.price_cents !== null;

    return (
      <div key={node.id}>
        <div
          className={`flex flex-wrap items-center gap-2 border-t border-ink/8 px-3 py-2.5 ${depth > 0 ? "bg-cream/40" : ""}`}
          style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
        >
          {/* Plier / déplier */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              aria-expanded={isOpen}
              className="flex h-6 w-6 items-center justify-center rounded-full text-ink/50 hover:bg-ink/8"
              aria-label={isOpen ? `Replier ${node.name}` : `Déplier ${node.name}`}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-6" />
          )}

          <span className="min-w-0 flex-1">
            <span className={`font-semibold ${isItem ? "" : "text-ink/70"} ${node.is_active ? "" : "opacity-40"}`}>
              {node.name}
            </span>
            {node.sold_out && isItem && (
              <span className="ml-2 rounded-full bg-tomato/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-tomato-deep">
                rupture
              </span>
            )}
            {!node.is_active && (
              <span className="ml-2 rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink/50">
                masqué
              </span>
            )}
          </span>

          {/* Prix */}
          {isItem && (
            <input
              type="number"
              min={0}
              max={10000}
              step={50}
              defaultValue={node.price_cents!}
              key={`${node.id}-${node.price_cents}`}
              onBlur={(e) => {
                const cents = Number(e.target.value);
                if (cents !== node.price_cents && cents >= 0 && cents <= 10000 && Number.isInteger(cents)) {
                  void act({ action: "update", id: node.id, price_cents: cents });
                }
              }}
              className="w-20 rounded-lg border-2 border-ink/12 px-2 py-1 text-sm"
              aria-label={`Prix de ${node.name} en centimes`}
            />
          )}

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => move(node, -10)}
              className="rounded-lg px-1.5 py-1 text-sm hover:bg-ink/8"
              aria-label={`Monter ${node.name}`}
              title="Monter"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => move(node, 10)}
              className="rounded-lg px-1.5 py-1 text-sm hover:bg-ink/8"
              aria-label={`Descendre ${node.name}`}
              title="Descendre"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const name = window.prompt(`Nouveau nom pour « ${node.name} » :`, node.name);
                if (name && name.trim().length >= 2) void act({ action: "rename", id: node.id, name: name.trim() });
              }}
              className="rounded-lg px-1.5 py-1 text-sm hover:bg-ink/8"
              aria-label={`Renommer ${node.name}`}
              title="Renommer"
            >
              ✏️
            </button>
            {hasChildren ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(
                    { action: "toggle_sold_out_section", id: node.id, sold_out: !node.sold_out },
                    node.sold_out ? "Section réactivée." : "Section mise en rupture.",
                  )
                }
                className="rounded-lg px-1.5 py-1 text-sm hover:bg-ink/8"
                aria-label={node.sold_out ? `Réactiver la section ${node.name}` : `Mettre la section ${node.name} en rupture`}
                title={node.sold_out ? "Réactiver la section" : "Rupture section"}
              >
                {node.sold_out ? "♻️" : "🚫"}
              </button>
            ) : isItem ? (
              <>
                <label className="ml-1 cursor-pointer" title="En rupture">
                  <input
                    type="checkbox"
                    checked={node.sold_out}
                    disabled={busy}
                    onChange={(e) => void act({ action: "update", id: node.id, sold_out: e.target.checked })}
                    className="h-4.5 w-4.5 accent-tomato"
                    aria-label={`Rupture pour ${node.name}`}
                  />
                </label>
                <label className="cursor-pointer" title="Visible dans le tunnel">
                  <input
                    type="checkbox"
                    checked={node.is_active}
                    disabled={busy}
                    onChange={(e) => void act({ action: "update", id: node.id, is_active: e.target.checked })}
                    className="h-4.5 w-4.5 accent-olive"
                    aria-label={`Activation de ${node.name}`}
                  />
                </label>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Supprimer « ${node.name} » ? (refusé si des commandes y réfèrent)`)) {
                  void act({ action: "delete", id: node.id }, "Article supprimé.");
                }
              }}
              className="rounded-lg px-1.5 py-1 text-sm hover:bg-tomato/10"
              aria-label={`Supprimer ${node.name}`}
              title="Supprimer"
            >
              🗑️
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCreating({ parentId: node.id, parentName: node.name });
                setNewName("");
                setNewPrice("");
              }}
              className="rounded-lg px-1.5 py-1 text-sm hover:bg-olive/10"
              aria-label={`Ajouter un article sous ${node.name}`}
              title="Ajouter un article ici"
            >
              ➕
            </button>
          </div>
        </div>

        {/* Formulaire de création inline */}
        {creating?.parentId === node.id && (
          <form
            className="flex flex-wrap items-center gap-2 border-t border-olive/25 bg-olive/[0.05] px-4 py-3"
            style={{ paddingLeft: `${1.25 + depth * 1.25}rem` }}
            onSubmit={(e) => {
              e.preventDefault();
              const price = Number(newPrice);
              if (newName.trim().length >= 2 && Number.isInteger(price) && price >= 0) {
                void act(
                  { action: "create", parent_id: creating.parentId, name: newName.trim(), price_cents: price },
                  `« ${newName.trim()} » ajouté sous ${creating.parentName}.`,
                ).then(() => setCreating(null));
              }
            }}
          >
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom de l'article"
              className="w-44 rounded-lg border-2 border-ink/12 px-2.5 py-1.5 text-sm"
              autoFocus
            />
            <input
              type="number"
              required
              min={0}
              max={10000}
              step={50}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Prix (centimes)"
              className="w-32 rounded-lg border-2 border-ink/12 px-2.5 py-1.5 text-sm"
            />
            <button type="submit" disabled={busy} className="btn-primary btn-sm">
              Créer
            </button>
            <button type="button" onClick={() => setCreating(null)} className="btn-outline btn-sm">
              Annuler
            </button>
          </form>
        )}

        {hasChildren && isOpen && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const roots = byParent.get(null) ?? [];

  return (
    <section className="mt-6">
      {error && (
        <p className="mb-4 rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-3 text-sm font-semibold text-tomato-deep" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-2xl border-2 border-olive/30 bg-olive/10 p-3 text-sm font-semibold text-olive" role="status">
          ✓ {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-cream-2 px-4 py-3">
          <p className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
            {items.filter((i) => i.price_cents !== null).length} articles — prix en centimes (650 = 6,50 €)
          </p>
          <p className="text-xs text-ink/40">
            ↑↓ ordre · ✏️ renommer · ➕ ajouter · 🗑️ supprimer — visible immédiatement sur le tunnel
          </p>
        </div>
        {roots.map((root) => renderNode(root, 0))}
      </div>

      <p className="mt-3 text-xs text-ink/50">
        💡 Supprimer un article déjà commandé est refusé (l'historique doit rester juste) :
        décoche « actif » pour le masquer du tunnel en conservant l'historique.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Vue RÉGLAGES — avec aperçu des créneaux en direct                         */
/* -------------------------------------------------------------------------- */

function slotPreview(settings: Settings): string[] {
  const labels: string[] = [];
  for (let m = settings.open_minutes; m + settings.slot_minutes <= settings.close_minutes; m += settings.slot_minutes) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    labels.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return labels;
}

function SettingsView({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  const patch = async (payload: Record<string, unknown>) => {
    await adminFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(payload) });
  };

  const slots = slotPreview(settings);
  const shown = slots.slice(0, 24);

  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2">
      {/* Interrupteur principal */}
      <div className={`rounded-3xl border-2 p-6 transition-colors ${settings.ordering_enabled ? "border-olive/40 bg-olive/[0.04]" : "border-tomato/30 bg-tomato/[0.04]"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-black">Commande en ligne</h2>
            <p className={`text-sm font-bold ${settings.ordering_enabled ? "text-olive" : "text-tomato-deep"}`}>
              {settings.ordering_enabled ? "● OUVERTE" : "○ FERMÉE"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.ordering_enabled}
            onClick={() => {
              const next = !settings.ordering_enabled;
              setSettings({ ...settings, ordering_enabled: next });
              void patch({ ordering_enabled: next });
            }}
            className={`relative h-8 w-14 rounded-full transition-colors ${settings.ordering_enabled ? "bg-olive" : "bg-ink/20"}`}
            aria-label={settings.ordering_enabled ? "Fermer la commande en ligne" : "Ouvrir la commande en ligne"}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${settings.ordering_enabled ? "left-7" : "left-1"}`}
            />
          </button>
        </div>
        <label className="mt-4 block text-sm font-bold">
          Message affiché quand fermée
          <input
            type="text"
            value={settings.ordering_message ?? ""}
            maxLength={200}
            onChange={(e) => setSettings({ ...settings, ordering_message: e.target.value })}
            onBlur={(e) => void patch({ ordering_message: e.target.value })}
            className="mt-1.5 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
            placeholder="La commande en ligne est momentanément fermée."
          />
        </label>
      </div>

      {/* Créneaux + aperçu */}
      <div className="rounded-3xl border border-ink/10 bg-white p-6">
        <h2 className="font-display text-lg font-black">Créneaux de retrait</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">
            Durée (min)
            <input
              type="number"
              min={5}
              max={60}
              step={5}
              value={settings.slot_minutes}
              onChange={(e) => setSettings({ ...settings, slot_minutes: Number(e.target.value) })}
              onBlur={(e) => void patch({ slot_minutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-bold">
            Capacité / créneau
            <input
              type="number"
              min={1}
              max={100}
              value={settings.capacity_per_slot}
              onChange={(e) => setSettings({ ...settings, capacity_per_slot: Number(e.target.value) })}
              onBlur={(e) => void patch({ capacity_per_slot: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-bold">
            Préparation (min)
            <input
              type="number"
              min={0}
              max={240}
              step={5}
              value={settings.prep_delay_minutes}
              onChange={(e) => setSettings({ ...settings, prep_delay_minutes: Number(e.target.value) })}
              onBlur={(e) => void patch({ prep_delay_minutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
            />
          </label>
          <div className="text-sm font-bold">
            <span className="block">Ouverture — fermeture</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={23}
                value={Math.floor(settings.open_minutes / 60)}
                onChange={(e) => {
                  const h = Math.min(23, Math.max(0, Number(e.target.value)));
                  setSettings({ ...settings, open_minutes: h * 60 + (settings.open_minutes % 60) });
                }}
                onBlur={() => void patch({ open_minutes: settings.open_minutes })}
                className="w-16 rounded-xl border-2 border-ink/12 px-2 py-2"
                aria-label="Heure d'ouverture"
              />
              <span>h</span>
              <input
                type="number"
                min={0}
                max={23}
                value={Math.floor(settings.close_minutes / 60)}
                onChange={(e) => {
                  const h = Math.min(24, Math.max(1, Number(e.target.value)));
                  setSettings({ ...settings, close_minutes: h * 60 + (settings.close_minutes % 60) });
                }}
                onBlur={() => void patch({ close_minutes: settings.close_minutes })}
                className="w-16 rounded-xl border-2 border-ink/12 px-2 py-2"
                aria-label="Heure de fermeture"
              />
              <span>h</span>
            </div>
          </div>
        </div>

        {/* Aperçu live */}
        <div className="mt-4 rounded-2xl bg-cream-2 p-3">
          <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">
            Aperçu — {slots.length} créneaux/jour · {slots.length * settings.capacity_per_slot} commandes max
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.map((s) => (
              <span key={s} className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-ink/70">
                {s}
              </span>
            ))}
            {slots.length > shown.length && (
              <span className="px-1 py-1 text-xs text-ink/40">+{slots.length - shown.length}…</span>
            )}
          </div>
        </div>
      </div>

      {/* Jours de fermeture */}
      <div className="rounded-3xl border border-ink/10 bg-white p-6 md:col-span-2">
        <h2 className="font-display text-lg font-black">Jours de fermeture hebdomadaire</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAY_LABELS.map((label, index) => {
            const checked = settings.closed_weekdays.includes(index);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={checked}
                onClick={() => {
                  const next = checked
                    ? settings.closed_weekdays.filter((d) => d !== index)
                    : [...settings.closed_weekdays, index].sort();
                  setSettings({ ...settings, closed_weekdays: next });
                  void patch({ closed_weekdays: next });
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

      {/* Intégration future : l'appli de gestion cuisine du restaurant lira les
          commandes directement (base Supabase ou export). Pas d'email par
          commande : la cuisine voit tout ici, en temps réel. */}
      <div className="rounded-3xl border border-ink/10 bg-white p-6 md:col-span-2">
        <h2 className="font-display text-lg font-black">Cuisine & intégrations</h2>
        <p className="mt-2 text-sm text-ink/70">
          Les commandes arrivent <strong>en temps réel</strong> dans l'onglet <strong>Service</strong> —
          imprime l'étiquette de chaque commande avec le bouton 🖨️ pour l'accrocher au passe.
        </p>
        <p className="mt-2 text-xs text-ink/50">
          🔮 Prévu : connexion directe entre ce site et l'appli de gestion des commandes déjà
          utilisée en cuisine (les commandes s'y ajouteront automatiquement, sans email ni saisie).
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  App principale                                                            */
/* -------------------------------------------------------------------------- */

type Tab = "orders" | "analytics" | "menu" | "settings" | "team";

export function AdminApp() {
  const [session, setSessionState] = useState<SessionInfo | null>(getSession());
  const [tab, setTab] = useState<Tab>("orders");
  const [day, setDay] = useState(parisToday());
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderRow["status"]>("all");
  const [search, setSearch] = useState("");
  const [statsDays, setStatsDays] = useState(7);

  const isAdmin = session?.role === "admin";

  const logout = useCallback(() => {
    accessToken = null;
    setSession(null);
    setSessionState(null);
  }, []);

  // Expiration du jeton pendant une session (401) : retour au login propre.
  useEffect(() => {
    const onUnauthorized = () => setSessionState(null);
    window.addEventListener("ruga-admin-unauthorized", onUnauthorized);
    return () => window.removeEventListener("ruga-admin-unauthorized", onUnauthorized);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await adminFetch<{ orders: OrderRow[] }>(
        `/api/admin/orders?day=${encodeURIComponent(day)}`,
      );
      setOrders(data.orders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, [day]);

  // Commandes du jour — rafraîchies toutes les 30 s.
  useEffect(() => {
    if (!session || tab !== "orders") return;
    let cancelled = false;
    const check = () => {
      if (!cancelled) void loadOrders();
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, tab, day, reloadKey, loadOrders]);

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

  const dayOrders = useMemo(() => {
    if (!orders) return null;
    const live = orders.filter((o) => o.status !== "cancelled");
    return {
      live,
      newCount: live.filter((o) => o.status === "new").length,
      readyCount: live.filter((o) => o.status === "ready").length,
      // null = rôle staff : le serveur masque les montants, on n'affiche rien.
      revenue: live.some((o) => o.total_cents === null)
        ? null
        : live.reduce((s, o) => s + (o.total_cents ?? 0), 0),
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!orders) return null;
    let list = orders;
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.code.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.includes(q),
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  /** Export CSV du jour filtré (tableur : Excel, Numbers, LibreOffice). */
  const exportCsv = () => {
    if (!filteredOrders?.length) return;
    const showPrices = !dayOrders || dayOrders.revenue !== null;
    const rows = [
      showPrices
        ? ["Code", "Client", "Téléphone", "Retrait", "Statut", "Articles", "Total (€)", "Note"]
        : ["Code", "Client", "Téléphone", "Retrait", "Statut", "Articles", "Note"],
      ...filteredOrders.map((o) => {
        const items = describeGroups(groupOrderItems(o.order_items));
        const base = [
          o.code,
          o.customer_name,
          o.customer_phone,
          new Date(o.pickup_at).toLocaleString("fr-FR"),
          STATUS_LABELS[o.status],
          items,
        ];
        if (!showPrices) {
          return [...base, (o.note ?? "").replace(/[\r\n;]+/g, " ")];
        }
        return [
          ...base,
          ((o.total_cents ?? 0) / 100).toFixed(2).replace(".", ","),
          (o.note ?? "").replace(/[\r\n;]+/g, " "),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ruga-commandes-${day}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!session) return <LoginView onLoggedIn={setSessionState} />;

  // Onglets selon le rôle : le staff ne voit que le service (commandes).
  // L'historique vit dans Service via le sélecteur de date (moins d'onglets).
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "orders", label: "Service", icon: "🍽️" },
    ...(isAdmin
      ? ([
          { key: "analytics", label: "Analytique", icon: "📈" },
          { key: "menu", label: "Carte", icon: "🧾" },
          { key: "settings", label: "Réglages", icon: "⚙️" },
          { key: "team", label: "Équipe", icon: "👥" },
        ] as const)
      : []),
  ];

  const isServiceView = tab === "orders";
  const isPastDay = day !== parisToday();

  const printDay = () => {
    if (!filteredOrders?.length) return;
    const withItems = filteredOrders.filter((o) => o.status !== "cancelled");
    withItems.forEach((o, i) => {
      setTimeout(() => printLabel(o), i * 400);
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 md:pb-16">
      {/* En-tête */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/images/logo-emblem.png" alt="" width="202" height="152" className="h-10 w-auto" />
          <div>
            <h1 className="h-serif text-xl font-black leading-none">Tableau de bord</h1>
            <p className="text-xs text-ink/50">
              {session.email}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${isAdmin ? "bg-olive/15 text-olive" : "bg-sun/20 text-[#8a5b0a]"}`}>
                {isAdmin ? "gérant" : "équipe"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/commander.html"
            className="btn-outline btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir le tunnel ↗
          </a>
          <button type="button" onClick={logout} className="btn-outline btn-sm">
            Déconnexion
          </button>
        </div>
      </header>

      {/* Navigation — en haut sur desktop, barre fixe en bas sur téléphone
          (cible tactile 44 px, safe-area iPhone) */}
      <nav
        aria-label="Sections du dashboard"
        className="mt-5 flex gap-1.5 overflow-x-auto
          max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:mt-0
          max-md:justify-around max-md:border-t max-md:border-ink/10 max-md:bg-cream
          max-md:px-1 max-md:pb-[env(safe-area-inset-bottom)] max-md:pt-1.5"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide transition-colors
              max-md:flex max-md:min-h-[48px] max-md:min-w-[64px] max-md:flex-col max-md:items-center max-md:justify-center max-md:gap-0.5 max-md:rounded-2xl max-md:px-3 max-md:py-1.5 max-md:text-[10px] ${
              tab === t.key ? "bg-ink text-cream" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
            }`}
          >
            <span aria-hidden="true" className="mr-1.5 text-base max-md:mr-0 max-md:text-xl">{t.icon}</span>
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

      {/* Bandeau service (jour courant uniquement) — 4 colonnes desktop,
          2×2 sur téléphone */}
      {isServiceView && dayOrders && day === parisToday() && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border-2 border-tomato/30 bg-tomato/[0.04] p-4">
            <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">À traiter</p>
            <p className="font-display text-3xl font-black text-tomato">{dayOrders.newCount}</p>
          </div>
          <div className="rounded-2xl border border-olive/30 bg-olive/[0.04] p-4">
            <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">Prêtes</p>
            <p className="font-display text-3xl font-black text-olive">{dayOrders.readyCount}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">Commandes du jour</p>
            <p className="font-display text-3xl font-black">{dayOrders.live.length}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">CA du jour</p>
            <p className="font-display text-3xl font-black">
              {dayOrders.revenue !== null ? euros(dayOrders.revenue) : "—"}
            </p>
          </div>
        </div>
      )}

      {/* ---------- SERVICE ---------- */}
      {isServiceView && (
        <section className="mt-6">
          {/* Ligne 1 : jour + rafraîchir */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              Jour :
              <input
                type="date"
                value={day}
                max={parisToday()}
                onChange={(e) => setDay(e.target.value)}
                className="min-h-[40px] rounded-xl border-2 border-ink/12 px-3 py-1.5"
              />
            </label>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn-outline btn-sm">
              Rafraîchir
            </button>
          </div>

          {/* Ligne 2 : recherche + filtre (repliés sous « Filtres » sur téléphone) */}
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <label className="relative max-md:w-full">
              <span className="sr-only">Rechercher une commande</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Code, nom, téléphone…"
                className="min-h-[40px] w-56 rounded-full border-2 border-ink/12 bg-white px-4 py-2 text-sm outline-none focus:border-tomato max-md:w-full"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="min-h-[40px] rounded-full border-2 border-ink/12 bg-white px-3 py-2 text-sm font-bold"
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous les statuts</option>
              {(Object.keys(STATUS_LABELS) as OrderRow["status"][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <details className="max-md:w-full md:hidden">
              <summary className="inline-flex min-h-[40px] cursor-pointer items-center rounded-full border-2 border-ink/12 bg-white px-4 py-2 text-sm font-extrabold uppercase">
                ⋯ Actions
              </summary>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!filteredOrders?.length}
                  className="btn-outline btn-sm min-h-[40px] disabled:opacity-40"
                >
                  ⬇ CSV
                </button>
                <button
                  type="button"
                  onClick={printDay}
                  disabled={!filteredOrders?.length}
                  className="btn-outline btn-sm min-h-[40px] disabled:opacity-40"
                >
                  🖨️ Étiquettes
                </button>
              </div>
            </details>
            <div className="max-md:hidden">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!filteredOrders?.length}
                className="btn-outline btn-sm disabled:opacity-40"
                title="Exporter vers un tableur"
              >
                ⬇ CSV
              </button>
              <button
                type="button"
                onClick={printDay}
                disabled={!filteredOrders?.length}
                className="btn-outline btn-sm ml-2 disabled:opacity-40"
                title="Imprimer les étiquettes cuisine des commandes non annulées"
              >
                🖨️ Étiquettes
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-ink/45">
            {filteredOrders?.length ?? 0} commande{(filteredOrders?.length ?? 0) > 1 ? "s" : ""} affichée
            {(filteredOrders?.length ?? 0) > 1 ? "s" : ""}
            {isPastDay && " — historique d'un jour passé"}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {orders === null ? (
              <p className="text-sm text-ink/50">Chargement…</p>
            ) : filteredOrders && filteredOrders.length > 0 ? (
              filteredOrders.map((order) => (
                <OrderCard key={order.code} order={order} onStatus={changeStatus} busy={busy} onPrint={printLabel} />
              ))
            ) : (
              <p className="rounded-2xl bg-cream-2 p-5 text-sm text-ink/60 md:col-span-2">
                Aucune commande {statusFilter !== "all" || search ? "pour ce filtre" : "ce jour-là"}.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ---------- ANALYTICS (admin) ---------- */}
      {tab === "analytics" && <AnalyticsView days={statsDays} setDays={setStatsDays} />}

      {/* ---------- CARTE (admin) ---------- */}
      {tab === "menu" && <MenuView />}

      {/* ---------- ÉQUIPE (admin) ---------- */}
      {tab === "team" && <TeamView />}

      {/* ---------- RÉGLAGES ---------- */}
      {tab === "settings" && (
        <SettingsPlaceholder onRetry={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
  );
}

/** Charge les réglages puis rend SettingsView. */
function SettingsPlaceholder({ onRetry }: { onRetry: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ settings: Settings }>("/api/admin/settings");
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, onRetry]);

  if (error) {
    return (
      <p className="mt-6 rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-3 text-sm font-semibold text-tomato-deep" role="alert">
        {error}
      </p>
    );
  }
  if (!settings) return <p className="mt-6 text-sm text-ink/50">Chargement…</p>;
  return <SettingsView settings={settings} setSettings={setSettings} />;
}

/* -------------------------------------------------------------------------- */
/*  Étiquette cuisine — impression via une fenêtre dédiée (styles isolés)      */
/* -------------------------------------------------------------------------- */

function printLabel(order: OrderRow) {
  const when = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(order.pickup_at));
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.pickup_at));

  const groups = groupOrderItems(order.order_items);
  const lines = groups
    .map((group) => {
      const extras = group.extras.map((e) =>
        e.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 60),
      );
      const title = group.title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const qty = group.qty > 1 ? `${group.qty}× ` : "";
      if (extras.length === 0) {
        return `<tr><td class="qty">${qty}</td><td>${title}</td></tr>`;
      }
      return `<tr>
        <td class="qty">${qty}</td>
        <td><strong>${title} :</strong>
          <ul class="extras">${extras.map((e) => `<li>${e}</li>`).join("")}</ul>
        </td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Étiquette ${order.code}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; padding: 10mm; background: #fff; }
  .label { width: 100mm; border: 2px solid #000; border-radius: 4mm; padding: 6mm; }
  .code { font-size: 30pt; font-weight: 900; letter-spacing: 1px; }
  .when { margin-top: 1mm; font-size: 12pt; color: #444; }
  .slot { margin-top: 4mm; font-size: 44pt; font-weight: 900; text-align: center;
          background: #000; color: #fff; border-radius: 3mm; padding: 2mm 0; }
  table { width: 100%; margin-top: 5mm; border-collapse: collapse; }
  td { padding: 2.5mm 0; border-bottom: 1px dashed #999; font-size: 13pt; vertical-align: top; }
  td.qty { font-weight: 900; width: 12mm; white-space: nowrap; }
  ul.extras { margin: 1mm 0 0 5mm; padding: 0; list-style: disc; }
  ul.extras li { font-size: 11.5pt; border: 0; padding: 0.5mm 0; }
  .note { margin-top: 4mm; font-size: 12pt; font-weight: 700; background: #fff3c4;
          border: 1px solid #d9b300; border-radius: 2mm; padding: 2.5mm 3mm; }
  .foot { margin-top: 5mm; font-size: 9pt; color: #666; text-align: center; }
  @media print { body { padding: 0; } }  /* l'étiquette EST la page */
</style>
</head>
<body>
  <div class="label">
    <div class="code">${order.code}</div>
    <div class="when">${when} · ${order.customer_name}</div>
    <div class="slot">${time}</div>
    <table>${lines}</table>
    ${order.note ? `<div class="note">📝 ${order.note.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>` : ""}
    <div class="foot">Ruga Pasta · Click &amp; Collect</div>
  </div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </${"script"}>
</body>
</html>`;

  const win = window.open("", "_blank", "width=480,height=640");
  if (!win) {
    window.alert("Le navigateur a bloqué la fenêtre d'impression. Autorise les pop-ups pour ce site.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

/* -------------------------------------------------------------------------- */
/*  Vue ÉQUIPE — création et gestion des comptes staff (rôle admin requis)     */
/* -------------------------------------------------------------------------- */

type TeamUser = { email: string; role: "admin" | "staff"; label: string | null; created_at: string };

function TeamView() {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ users: TeamUser[] }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ action: "list" }),
      });
      setUsers(data.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
      setNotice(done);
      await load();
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const flash = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setNotice(`Mot de passe copié — colle-le en toute sécurité au salarié.`);
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      {error && (
        <p className="rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-3 text-sm font-semibold text-tomato-deep lg:col-span-2" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-2xl border-2 border-olive/30 bg-olive/10 p-3 text-sm font-semibold text-olive lg:col-span-2" role="status">
          ✓ {notice}
        </p>
      )}

      {/* Création */}
      <form
        className="rounded-3xl border border-ink/10 bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "create", email, password, role, label }, `Compte créé pour ${email}.`).then(() => {
            setEmail("");
            setPassword("");
            setLabel("");
            setRole("staff");
          });
        }}
      >
        <h2 className="font-display text-lg font-black">Créer un compte</h2>
        <p className="mt-1 text-xs text-ink/50">
          Le compte est actif immédiatement. Communique le mot de passe en personne —
          il n'y a pas d'email d'activation.
        </p>
        <label className="mt-4 block text-sm font-bold">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
            placeholder="sarah@exemple.fr"
          />
        </label>
        <label className="mt-3 block text-sm font-bold">
          Mot de passe (8 caractères min.)
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              required
              minLength={8}
              maxLength={64}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-2 border-ink/12 px-3 py-2 font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => flash(genPassword())}
              className="btn-outline btn-sm shrink-0"
              title="Générer et copier un mot de passe solide"
            >
              🎲 Générer
            </button>
          </div>
        </label>
        <label className="mt-3 block text-sm font-bold">
          Rôle
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "staff" | "admin")}
            className="mt-1 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
          >
            <option value="staff">Équipe — commandes et statuts uniquement</option>
            <option value="admin">Admin — tout, comme le gérant</option>
          </select>
        </label>
        <label className="mt-3 block text-sm font-bold">
          Nom / précision (facultatif)
          <input
            type="text"
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-ink/12 px-3 py-2"
            placeholder="Sarah — cuisine"
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary mt-4 w-full disabled:opacity-50">
          {busy ? "Création…" : "Créer le compte"}
        </button>
      </form>

      {/* Liste */}
      <div className="rounded-3xl border border-ink/10 bg-white p-6">
        <h2 className="font-display text-lg font-black">Comptes de l'équipe</h2>
        {users === null ? (
          <p className="mt-3 text-sm text-ink/50">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="mt-3 text-sm text-ink/50">
            Aucun compte supplémentaire. Le gérant se connecte avec son email allowlisté.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {users.map((u) => (
              <li
                key={u.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-cream/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {u.label || u.email}
                    {u.label && <span className="ml-1.5 text-xs font-normal text-ink/50">{u.email}</span>}
                  </p>
                  <p className="text-xs text-ink/50">
                    Créé le {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(u.created_at))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase ${u.role === "admin" ? "bg-olive/15 text-olive" : "bg-sun/20 text-[#8a5b0a]"}`}>
                    {u.role === "admin" ? "admin" : "équipe"}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Supprimer le compte ${u.email} ? Le salarié ne pourra plus se connecter.`)) {
                        void act({ action: "delete", email: u.email }, `Compte ${u.email} supprimé.`);
                      }
                    }}
                    className="rounded-lg px-2 py-1 text-sm hover:bg-tomato/10"
                    aria-label={`Supprimer le compte ${u.email}`}
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-ink/50">
          🔒 Rôle « équipe » : commandes, statuts et étiquettes — sans prix, chiffre
          d'affaires, analytique, carte ni réglages. Rôle « admin » : accès complet.
        </p>
      </div>
    </section>
  );
}

/** Mot de passe prononçable-ish : lettres + chiffres, sans caractères ambigus. */
function genPassword(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
