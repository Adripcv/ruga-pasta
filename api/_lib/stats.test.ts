/**
 * Tests du module d'agrégations — les chiffres du dashboard doivent être
 * EXACTS (le gérant pilote son activité dessus). Cas couverts : fuseau Paris
 * (commande UTC 22h → jour parisien suivant), jours vides, annulations,
 * tendances période précédente, top produits, affluence horaire.
 */
import { describe, expect, it } from "vitest";
import { aggregateStats, parisDayKey, parisHour, type StatOrder } from "./stats.js";

// 2026-09-14 = lundi (Paris). 12:00 Paris = 10:00 UTC (été).
const NOW = new Date("2026-09-19T14:00:00.000Z"); // samedi 16:00 Paris

const order = (over: Partial<StatOrder>): StatOrder => ({
  created_at: "2026-09-18T10:00:00.000Z",
  pickup_at: "2026-09-18T11:00:00.000Z",
  status: "picked_up",
  total_cents: 1000,
  order_items: [],
  ...over,
});

describe("parisDayKey / parisHour", () => {
  it("ramène 22h UTC au jour suivant à Paris", () => {
    // 2026-09-18T22:30:00Z = 2026-09-19 00:30 à Paris (été, +2h).
    expect(parisDayKey("2026-09-18T22:30:00.000Z")).toBe("2026-09-19");
    expect(parisHour("2026-09-18T22:30:00.000Z")).toBe(0);
  });

  it("reste sur le même jour en journée", () => {
    expect(parisDayKey("2026-09-18T10:00:00.000Z")).toBe("2026-09-18");
    expect(parisHour("2026-09-18T10:00:00.000Z")).toBe(12);
  });

  it("gère les entrées invalides sans planter", () => {
    expect(parisDayKey("nimporte-quoi")).toBe("");
    expect(parisHour("nimporte-quoi")).toBe(-1);
  });
});

describe("aggregateStats", () => {
  it("calcule les KPI exacts sur 7 jours", () => {
    const orders: StatOrder[] = [
      order({ created_at: "2026-09-18T10:00:00.000Z", total_cents: 650 }),
      order({ created_at: "2026-09-18T11:00:00.000Z", total_cents: 850 }),
      order({ created_at: "2026-09-17T10:00:00.000Z", total_cents: 1190, status: "cancelled" }),
    ];
    const s = aggregateStats(orders, 7, NOW);
    expect(s.kpis.revenue_cents).toBe(1500);
    expect(s.kpis.order_count).toBe(2);
    expect(s.kpis.average_cents).toBe(750);
    expect(s.kpis.cancelled_count).toBe(1);
    expect(s.kpis.cancellation_rate).toBeCloseTo(1 / 3, 5);
  });

  it("produit TOUS les jours de la période, même vides", () => {
    const s = aggregateStats(
      [order({ created_at: "2026-09-18T10:00:00.000Z" })],
      7,
      NOW,
    );
    expect(s.daily).toHaveLength(7);
    expect(s.daily[6].date).toBe("2026-09-19");
    expect(s.daily[0].revenue_cents).toBe(0); // jour vide ≠ jour manquant
    const filled = s.daily.find((d) => d.date === "2026-09-18");
    expect(filled?.orders).toBe(1);
    expect(filled?.revenue_cents).toBe(1000);
  });

  it("sépare la période précédente pour les tendances", () => {
    const orders: StatOrder[] = [
      // Semaine courante (13-19 sept)
      order({ created_at: "2026-09-18T10:00:00.000Z", total_cents: 1000 }),
      // Semaine précédente (6-12 sept)
      order({ created_at: "2026-09-10T10:00:00.000Z", total_cents: 2500 }),
      order({ created_at: "2026-09-11T10:00:00.000Z", total_cents: 500 }),
    ];
    const s = aggregateStats(orders, 7, NOW);
    expect(s.kpis.revenue_cents).toBe(1000);
    expect(s.kpis.prev_revenue_cents).toBe(3000);
    expect(s.kpis.prev_order_count).toBe(2);
  });

  it("classe l'affluence à l'heure de retrait PARISIENNE", () => {
    const s = aggregateStats(
      [
        // Retrait 09:00 UTC = 11:00 Paris
        order({ pickup_at: "2026-09-18T09:00:00.000Z" }),
        // Retrait 21:30 UTC = 23:30 Paris
        order({ pickup_at: "2026-09-18T21:30:00.000Z" }),
      ],
      7,
      NOW,
    );
    expect(s.hourly[11].orders).toBe(1);
    expect(s.hourly[23].orders).toBe(1);
    expect(s.hourly[10].orders).toBe(0);
  });

  it("classe le top produits par CA décroissant", () => {
    const s = aggregateStats(
      [
        order({
          created_at: "2026-09-18T10:00:00.000Z",
          order_items: [
            { name: "Box S", qty: 1, line_cents: 650 },
            { name: "Tiramisu", qty: 1, line_cents: 400 },
          ],
        }),
        order({
          created_at: "2026-09-18T11:00:00.000Z",
          order_items: [{ name: "Box S", qty: 2, line_cents: 1300 }],
        }),
      ],
      7,
      NOW,
    );
    expect(s.top_items[0].name).toBe("Box S");
    expect(s.top_items[0].qty).toBe(3);
    expect(s.top_items[0].revenue_cents).toBe(1950);
    expect(s.top_items[1].name).toBe("Tiramisu");
  });

  it("compte la répartition par statut", () => {
    const s = aggregateStats(
      [
        order({ status: "new" }),
        order({ status: "new", created_at: "2026-09-18T11:00:00.000Z" }),
        order({ status: "picked_up", created_at: "2026-09-17T10:00:00.000Z" }),
        order({ status: "cancelled", created_at: "2026-09-16T10:00:00.000Z" }),
      ],
      7,
      NOW,
    );
    expect(s.statuses).toEqual([
      { status: "new", count: 2 },
      { status: "picked_up", count: 1 },
      { status: "cancelled", count: 1 },
    ]);
  });

  it("aucune commande → zéros propres, pas de division par zéro", () => {
    const s = aggregateStats([], 7, NOW);
    expect(s.kpis.revenue_cents).toBe(0);
    expect(s.kpis.average_cents).toBe(0);
    expect(s.kpis.cancellation_rate).toBe(0);
    expect(s.daily).toHaveLength(7);
    expect(s.top_items).toEqual([]);
  });
});
