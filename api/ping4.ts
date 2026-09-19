/**
 * Diagnostic : teste la chaîne complète handlers.ts (imports supabase, crypto…).
 * À supprimer une fois le problème résolu.
 */
import { handleMenu } from "./_lib/handlers";
import { bridge } from "./_lib/vercel-bridge";

async function handler(_req: Request): Promise<Response> {
  const result = await handleMenu();
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

export default bridge(handler);
