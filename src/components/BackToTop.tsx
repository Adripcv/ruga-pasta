import { useEffect, useState } from "react";
import { ArrowUp } from "./icons";

/**
 * Bouton retour en haut — apparaît après le hero (scroll > 80 % du viewport).
 * Se place au-dessus de la MobileBar sur mobile.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVisible(window.scrollY > window.innerHeight * 0.8);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <a
      href="#accueil"
      aria-label="Revenir en haut de page"
      className={`fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink/10 bg-cream/95 text-ink shadow-[0_12px_30px_-10px_rgba(43,26,16,0.45)] backdrop-blur-md transition-all duration-300 hover:border-tomato hover:bg-tomato hover:text-cream sm:right-6 sm:bottom-6 ${
        visible
          ? "bottom-[4.5rem] translate-y-0 opacity-100 sm:bottom-6"
          : "bottom-[3.5rem] pointer-events-none translate-y-3 opacity-0 sm:bottom-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </a>
  );
}
