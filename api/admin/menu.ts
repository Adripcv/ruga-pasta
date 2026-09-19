/**
 * POST /api/admin/menu — prix / rupture / activation d'un produit (gérant).
 */
import { handleAdminMenuUpdate } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed, readJson } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleAdminMenuUpdate({ token: bearerFrom(req) }, body));
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
