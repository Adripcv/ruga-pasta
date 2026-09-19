# 🚀 Activation du Click & Collect — guide pas à pas

Tout ce qu'il faut faire, dans l'ordre, pour passer du « commande fermée »
actuel au click & collect opérationnel. Compte ~30 minutes.

---

## Étape 1 — Créer le projet Supabase (5 min)

1. Va sur **https://supabase.com** → **Start your project** → connexion GitHub.
2. **New project** :
   - **Name** : `ruga-pasta`
   - **Database Password** : génère un mot de passe fort et **conserve-le**
     (il ne sert qu'aux accès SQL directs, pas au site).
   - **Region** : `West EU (London)` ou `Central EU (Frankfurt)` — le plus
     proche de l'Italie… pardon, d'Aix-en-Provence.
   - **Plan** : Free (gratuit, largement suffisant pour démarrer).
3. Attends ~2 minutes que le projet soit provisionné.

> 💰 **Coût** : le plan Free de Supabase suffit pour une boutique. Limites :
> 500 Mo de base, 50 000 utilisateurs — on en est très loin. Pause après
> 7 jours d'inactivité (une commande réactive tout ; sinon, activity
> manuelle depuis le dashboard).

## Étape 2 — Exécuter le schéma SQL (2 min)

1. Dans Supabase : **SQL Editor** (icône `>_` dans la barre latérale) → **New query**.
2. Ouvre le fichier `supabase/schema.sql` du dépôt, **copie TOUT son contenu**
   et colle-le dans l'éditeur.
3. **Run** (Ctrl+Entrée). Résultat attendu : `Success. No rows returned`.
4. Vérification : **Table Editor** → tu dois voir 4 tables :
   `menu_nodes`, `store_settings`, `orders`, `order_items`.
   - `menu_nodes` contient toute la carte (boxes, formules, boissons…).
   - `store_settings` contient 1 ligne (réglages par défaut).

Le script est **idempotent** : tu peux le relancer sans risque.

## Étape 3 — Récupérer les clés API (2 min)

Dans Supabase : **Project Settings** (⚙️ en bas à gauche) → **API**.

Copie 3 valeurs :

| Variable | Où | Rôle |
|---|---|---|
| `SUPABASE_URL` | Project URL | Adresse du projet |
| `SUPABASE_ANON_KEY` | Project API Keys → `anon` `public` | Publique par design (inutilisée : le navigateur ne parle jamais à Supabase directement) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API Keys → `service_role` | **SECRÈTE** — serveur uniquement |

> ⚠️ La clé `service_role` contourne TOUTE sécurité (RLS). Elle ne va QUE
> dans les variables d'environnement Vercel — jamais dans le code, jamais
> dans le navigateur.

## Étape 4 — Créer le compte gérant (3 min)

Le dashboard `/admin` s'authentifie via Supabase Auth, avec **allowlist
d'emails côté serveur** : même avec un compte valide, sans email autorisé,
l'accès est refusé.

1. Dans Supabase : **Authentication** → **Users** → **Add user** →
   **Create new user**.
   - Email : l'email du gérant (ex. `gerant@ruga-pasta.fr` — une adresse
     réelle qu'il consulte).
   - Password : mot de passe fort.
   - ✅ **Auto Confirm User** : coché (pas d'email de vérification).
2. Note l'email exact : il va dans `ADMIN_EMAILS` à l'étape suivante.

## Étape 5 — Configurer les variables sur Vercel (5 min)

Depuis un terminal (le CLI est déjà connecté) :

```bash
npx vercel env add SUPABASE_URL production
# colle : https://TON-PROJET.supabase.co

npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# colle la clé service_role

npx vercel env add ADMIN_EMAILS production
# colle : l'email du gérant (ou plusieurs, séparés par des virgules)

npx vercel env add ADMIN_JWT_SECRET production
# colle une longue chaîne aléatoire (génère avec : openssl rand -hex 32)
```

Optionnel mais recommandé (notifications email au gérant à chaque commande) :

```bash
npx vercel env add RESEND_API_KEY production    # clé gratuite sur resend.com
npx vercel env add RESEND_FROM production       # Ruga Pasta <onboarding@resend.dev>
```

> `ADMIN_JWT_SECRET` est présent par sécurité pour une évolution future ;
> l'auth actuelle passe par Supabase Auth (`auth.getUser`), qui ne l'utilise
> pas encore.

Puis **redéploie** pour que les variables soient prises en compte :

```bash
npx vercel --prod
```

## Étape 6 — Activer et tester (5 min)

1. Ouvre **https://ruga-pasta.vercel.app/admin** → connexion avec l'email +
   mot de passe du gérant (étape 4).
2. Onglet **Réglages** : active **« Commande en ligne : Ouverte »**.
3. Vérifie les réglages (valeurs par défaut raisonnables) :
   - Créneaux de 15 min, capacité 6 commandes/créneau
   - Délai de préparation : 20 min
   - Ouverture 11:00 → fermeture 21:00, dimanche fermé
4. Sur le site : **Commander** → le tunnel doit afficher la vraie carte
   (Box S/M avec pâtes-sauce-fromage-toppings, formules…).
5. Passe une commande de test → note le code `RUGA-XXXX` → vérifie qu'elle
   apparaît dans l'onglet **Commandes** du dashboard.
6. Marque-la « Récupérée » puis annule ton test si besoin.

## Étape 7 — Créer le compte Resend (optionnel, 5 min)

Pour l'email automatique au gérant à chaque commande :

1. Crée un compte sur **https://resend.com** (gratuit : 3 000 emails/mois).
2. **API Keys** → Create API Key → colle-la dans `RESEND_API_KEY` (Vercel).
3. Avec le domaine `vercel.app`, l'expéditeur doit être
   `onboarding@resend.dev`. Si le site passe un jour sur son propre domaine
   (ex. `ruga-pasta.fr`), vérifie le domaine chez Resend et utilise
   `commande@ruga-pasta.fr` (plus professionnel).

---

## 🔒 Récap sécurité (déjà en place, rien à faire)

| Couche | Protection |
|---|---|
| Base de données | RLS **deny-all** : aucune policy → navigateur n'accède à rien, même avec la clé `anon` |
| Fonction SQL | `create_order` : `EXECUTE` retiré à `PUBLIC`/`anon`/`authenticated` — seul le serveur (service_role) peut commander |
| Prix | Recalculés côté serveur depuis la base (un client falsifié ne change rien) |
| Anti-spam | Honeypot + limites : 5 commandes/téléphone/jour, 10/heure/IP, 30/jour/IP ; login : 8 tentatives/15 min par IP **et** par email |
| CSRF | POST en `application/json` uniquement + vérification de l'`Origin` |
| Admin | JWT validé cryptographiquement par Supabase + allowlist email stricte ; fail-closed sans config |
| RGPD | Nom + téléphone seulement ; purge automatique des commandes livrées > 24 mois (pg_cron) ; page /confidentialite.html |

## 🛠 Dépannage

| Symptôme | Cause probable |
|---|---|
| `/api/menu` renvoie `configured: false` | Variables Vercel absentes ou mauvaises → vérifie l'étape 5, redéploie |
| Login admin « Email ou mot de passe incorrect » | Email pas dans `ADMIN_EMAILS`, ou utilisateur Supabase pas créé/auto-confirmé |
| « Ce créneau est complet » | 6 commandes sur le créneau (capacité) — augmente-la dans Réglages |
| Pas d'email reçu | `RESEND_API_KEY` absente (les emails sont sautés, la commande passe quand même) |
