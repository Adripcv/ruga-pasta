# 🍝 Ruga Pasta — Site vitrine

Site one-page premium pour **Ruga Pasta**, pasta bar italien à Aix-en-Provence.

## Stack

- **Vite + React 19 + TypeScript** — build 100 % statique, déployé sur Vercel (également compatible Netlify, OVH, IONOS…)
- **Tailwind CSS v4** — design system maison (crème / rouge tomate / vert olive / jaune soleil)
- **Fraunces + DM Sans** auto-hébergées via Fontsource (aucune requête tierce au runtime)
- Aucune librairie d'animation : IntersectionObserver maison, respect de `prefers-reduced-motion`

## Commandes

```bash
npm install            # installer
npm run dev            # serveur de développement
npm run build          # build de production (dist/ + _headers + robots.txt + sitemap.xml)
npm run preview        # prévisualiser le build
npm run preview:headers # prévisualiser avec les en-têtes de sécurité appliqués
```

### 🚀 Déploiement Vercel

Le site est en ligne sur **https://ruga-pasta.vercel.app** — chaque `git push` sur `main`
redéploie automatiquement. `vercel.json` applique les **en-têtes de sécurité** (CSP,
anti-clickjacking, nosniff…) et le cache : les fichiers `_headers` Netlify ne sont pas
lus par Vercel. Les deux configs (`vercel.json` et la CSP générée dans `vite.config.ts`)
doivent rester identiques — c'est vérifié au build.

### Domaine de production (`SITE_URL`)

Les balises SEO (canonical, og:image, JSON-LD) et le sitemap exigent des URL **absolues**.
Par défaut, le build utilise `https://ruga-pasta.vercel.app`. Pour un domaine personnel,
copier `.env.example` en `.env` et renseigner `SITE_URL=https://mon-domaine.fr` avant le
build (et ajouter le domaine dans Vercel → Settings → Domains).

## ⭐ Modifier les données du restaurant

**Tout est centralisé dans [`src/data/restaurant.ts`](src/data/restaurant.ts)** :

| Donnée | État |
|---|---|
| Adresse, téléphone, note Google (4,8 · 25 avis), services, fourchette de prix (1–10 €/pers.) | ✅ Réels |
| Carte (formules, box à composer, salade de la semaine, boissons, desserts) | ✅ **Réelle** — d'après le menu officiel fourni (scan : `public/images/carte-ruga-pasta.png`) |
| `orderUrl` | ✅ **Uber Eats** — https://www.ubereats.com/fr/store/ruga-pasta/gvwuEThrT1CwvEOqixRvuw. Tous les boutons « Commander » pointent dessus (nouvel onglet). Remettre `null` pour revenir à l'appel téléphonique |
| `hours` | ✅ **Réels** — lun.–sam. 11:00–21:00, dimanche fermé. Modifier le champ pour changer les horaires ; ils alimentent aussi le badge « Ouvert / Fermé » (`getOpenStatus`) |
| Réseaux sociaux | Aucun compte officiel connu : `social` est vide volontairement |
| Photos | ✅ **Réelles** — photos du restaurant (devanture, terrasse, boxes) dans `public/images/`. Origine : photos publiées sur la fiche Google Maps de Ruga Pasta. Pour en ajouter : déposer le fichier dans `public/images/` puis l'ajouter au tableau `gallery.photos` de `src/data/restaurant.ts` |
| Photos produit (boxes) | ✅ **Réelles** — source : page Uber Eats officielle (`box-carbonara.webp`, `boxes-boutique.webp`), affichées dans la section carte |

## SEO

- Title / meta description optimisés recherche locale, Open Graph
- Données structurées **Schema.org Restaurant** (JSON-LD dans `index.html`) : adresse, téléphone, gamme de prix, **horaires d'ouverture** (`openingHoursSpecification`), note 4,8/25 avis, services, **OrderAction** vers Uber Eats (retrait ou livraison)
- Hiérarchie H1→H3 sémantique, textes alternatifs descriptifs

## Accessibilité & performance

- Skip-link, navigation clavier, focus visible, contrastes vérifiés, piège à focus dans la lightbox
- Images WebP locales, lazy-loading, dimensions explicites
- Animations désactivées si `prefers-reduced-motion`

## Sécurité & RGPD

- **CSP stricte** sans aucun script tiers : `vercel.json` (Vercel, production) et `dist/_headers`
  (généré au build pour Netlify / Cloudflare Pages) portent la **même politique** —
  anti-clickjacking, nosniff, Referrer-Policy, Permissions-Policy, COOP. Le JSON-LD est en
  `application/ld+json` (non exécutable, donc exempté de `script-src`)
- **Carte Google Maps à clic** : l'iframe Google n'est chargée qu'après une action du visiteur — aucun cookie ni requête tierce avant consentement (recommandation CNIL)
- `npm run preview:headers` sert `dist/` avec les en-têtes de `_headers` appliqués, pour tester la CSP en local

---

© Ruga Pasta — Tous droits réservés.
