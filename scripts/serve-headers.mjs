/**
 * Sert le dossier `dist/` en appliquant les en-têtes générés dans
 * `dist/_headers`, exactement comme le ferait Netlify ou Cloudflare Pages.
 *
 * À quoi ça sert : une CSP trop stricte casse un site sans message d'erreur
 * visible (police, image ou script bloqués). Comme `npm run preview` ne lit
 * pas les `_headers`, ce petit serveur est le seul moyen de tester la
 * politique de sécurité en local avant de déployer.
 *
 *   npm run build          # génère dist/ et dist/_headers
 *   npm run preview:headers
 *   → http://localhost:4174
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve("dist");
// `|| 4174` : une variable PORT vide ou non numérique doit retomber sur la
// valeur par défaut au lieu d'écouter sur un port aléatoire.
const PORT = Number.parseInt(process.env.PORT ?? "", 10) || 4174;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

/** Lit `dist/_headers` → [{ pattern, headers: { clé: valeur } }]. */
async function readHeaderRules() {
  let raw = "";
  try {
    raw = await readFile(join(ROOT, "_headers"), "utf8");
  } catch {
    console.warn("⚠️  dist/_headers introuvable — lancer `npm run build` d'abord.");
    return [];
  }

  const rules = [];
  let current = null;
  for (const line of raw.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const sep = line.indexOf(":");
    if (current && sep > 0) {
      current.headers[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
  }
  return rules;
}

/** Spécificité : règle exacte > préfixe > joker (`/*`). */
function matchRule(pattern, pathname) {
  if (pattern === "/*") return 1;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix) ? 2 + prefix.length : 0;
  }
  return pattern === pathname ? 100 : 0;
}

const rules = await readHeaderRules();

function headersFor(pathname) {
  const matched = rules
    .map((rule) => ({ ...rule, score: matchRule(rule.pattern, pathname) }))
    .filter((rule) => rule.score > 0)
    .sort((a, b) => a.score - b.score); // le plus spécifique en dernier = gagne
  return Object.assign({}, ...matched.map((rule) => rule.headers));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // Anti-traversée de répertoire.
  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": body.length,
      ...headersFor(pathname),
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  }
});

server.listen(PORT, () => {
  console.log(`dist/ servi avec les en-têtes de _headers → http://localhost:${PORT}`);
});
