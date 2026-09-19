# 🍝 Ruga Pasta — Site vitrine + Click & Collect

Site one-page premium pour **Ruga Pasta**, pasta bar italien à Aix-en-Provence —
avec **commande en ligne (click & collect)**, dashboard gérant, et repli Uber Eats.

## Stack

- **Vite + React 19 + TypeScript** — 3 pages séparées (vitrine, tunnel de commande, dashboard)
- **Tailwind CSS v4** — design system maison (crème / rouge tomate / vert olive / jaune soleil)
- **Supabase** (Postgres + Auth) — base de données du click & collect
- **Vercel Functions** (Node, signature Web standard) — API serveur dans `api/`
- **Vitest** — tests de la logique métier (`npm test`)
- Fraunces + DM Sans auto-hébergées ; aucune requête tierce au runtime

## Commandes

```bash
npm install        # installer
npm run dev        # tout-en-un : API de dev (port 8787) + Vite (port 5173)
npm run dev:web    # Vite seul (le tunnel affichera « commande fermée » sans API)
npm run dev:api    # API seule
npm test           # tests de la logique métier (fuseau Paris, prix, statuts…)
npm run build      # build de production (dist/ + _headers + robots.txt + sitemap.xml)
npm run preview:headers  # prévisualiser le build avec les en-têtes de sécurité
```

### Mode démonstration (sans Supabase)

```bash
DEV_MOCK_MENU=1 npm run dev:api
```

Le tunnel fonctionne avec un menu en mémoire (aucune commande réelle enregistrée).
Pratique pour le design — jamais activé en production (la variable n'existe pas sur Vercel).

## 🚀 Déploiement Vercel

En ligne sur **https://ruga-pasta.vercel.app** — chaque `git push` sur `main` redéploie.
Les fonctions sous `api/` sont déployées automatiquement (runtime Node, export `{ fetch }`).

### Variables d'environnement à définir dans Vercel (Settings → Environment Variables)

| Variable | Rôle | Secret ? |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | non |
| `SUPABASE_ANON_KEY` | Clé publique (RLS deny-all : ne donne accès à rien) | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès serveur complet | **OUI — jamais côté client** |
| `RESEND_API_KEY` | Envoi des emails de notification (optionnel) | oui |
| `RESEND_FROM` | Expéditeur (`Ruga Pasta <commande@domaine.fr>`) | non |
| `ADMIN_EMAILS` | Emails autorisés à se connecter à `/admin`, séparés par des virgules | non |
| `SITE_URL` | Domaine public (SEO) — défaut : `https://ruga-pasta.vercel.app` | non |

Les mêmes variables vont dans `.env` local (copier `.env.example`).

## 🗄️ Mise en place Supabase (pas à pas, ~10 minutes)

1. Créer un compte sur [supabase.com](https://supabase.com) (gratuit) → **New project**
   (nom : `ruga-pasta`, région : West EU, mot de passe DB à conserver).
2. Ouvrir **SQL Editor → New query**, coller **tout** le contenu de
   [`supabase/schema.sql`](supabase/schema.sql), puis **Run**. Crée tables, sécurité
   RLS, fonction atomique de commande et menu initial.
3. **Settings → API** : copier `Project URL`, `anon key` et `service_role key`
   dans les variables Vercel + `.env` local.
4. **Authentication → Providers → Email** : activé (par défaut).
   **Authentication → Users → Add user** : créer le compte du gérant
   (email + mot de passe). Cet email doit figurer dans `ADMIN_EMAILS`.
5. Redéployer (un `git push` suffit) → ouvrir `https://…/admin`, se connecter,
   onglet **Réglages** : activer « Commande en ligne ».

### Emails (optionnel mais recommandé)

Créer un compte [resend.com](https://resend.com) (gratuit jusqu'à 3 000 emails/mois),
générer une clé API, la mettre dans `RESEND_API_KEY`. Avec le domaine Vercel par défaut,
garder `RESEND_FROM="Ruga Pasta <onboarding@resend.dev>"`. Avec un domaine personnalisé
vérifié chez Resend : `RESEND_FROM="Ruga Pasta <commande@mon-domaine.fr>"`.

## 🏪 Guide gérant — `/admin`

Connecté sur `/admin` (page non indexée), 4 onglets :

- **Commandes** : la journée en cours, rafraîchie toutes les 30 s. Boutons
  « Préparer → Prête ! → Récupérée » (ou « Annuler »). Le code `RUGA-XXXX` est ce que
  le client présente au comptoir.
- **Stats** : CA 7 jours, nombre de commandes, panier moyen, top ventes.
- **Carte** : changer un prix (en centimes : 650 = 6,50 €), cocher « Rupture »
  (masque l'article du tunnel immédiatement) ou désactiver une ligne.
- **Réglages** : ouvrir/fermer la commande en ligne (avec message), capacité par
  créneau, délai de préparation, jours de fermeture, email de notification.

## 🔒 Sécurité (résumé)

- **Prix recalculés côté serveur** depuis la base — le client n'envoie que des IDs ;
  aucune falsification possible.
- **RLS `deny-all`** : le navigateur ne parle jamais à Supabase ; tout passe par
  l'API, qui valide et signe.
- **Création atomique** : verrou par créneau en transaction SQL — deux clients sur le
  dernier créneau, un seul gagne.
- **Anti-spam** : honeypot, limites par téléphone (5/jour) et par empreinte IP
  hachée + salée (10/h, 30/jour), idempotence des soumissions.
- **Admin** : JWT vérifié par Supabase + allowlist email côté serveur (fail-closed),
  rate-limit des connexions, transitions de statuts contrôlées par machine à états.
- **CSP stricte** inchangée (`vercel.json` + `_headers`) : `connect-src 'self'` —
  le front ne contacte que notre API.

## ⭐ Modifier les données du restaurant

| Donnée | Où |
|---|---|
| Vitrine (adresse, horaires, carte affichée, avis, photos) | `src/data/restaurant.ts` |
| **Carte du click & collect** (prix réels) | Dashboard → Carte, ou `supabase/schema.sql` (seed) |
| Créneaux & capacité | Dashboard → Réglages |

⚠️ La vitrine et la base sont deux sources : si un prix change, le modifier aux
**deux endroits** (dashboard pour la commande en ligne, `restaurant.ts` pour l'affichage).

## SEO, accessibilité, RGPD

- JSON-LD Restaurant avec `OrderAction` vers `/commander.html`
- Skip-link, navigation clavier, piège à focus, `prefers-reduced-motion`, zones tactiles ≥ 44 px
- Collecte minimale (nom + téléphone), page `/confidentialite.html`, IP pseudonymisées
- Carte Google chargée uniquement après clic (recommandation CNIL)

---

© Ruga Pasta — Tous droits réservés.
