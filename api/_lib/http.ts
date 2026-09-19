/**
 * Helpers HTTP partagés par les adaptateurs d'endpoints.
 * Signature Web standard (Request → Response) : marche sur Vercel ET dans le
 * serveur de dev local (`scripts/dev-api.mjs`) avec le même code.
 */
import type { ApiResponse } from "./handlers";

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
