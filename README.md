# 🍝 Ruga Pasta — Site vitrine

Site one-page premium pour **Ruga Pasta**, pasta bar italien à Aix-en-Provence.

## Stack

- **Vite + React 18 + TypeScript** — build 100 % statique, déployable partout (Netlify, Vercel, OVH, IONOS…)
- **Tailwind CSS v4** — design system maison (crème / rouge tomate / vert olive / jaune soleil)
- **Fraunces + DM Sans** auto-hébergées via Fontsource (aucune requête tierce au runtime)
- Aucune librairie d'animation : IntersectionObserver maison, respect de `prefers-reduced-motion`

## Commandes

```bash
npm install     # installer
npm run dev     # serveur de développement
npm run build   # build de production (dist/)
npm run preview # prévisualiser le build
```

## ⭐ Modifier les données du restaurant

**Tout est centralisé dans [`src/data/restaurant.ts`](src/data/restaurant.ts)** :

| Donnée | État |
|---|---|
| Adresse, téléphone, note Google (4,8 · 25 avis), services, fourchette de prix (1–10 €/pers.) | ✅ Réels |
| Carte (formules, box à composer, salade de la semaine, boissons, desserts) | ✅ **Réelle** — d'après le menu officiel fourni (scan : `public/images/carte-ruga-pasta.png`) |
| `orderUrl` | `null` → les boutons « Commander » appellent le restaurant. Remplacer par l'URL officielle (Click & Collect, Uber Eats…) quand elle est fournie |
| `hours` | ✅ **Réels** — lun.–sam. 11:00–21:00, dimanche fermé. Modifier le champ pour changer les horaires ; ils alimentent aussi le badge « Ouvert / Fermé » (`getOpenStatus`) |
| Réseaux sociaux | Aucun compte officiel connu : `social` est vide volontairement |
| Photos | Images de démonstration (univers pasta/Italie) dans `public/images/` — remplacer par les vraies photos du restaurant |

## SEO

- Title / meta description optimisés recherche locale, Open Graph
- Données structurées **Schema.org Restaurant** (JSON-LD dans `index.html`) : adresse, téléphone, gamme de prix, **horaires d'ouverture** (`openingHoursSpecification`), note 4,8/25 avis, services
- Hiérarchie H1→H3 sémantique, textes alternatifs descriptifs

## Accessibilité & performance

- Skip-link, navigation clavier, focus visible, contrastes vérifiés
- Images WebP locales, lazy-loading, dimensions explicites
- Animations désactivées si `prefers-reduced-motion`

---

© Ruga Pasta — Tous droits réservés.
