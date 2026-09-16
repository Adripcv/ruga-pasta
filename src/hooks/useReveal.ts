import { useEffect, useRef } from "react";

/**
 * Ajoute la classe `is-visible` aux éléments `.reveal` / `.reveal-img`
 * lorsqu'ils entrent dans le viewport.
 * Si `prefers-reduced-motion` est actif, tout est affiché sans animation.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(".reveal, .reveal-img, .line-mask"),
    );

    if (reduced) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.96) {
        el.classList.add("is-visible");
      } else {
        io.observe(el);
      }
    });

    return () => io.disconnect();
  }, []);

  return ref;
}

/** True when the user prefers reduced motion (re-evaluated per render). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
