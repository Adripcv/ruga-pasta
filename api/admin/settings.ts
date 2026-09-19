/**
 * POST /api/admin/settings — réglages opérationnels du click & collect (gérant).
 */
import { handleAdminSettingsUpdate } from "../_lib/handlers";
import { bearerFrom, json, methodNotAllowed, readJson } from "../_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleAdminSettingsUpdate({ token: bearerFrom(req) }, body));
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
