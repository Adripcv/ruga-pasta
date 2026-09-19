/**
 * GET /api/admin/orders?day=YYYY-MM-DD — commandes d'une journée (gérant).
 */
import { handleAdminOrders } from "../_lib/handlers.js";
import { bearerFrom, json, methodNotAllowed } from "../_lib/http.js";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  const day = new URL(req.url).searchParams.get("day");
  return json(await handleAdminOrders({ token: bearerFrom(req) }, day));
}


import { bridge } from "../_lib/vercel-bridge.js";

export default bridge(handler);
