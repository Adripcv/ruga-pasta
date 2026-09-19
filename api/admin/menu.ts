/**
 * POST /api/admin/menu — prix / rupture / activation d'un produit (gérant).
 */
import { handleAdminMenuUpdate } from "../_lib/handlers.js";
import { bearerFrom, json, methodNotAllowed, readJson } from "../_lib/http.js";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleAdminMenuUpdate({ token: bearerFrom(req) }, body));
}


import { bridge } from "../_lib/vercel-bridge.js";

export default bridge(handler);
