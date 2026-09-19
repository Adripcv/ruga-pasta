import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Outils de déploiement ajoutés au build (rien à installer) :
 *
 * 1. `%SITE_URL%` — les balises qui exigent une URL ABSOLUE (canonical,
 *    og:url, og:image, JSON-LD, sitemap) ne peuvent pas se contenter d'un
 *    chemin relatif : les robots d'indexation et les aperçus de partage
 *    (WhatsApp, Facebook…) les refusent. On remplace donc le marqueur par
 *    le domaine fourni via `SITE_URL` (variable d'environnement ou `.env`).
 *    Sans domaine configuré, le marqueur devient une chaîne vide et le site
 *    reste fonctionnel (aucune régression).
 *
 * 2. `_headers` — en-têtes de sécurité (CSP, anti-clickjacking, nosniff…)
 *    pour Netlify / Cloudflare Pages. Sur Vercel, l'équivalent est statique
 *    dans `vercel.json` : la CSP des deux fichiers DOIT rester identique
 *    (elle n'utilise donc aucun hachage — le JSON-LD est en
 *    `application/ld+json`, non exécutable et exempté de `script-src`).
 *
 * 3. `robots.txt` + `sitemap.xml`, générés avec le domaine réel.
 */

/** Nom de domaine public du site, sans slash final (ex. « https://ruga-pasta.fr »). */
function normalizeSiteUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
}/**
 * CSP : on autorise le strict nécessaire.
 * - `script-src 'self'` : aucun script inline exécutable (le JSON-LD est en
 *   `application/ld+json`, non exécutable et donc exempté) — politique
 *   IDENTIQUE à celle de `vercel.json` pour que local et production coïncident
 * - `style-src 'unsafe-inline'` : React pose des styles en ligne (délais
 *   d'animation, transforms de parallaxe) — inévitable sans hachage par nœud
 * - `frame-src` : uniquement Google Maps, et seulement après un clic du
 *   visiteur (voir `Location.tsx`)
 * - `img-src data:` : texture papier en SVG data-URI dans le CSS
 */
function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://www.google.com https://maps.google.com",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function securityHeaders(): string {
  return `# En-têtes de sécurité générés par vite.config.ts (Netlify / Cloudflare Pages).
# Sur Vercel, l'équivalent vit dans vercel.json (les _headers n'y sont pas lus).

/*
  Content-Security-Policy: ${contentSecurityPolicy()}
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()
  Cross-Origin-Opener-Policy: same-origin

# Le HTML ne doit jamais être figé dans un cache : une mise à jour du site
# doit être visible tout de suite.
/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate

# Assets fingerprintés par Vite (nom + hash) : cache long sans risque.
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# Images et favicon : noms fixes, donc cache court pour pouvoir les remplacer.
/images/*
  Cache-Control: public, max-age=86400
/favicon.svg
  Cache-Control: public, max-age=86400
`;
}

function robotsTxt(siteUrl: string): string {
  return [
    "# Toutes les pages sont indexables.",
    "User-agent: *",
    "Allow: /",
    siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml` : "",
    "",
  ].join("\n");
}

function sitemapXml(siteUrl: string): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

function deployPlugin(siteUrl: string): Plugin {
  return {
    name: "ruga-deploy",

    // `%SITE_URL%` → domaine réel, dans index.html (head + JSON-LD).
    transformIndexHtml(html) {
      return html.replaceAll("%SITE_URL%", siteUrl);
    },

    // Après l'écriture sur disque : génère les fichiers de déploiement.
    async writeBundle(options) {
      const outDir = resolve(options.dir ?? "dist");

      await Promise.all([
        writeFile(resolve(outDir, "_headers"), securityHeaders(), "utf8"),
        writeFile(resolve(outDir, "robots.txt"), robotsTxt(siteUrl), "utf8"),
        siteUrl
          ? writeFile(resolve(outDir, "sitemap.xml"), sitemapXml(siteUrl), "utf8")
          : Promise.resolve(),
      ]);

      if (!siteUrl) {
        this.warn(
          "SITE_URL n'est pas défini : canonical, og:image, JSON-LD et sitemap resteront relatifs. " +
            "Définir SITE_URL (ex. SITE_URL=https://ruga-pasta.fr) avant le build de production.",
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = normalizeSiteUrl(
    process.env.SITE_URL ??
      env.SITE_URL ??
      env.VITE_SITE_URL ??
      // Déploiement par défaut (Vercel) : à surcharger via SITE_URL si le
      // site déménage vers son propre domaine.
      "https://ruga-pasta.vercel.app",
  );

  return {
    plugins: [react(), tailwindcss(), deployPlugin(siteUrl)],
    build: {
      // Les sources ne sont pas publiées : elles exposent le code sans intérêt
      // pour l'utilisateur (et alourdissent le déploiement).
      sourcemap: false,
      // Pages séparées : le site vitrine ne télécharge pas le code du tunnel
      // de commande (et inversement) — chaque page charge ce qu'elle utilise.
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          order: resolve(__dirname, "commander.html"),
          admin: resolve(__dirname, "admin.html"),
          privacy: resolve(__dirname, "confidentialite.html"),
        },
      },
    },
    server: {
      proxy: {
        // Le serveur d'API de développement tourne à côté de Vite (même
        // handlers que la prod Vercel) : le tunnel et le dashboard marchent
        // en local sans configuration.
        "/api": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },
  };
});
