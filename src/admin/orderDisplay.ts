/**
 * Affichage compact des commandes — logique pure, testée.
 *
 * Les lignes d'une commande viennent de la base avec leur chemin complet
 * dans l'arbre du menu : ["Menu", "Compose ta box", "Box S"] pour le
 * produit, ["Menu", "Compose ta box", "Box S", "Pâtes", "Penne"] pour un
 * ingrédient choisi. Un produit est une ligne dont le chemin n'est PAS
 * l'extension d'une autre ligne ; les ingrédients sont les lignes qui
 * l'étendent. On regroupe pour afficher :
 *
 *   Box S :
 *   - Penne
 *   - Carbonara
 *
 * au lieu de cinq lignes verbeuses avec des chemins et des 0,00 €.
 */

export type RawLine = {
  name: string;
  qty: number;
  line_cents: number | null;
  path: string[];
};

export type DisplayGroup = {
  /** Nom du produit (« Box S ») — null ne devrait jamais arriver (fallback). */
  title: string;
  /** Quantité du produit (les ingrédients suivent la quantité du produit). */
  qty: number;
  /** Ingrédients/choix, chacun le dernier élément de son chemin. */
  extras: string[];
  /** Prix du produit seul (null si le rôle ne voit pas les prix). */
  line_cents: number | null;
};

function isStrictPrefix(prefix: string[], full: string[]): boolean {
  return prefix.length < full.length && prefix.every((el, i) => el === full[i]);
}

function lastName(path: string[]): string {
  return path.length > 0 ? path[path.length - 1] : "";
}

/**
 * Groupe les lignes d'une commande : produits + leurs ingrédients.
 * L'ordre d'origine (heure, arbre) est conservé.
 */
export function groupOrderItems(items: RawLine[]): DisplayGroup[] {
  const safe = items.filter((it) => it && Array.isArray(it.path));

  const groups: DisplayGroup[] = [];
  const consumed = new Set<RawLine>();

  for (const candidate of safe) {
    if (consumed.has(candidate)) continue;

    // Un produit = chemin non vide + aucune autre ligne n'est un préfixe
    // strict de son chemin. (Chemin vide : le « toutes les lignes sont
    // préfixes du vide » serait trivialement vrai — on va au repli.)
    const hasParent =
      candidate.path.length > 0 &&
      safe.some(
        (other) => other !== candidate && isStrictPrefix(other.path, candidate.path),
      );
    if (hasParent || candidate.path.length === 0) continue; // rattaché plus bas / repli

    consumed.add(candidate);
    const extras = safe
      .filter((other) => !consumed.has(other) && isStrictPrefix(candidate.path, other.path))
      .map((other) => {
        consumed.add(other);
        return lastName(other.path);
      });

    groups.push({
      title: lastName(candidate.path) || candidate.name,
      qty: candidate.qty,
      extras,
      line_cents: candidate.line_cents,
    });
  }

  // Filet de sécurité : lignes orphelines (chemin vide ou produit introuvable)
  // → ligne simple, intitulé = dernier segment du chemin sinon `name`.
  for (const leftover of safe) {
    if (!consumed.has(leftover)) {
      groups.push({
        title: lastName(leftover.path) || leftover.name,
        qty: leftover.qty,
        extras: [],
        line_cents: leftover.line_cents,
      });
    }
  }

  return groups;
}

/** Rendu texte compact (CSV, résumés) : « Box S (Penne, Carbonara) ». */
export function describeGroups(groups: DisplayGroup[]): string {
  return groups
    .map((g) => {
      const base = g.qty > 1 ? `${g.qty}× ${g.title}` : g.title;
      return g.extras.length > 0 ? `${base} (${g.extras.join(", ")})` : base;
    })
    .join(" | ");
}
