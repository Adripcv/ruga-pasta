/**
 * Logique de panier du tunnel — pure et testable.
 * Sélections = Record<nodeId, qty>. Les règles d'affichage (radio vs cases)
 * dérivent de `max_qty` de l'arbre du menu : même source que le serveur.
 */
import type { MenuNode } from "./types";

/** qty par nodeId. Zéro = retiré (les clés à 0 ne persistent pas). */
export type Selections = Record<string, number>;

export type FlatItem = { node: MenuNode; path: string[] };

/** Feuilles commandables (price_cents ≠ null) aplaties, avec chemin de groupes. */
export function flattenItems(nodes: MenuNode[], ancestry: string[] = []): FlatItem[] {
  const out: FlatItem[] = [];
  for (const node of nodes) {
    const path = [...ancestry, node.name];
    if (node.price_cents !== null) out.push({ node, path });
    if (node.children.length > 0) out.push(...flattenItems(node.children, path));
  }
  return out;
}

/** Somme des lignes sélectionnées, prix tirés de l'arbre (jamais saisi). */
export function cartTotalCents(
  selections: Selections,
  items: FlatItem[],
): number {
  return items.reduce((sum, { node }) => {
    const qty = selections[node.id] ?? 0;
    return sum + (node.price_cents ?? 0) * qty;
  }, 0);
}

/** Nombre d'articles (pour le badge « 3 articles » du récap). */
export function cartCount(selections: Selections): number {
  return Object.values(selections).reduce((s, q) => s + q, 0);
}

/** Ajoute qty (borné à max_qty) ; retire la clé si le résultat est 0. */
export function addToSelections(
  selections: Selections,
  id: string,
  delta: number,
  maxQty: number,
): Selections {
  const next = { ...selections };
  const current = next[id] ?? 0;
  const value = Math.min(Math.max(current + delta, 0), maxQty);
  if (value === 0) delete next[id];
  else next[id] = value;
  return next;
}

/**
 * Radio (max_qty=1) : poser une valeur retire les autres du MÊME groupe.
 * C'est la garantie « une seule sauce » — d'où `siblings`.
 */
export function setRadioSelection(
  selections: Selections,
  id: string,
  siblingIds: string[],
): Selections {
  const next: Selections = {};
  for (const [key, qty] of Object.entries(selections)) {
    if (!siblingIds.includes(key)) next[key] = qty;
  }
  next[id] = 1;
  return next;
}

/**
 * Garde-fou : la sauce est obligatoire pour une box. Déclaratif : chaque
 * `requiresOne` liste les ids d'un groupe dont ≥ 1 choix doit être présent
 * quand un des items du groupe parent est sélectionné.
 */
export function missingRequired(
  selections: Selections,
  rules: { whenAnyOf: string[]; oneOf: string[]; label: string }[],
): string[] {
  const missing: string[] = [];
  for (const rule of rules) {
    const triggered = rule.whenAnyOf.some((id) => (selections[id] ?? 0) > 0);
    if (!triggered) continue;
    const satisfied = rule.oneOf.some((id) => (selections[id] ?? 0) > 0);
    if (!satisfied) missing.push(rule.label);
  }
  return missing;
}

/**
 * Groupes de choix OBLIGATOIRES quand le produit parent est sélectionné :
 * une box (ou formule) sans pâtes/sauce n'a pas de sens, et une formule
 * sans sa boisson/dessert inclus n'est pas complète. Les garnitures
 * (fromage, toppings) restent facultatives — c'est l'esprit de la carte.
 * Détection par le nom du groupe (insensible à la casse/accents légers).
 */
const REQUIRED_GROUP_RE = /p[aâ]tes|sauce|boisson|dessert/i;

export type RequiredRule = { whenAnyOf: string[]; oneOf: string[]; label: string };

/**
 * Construit les règles de complétude depuis l'arbre du menu — une règle PAR
 * instance de groupe (la Box S et la Box M ont chacune leurs pâtes et leur
 * sauce ; idem pour chaque formule). Sert au blocage du bouton « Continuer ».
 */
export function buildRequiredRules(menuTree: MenuNode[]): RequiredRule[] {
  const rules: RequiredRule[] = [];

  const walkSections = (nodes: MenuNode[]): void => {
    for (const section of nodes) {
      for (const product of section.children) {
        for (const group of product.children) {
          if (!REQUIRED_GROUP_RE.test(group.name)) continue;
          rules.push({
            whenAnyOf: [product.id],
            oneOf: group.children.map((leaf) => leaf.id),
            label: `${group.name} pour ${product.name}`,
          });
        }
      }
      // Récursion : l'arbre peut avoir des niveaux supplémentaires.
      walkSections(section.children);
    }
  };
  walkSections(menuTree);
  return rules;
}

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const euros = (cents: number) => EUR.format(cents / 100);
