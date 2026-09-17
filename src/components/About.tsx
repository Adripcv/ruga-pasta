import { about, orderLink } from "../data/restaurant";
import { useReveal } from "../hooks/useReveal";
import { Arrow } from "./icons";

export function About() {
  const ref = useReveal<HTMLElement>();

  return (
    <section
      id="a-propos"
      ref={ref}
      className="paper relative overflow-hidden py-20 sm:py-28"
      aria-labelledby="about-title"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-6 hidden font-display text-[11rem] leading-none font-black text-tomato/8 italic select-none lg:block"
      >
        Pasta
      </span>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10">
        {/* Photos asymétriques */}
        <div className="relative lg:col-span-7">
          <div className="reveal-img overflow-hidden rounded-[2rem] shadow-[0_30px_60px_-30px_rgba(43,26,16,0.45)]">
            <img
              src="/images/about-big.webp"
              alt="La terrasse du Ruga Pasta : boxes de pâtes sur les tables, devant la boutique"
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
              decoding="async"
              width="1100"
              height="825"
            />
          </div>
          <div className="reveal-img mt-4 grid grid-cols-2 gap-4">
            <div className="overflow-hidden rounded-3xl shadow-[0_20px_40px_-24px_rgba(43,26,16,0.4)]">
              <img
                src="/images/about-box.webp"
                alt="Une box Ruga Pasta tenue à la main : penne, sauce crémeuse et bacon"
                className="aspect-[3/4] w-full object-cover"
                loading="lazy"
                decoding="async"
                width="600"
                height="800"
              />
            </div>
            <div className="overflow-hidden rounded-3xl shadow-[0_20px_40px_-24px_rgba(43,26,16,0.4)]">
              <img
                src="/images/about-top.webp"
                alt="Box Ruga Pasta vue du dessus : fusilli, sauce et parmesan râpé"
                className="aspect-[3/4] w-full object-cover"
                loading="lazy"
                decoding="async"
                width="600"
                height="800"
              />
            </div>
          </div>

          {/* Sticker */}
          <span
            aria-hidden="true"
            className="absolute -top-4 -left-3 rotate-[-8deg] rounded-2xl bg-sun px-4 py-2 font-display text-sm font-black tracking-widest text-ink uppercase shadow-lg sm:-left-6 sm:text-base"
          >
            100% Italia
          </span>
        </div>

        {/* Texte */}
        <div className="reveal lg:col-span-5 lg:pl-4">
          <p className="text-xs font-extrabold tracking-[0.28em] text-tomato uppercase">
            {about.kicker}
          </p>
          <h2
            id="about-title"
            className="h-serif mt-4 text-4xl leading-[1.02] font-black sm:text-5xl"
          >
            <span
              className="line-mask"
              style={{ "--d": "80ms" } as React.CSSProperties}
            >
              <span className="line-mask-inner">{about.title}</span>
            </span>
            <span
              className="line-mask"
              style={{ "--d": "220ms" } as React.CSSProperties}
            >
              <span className="line-mask-inner em-italic text-tomato">
                {about.titleAccent}
              </span>
            </span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink/80">
            {about.paragraphs[0]}
          </p>

          <ul className="mt-6 flex flex-wrap gap-2.5" aria-label="Services">
            {about.chips.map((chip) => (
              <li key={chip} className="sticker-olive">
                {chip}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a {...orderLink()} className="btn-primary">
              Commander
              <Arrow />
            </a>
            <a
              href="#carte"
              className="font-display text-lg font-bold text-ink italic underline decoration-tomato decoration-[3px] underline-offset-4 transition-colors hover:text-tomato"
            >
              Découvrir la carte
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
