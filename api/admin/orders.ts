/**
 * GET /api/admin/orders?day=YYYY-MM-DD — commandes d'une journée (gérant).
 */
import { handleAdminOrders } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  const day = new URL(req.url).searchParams.get("day");
  return json(await handleAdminOrders({ token: bearerFrom(req) }, day));
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
