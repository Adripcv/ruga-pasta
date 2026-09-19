import { describe, expect, it } from "vitest";
import {
  addToSelections,
  buildRequiredRules,
  cartCount,
  cartTotalCents,
  flattenItems,
  missingRequired,
  setRadioSelection,
  type FlatItem,
} from "./cart";
import type { MenuNode } from "./client";

const n = (over: Partial<MenuNode>): MenuNode => ({
  id: "x",
  name: "X",
  price_cents: 100,
  max_qty: 1,
  children: [],
  ...over,
});

const TREE: MenuNode[] = [
  n({
    id: "box",
    name: "Compose ta box",
    price_cents: null,
    children: [
      n({ id: "box-s", name: "Box S", price_cents: 650, max_qty: 10, children: [
        n({ id: "sauce-tomate", name: "Tomate", price_cents: 0 }),
        n({ id: "sauce-pesto", name: "Pesto", price_cents: 0 }),
      ] }),
      n({ id: "box-m", name: "Box M", price_cents: 850, max_qty: 10 }),
    ],
  }),
  n({ id: "tiramisu", name: "Tiramisu", price_cents: 400, max_qty: 5 }),
];

const ITEMS: FlatItem[] = flattenItems(TREE);

describe("flattenItems", () => {
  it("aplatit toutes les feuilles commandables avec leur chemin", () => {
    const ids = ITEMS.map((i) => i.node.id);
    expect(ids).toContain("box-s");
    expect(ids).toContain("tiramisu");
    const boxS = ITEMS.find((i) => i.node.id === "box-s")!;
    expect(boxS.path).toEqual(["Compose ta box", "Box S"]);
  });

  it("exclut les groupes non commandables", () => {
    expect(ITEMS.some((i) => i.node.id === "box")).toBe(false);
  });
});

describe("cartTotalCents", () => {
  it("calcule depuis l'arbre, pas depuis une saisie", () => {
    expect(
      cartTotalCents({ "box-s": 2, tiramisu: 1 }, ITEMS),
    ).toBe(650 * 2 + 400);
  });

  it("ignora les clés inconnues (défense en profondeur)", () => {
    expect(cartTotalCents({ hack: 5 }, ITEMS)).toBe(0);
  });
});

describe("addToSelections", () => {
  it("borne à max_qty et retire à zéro", () => {
    let s = addToSelections({}, "box-s", 1, 10);
    s = addToSelections(s, "box-s", 15, 10); // plafonné à 10
    expect(s["box-s"]).toBe(10);
    s = addToSelections(s, "box-s", -10, 10);
    expect("box-s" in s).toBe(false);
  });
});

describe("setRadioSelection", () => {
  it("retire les frères du groupe et pose la valeur", () => {
    const s = setRadioSelection(
      { "sauce-tomate": 1, tiramisu: 2 },
      "sauce-pesto",
      ["sauce-tomate", "sauce-pesto"],
    );
    expect(s).toEqual({ tiramisu: 2, "sauce-pesto": 1 });
  });
});

describe("missingRequired", () => {
  it("exige une sauce quand une box est sélectionnée", () => {
    const rules = [
      {
        whenAnyOf: ["box-s", "box-m"],
        oneOf: ["sauce-tomate", "sauce-pesto"],
        label: "Choisis une sauce",
      },
    ];
    expect(missingRequired({ "box-s": 1 }, rules)).toEqual(["Choisis une sauce"]);
    expect(missingRequired({ "box-s": 1, "sauce-pesto": 1 }, rules)).toEqual([]);
    expect(missingRequired({ tiramisu: 1 }, rules)).toEqual([]); // pas de box → pas d'exigence
  });
});

describe("buildRequiredRules", () => {
  it("crée une règle par groupe obligatoire d'un produit sélectionnable", () => {
    const tree: MenuNode[] = [
      n({
        id: "box", name: "Compose ta box", price_cents: null, children: [
          n({ id: "box-s", name: "Box S", price_cents: 650, max_qty: 10, children: [
            n({ id: "pates", name: "Pâtes", price_cents: null, children: [
              n({ id: "p-fusilli", name: "Fusilli", price_cents: 0 }),
            ] }),
            n({ id: "sauces", name: "Sauces", price_cents: null, children: [
              n({ id: "s-tomate", name: "Tomate", price_cents: 0 }),
            ] }),
            n({ id: "fromage", name: "Ton fromage", price_cents: null, children: [
              n({ id: "f-parmesan", name: "Parmesan", price_cents: 0 }),
            ] }),
          ] }),
        ],
      }),
    ];
    const rules = buildRequiredRules(tree);
    // Pâtes et sauces obligatoires ; le fromage (garniture) facultatif.
    expect(rules).toHaveLength(2);
    expect(rules[0].label).toBe("Pâtes pour Box S");
    expect(rules[0].whenAnyOf).toEqual(["box-s"]);
    expect(rules[0].oneOf).toEqual(["p-fusilli"]);
  });

  it("gère les formules (boisson + dessert obligatoires) et les box séparément", () => {
    const tree: MenuNode[] = [
      n({ id: "root", name: "Menu", price_cents: null, children: [
        n({ id: "fcs", name: "Formule Classique S", price_cents: 790, max_qty: 10, children: [
          n({ id: "fcs-choix", name: "Boisson ou dessert inclus", price_cents: null, children: [
            n({ id: "fcs-b-eau", name: "Eau", price_cents: 0 }),
          ] }),
        ] }),
        n({ id: "salade", name: "Salade de la semaine", price_cents: 950, max_qty: 5 }),
      ] }),
    ];
    const rules = buildRequiredRules(tree);
    // La salade (produit simple, sans groupe) ne génère aucune règle.
    expect(rules).toHaveLength(1);
    expect(rules[0].label).toBe("Boisson ou dessert inclus pour Formule Classique S");
  });

  it("arbre vide → aucune règle", () => {
    expect(buildRequiredRules([])).toEqual([]);
  });
});

describe("cartCount", () => {
  it("compte les articles", () => {
    expect(cartCount({ "box-s": 2, tiramisu: 1 })).toBe(3);
  });
});
