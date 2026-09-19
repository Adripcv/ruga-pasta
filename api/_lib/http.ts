/**
 * Helpers HTTP partagés par les adaptateurs d'endpoints.
 * Signature Web standard (Request → Response) : marche sur Vercel ET dans le
 * serveur de dev local (`scripts/dev-api.mjs`) avec le même code.
 */
import type { ApiResponse } from "./handlers.js";

export function json(res: ApiResponse): Response {
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Aucune réponse d'API ne doit être mise en cache (prix, créneaux,
      // commandes : tout est temps réel).
      "Cache-Control": "no-store",
      // Même origine uniquement : les endpoints sont appelés par le site luimême.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function methodNotAllowed(_allow: string): Response {
  return json({ status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
}

/** Lit le corps JSON avec garde-fous (taille, parse) — jamais une exception. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    const length = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 16_384) return null; // 16 Ko max
    return await req.json();
  } catch {
    return null;
  }
}

/** Première IP de la chaîne X-Forwarded-For (posé par la plateforme, non falsifiable côté client). */
export function ipFrom(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for");
  if (!raw) return null;
  return raw.split(",")[0]?.trim() || null;
}

/** Jeton Bearer du header Authorization (dashboard gérant). */
export function bearerFrom(req: Request): string | null {
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * Garde anti-CSRF pour les endpoints mutatifs (POST).
 *
 * Deux barres indépendantes :
 *  1. `Content-Type: application/json` obligatoire — un formulaire cross-origin
 *     ne peut PAS poser cet en-tête (les valeurs `text/plain` /
 *     `multipart/form-data` seules sont autorisées sans preflight) : une
 *     tentative CSRF échoue avant d'atteindre le handler ;
 *  2. si l'en-tête `Origin` est présent, il DOIT correspondre à l'hôte servi
 *     (les navigateurs l'envoient sur chaque POST) — défense en profondeur si
 *     un jour un proxy réécrit le Content-Type.
 *
 * Une requête sans `Origin` (curl, serveur à serveur) passe : ce n'est pas un
 * vecteur CSRF (un navigateur en met toujours un sur POST).
 * Renvoie une `Response` d'erreur, ou `null` si la requête est acceptable.
 */
export function csrfGuard(req: Request): Response | null {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return null;

  const contentType = (req.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return json({ status: 415, body: { error: "UNSUPPORTED_MEDIA_TYPE" } });
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    if (!originHost || originHost !== host) {
      return json({ status: 403, body: { error: "FORBIDDEN_ORIGIN" } });
    }
  }
  return null;
}
