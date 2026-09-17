import { useEffect, useRef, useState } from "react";
import { nav, orderLink, restaurant } from "../data/restaurant";
import { useScrollSpy } from "../hooks/useScrollSpy";
import { Burger } from "./icons";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const active = useScrollSpy(nav.map((item) => item.href.slice(1)));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bloque le défilement de la page tant que le menu mobile est ouvert.
  // On mémorise la valeur précédente : la lightbox de la galerie verrouille
  // aussi le scroll, et refermer le menu ne doit pas le déverrouiller à tort.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // ⚠️ Le panneau du menu est en `lg:hidden` : ouvert en mobile puis passé en
  // desktop (rotation d'iPad, fenêtre agrandie, DevTools), il devenait
  // invisible alors que le scroll de la page restait bloqué, sans aucun
  // moyen de s'en sortir autrement qu'en rechargeant. On le referme.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  // Échap referme le menu et rend le focus au bouton qui l'a ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
          {/* Vrai logo (emblème sans texte — le nom est à côté) */}
          <img
            src="/images/logo-emblem.png"
            alt=""
            width="202"
            height="152"
            className="h-9 w-auto shrink-0"
          />
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
            {...orderLink()}
            className="btn-primary btn-sm hidden sm:inline-flex"
            {...(restaurant.orderUrl ? {} : { "aria-label": "Commander par téléphone au 04 42 23 37 08" })}
          >
            Commander
          </a>
          <button
            ref={toggleRef}
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
                {...orderLink()}
                onClick={() => setOpen(false)}
                className="btn-primary w-full"
              >
                Commander{restaurant.orderSource ? ` sur ${restaurant.orderSource}` : ""}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
