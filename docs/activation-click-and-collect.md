# 🚀 Activation du Click & Collect — Ruga Pasta

> Guide pas à pas, écrit pour être suivi depuis le navigateur, tasse de café à la main.
> Tout se joue entre **Supabase** (la base de données) et **Vercel** (l'hébergement).

---

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → **Start your project** → connexion GitHub.
2. **New project** :
   - Name : `ruga-pasta`
   - Database Password : génère et **conserve-le précieusement** (tu n'en auras plus besoin, mais c'est la seule fois où il est affiché).
   - Region : **West EU (Paris)**
   - Plan : Free — largement suffisant pour démarrer.
3. Attends ~2 min que le projet soit provisionné.

## 2. Exécuter le schéma SQL

1. Dans Supabase : **SQL Editor** → **New query**.
2. Copie **tout le contenu** de `supabase/schema.sql` → colle → **Run**.
3. Tu dois voir `Success. No rows returned` — c'est normal (le seed insère la carte mais ne renvoie pas de lignes).

Le schéma est **idempotent** : tu peux le relancer plus tard pour mettre à jour la carte sans casser les données. Il contient :

- les tables `products` (arbre de la carte), `orders`, `order_items`, `settings`, `order_events` ;
- le **seed de la vraie carte** (box S et M avec leurs 4 groupes de choix, formules Classique/Gourmande, tiramisu, boissons, garnitures — 157 articles) ;
- la fonction atomique `create_order` (validations prix/créneaux/capacité côté base, `security definer`, `EXECUTE` révoqué à `PUBLIC/anon/authenticated` — seul notre serveur peut commander) ;
- **RLS deny-all** sur toutes les tables : le navigateur ne parle jamais directement à la base ;
- la **purge RGPD** automatique (pg_cron quotidien : commandes livrées depuis > 24 mois supprimées).

> ⚠️ Si tu relances le schéma alors que d'anciens articles démo existent encore, il les nettoie
> automatiquement (sauf si des commandes les référencent).

## 3. Créer le compte gérant

1. Supabase → **Authentication** → **Users** → **Add user** :
   - Email : l'email du gérant (ex. `gerant@ruga-pasta.fr`)
   - Password : un mot de passe fort
   - ✅ **Auto Confirm** (pas d'email de vérification)
2. Cet email doit figurer dans la variable `ADMIN_EMAILS` (étape 4) — sinon la connexion sera refusée par le serveur.

## 4. Configurer les variables sur Vercel

```bash
npx vercel link --yes --project ruga-pasta
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ADMIN_EMAILS production
npx vercel env add ADMIN_JWT_SECRET production
npx vercel --prod
```

Valeurs (Supabase → Project Settings → API) :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` (secret — ne jamais exposer côté client) |
| `ADMIN_EMAILS` | Emails gérant séparés par des virgules |
| `ADMIN_JWT_SECRET` | Chaîne aléatoire (ex. `openssl rand -hex 32`) |

Optionnel (emails automatiques au gérant) : `RESEND_API_KEY` + domaine vérifié.

## 5. Vérifier que tout marche

```bash
curl -s https://ruga-pasta.vercel.app/api/menu | head -c 300
# → {"configured":true,"ordering":{"open":true,...}
```

Puis passe une commande test sur **/commander.html** : elle doit apparaître dans le dashboard
**/admin** en moins de 30 secondes.

---

## 🎛️ Le dashboard admin (`/admin`)

Connexion : l'email du gérant + son mot de passe (allowlist serveur : seul un email présent
dans `ADMIN_EMAILS` peut se connecter, même s'il a un compte Supabase valide).

### Organisation en 5 onglets

| Onglet | Ce que tu y fais |
|---|---|
| 🍽️ **Service** | Le jour en direct : bandeau KPI (à traiter / prêtes / commandes / CA), cartes commandes avec transitions `Nouvelle → Préparation → Prête → Récupérée`, recherche code/nom/téléphone, filtre par statut, export **CSV** (tableur). Rafraîchissement auto toutes les 30 s + bouton. |
| 📈 **Analytique** | Période 7/14/30/90 j : 4 KPI avec **tendances vs période précédente** et sparklines, **courbe CA/commandes** (bascule), **affluence par heure de retrait** (barres), **répartition des statuts** (donut), **top produits** avec barres de progression. |
| 🗂️ **Historique** | Les mêmes listes de commandes sur n'importe quel jour passé (sélecteur de date), mêmes filtres/recherche/CSV. |
| 🧾 **Carte** | Arbre complet de la carte : **prix éditable en ligne** (en centimes), rupture par article ou section entière, activation/masquage, **renommer, réordonner (↑↓), ajouter, supprimer** (refusé si des commandes y réfèrent — masque plutôt). Visible immédiatement sur le tunnel. |
| ⚙️ **Réglages** | Interrupteur **ouverture/fermeture** de la commande + message personnalisé, durée des créneaux, capacité par créneau, délai de préparation, heures d'ouverture/fermeture avec **aperçu live des créneaux**, jours de fermeture hebdomadaire, email de notification. |

### Bon à savoir

- Le jeton admin vit **en mémoire** (jamais `localStorage`) et la session d'affichage dans
  `sessionStorage` : fermer l'onglet déconnecte.
- Sans Supabase configuré, tout le système est **fail-closed** : tunnel fermé, dashboard
  inaccessible, aucun endpoint ne fuit d'information.
- Rate limiting : 8 tentatives de connexion / 15 min par IP **et par email**.

---

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| `/api/menu` → `configured:false` | Variables Vercel absentes | Étape 4, puis `npx vercel --prod` |
| Login refusé avec bons identifiants | Email absent d'`ADMIN_EMAILS` | Ajoute-le, redéploie |
| « Commande fermée » alors que les réglages disent ouverte | `ordering_enabled=false` en base | Dashboard → Réglages → interrupteur |
| Déploiement Vercel en erreur « 12 functions » | Trop de fonctions serverless (plan Hobby) | Vérifie qu'aucun fichier superflu dans `api/` |
| Prix modifié ne s'affiche pas | Cache du navigateur | Recharge (Ctrl+Shift+R) — l'API est en `no-store` |

## Emails automatiques (optionnel)

Par défaut, aucune notification email. Pour l'activer : compte [Resend](https://resend.com)
(clé API), vérifie un domaine d'envoi, ajoute `RESEND_API_KEY` sur Vercel. Le handler envoie
alors le détail de chaque commande au `admin_notify_email` (Réglages).
