import { concept } from "../data/restaurant";
import { useReveal } from "../hooks/useReveal";

/** Drapeau italien en SVG (les emojis drapeaux ne s'affichent pas sous Windows). */
function ItalyFlag({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <clipPath id="it-flag-circle">
        <circle cx="18" cy="18" r="18" />
      </clipPath>
      <g clipPath="url(#it-flag-circle)">
        <rect width="12" height="36" fill="#3E9B4F" />
        <rect x="12" width="12" height="36" fill="#F4F5F0" />
        <rect x="24" width="12" height="36" fill="#CD2B37" />
      </g>
    </svg>
  );
}

export function Concept() {
  const ref = useReveal<HTMLElement>();

  return (
    <section
      id="concept"
      ref={ref}
      className="paper-dark relative overflow-hidden bg-ink py-20 text-cream sm:py-28"
      aria-labelledby="concept-title"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -left-8 hidden font-display text-[13rem] leading-none font-black text-cream/5 italic select-none lg:block"
      >
        Italia
      </span>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal max-w-2xl">
          <p className="text-xs font-extrabold tracking-[0.28em] text-sun uppercase">
            {concept.kicker}
          </p>
          <h2
            id="concept-title"
            className="h-serif mt-4 text-5xl leading-[0.95] font-black sm:text-6xl"
          >
            <span className="line-mask" style={{ "--d": "80ms" } as React.CSSProperties}>
              <span className="line-mask-inner">{concept.title}</span>
            </span>
            <span className="line-mask" style={{ "--d": "220ms" } as React.CSSProperties}>
              <span className="line-mask-inner em-italic text-tomato">
                {concept.titleAccent}
              </span>
            </span>
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {concept.items.map((item, i) => (
            <div
              key={item.title}
              className="reveal group relative overflow-hidden rounded-3xl border border-cream/10 bg-cream/5 p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-tomato/50 hover:bg-cream/10"
              style={{ "--d": `${i * 80}ms` } as React.CSSProperties}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-3 right-4 font-display text-7xl font-black text-cream/8 select-none"
              >
                0{i + 1}
              </span>
              <span
                aria-hidden="true"
                className="inline-block text-4xl transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-6"
              >
                {item.emoji === "🇮🇹" ? (
                  <ItalyFlag className="h-9 w-9" />
                ) : (
                  item.emoji
                )}
              </span>
              <h3 className="font-display mt-5 text-xl leading-tight font-black">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-cream/70">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
