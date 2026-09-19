/**
 * POST /api/admin/settings — réglages opérationnels du click & collect (gérant).
 */
import { handleAdminSettingsUpdate } from "../_lib/handlers.js";
import { bearerFrom, csrfGuard, json, methodNotAllowed, readJson } from "../_lib/http.js";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const csrf = csrfGuard(req);
  if (csrf) return csrf;
  const body = await readJson(req);
  return json(await handleAdminSettingsUpdate({ token: bearerFrom(req) }, body));
}


import { bridge } from "../_lib/vercel-bridge.js";

export default bridge(handler);
