import { useState } from "react";
import { getOpenStatus, location, restaurant } from "../data/restaurant";
import { useReveal } from "../hooks/useReveal";
import { Clock, Phone, Pin, Route, Tag } from "./icons";

export function Location() {
  const ref = useReveal<HTMLElement>();
  // Calculé une fois au montage : l'état « Ouvert / Fermé » du visiteur.
  const [status] = useState(() => getOpenStatus());

  return (
    <section
      id="trouver"
      ref={ref}
      className="paper relative overflow-hidden py-20 sm:py-28"
      aria-labelledby="location-title"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal">
          <p className="text-xs font-extrabold tracking-[0.28em] text-tomato uppercase">
            {location.kicker}
          </p>
          <h2
            id="location-title"
            className="h-serif mt-4 text-4xl leading-[0.95] font-black sm:text-6xl"
          >
            <span className="line-mask" style={{ "--d": "80ms" } as React.CSSProperties}>
              <span className="line-mask-inner">{location.title}</span>
            </span>
            <span className="line-mask" style={{ "--d": "220ms" } as React.CSSProperties}>
              <span className="line-mask-inner em-italic text-tomato">
                {location.titleAccent}
              </span>
            </span>
          </h2>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-12">
          {/* Carte Google Maps */}
          <div className="reveal-img lg:col-span-7">
            <div className="overflow-hidden rounded-[2rem] border border-ink/10 shadow-[0_26px_60px_-34px_rgba(43,26,16,0.5)]">
              <iframe
                src={location.mapEmbed}
                title="Carte — Ruga Pasta, 7 Rue Rifle Rafle, Aix-en-Provence"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[320px] w-full border-0 sm:h-[440px] lg:h-full lg:min-h-[460px]"
                allowFullScreen
              />
            </div>
          </div>

          {/* Infos pratiques */}
          <div className="reveal lg:col-span-5">
            <div className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-[0_22px_50px_-32px_rgba(43,26,16,0.45)] sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tomato/10 text-tomato">
                  <Pin className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-black">Adresse</h3>
                  <p className="mt-1.5 leading-relaxed text-ink/75">
                    {restaurant.address.street}
                    <br />
                    {restaurant.address.zip} {restaurant.address.city}
                  </p>
                </div>
              </div>

              <div className="mt-7 flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tomato/10 text-tomato">
                  <Phone className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-black">Téléphone</h3>
                  <a
                    href={restaurant.phoneHref}
                    className="mt-1.5 inline-block font-bold text-tomato underline decoration-tomato/40 decoration-2 underline-offset-4 transition-colors hover:text-tomato-deep"
                  >
                    {restaurant.phoneDisplay}
                  </a>
                </div>
              </div>

              <div className="mt-7 flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tomato/10 text-tomato">
                  <Clock className="h-5 w-5" />
                </span>
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <h3 className="font-display text-xl font-black">Horaires</h3>
                    {status && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold tracking-[0.12em] uppercase ${
                          status.isOpen
                            ? "bg-olive/12 text-olive"
                            : "bg-ink/8 text-ink/55"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            status.isOpen ? "bg-olive" : "bg-ink/35"
                          }`}
                        />
                        {status.label}
                      </span>
                    )}
                  </div>

                  {status ? (
                    <>
                      <p className="mt-1.5 text-sm font-semibold text-ink/60">
                        {status.detail}
                      </p>
                      <ul className="mt-3 space-y-0.5 text-ink/75">
                        {Object.entries(restaurant.hours ?? {}).map(([day, h]) => {
                          const isToday = day === status.today;
                          const isClosed = /ferm/i.test(h);
                          return (
                            <li
                              key={day}
                              aria-current={isToday ? "date" : undefined}
                              className={`-mx-2 flex justify-between gap-4 rounded-lg px-2 py-1 ${
                                isToday ? "bg-tomato/10 font-bold text-ink" : ""
                              }`}
                            >
                              <span className="capitalize">
                                {day}
                                {isToday && (
                                  <span className="ml-1.5 text-xs font-semibold text-tomato">
                                    aujourd’hui
                                  </span>
                                )}
                              </span>
                              <span
                                className={`text-right font-semibold ${
                                  isClosed ? "text-ink/35" : ""
                                }`}
                              >
                                {h}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1.5 leading-relaxed text-ink/70">
                      Horaires non communiqués —{" "}
                      <a
                        href={restaurant.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-tomato underline decoration-tomato/40 decoration-2 underline-offset-4 hover:text-tomato-deep"
                      >
                        voir les horaires à jour sur Google
                      </a>
                      .
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-7 flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tomato/10 text-tomato">
                  <Tag className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-black">Prix</h3>
                  <p className="mt-1.5 leading-relaxed text-ink/75">
                    <strong className="font-extrabold text-ink">
                      {restaurant.priceRange}
                    </strong>{" "}
                    {restaurant.priceNote}
                    <span className="block text-sm text-ink/55">
                      Boxes dès 6,50 € — formules de 7,90 € à 11,90 €.
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <a
                  href={restaurant.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary w-full"
                >
                  <Route className="h-4 w-4" />
                  Itinéraire
                </a>
                <a
                  href={restaurant.phoneHref}
                  className="btn-olive w-full"
                >
                  <Phone className="h-4 w-4" />
                  Appeler
                </a>
              </div>

              <p className="mt-6 text-xs leading-relaxed text-ink/50">
                Restaurant non contractuel — photo d’illustration possible.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
