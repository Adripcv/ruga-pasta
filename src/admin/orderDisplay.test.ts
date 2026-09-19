/**
 * Tests du regroupement compact — l'affichage cuisine doit rester juste :
 * un produit + ses ingrédients, rien d'autre. Cas limites : chemins vides,
 * ingrédients sans produit (orphelins), quantités multiples.
 */
import { describe, expect, it } from "vitest";
import { describeGroups, groupOrderItems, type RawLine } from "./orderDisplay.js";

const line = (
  name: string,
  path: string[],
  qty = 1,
  line_cents: number | null = 0,
): RawLine => ({ name, qty, line_cents, path });

describe("groupOrderItems", () => {
  it("regroupe une Box S avec ses ingrédients — le cas réel du tunnel", () => {
    const items: RawLine[] = [
      line("Box S", ["Menu", "Compose ta box", "Box S"], 1, 650),
      line("Penne", ["Menu", "Compose ta box", "Box S", "Pâtes", "Penne"], 1, 0),
      line("Carbonara", ["Menu", "Compose ta box", "Box S", "Sauces", "Carbonara"], 1, 0),
      line("Parmesan", ["Menu", "Compose ta box", "Box S", "Ton fromage", "Parmesan"], 1, 0),
      line("Olives", ["Menu", "Compose ta box", "Box S", "Tes toppings", "Olives"], 1, 0),
    ];
    expect(groupOrderItems(items)).toEqual([
      {
        title: "Box S",
        qty: 1,
        extras: ["Penne", "Carbonara", "Parmesan", "Olives"],
        line_cents: 650,
      },
    ]);
  });

  it("sépare deux produits distincts avec leurs ingrédients respectifs", () => {
    const items: RawLine[] = [
      line("Box S", ["Menu", "Box S"], 1, 650),
      line("Penne", ["Menu", "Box S", "Pâtes", "Penne"], 1, 0),
      line("Box M", ["Menu", "Box M"], 1, 850),
      line("Farfalle", ["Menu", "Box M", "Pâtes", "Farfalle"], 1, 0),
      line("Pesto", ["Menu", "Box M", "Sauces", "Pesto"], 1, 0),
    ];
    const groups = groupOrderItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ title: "Box S", extras: ["Penne"] });
    expect(groups[1]).toMatchObject({ title: "Box M", extras: ["Farfalle", "Pesto"] });
  });

  it("garde les produits sans ingrédient (boisson, dessert)", () => {
    const items: RawLine[] = [
      line("Coca-Cola", ["Menu", "Boissons", "Coca-Cola"], 1, 200),
      line("Cookies", ["Menu", "Desserts", "Cookies"], 2, 600),
    ];
    expect(groupOrderItems(items)).toEqual([
      { title: "Coca-Cola", qty: 1, extras: [], line_cents: 200 },
      { title: "Cookies", qty: 2, extras: [], line_cents: 600 },
    ]);
  });

  it("mélange box avec choix et articles simples dans l'ordre", () => {
    const items: RawLine[] = [
      line("Box S", ["Menu", "Box S"], 1, 650),
      line("Penne", ["Menu", "Box S", "Pâtes", "Penne"], 1, 0),
      line("Coca-Cola", ["Menu", "Boissons", "Coca-Cola"], 1, 200),
    ];
    const groups = groupOrderItems(items);
    expect(groups.map((g) => g.title)).toEqual(["Box S", "Coca-Cola"]);
    expect(groups[0].extras).toEqual(["Penne"]);
  });

  it("tombe en repli sur `name` pour des lignes sans chemin exploitable", () => {
    const items: RawLine[] = [line("Mystère", [], 1, 100)];
    expect(groupOrderItems(items)).toEqual([
      { title: "Mystère", qty: 1, extras: [], line_cents: 100 },
    ]);
  });

  it("ignore les lignes vides/malformées sans planter", () => {
    const items = [
      line("OK", ["Menu", "OK"], 1, 0),
      { name: "cassé", qty: 1, line_cents: 0, path: null as unknown as string[] },
    ];
    expect(groupOrderItems(items)).toHaveLength(1);
  });

  it("un ingrédient seul sans produit parent devient une ligne simple", () => {
    const items: RawLine[] = [line("Penne", ["Menu", "Pâtes", "Penne"], 1, 0)];
    expect(groupOrderItems(items)).toEqual([
      { title: "Penne", qty: 1, extras: [], line_cents: 0 },
    ]);
  });
});

describe("describeGroups", () => {
  it("rend le texte compact pour le CSV", () => {
    expect(
      describeGroups([
        { title: "Box S", qty: 1, extras: ["Penne", "Carbonara"], line_cents: 650 },
        { title: "Cookies", qty: 2, extras: [], line_cents: 600 },
      ]),
    ).toBe("Box S (Penne, Carbonara) | 2× Cookies");
  });
});
