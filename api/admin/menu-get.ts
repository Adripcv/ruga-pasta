/**
 * GET /api/admin/menu-get — liste plate du menu pour le dashboard (gérant).
 */
import { handleAdminMenuGet } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  return json(await handleAdminMenuGet({ token: bearerFrom(req) }));
}


import { bridge } from "../_lib/vercel-bridge";

export default bridge(handler);
