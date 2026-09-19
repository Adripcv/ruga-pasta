/**
 * Diagnostic déploiement : vérifie la résolution de supabase-js et des envs.
 * À supprimer une fois le problème résolu.
 */
import { createClient } from "@supabase/supabase-js";

export default function handler(_req: unknown, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}): void {
  res.setHeader("Cache-Control", "no-store");
  const url = process.env.SUPABASE_URL ? "définie" : "absente";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ? "définie" : "absente";
  let supabase = "import ko";
  try {
    const c = createClient("https://example.supabase.co", "fake-key");
    supabase = c ? "import ok" : "client vide";
  } catch (err) {
    supabase = `import erreur: ${String(err).slice(0, 80)}`;
  }
  res.status(200).json({ ok: true, supabaseUrl: url, serviceKey: key, supabase });
}
