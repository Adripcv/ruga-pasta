import { orderLinkProps, restaurant } from "../data/restaurant";
import { ForkLogo } from "./icons";

export function Footer() {
  const links = [
    { label: "Accueil", href: "#accueil" },
    { label: "Carte", href: "#carte" },
    { label: "Le concept", href: "#concept" },
    { label: "Avis", href: "#avis" },
    { label: "Nous trouver", href: "#trouver" },
  ];

  return (
    <footer className="paper-dark relative overflow-hidden bg-ink text-cream">
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-28 sm:px-6 sm:pb-12">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Logo + baseline */}
          <div className="md:col-span-6">
            <a
              href="#accueil"
              className="inline-flex items-center gap-3"
              aria-label="Ruga Pasta — retour à l’accueil"
            >
              <ForkLogo className="h-10 w-10" />
              <span className="h-serif text-2xl font-black tracking-tight">
                RUGA&nbsp;PASTA
              </span>
            </a>
            <p className="em-italic mt-4 text-2xl text-tomato">
              {restaurant.tagline}
            </p>
            <address className="mt-6 space-y-1 text-sm leading-relaxed text-cream/70 not-italic">
              <p>{restaurant.address.full}</p>
              <p>
                <a
                  href={restaurant.phoneHref}
                  className="transition-colors hover:text-sun"
                >
                  {restaurant.phoneDisplay}
                </a>
              </p>
            </address>
          </div>

          {/* Navigation */}
          <nav
            className="md:col-span-3"
            aria-label="Navigation de pied de page"
          >
            <h3 className="text-xs font-extrabold tracking-[0.28em] text-sun uppercase">
              Navigation
            </h3>
            <ul className="mt-4 space-y-2.5">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm font-semibold text-cream/80 transition-colors hover:text-tomato"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Services */}
          <div className="md:col-span-3">
            <h3 className="text-xs font-extrabold tracking-[0.28em] text-sun uppercase">
              Services
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm font-semibold text-cream/80">
              {restaurant.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
            {restaurant.orderUrl && (
              <a
                href={restaurant.orderUrl}
                {...orderLinkProps}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-tomato px-4 py-2 text-xs font-extrabold tracking-[0.12em] text-cream uppercase transition-colors hover:bg-tomato-deep"
              >
                ★ Commander sur {restaurant.orderSource}
              </a>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-cream/10 pt-6 text-xs text-cream/50 sm:flex-row">
          <p>© Ruga Pasta — Tous droits réservés.</p>
          <p className="em-italic text-sm text-cream/60">
            Prends une fourchette. 🍝
          </p>
        </div>
      </div>
    </footer>
  );
}
