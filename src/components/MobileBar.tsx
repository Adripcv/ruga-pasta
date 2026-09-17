import { orderLink, restaurant } from "../data/restaurant";
import { Phone, Pin, Star } from "./icons";

/**
 * Barre CTA fixe en bas d'écran — mobile uniquement.
 * Commander · Itinéraire · Appeler
 */
export function MobileBar() {

  return (
    <nav
      aria-label="Actions rapides"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgba(43,26,16,0.35)] backdrop-blur-md sm:hidden"
    >
      <div className="grid grid-cols-3 divide-x divide-ink/10">
        <a
          {...orderLink()}
          className="flex flex-col items-center gap-0.5 bg-tomato py-2.5 text-[11px] font-extrabold tracking-wider text-cream uppercase active:bg-tomato-deep"
          {...(restaurant.orderUrl
            ? {}
            : { "aria-label": "Commander par téléphone au 04 42 23 37 08" })}
        >
          <Star className="h-4.5 w-4.5" />
          Commander
        </a>
        <a
          href={restaurant.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-extrabold tracking-wider text-ink uppercase active:bg-cream-2"
        >
          <Pin className="h-4.5 w-4.5" />
          Itinéraire
        </a>
        <a
          href={restaurant.phoneHref}
          className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-extrabold tracking-wider text-ink uppercase active:bg-cream-2"
        >
          <Phone className="h-4.5 w-4.5" />
          Appeler
        </a>
      </div>
    </nav>
  );
}
