import { useEffect, useState } from "react";
import { nav, restaurant } from "../data/restaurant";
import { useScrollSpy } from "../hooks/useScrollSpy";
import { ForkLogo, Burger } from "./icons";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useScrollSpy(nav.map((item) => item.href.slice(1)));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Ferme le menu au resize desktop + bloque le scroll mobile ouvert
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const orderHref = restaurant.orderUrl ?? restaurant.phoneHref;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? "bg-cream/95 shadow-[0_6px_30px_-12px_rgba(43,26,16,0.25)] backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6"
        aria-label="Navigation principale"
      >
        <a
          href="#accueil"
          className={`flex items-center gap-2.5 transition-colors ${
            scrolled || open ? "text-ink" : "text-cream"
          }`}
          aria-label="Ruga Pasta — retour à l’accueil"
        >
          <ForkLogo className="h-8 w-8 shrink-0" />
          <span className="h-serif text-lg font-black leading-none tracking-tight sm:text-xl">
            RUGA&nbsp;PASTA
          </span>
        </a>

        {/* Liens desktop */}
        <ul className="hidden items-center gap-7 lg:flex">
          {nav.map((item) => {
            const isActive = active === item.href.slice(1);
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  className={`group relative text-[13px] font-bold tracking-[0.12em] uppercase transition-colors ${
                    isActive
                      ? "text-tomato"
                      : scrolled
                        ? "text-ink/80 hover:text-tomato"
                        : "text-cream/90 hover:text-tomato"
                  }`}
                >
                  {item.label}
                  {/* Underline animée (hover + section active) */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 -bottom-1.5 h-[2.5px] origin-left rounded-full bg-tomato transition-transform duration-300 ease-out ${
                      isActive
                        ? "scale-x-100"
                        : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </a>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <a
            href={orderHref}
            className="btn-primary btn-sm hidden sm:inline-flex"
            {...(restaurant.orderUrl ? {} : { "aria-label": "Commander par téléphone au 04 42 23 37 08" })}
          >
            Commander
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors lg:hidden ${
              scrolled || open
                ? "border-ink/15 text-ink"
                : "border-cream/30 text-cream"
            }`}
          >
            <Burger open={open} />
          </button>
        </div>
      </nav>

      {/* Menu mobile */}
      <div
        id="menu-mobile"
        className={`grid overflow-hidden transition-[grid-template-rows,visibility] duration-300 lg:hidden ${
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="space-y-1 px-4 pt-2 pb-6 sm:px-6">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`h-serif block rounded-2xl px-3 py-3 text-2xl font-bold text-ink transition-colors hover:bg-tomato/10 hover:text-tomato ${
                    active === item.href.slice(1) ? "text-tomato" : ""
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="pt-2">
              <a
                href={orderHref}
                onClick={() => setOpen(false)}
                className="btn-primary w-full"
              >
                Commander
              </a>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
