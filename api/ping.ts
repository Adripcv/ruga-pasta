/**
 * Diagnostic déploiement : endpoint sans aucune dépendance.
 * À supprimer une fois le problème résolu.
 */
export default function handler(_req: unknown, res: {
  status: (n: number) => { json: (b: unknown) => void; end: () => void };
  setHeader: (k: string, v: string) => void;
}): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, ping: true, at: new Date().toISOString() });
}
