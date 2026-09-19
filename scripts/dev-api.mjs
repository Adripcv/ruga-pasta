/**
 * Serveur d'API de développement — monte les mêmes handlers que la prod
 * Vercel sur /api/* (port 8787). Vite proxifie /api vers ce serveur :
 * le tunnel et le dashboard fonctionnent en local exactement comme en prod.
 *
 * Usage : node scripts/dev-api.mjs (lancé par `npm run dev` via concurrently).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Charge .env (le même que Vite) — pas de dépendance dotenv.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const handlers = {
  "/api/orders": { mod: "../api/orders.ts", method: "POST" },
  "/api/slots": { mod: "../api/slots.ts", method: "GET" },
  "/api/menu": { mod: "../api/menu.ts", method: "GET" },
  "/api/admin/login": { mod: "../api/admin/login.ts", method: "POST" },
  "/api/admin/orders": { mod: "../api/admin/orders.ts", method: "GET" },
  "/api/admin/order-status": { mod: "../api/admin/order-status.ts", method: "POST" },
  "/api/admin/stats": { mod: "../api/admin/stats.ts", method: "GET" },
  "/api/admin/menu": { mod: "../api/admin/menu.ts", method: "POST" },
  "/api/admin/menu-get": { mod: "../api/admin/menu-get.ts", method: "GET" },
  "/api/admin/settings": { mod: "../api/admin/settings.ts", method: "POST" },
  "/api/admin/settings-get": { mod: "../api/admin/settings-get.ts", method: "GET" },
};

// tsx exécute TypeScript directement (devDependency, pas de build).
import "tsx/esm";

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = handlers[url.pathname];

  res.setHeader("Cache-Control", "no-store");
  if (!route) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }

  const method = req.method ?? "GET";
  if (method !== route.method) {
    res.writeHead(405, { "Content-Type": "application/json", Allow: route.method });
    res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return;
  }

  try {
    const mod = await import(route.mod);
    // Priorité : le handler Web nommé (utilisé ici) ; `default` est le pont
    // Vercel Node, inutile en local.
    const handler = mod.handler ?? mod.default?.fetch ?? mod.default;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(","));
    }
    const bodyChunks = [];
    for await (const chunk of req) bodyChunks.push(chunk);
    const rawBody = Buffer.concat(bodyChunks);
    const request = new Request(`http://localhost${req.url}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : rawBody,
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch (err) {
    console.error("[api]", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "INTERNAL", message: String(err?.message ?? err) }));
  }
});

const PORT = Number(process.env.API_PORT ?? 8787);
server.listen(PORT, () => {
  console.log(`[api] prêt sur http://localhost:${PORT}`);
});
