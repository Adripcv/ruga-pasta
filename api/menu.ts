/**
 * GET /api/menu — arbre du menu actif + état du click & collect.
 */
import { handleMenu } from "./_lib/handlers";
import { json, methodNotAllowed } from "./_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  return json(await handleMenu());
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
