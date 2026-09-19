/**
 * Diagnostic : teste le pont Request/Response (globals Web) dans le runtime Vercel.
 * À supprimer une fois le problème résolu.
 */
import { bridge } from "./_lib/vercel-bridge";

async function handler(_req: Request): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, bridge: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default bridge(handler);
