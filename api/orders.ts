/**
 * POST /api/orders — création de commande.
 * Adaptateur minimal : toute la logique vit dans `api/_lib/handlers.ts`.
 */
import { handleCreateOrder } from "./_lib/handlers.js";
import { ipFrom, json, methodNotAllowed, readJson } from "./_lib/http.js";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleCreateOrder({ body, ip: ipFrom(req) }));
}


import { bridge } from "./_lib/vercel-bridge.js";

export default bridge(handler);
