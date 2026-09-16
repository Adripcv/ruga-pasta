import { useEffect, useRef, useState } from "react";

/** Barre de progression de lecture — 3 px fixés en haut de page. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(window.scrollY / max, 1) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-[3px] pointer-events-none"
    >
      <div
        className="h-full origin-left bg-tomato"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
