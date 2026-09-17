import { orderCta, orderLink, restaurant } from "../data/restaurant";
import { useReveal } from "../hooks/useReveal";
import { Phone, Star } from "./icons";

export function OrderCta() {
  const ref = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      aria-labelledby="order-title"
      className="paper-dark relative overflow-hidden bg-tomato py-20 text-cream sm:py-24"
    >
      {/* Formes décoratives — dérive lente */}
      <span
        aria-hidden="true"
        className="drift pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-cream/10 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="drift-alt pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-ink/15 blur-2xl"
      />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
        <p className="reveal h-serif text-lg font-bold tracking-[0.3em] text-sun uppercase">
          Pasta time
        </p>
        <h2
          id="order-title"
          className="h-serif mt-4 text-5xl leading-[0.95] font-black sm:text-7xl"
        >
          <span className="line-mask" style={{ "--d": "80ms" } as React.CSSProperties}>
            <span className="line-mask-inner">{orderCta.title}</span>
          </span>
        </h2>
        <p className="reveal mx-auto mt-5 max-w-xl text-lg text-cream/90 sm:text-xl">
          {orderCta.text}
        </p>

        <div className="reveal mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            {...orderLink()}
            className="inline-flex items-center justify-center gap-3 rounded-full bg-cream px-10 py-5 text-base font-black tracking-[0.14em] text-tomato uppercase shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)] sm:text-lg"
            {...(restaurant.orderUrl
              ? {}
              : { "aria-label": "Commander maintenant par téléphone au 04 42 23 37 08" })}
          >
            {restaurant.orderUrl ? (
              <Star className="h-5 w-5" />
            ) : (
              <Phone className="h-5 w-5" />
            )}
            Commander{restaurant.orderSource ? ` sur ${restaurant.orderSource}` : " maintenant"}
          </a>
          {restaurant.orderUrl && (
            <a
              href={restaurant.phoneHref}
              className="inline-flex items-center gap-2 rounded-full border-2 border-cream/40 px-6 py-4 text-sm font-bold tracking-[0.1em] text-cream uppercase transition-colors hover:border-cream hover:bg-cream/10"
            >
              <Phone className="h-4 w-4" />
              {restaurant.phoneDisplay}
            </a>
          )}
        </div>

        {restaurant.orderUrl && (
          <p className="reveal mt-5 text-sm text-cream/75">
            {restaurant.orderNote}
          </p>
        )}

        <div className="reveal mt-8 flex flex-wrap justify-center gap-2.5">
          {restaurant.services.map((service) => (
            <span
              key={service}
              className="rounded-full border border-cream/30 px-4 py-1.5 text-xs font-bold tracking-[0.16em] uppercase"
            >
              {service}
            </span>
          ))}
        </div>

        <p className="reveal mt-6 text-sm text-cream/75">
          {restaurant.orderUrl
            ? "Commande en ligne officielle — paiement par titres-restaurant accepté."
            : "En attendant la commande en ligne : un appel suffit !"}
        </p>
      </div>
    </section>
  );
}
