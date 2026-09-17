import { useCallback, useEffect, useRef, useState } from "react";
import { gallery } from "../data/restaurant";
import { useReveal } from "../hooks/useReveal";
import { ChevronLeft, ChevronRight, X } from "./icons";

export function Gallery() {
  const ref = useReveal<HTMLElement>();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const photos = gallery.photos;

  const close = useCallback(() => {
    setLightbox(null);
    // Restaure le focus sur la miniature d'origine
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  const step = useCallback(
    (dir: 1 | -1) =>
      setLightbox((i) =>
        i === null ? i : (i + dir + photos.length) % photos.length,
      ),
    [photos.length],
  );

  const open = (i: number) => (e: React.MouseEvent<HTMLElement>) => {
    triggerRef.current = e.currentTarget;
    setLightbox(i);
  };

  // Clavier : Échap ferme, flèches naviguent, Tab reste dans la lightbox —
  // scroll bloqué quand elle est ouverte.
  useEffect(() => {
    if (lightbox === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);

      if (e.key === "Tab") {
        // Piège à focus : sans ça, Tab sortait de la lightbox et promenait le
        // focus sur les liens de la page cachés derrière l'overlay (WCAG 2.4.3).
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (!active || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
          return;
        }
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox !== null, close, step]);

  const current = lightbox !== null ? photos[lightbox] : null;

  return (
    <section
      id="galerie"
      ref={ref}
      className="paper relative overflow-hidden py-20 sm:py-28"
      aria-labelledby="gallery-title"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold tracking-[0.28em] text-tomato uppercase">
              {gallery.kicker}
            </p>
            <h2
              id="gallery-title"
              className="h-serif mt-4 text-5xl leading-[0.95] font-black sm:text-6xl"
            >
              <span className="line-mask" style={{ "--d": "80ms" } as React.CSSProperties}>
                <span className="line-mask-inner">{gallery.title}</span>
              </span>
              <span className="line-mask" style={{ "--d": "220ms" } as React.CSSProperties}>
                <span className="line-mask-inner em-italic text-tomato">
                  {gallery.titleAccent}
                </span>
              </span>
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-ink/60">
            {gallery.note}
          </p>
        </div>

        <div className="mt-12 grid auto-rows-[minmax(180px,auto)] grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-12">
          {photos.map((photo, i) => (
            <figure
              key={photo.img + i}
              className={`reveal-img group relative overflow-hidden rounded-3xl shadow-[0_18px_40px_-26px_rgba(43,26,16,0.45)] transition-shadow duration-300 hover:shadow-[0_28px_54px_-26px_rgba(43,26,16,0.55)] ${photo.span}`}
              style={{ "--d": `${(i % 6) * 60}ms` } as React.CSSProperties}
            >
              <img
                src={photo.img}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 ${photo.ratio} lg:absolute lg:inset-0`}
              />
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink/80 to-transparent p-4 pt-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="text-xs font-bold text-cream">
                  {photo.alt}
                </span>
              </figcaption>
              <button
                type="button"
                onClick={open(i)}
                aria-label={`Agrandir : ${photo.alt}`}
                className="absolute inset-0 z-20 cursor-zoom-in rounded-3xl"
              />
            </figure>
          ))}
        </div>
      </div>

      {/* ---------- Lightbox ---------- */}
      {current && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
          className="lightbox-fade fixed inset-0 z-[90] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm sm:p-8"
          onClick={close}
        >
          {/* Fermer */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Fermer l’agrandissement"
            className="absolute top-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-cream/30 text-cream transition-colors hover:border-cream hover:bg-cream hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Précédent */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Image précédente"
              className="absolute top-1/2 left-3 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cream/30 text-cream transition-colors hover:border-cream hover:bg-cream hover:text-ink sm:left-6"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Suivant */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Image suivante"
              className="absolute top-1/2 right-3 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cream/30 text-cream transition-colors hover:border-cream hover:bg-cream hover:text-ink sm:right-6"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Image + légende */}
          <figure
            key={lightbox ?? 0}
            className="lightbox-in flex max-h-full max-w-full flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={current.img}
              alt={current.alt}
              className="max-h-[78svh] w-auto max-w-full rounded-2xl object-contain shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]"
              decoding="async"
            />
            <figcaption className="mt-4 max-w-2xl text-center text-sm font-semibold text-cream/85">
              {current.alt}
              {photos.length > 1 && (
                <span className="mt-1 block text-xs font-bold tracking-[0.2em] text-cream/50">
                  {(lightbox ?? 0) + 1} / {photos.length}
                </span>
              )}
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
