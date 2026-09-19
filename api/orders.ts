/**
 * POST /api/orders — création de commande.
 * Adaptateur minimal : toute la logique vit dans `api/_lib/handlers.ts`.
 */
import { handleCreateOrder } from "./_lib/handlers";
import { ipFrom, json, methodNotAllowed, readJson } from "./_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(req);
  return json(await handleCreateOrder({ body, ip: ipFrom(req) }));
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
