import { marqueeWords } from "../data/restaurant";

export function Marquee() {
  const words = [...marqueeWords, ...marqueeWords];

  return (
    <div
      className="marquee-mask relative overflow-hidden border-y-4 border-ink bg-tomato py-3.5"
      aria-hidden="true"
    >
      <div className="marquee-track flex w-max items-center gap-8 pr-8">
        {[0, 1].map((half) => (
          <div key={half} className="flex items-center gap-8">
            {words.map((w, i) => (
              <span
                key={`${half}-${i}`}
                className="h-serif flex items-center gap-8 text-lg font-black tracking-wide whitespace-nowrap text-cream sm:text-xl"
              >
                {w}
                <span className="text-sun">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
