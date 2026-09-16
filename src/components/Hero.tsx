import { useEffect, useRef } from "react";
import { hero, restaurant } from "../data/restaurant";
import { prefersReducedMotion } from "../hooks/useReveal";
import { Pin, Star } from "./icons";

/** Délais de l'entrée chorégraphiée (ms). */
const STAGGER = [0, 90, 160, 260, 360, 440] as const;

export function Hero() {
  const orderHref = restaurant.orderUrl ?? restaurant.phoneHref;
  const imgWrapRef = useRef<HTMLDivElement>(null);

  // Parallax doux : l'image glisse à ~15 % de la vitesse de défilement.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = imgWrapRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = Math.min(window.scrollY, window.innerHeight);
        el.style.transform = `translateY(${y * 0.15}px)`;
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
    <section
      id="accueil"
      className="relative flex min-h-[100svh] items-end overflow-hidden bg-ink"
      aria-label="Ruga Pasta — accueil"
    >
      {/* Photo plein écran (parallax + zoom d'arrivée) */}
      <div ref={imgWrapRef} className="absolute inset-0 will-change-transform">
        <img
          src="/images/hero.webp"
          alt="Assiette de pâtes fraîches nappées d’une sauce généreuse — spécialité italienne"
          className="hero-zoom h-full w-full object-cover object-center"
          fetchPriority="high"
          decoding="async"
        />
      </div>
      {/* Overlays lisibilité */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/25"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-ink/55 via-transparent to-transparent"
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-28 pb-24 sm:px-6 sm:pb-28">
        <p
          className="hero-in mb-5 inline-flex items-center gap-2 rounded-full border border-cream/25 bg-ink/45 px-4 py-2 text-[11px] font-extrabold tracking-[0.24em] text-cream uppercase backdrop-blur-sm sm:text-xs"
          style={{ "--d": `${STAGGER[0]}ms` } as React.CSSProperties}
        >
          Pasta bar · Aix-en-Provence
        </p>

        <h1
          className="hero-in h-serif max-w-4xl text-[13.5vw] leading-[0.95] font-black text-cream sm:text-7xl lg:text-8xl"
          style={{ "--d": `${STAGGER[1]}ms` } as React.CSSProperties}
        >
          {hero.titleTop}
          <br />
          <span className="em-italic text-tomato [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]">
            {hero.titleBottom}
          </span>
        </h1>

        <p
          className="hero-in mt-5 max-w-xl text-base leading-relaxed text-cream/90 sm:text-lg"
          style={{ "--d": `${STAGGER[2]}ms` } as React.CSSProperties}
        >
          {hero.subtitle}
        </p>

        <div
          className="hero-in mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
          style={{ "--d": `${STAGGER[3]}ms` } as React.CSSProperties}
        >
          <a href={orderHref} className="btn-primary text-base sm:text-sm">
            Commander
          </a>
          <a href="#carte" className="btn-ghost text-base sm:text-sm">
            Voir la carte
          </a>
        </div>

        <div
          className="hero-in mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-cream/85"
          style={{ "--d": `${STAGGER[4]}ms` } as React.CSSProperties}
        >
          <span className="inline-flex items-center gap-2">
            <Pin className="h-4 w-4 text-sun" />
            {hero.location}
          </span>
          <span className="inline-flex items-center gap-2">
            <Star className="h-4 w-4 text-sun" />
            <strong className="font-extrabold text-cream">
              {restaurant.rating.value.toLocaleString("fr-FR")} ★
            </strong>
            sur Google · {restaurant.rating.count} avis
          </span>
        </div>
      </div>

      {/* Indicateur scroll */}
      <div
        aria-hidden="true"
        className="hero-in absolute bottom-5 left-1/2 hidden -translate-x-1/2 sm:block"
        style={{ "--d": `${STAGGER[5]}ms` } as React.CSSProperties}
      >
        <div className="h-9 w-5.5 rounded-full border-2 border-cream/40 p-1">
          <div className="h-2 w-full animate-bounce rounded-full bg-cream/60" />
        </div>
      </div>
    </section>
  );
}
