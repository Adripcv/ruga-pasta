/**
 * Tests de la logique métier — le cœur du système. `npm test` doit rester vert
 * avant chaque commit : ces tests sont la garantie qu'aucune régression ne
 * touche les prix, les créneaux (fuseau Paris / heure d'été) ni les statuts.
 */
import { describe, expect, it } from "vitest";
import {
  canTransition,
  generateOrderCode,
  normalizeFrenchPhone,
  orderingStatus,
  parisDateToUtc,
  parisOffsetMinutes,
  parisWeekday,
  priceCart,
  slotsForDate,
  tomorrowParisISO,
  todayParisISO,
  validateCustomer,
  type MenuNode,
  type StoreSettings,
} from "./domain.js";

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

const SETTINGS: StoreSettings = {
  ordering_enabled: true,
  ordering_message: null,
  slot_minutes: 15,
  prep_delay_minutes: 20,
  open_minutes: 11 * 60,
  close_minutes: 21 * 60,
  capacity_per_slot: 6,
  closed_weekdays: [0], // dimanche
  admin_notify_email: null,
};

const menu = (over: Partial<MenuNode>): MenuNode => ({
  id: "x",
  name: "X",
  price_cents: 100,
  max_qty: 1,
  children: [],
  ...over,
});

const MENU: MenuNode[] = [
  menu({
    id: "box",
    name: "Compose ta box",
    price_cents: null,
    children: [
      menu({
        id: "box-s",
        name: "Box S",
        price_cents: 650,
        max_qty: 10,
        children: [
          menu({ id: "sauce-pesto", name: "Pesto", price_cents: 0 }),
          menu({ id: "sauce-carbo", name: "Carbonara", price_cents: 0 }),
        ],
      }),
      menu({ id: "box-m", name: "Box M", price_cents: 850, max_qty: 10 }),
    ],
  }),
  menu({ id: "tiramisu", name: "Tiramisu", price_cents: 400, max_qty: 5 }),
  menu({ id: "cola", name: "Coca-Cola", price_cents: 200, max_qty: 10 }),
];

/** Mercredi 15 juillet 2026, 10:00 UTC = 12:00 à Paris (heure d'été). */
const SUMMER_NOON = new Date("2026-07-15T10:00:00Z");

// ---------------------------------------------------------------------------
// Fuseau Europe/Paris
// ---------------------------------------------------------------------------

describe("parisOffsetMinutes", () => {
  it("renvoie +60 en hiver et +120 en été", () => {
    expect(parisOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(60);
    expect(parisOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(120);
  });

  it("bascule à 01:00 UTC le dernier dimanche de mars", () => {
    // 29 mars 2026 est le dernier dimanche de mars.
    expect(parisOffsetMinutes(new Date("2026-03-29T00:59:59Z"))).toBe(60);
    expect(parisOffsetMinutes(new Date("2026-03-29T01:00:00Z"))).toBe(120);
  });

  it("rebascule à 01:00 UTC le dernier dimanche d'octobre", () => {
    // 25 octobre 2026 est le dernier dimanche d'octobre.
    expect(parisOffsetMinutes(new Date("2026-10-25T00:59:59Z"))).toBe(120);
    expect(parisOffsetMinutes(new Date("2026-10-25T01:00:00Z"))).toBe(60);
  });
});

describe("parisDateToUtc", () => {
  it("convertit minuit à Paris vers UTC (été et hiver)", () => {
    // 2026-07-15 00:00 Paris = 2026-07-14 22:00 UTC (décalé au jour précédent).
    expect(parisDateToUtc("2026-07-15", 0)?.toISOString()).toBe(
      "2026-07-14T22:00:00.000Z",
    );
    // 2026-01-15 00:00 Paris = 2026-01-14 23:00 UTC.
    expect(parisDateToUtc("2026-01-15", 0)?.toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });

  it("refuse les dates invalides au lieu de les normaliser", () => {
    expect(parisDateToUtc("2026-02-31", 0)).toBeNull();
    expect(parisDateToUtc("2026-13-01", 0)).toBeNull();
    expect(parisDateToUtc("15/07/2026", 0)).toBeNull();
    expect(parisDateToUtc("2026-07-15T10:00", 0)).toBeNull();
  });
});

describe("jours et dates à Paris", () => {
  it("parisWeekday donne le jour calendaire parisien", () => {
    expect(parisWeekday("2026-07-15")).toBe(3); // mercredi
    expect(parisWeekday("2026-07-19")).toBe(0); // dimanche
    expect(parisWeekday("bad")).toBeNull();
  });

  it("todayParisISO / tomorrowParisISO suivent l'horloge de Paris, pas UTC", () => {
    // 23 h UTC en été = 1 h du matin le LENDEMAIN à Paris.
    const lateUtc = new Date("2026-07-15T23:00:00Z");
    expect(todayParisISO(lateUtc)).toBe("2026-07-16");
    expect(tomorrowParisISO(lateUtc)).toBe("2026-07-17");

    // Fin de mois + passage d'heure d'hiver (31 oct 2026) : demain reste juste.
    expect(tomorrowParisISO(new Date("2026-10-30T23:00:00Z"))).toBe(
      "2026-11-01",
    );
  });
});

// ---------------------------------------------------------------------------
// Créneaux
// ---------------------------------------------------------------------------

describe("slotsForDate", () => {
  it("génère les créneaux 11:00 → 21:00 par tranches de 15 min", () => {
    const slots = slotsForDate(SETTINGS, "2026-07-16", SUMMER_NOON);
    expect(slots).not.toBeNull();
    expect(slots![0]).toMatchObject({ label: "11:00", dateISO: "2026-07-16" });
    // Dernier créneau : 20:45 (11 h + 45 × 15 min = 20:45, fin à 21:00 pile).
    expect(slots![slots!.length - 1].label).toBe("20:45");
    expect(slots).toHaveLength(40);
  });

  it("grise le jour de fermeture hebdomadaire (dimanche)", () => {
    const slots = slotsForDate(SETTINGS, "2026-07-19", SUMMER_NOON);
    expect(slots!.every((s) => !s.available && s.reason === "closed-day")).toBe(
      true,
    );
  });

  it("grise les créneaux passés et ceux sous le délai de préparation", () => {
    // 12:00 à Paris : 11:00–11:45 passés ; 12:00 et 12:15 sous les 20 min de prep.
    const slots = slotsForDate(SETTINGS, "2026-07-15", SUMMER_NOON);
    expect(slots![0].reason).toBe("past");
    expect(slots![3].reason).toBe("past"); // 11:45
    expect(slots![4].reason).toBe("prep-delay"); // 12:00
    expect(slots![5].reason).toBe("prep-delay"); // 12:15
    expect(slots![6].available).toBe(true); // 12:30
  });

  it("tout est grisé pour une date passée, et disponible dans le futur lointain", () => {
    const past = slotsForDate(SETTINGS, "2026-07-01", SUMMER_NOON);
    expect(past!.every((s) => !s.available)).toBe(true);

    const future = slotsForDate(SETTINGS, "2026-08-01", SUMMER_NOON);
    expect(future!.every((s) => s.available)).toBe(true);
  });

  it("retourne null sur une date mal formée", () => {
    expect(slotsForDate(SETTINGS, "garbage", SUMMER_NOON)).toBeNull();
  });
});

describe("orderingStatus", () => {
  it("fermé avant l'ouverture, ouvert pendant, fermé après", () => {
    // 09:00 à Paris (07:00 UTC en été).
    const morning = new Date("2026-07-15T07:00:00Z");
    expect(orderingStatus(SETTINGS, morning)).toMatchObject({
      open: false,
      message: expect.stringContaining("11:00"),
    });

    expect(orderingStatus(SETTINGS, SUMMER_NOON).open).toBe(true);

    // 21:30 à Paris (19:30 UTC).
    const night = new Date("2026-07-15T19:30:00Z");
    expect(orderingStatus(SETTINGS, night)).toMatchObject({
      open: false,
      message: expect.stringContaining("Service terminé"),
    });
  });

  it("fermé le dimanche avec message dédié", () => {
    const sunday = new Date("2026-07-19T10:00:00Z");
    const s = orderingStatus(SETTINGS, sunday);
    expect(s.open).toBe(false);
    expect(s.message).toContain("Fermé aujourd'hui");
  });

  it("l'interrupteur manuel prime et affiche le message du gérant", () => {
    const s = orderingStatus(
      {
        ...SETTINGS,
        ordering_enabled: false,
        ordering_message: "Vacances jusqu'au 15 août !",
      },
      SUMMER_NOON,
    );
    expect(s).toEqual({ open: false, message: "Vacances jusqu'au 15 août !" });
  });
});

// ---------------------------------------------------------------------------
// Prix — le serveur est la seule autorité
// ---------------------------------------------------------------------------

describe("priceCart", () => {
  it("recalcule le total depuis le menu, ignore tout prix envoyé par le client", () => {
    const result = priceCart(MENU, [
      { id: "box-s", qty: 2 },
      { id: "tiramisu", qty: 1 },
    ]);
    expect(result).toMatchObject({
      ok: true,
      total_cents: 650 * 2 + 400,
    });
    expect(result.ok && result.lines[0].path).toEqual([
      "Compose ta box",
      "Box S",
    ]);
  });

  it("refuse un article inconnu (id fabriqué par un client falsifié)", () => {
    const result = priceCart(MENU, [{ id: "box-s", qty: 1 }, { id: "hack", qty: 1 }]);
    expect(result.ok).toBe(false);
  });

  it("refuse un noeud non commandable (groupe) et une quantité excessive", () => {
    expect(priceCart(MENU, [{ id: "box", qty: 1 }]).ok).toBe(false);
    expect(priceCart(MENU, [{ id: "box-m", qty: 11 }]).ok).toBe(false);
    expect(priceCart(MENU, [{ id: "box-s", qty: 0 }]).ok).toBe(false);
    expect(priceCart(MENU, [{ id: "box-s", qty: 1.5 }]).ok).toBe(false);
  });

  it("refuse panier vide, trop volumineux, et total nul (options gratuites seules)", () => {
    expect(priceCart(MENU, []).ok).toBe(false);
    expect(priceCart(MENU, new Array(41).fill({ id: "cola", qty: 1 })).ok).toBe(
      false,
    );
    // Les sauces à 0 € ne suffisent pas : il faut au moins une box.
    expect(priceCart(MENU, [{ id: "sauce-pesto", qty: 1 }])).toMatchObject({
      ok: false,
      error: "Total invalide.",
    });
  });

  it("tolère les payloads hostiles (objets, null, chaînes)", () => {
    expect(priceCart(MENU, null).ok).toBe(false);
    expect(priceCart(MENU, "box-s").ok).toBe(false);
    expect(priceCart(MENU, [{ id: 1, qty: 1 }]).ok).toBe(false);
    expect(priceCart(MENU, [{ id: "box-s", qty: "2" }]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coordonnées
// ---------------------------------------------------------------------------

describe("normalizeFrenchPhone", () => {
  it.each([
    ["06 12 34 56 78", "+33612345678"],
    ["06.12.34.56.78", "+33612345678"],
    ["+33612345678", "+33612345678"],
    ["0033612345678", "+33612345678"],
    ["04 42 23 37 08", "+33442233708"],
    [" 0612345678 ", "+33612345678"],
  ])("normalise %s → %s", (raw, expected) => {
    expect(normalizeFrenchPhone(raw)).toBe(expected);
  });

  it.each(["1234", "06 12 34 56", "+336123456780", "abc", "", null, 612345678])(
    "refuse %s",
    (raw) => {
      expect(normalizeFrenchPhone(raw)).toBeNull();
    },
  );
});

describe("validateCustomer", () => {
  it("accepte un couple nom/téléphone propre", () => {
    expect(
      validateCustomer("  Marie   Dupont  ", "06 12 34 56 78"),
    ).toEqual({ ok: true, name: "Marie Dupont", phone: "+33612345678" });
  });

  it("refuse noms vides, trop longs ou avec chiffres", () => {
    expect(validateCustomer("", "0612345678").ok).toBe(false);
    expect(validateCustomer("A", "0612345678").ok).toBe(false);
    expect(validateCustomer("x".repeat(61), "0612345678").ok).toBe(false);
    expect(validateCustomer("Jean <script>", "0612345678").ok).toBe(false);
    expect(validateCustomer("Marie", "06 12").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

describe("machine à états des commandes", () => {
  it("autorise le cycle normal et l'annulation", () => {
    expect(canTransition("new", "preparing")).toBe(true);
    expect(canTransition("preparing", "ready")).toBe(true);
    expect(canTransition("ready", "picked_up")).toBe(true);
    expect(canTransition("new", "cancelled")).toBe(true);
    expect(canTransition("ready", "cancelled")).toBe(true);
  });

  it("interdit les sauts, les retours en arrière et la résurrection", () => {
    expect(canTransition("new", "ready")).toBe(false);
    expect(canTransition("new", "picked_up")).toBe(false);
    expect(canTransition("ready", "preparing")).toBe(false);
    expect(canTransition("cancelled", "preparing")).toBe(false);
    expect(canTransition("picked_up", "cancelled")).toBe(false);
    expect(canTransition("picked_up", "picked_up")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Code commande
// ---------------------------------------------------------------------------

describe("generateOrderCode", () => {
  it("produit un code du format RUGA-XXXX, sans caractères ambigus", () => {
    const code = generateOrderCode(() => 0.42);
    expect(code).toMatch(/^RUGA-[2-9A-HJ-NP-Z]{4}$/);
    expect(code).not.toMatch(/[01ILO]/);
  });

  it("est déterministe avec une source aléatoire injectée", () => {
    expect(generateOrderCode(() => 0)).toBe("RUGA-2222");
    expect(generateOrderCode(() => 0.9999)).toBe("RUGA-ZZZZ");
  });
});
