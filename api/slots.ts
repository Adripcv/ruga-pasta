/**
 * GET /api/slots?date=YYYY-MM-DD — créneaux de retrait avec capacité.
 */
import { handleSlots } from "./_lib/handlers";
import { json, methodNotAllowed } from "./_lib/http";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed("GET");
  const date = new URL(req.url).searchParams.get("date");
  return json(await handleSlots(date));
}

// Runtime Vercel (Node) : signature Web standard = objet avec méthode fetch.
export default { fetch: handler };
