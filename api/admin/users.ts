/**
 * POST /api/admin/users — gestion des comptes de l'équipe (rôle admin) :
 * list / create / delete. Voir handleAdminUsers dans handlers.ts.
 */
import { handleAdminUsers } from "../_lib/handlers.js";
import { bearerFrom, csrfGuard, json, methodNotAllowed, readJson } from "../_lib/http.js";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const csrf = csrfGuard(req);
  if (csrf) return csrf;
  const body = await readJson(req);
  return json(await handleAdminUsers({ token: bearerFrom(req) }, body));
}


import { bridge } from "../_lib/vercel-bridge.js";

export default bridge(handler);
