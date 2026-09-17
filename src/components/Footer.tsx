import { orderLink, restaurant } from "../data/restaurant";

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
            {/* Logo complet (personnages + nom) sur badge crème : le rouge de
                la marque n'est pas lisible sur le fond sombre du footer. */}
            <a
              href="#accueil"
              className="inline-flex w-fit items-center rounded-2xl bg-cream px-4 py-3 transition-transform duration-300 hover:-translate-y-0.5"
              aria-label="Ruga Pasta — retour à l’accueil"
            >
              <img
                src="/images/logo-ruga.png"
                alt="Logo Ruga Pasta"
                width="202"
                height="188"
                className="h-16 w-auto"
                loading="lazy"
                decoding="async"
              />
            </a>
            <p className="em-italic mt-4 text-2xl text-tomato">
              {restaurant.tagline}
            </p>
            <address className="mt-6 space-y-1 text-sm leading-relaxed text-cream/70 not-italic">
              <p>{restaurant.address.full}</p>
              <p>
                <a
                  href={restaurant.phoneHref}
                  className="inline-block py-1.5 transition-colors hover:text-sun"
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
                    className="inline-block py-1.5 text-sm font-semibold text-cream/80 transition-colors hover:text-tomato"
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
                {...orderLink()}
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
