/**
 * Pont entre les handlers purs (Web standard Request → Response) et le
 * runtime Node.js classique de Vercel (VercelRequest → VercelResponse).
 *
 * Pourquoi ce pont : les handlers métier restent 100 % standards (testables
 * avec Vitest, exécutables par le serveur de dev ET par Vercel), tandis que
 * l'adaptateur bas utilise la signature la plus universelle et éprouvée de
 * Vercel Functions.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

type WebHandler = (req: Request) => Promise<Response>;

/** Reconstruit une URL absolue depuis les propriétés Vercel. */
function absoluteUrl(req: VercelRequest): string {
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  return `${proto}://${host}${req.url ?? "/"}`;
}

/** Convertit les en-têtes Node (valeurs string | string[] | undefined). */
function toWebHeaders(req: VercelRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(","));
  }
  return headers;
}

/**
 * Convertit un handler Web en handler Vercel Node classique.
 * Le corps du Request est reconstruit depuis le buffer déjà lu par Vercel
 * (le flux Node a déjà été consommé — on ne peut pas le relire).
 */
export function bridge(webHandler: WebHandler) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    try {
      const method = (req.method ?? "GET").toUpperCase();
      const headers = toWebHeaders(req);
      const hasBody = method !== "GET" && method !== "HEAD";
      const request = new Request(absoluteUrl(req), {
        method,
        headers,
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      });
      const response = await webHandler(request);
      const out: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        out[key] = value;
      });
      res.writeHead(response.status, out);
      res.end(await response.text());
    } catch (err) {
      console.error("[api]", err);
      res.status(500).json({ error: "INTERNAL" });
    }
  };
}
