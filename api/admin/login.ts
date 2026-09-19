/**
 * POST /api/admin/login — proxy d'authentification gérant.
 * Le navigateur ne parle jamais à Supabase directement : l'allowlist email
 * est vérifiée AVANT toute requête d'authentification.
 */
import { handleAdminLogin } from "../_lib/handlers";
import { ipFrom, json, methodNotAllowed, readJson } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleAdminLogin(body, ipFrom(req)));
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
