import { menu, orderLinkProps, restaurant } from "../data/restaurant";
import { useReveal } from "../hooks/useReveal";
import { Arrow } from "./icons";

/** Prix S / M façon étiquette ronde, comme sur la carte officielle. */
function PriceBadge({
  size,
  price,
  tone = "ink",
}: {
  size?: string;
  price: string;
  tone?: "ink" | "tomato";
}) {
  return (
    <div className="text-center">
      {size && (
        <span className="block text-[11px] font-extrabold tracking-[0.2em] text-ink/50 uppercase">
          {size}
        </span>
      )}
      <span
        className={`mt-1.5 inline-flex rounded-full px-4 py-2 font-display text-base font-black text-cream shadow-md sm:text-lg ${
          tone === "tomato" ? "bg-tomato" : "bg-ink"
        }`}
      >
        {price}
      </span>
    </div>
  );
}

export function MenuSection() {
  const ref = useReveal<HTMLElement>();
  const orderHref = restaurant.orderUrl ?? restaurant.phoneHref;

  return (
    <section
      id="carte"
      ref={ref}
      className="paper relative overflow-hidden bg-cream-2 py-20 sm:py-28"
      aria-labelledby="menu-title"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* En-tête */}
        <div className="reveal flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-extrabold tracking-[0.28em] text-tomato uppercase">
              {menu.kicker}
            </p>
            <h2
              id="menu-title"
              className="h-serif mt-4 text-5xl leading-[0.95] font-black sm:text-6xl"
            >
              <span className="line-mask" style={{ "--d": "80ms" } as React.CSSProperties}>
                <span className="line-mask-inner">
                  {menu.title}
                  <span className="text-tomato">.</span>
                </span>
              </span>
            </h2>
            <p className="mt-4 max-w-md text-lg text-ink/70">
              {menu.subtitle}
            </p>
          </div>
          <span className="sticker-red rotate-2">📦 {menu.sticker}</span>
        </div>

        {/* Formules + salade de la semaine */}
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {menu.formules.map((formule, i) => (
            <article
              key={formule.name}
              className="reveal group relative flex flex-col rounded-3xl border border-ink/10 bg-white p-6 shadow-[0_16px_40px_-26px_rgba(43,26,16,0.4)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_54px_-26px_rgba(43,26,16,0.5)] sm:p-7"
              style={{ "--d": `${i * 80}ms` } as React.CSSProperties}
            >
              {formule.tag && (
                <span className="absolute -top-3 left-6 rotate-[-2deg] rounded-xl bg-tomato px-3 py-1.5 text-[10px] font-extrabold tracking-[0.16em] text-cream uppercase shadow-md">
                  {formule.tag}
                </span>
              )}
              <h3 className="font-display mt-2 text-2xl leading-tight font-black">
                {formule.name}
              </h3>
              <p className="mt-2.5 inline-flex w-fit rounded-full bg-tomato/10 px-3.5 py-1.5 text-sm font-bold text-tomato-deep">
                {formule.desc}
              </p>
              <div className="mt-6 flex items-start justify-center gap-10">
                <PriceBadge size="S" price={formule.prices.S} />
                <PriceBadge size="M" price={formule.prices.M} />
              </div>

              {/* Reflet qui balaye la carte au hover */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-[linear-gradient(115deg,transparent_30%,rgba(242,179,61,0.12)_48%,rgba(255,255,255,0.25)_52%,transparent_68%)]"
              />
            </article>
          ))}

          {/* Salade de pâtes de la semaine */}
          <article
            className="reveal group relative flex flex-col overflow-hidden rounded-3xl border-2 border-sun/50 bg-white p-6 shadow-[0_16px_40px_-26px_rgba(43,26,16,0.4)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_54px_-26px_rgba(43,26,16,0.5)] sm:p-7"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            <span
              aria-hidden="true"
              className="absolute -right-7 -bottom-7 h-28 w-28 rounded-full bg-sun/25"
            />
            <span className="sticker-sun w-fit rotate-1">
              💛 Chaque semaine
            </span>
            <h3 className="font-display mt-4 text-2xl leading-tight font-black">
              {menu.salade.name}
            </h3>
            <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink/70">
              {menu.salade.desc}
            </p>
            <div className="mt-5">
              <PriceBadge price={menu.salade.price} tone="tomato" />
            </div>
          </article>
        </div>

        {/* Composer sa box — 4 étapes */}
        <div
          className="reveal mt-8 rounded-[2rem] border border-ink/10 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(43,26,16,0.45)] sm:p-9"
          aria-labelledby="box-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3
              id="box-title"
              className="h-serif text-3xl font-black sm:text-4xl"
            >
              {menu.box.title}
              <span className="text-tomato">.</span>
            </h3>
            <div className="flex gap-6">
              <PriceBadge size="Box S" price={menu.box.prices.S} />
              <PriceBadge size="Box M" price={menu.box.prices.M} />
            </div>
          </div>

          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {menu.box.steps.map((step, i) => (
              <li
                key={step.num}
                className="reveal rounded-3xl bg-cream p-5 ring-1 ring-ink/5 transition-all duration-300 hover:-translate-y-1 hover:bg-white"
                style={{ "--d": `${300 + i * 80}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tomato font-display text-lg font-black text-cream"
                  >
                    {step.num}
                  </span>
                  <h4 className="font-display text-lg leading-tight font-black">
                    {step.title}
                  </h4>
                </div>
                <div className="mt-4 space-y-3.5">
                  {step.groups.map((group) => (
                    <div key={group.label}>
                      <p className="text-[10px] font-extrabold tracking-[0.18em] text-ink/45 uppercase">
                        {group.label}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {group.options.map((option) => (
                          <li
                            key={option}
                            className="rounded-full border border-ink/12 bg-white px-3 py-1.5 text-[13px] font-bold text-ink/80"
                          >
                            {option}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Boissons & desserts */}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div
            className="reveal rounded-3xl border border-ink/10 bg-white p-6 sm:p-7"
            aria-labelledby="boissons-title"
          >
            <span className="inline-flex rounded-full bg-olive/10 px-4 py-1.5 text-xs font-extrabold tracking-[0.18em] text-olive uppercase">
              🥤 Nos boissons
            </span>
            <h3 id="boissons-title" className="sr-only">
              Nos boissons
            </h3>
            <ul className="mt-5 space-y-3">
              {menu.boissons.map((boisson) => (
                <li
                  key={boisson.name}
                  className="-mx-2 flex items-baseline justify-between gap-4 rounded-xl border-b border-dashed border-ink/15 px-2 pb-3 transition-colors duration-200 hover:bg-cream/70 last:border-0 last:pb-0"
                >
                  <span className="font-bold text-ink/85">{boisson.name}</span>
                  <span className="font-display shrink-0 text-lg font-black text-tomato transition-transform duration-300">
                    {boisson.price}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="reveal rounded-3xl border border-ink/10 bg-white p-6 sm:p-7"
            aria-labelledby="desserts-title"
            style={{ "--d": "80ms" } as React.CSSProperties}
          >
            <span className="inline-flex rounded-full bg-tomato/10 px-4 py-1.5 text-xs font-extrabold tracking-[0.18em] text-tomato-deep uppercase">
              🍰 Nos desserts
            </span>
            <h3 id="desserts-title" className="sr-only">
              Nos desserts
            </h3>
            <ul className="mt-5 grid grid-cols-2 gap-3">
              {menu.desserts.map((dessert) => (
                <li
                  key={dessert.name}
                  className="rounded-2xl bg-cream p-4 ring-1 ring-ink/5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink/85">
                      {dessert.name}
                    </span>
                    <span className="font-display text-lg font-black text-tomato">
                      {dessert.price}
                    </span>
                  </div>
                  {dessert.note && (
                    <span className="mt-1 inline-block text-[11px] font-bold tracking-wide text-ink/50 uppercase">
                      {dessert.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="reveal mt-6 text-center text-sm text-ink/55">
          {menu.note}
        </p>

        {/* Photos produit officielles (source : page Uber Eats du restaurant) */}
        <div className="reveal mt-10 grid gap-4 sm:grid-cols-2">
          {menu.boxPhotos.map((photo) => (
            <figure
              key={photo.img}
              className="group overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-[0_16px_40px_-26px_rgba(43,26,16,0.4)]"
            >
              <img
                src={photo.img}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                width="550"
                height="413"
              />
            </figure>
          ))}
        </div>

        {/* Halal, prix et commande */}
        <p className="reveal mt-6 text-center text-sm text-ink/55">
          🥩 Viande Halal certifiée · Paiement par titres-restaurant acceptés
        </p>

        {/* CTA */}
        <div className="reveal mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={menu.fullMenuImage}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline w-full sm:w-auto"
          >
            {menu.fullMenuLabel}
            <Arrow />
          </a>
          <a
            href={orderHref}
            {...orderLinkProps}
            className="btn-primary w-full sm:w-auto"
            {...(restaurant.orderUrl
              ? {}
              : { "aria-label": "Commander par téléphone au 04 42 23 37 08" })}
          >
            Commander{restaurant.orderSource ? ` sur ${restaurant.orderSource}` : ""}
            <Arrow />
          </a>
        </div>
      </div>
    </section>
  );
}
