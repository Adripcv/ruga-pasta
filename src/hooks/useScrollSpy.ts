import { useEffect, useState } from "react";

/**
 * Scrollspy : renvoie l'id de la section actuellement visible.
 * IntersectionObserver sur chaque section ; la section dont le ratio
 * d'intersection est le plus grand gagne.
 */
export function useScrollSpy(ids: readonly string[]): string {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const visibles = new Map<string, number>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibles.set(
            entry.target.id,
            entry.isIntersecting ? entry.intersectionRatio : 0,
          );
        }
        // La plus visible gagne ; à égalité, la première observée reste.
        let best = "";
        let bestRatio = 0;
        for (const [id, ratio] of visibles) {
          if (ratio > bestRatio + 0.001) {
            best = id;
            bestRatio = ratio;
          }
        }
        setActive(best);
      },
      {
        rootMargin: "-40% 0px -40% 0px",
        threshold: [0, 0.05, 0.25, 0.5, 0.75, 1],
      },
    );

    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [ids.join("|")]);

  return active;
}
