/**
 * 📊 Agrégations analytiques du dashboard — module PUR (aucune dépendance
 * base/Node) : prend des commandes en entrée, renvoie des chiffres. Testé à
 * 100 % dans stats.test.ts, partagé entre l'API et d'éventuels exports.
 *
 * Toutes les dates affichées sont à Paris (fuseau de la boutique) : une
 * commande passée à 23h30 UTC un dimanche compte sur le lundi parisien.
 */
import { parisOffsetMinutes } from "./domain.js";

export type StatOrder = {
  created_at: string;
  pickup_at: string;
  status: string;
  total_cents: number;
  order_items?: { name: string; qty: number; line_cents: number }[];
};

export type DayPoint = {
  date: string; // YYYY-MM-DD (Paris)
  revenue_cents: number;
  orders: number;
  cancelled: number;
};

export type HourPoint = { hour: number; orders: number; revenue_cents: number };
export type TopItem = { name: string; qty: number; revenue_cents: number };

export type RichStats = {
  days: number;
  kpis: {
    revenue_cents: number;
    order_count: number;
    average_cents: number;
    cancelled_count: number;
    cancellation_rate: number; // 0..1
    /** Période précédente (même durée) — pour les tendances ↗ ↘. */
    prev_revenue_cents: number;
    prev_order_count: number;
  };
  daily: DayPoint[];
  /** Affluence par heure de RETRAIT (0–23, heure de Paris). */
  hourly: HourPoint[];
  top_items: TopItem[];
  statuses: { status: string; count: number }[];
};

/** « YYYY-MM-DD » à Paris pour un instant ISO UTC. */
export function parisDayKey(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const offset = parisOffsetMinutes(new Date(t));
  return new Date(t + offset * 60_000).toISOString().slice(0, 10);
}

/** Heure (0–23) à Paris pour un instant ISO UTC. */
export function parisHour(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return -1;
  const offset = parisOffsetMinutes(new Date(t));
  return new Date(t + offset * 60_000).getUTCHours();
}

/**
 * Agrège une liste de commandes (période courante + précédente récupérées
 * par l'appelant) en statistiques riches.
 */
export function aggregateStats(
  orders: StatOrder[],
  days: number,
  now: Date,
): RichStats {
  const since = now.getTime() - days * 86_400_000;
  const prevSince = since - days * 86_400_000;

  const inPeriod = orders.filter((o) => Date.parse(o.created_at) >= since);
  const current = inPeriod.filter((o) => o.status !== "cancelled");
  const cancelled = inPeriod.filter((o) => o.status === "cancelled");
  const prev = orders.filter((o) => {
    const t = Date.parse(o.created_at);
    return t >= prevSince && t < since && o.status !== "cancelled";
  });

  const revenue = current.reduce((s, o) => s + o.total_cents, 0);
  const prevRevenue = prev.reduce((s, o) => s + o.total_cents, 0);

  // Série journalière : TOUS les jours de la période (0 € les jours vides —
  // indispensable pour un graphique honnête).
  const daily: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = parisDayKey(new Date(now.getTime() - i * 86_400_000).toISOString());
    daily.push({ date: d, revenue_cents: 0, orders: 0, cancelled: 0 });
  }
  const byDate = new Map(daily.map((d) => [d.date, d]));
  for (const o of inPeriod) {
    const day = byDate.get(parisDayKey(o.created_at));
    if (!day) continue;
    if (o.status === "cancelled") {
      day.cancelled += 1;
      continue;
    }
    day.orders += 1;
    day.revenue_cents += o.total_cents;
  }

  // Affluence par heure de retrait.
  const hourly: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue_cents: 0,
  }));
  for (const o of current) {
    const h = parisHour(o.pickup_at);
    if (h < 0 || h > 23) continue;
    hourly[h].orders += 1;
    hourly[h].revenue_cents += o.total_cents;
  }

  // Top produits par chiffre d'affaires (pas seulement la quantité).
  const items = new Map<string, TopItem>();
  for (const o of current) {
    for (const it of o.order_items ?? []) {
      const entry = items.get(it.name) ?? {
        name: it.name,
        qty: 0,
        revenue_cents: 0,
      };
      entry.qty += it.qty;
      entry.revenue_cents += it.line_cents;
      items.set(it.name, entry);
    }
  }
  const top_items = [...items.values()]
    .sort((a, b) => b.revenue_cents - a.revenue_cents || b.qty - a.qty)
    .slice(0, 8);

  // Répartition par statut (toutes commandes de la période).
  const statusCount = new Map<string, number>();
  for (const o of inPeriod) {
    statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
  }
  const statuses = [...statusCount.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const attempts = current.length + cancelled.length;
  return {
    days,
    kpis: {
      revenue_cents: revenue,
      order_count: current.length,
      average_cents: current.length ? Math.round(revenue / current.length) : 0,
      cancelled_count: cancelled.length,
      cancellation_rate: attempts ? cancelled.length / attempts : 0,
      prev_revenue_cents: prevRevenue,
      prev_order_count: prev.length,
    },
    daily,
    hourly,
    top_items,
    statuses,
  };
}
