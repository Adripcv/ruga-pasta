/**
 * /api/admin/settings — GET : réglages courants ; POST : mise à jour.
 * Rôle admin requis. Un seul fichier (limite de fonctions Vercel Hobby).
 */
import {
  handleAdminSettingsGet,
  handleAdminSettingsUpdate,
} from "../_lib/handlers.js";
import { bearerFrom, csrfGuard, json, methodNotAllowed, readJson } from "../_lib/http.js";

export async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return json(await handleAdminSettingsGet({ token: bearerFrom(req) }));
  }
  if (req.method !== "POST") return methodNotAllowed("GET, POST");
  const csrf = csrfGuard(req);
  if (csrf) return csrf;
  const body = await readJson(req);
  return json(await handleAdminSettingsUpdate({ token: bearerFrom(req) }, body));
}


import { bridge } from "../_lib/vercel-bridge.js";

export default bridge(handler);
