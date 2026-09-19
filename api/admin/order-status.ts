/**
 * POST /api/admin/order-status — changer le statut d'une commande (gérant).
 */
import { handleAdminUpdateOrder } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed, readJson } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleAdminUpdateOrder({ token: bearerFrom(req) }, body));
}


import { bridge } from "../_lib/vercel-bridge";

export default bridge(handler);
