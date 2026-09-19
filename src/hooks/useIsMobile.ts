import { useEffect, useState } from "react";

/**
 * Vrai quand l'écran est plus étroit que la breakpoint `lg` de Tailwind
 * (1024 px) — la MÊME breakpoint que les classes `lg:` du CSS, pour que la
 * logique JSX (sections masquées, galerie réduite) et le style restent
 * toujours d'accord, y compris à la rotation d'une tablette.
 *
 * Par défaut `false` (rendu desktop) : c'est la valeur sûre si le hook s'exécute
 * hors navigateur, et l'état se corrige seul au premier effet.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobile(!event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
