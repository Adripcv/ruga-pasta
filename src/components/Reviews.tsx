import { useCallback, useEffect, useRef, useState } from "react";
import { restaurant, reviews } from "../data/restaurant";
import { prefersReducedMotion, useReveal } from "../hooks/useReveal";
import { Arrow, GoogleG, Quote, Stars } from "./icons";

/** Détecte un unique passage dans le viewport (pour lancer le count-up). */
function useInViewOnce(ref: React.RefObject<HTMLElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return seen;
}

/** Note Google avec count-up (0 → 4,8) à l'entrée dans le viewport. */
function AnimatedRating({ value }: { value: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const seen = useInViewOnce(ref);
  const reduced = prefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!seen || reduced) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduced, value]);

  return (
    <p ref={ref} className="font-display mt-3 text-5xl font-black text-ink">
      {display.toLocaleString("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}
      <span className="text-2xl text-ink/40">/5</span>
    </p>
  );
}

export function Reviews() {
  const ref = useReveal<HTMLElement>();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const total = reviews.list.length;

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + total) % total),
    [total],
  );

  useEffect(() => {
    if (paused) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const t = setInterval(() => go(1), 7000);
    return () => clearInterval(t);
    // `index` dans les deps : le timer repart de 7 s après un clic sur un dot
    // ou une flèche, en synchro avec la barre de progression du dot actif.
  }, [paused, go, index]);

  return (
    <section
      id="avis"
      ref={ref}
      className="relative overflow-hidden bg-cream-2 py-20 sm:py-28"
      aria-labelledby="reviews-title"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-extrabold tracking-[0.28em] text-tomato uppercase">
              {reviews.kicker}
            </p>
            <h2
              id="reviews-title"
              className="h-serif mt-4 text-4xl leading-[1.02] font-black sm:text-6xl"
            >
              <span className="line-mask" style={{ "--d": "80ms" } as React.CSSProperties}>
                <span className="line-mask-inner">{reviews.title}</span>
              </span>
              <span className="line-mask" style={{ "--d": "220ms" } as React.CSSProperties}>
                <span className="line-mask-inner em-italic text-tomato">
                  {reviews.titleAccent}
                </span>
              </span>
            </h2>
          </div>

          {/* Bloc note Google */}
          <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-[0_18px_40px_-28px_rgba(43,26,16,0.4)]">
            <div className="flex items-center gap-3">
              <GoogleG />
              <span className="text-sm font-bold text-ink/70">Google</span>
            </div>
            <AnimatedRating value={restaurant.rating.value} />
            <div className="mt-2 flex items-center gap-2">
              <Stars />
              <span className="text-sm font-semibold text-ink/60">
                {restaurant.rating.count} avis
              </span>
            </div>
          </div>
        </div>

        {/* Carousel */}
        <div
          className="reveal mt-12"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          // Le survol ne suffit pas : le défilement automatique doit aussi
          // s'arrêter au clavier (WCAG 2.2.2 — contenu en mouvement).
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
            setPaused(true);
          }}
          onTouchEnd={(e) => {
            if (touchX.current !== null) {
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
              touchX.current = null;
            }
            setPaused(false);
          }}
        >
          <div
            className="overflow-hidden rounded-[2rem]"
            role="region"
            aria-roledescription="carousel"
            aria-label={`Témoignages clients — ${total} avis`}
          >
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {reviews.list.map((review, i) => (
                <figure
                  key={review.name}
                  className="w-full shrink-0 rounded-[2rem] border border-ink/10 bg-white p-7 shadow-[0_22px_50px_-30px_rgba(43,26,16,0.4)] sm:p-10"
                  // Les avis hors écran ne doivent être ni lus par un lecteur
                  // d'écran ni atteignables au clavier (`inert` les retire du
                  // focus) : sinon on entendait les 3 avis d'affilée.
                  aria-hidden={index !== i}
                  inert={index !== i}
                >
                  <Quote className="h-9 w-9 text-tomato/25" />
                  <blockquote className="mt-4 text-lg leading-relaxed text-ink/85 sm:text-xl">
                    «&nbsp;{review.text}&nbsp;»
                  </blockquote>
                  <figcaption className="mt-6 flex flex-wrap items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-tomato font-display text-lg font-black text-cream"
                    >
                      {review.name.charAt(0)}
                    </span>
                    <span>
                      <span className="block font-bold text-ink">
                        {review.name}
                      </span>
                      <span className="block text-sm text-ink/60">
                        <Stars /> {review.rating}/5 · Avis Google
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          {/* Contrôles */}
          <div className="mt-6 flex items-center justify-between">
            {/* De vrais boutons, pas un faux `tablist` : les onglets ARIA sans
                panneau associé sont invalides et annonçaient « 1 sur 3 » à tort. */}
            <div className="flex gap-2" role="group" aria-label="Choisir un avis">
              {reviews.list.map((r, i) => (
                <button
                  key={r.name}
                  type="button"
                  aria-current={index === i ? "true" : undefined}
                  aria-label={`Afficher l'avis de ${r.name}`}
                  onClick={() => setIndex(i)}
                  className={`relative h-3 overflow-hidden rounded-full transition-all duration-300 ${
                    index === i ? "w-8 bg-ink/10" : "w-3 bg-ink/20 hover:bg-ink/40"
                  }`}
                >
                  {/* Remplissage progressif = temps restant avant la slide suivante.
                      La key inclut `index` et `paused` : le timer JS repart de 7 s
                      après un changement de slide ou une pause/reprise, la barre
                      fait pareil. */}
                  {index === i && (
                    <span
                      key={`${index}-${paused}`}
                      aria-hidden="true"
                      className={`dot-progress absolute inset-0 rounded-full bg-tomato ${
                        paused ? "dot-progress-paused" : ""
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Avis précédent"
                className="flex h-11 w-11 rotate-180 items-center justify-center rounded-full border-2 border-ink/15 text-ink transition-colors hover:border-tomato hover:bg-tomato hover:text-cream"
              >
                <Arrow />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Avis suivant"
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink/15 text-ink transition-colors hover:border-tomato hover:bg-tomato hover:text-cream"
              >
                <Arrow />
              </button>
            </div>
          </div>
        </div>

        <div className="reveal mt-10 text-center">
          <a
            href={restaurant.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
          >
            Voir tous les avis
            <GoogleG className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
