/**
 * GET /api/admin/settings-get — réglages courants pour le dashboard (gérant).
 */
import { handleAdminSettingsGet } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  return json(await handleAdminSettingsGet({ token: bearerFrom(req) }));
}


import { bridge } from "../_lib/vercel-bridge";

export default bridge(handler);
