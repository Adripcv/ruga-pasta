/**
 * GET /api/admin/stats?days=N — chiffres du click & collect (gérant).
 */
import { handleAdminStats } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  const days = new URL(req.url).searchParams.get("days");
  return json(await handleAdminStats({ token: bearerFrom(req) }, days));
}


import { bridge } from "../_lib/vercel-bridge";

export default bridge(handler);
