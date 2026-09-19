import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/ordering/client";
import {
  addToSelections,
  cartCount,
  cartTotalCents,
  euros,
  flattenItems,
  missingRequired,
  setRadioSelection,
  type FlatItem,
  type Selections,
} from "../lib/ordering/cart";
import type { MenuNode, SlotsResponse } from "../lib/ordering/types";
import { orderLink, restaurant } from "../data/restaurant";

// ---------------------------------------------------------------------------
// Petites briques UI
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
        <a
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Ruga Pasta — retour à l'accueil"
        >
          <img
            src="/images/logo-emblem.png"
            alt=""
            width="202"
            height="152"
            className="h-9 w-auto"
          />
          <span className="h-serif text-lg font-black tracking-tight">
            RUGA&nbsp;PASTA
          </span>
        </a>
        <span className="sticker-red hidden sm:inline-flex">🥡 Click&nbsp;&amp;&nbsp;Collect</span>
      </div>
    </header>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20" role="status">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-[3px] border-tomato/25 border-t-tomato"
      />
      <span className="text-sm font-semibold text-ink/60">{label}</span>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border-2 border-tomato/30 bg-tomato/5 p-6 text-center">
      <p className="font-display text-xl font-black text-tomato-deep">
        Oups, un pépin.
      </p>
      <p className="mt-2 text-sm text-ink/70">{message}</p>
      <button type="button" onClick={onRetry} className="btn-primary mt-5">
        Réessayer
      </button>
    </div>
  );
}

/** Ligne produit simple : compteur +/-. */
function ProductRow({
  node,
  selections,
  setSelections,
}: {
  node: MenuNode;
  selections: Selections;
  setSelections: React.Dispatch<React.SetStateAction<Selections>>;
}) {
  const qty = selections[node.id] ?? 0;
  const step = (delta: number) =>
    setSelections((s) => addToSelections(s, node.id, delta, node.max_qty));

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
        qty > 0 ? "border-tomato bg-tomato/5" : "border-ink/12 bg-cream"
      }`}
    >
      <span className="font-bold text-ink/85">
        {node.name}
        <span className="ml-2 text-sm font-semibold text-ink/50">
          {node.price_cents === 0 ? "Inclus" : euros(node.price_cents ?? 0)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={`Retirer ${node.name}`}
          disabled={qty === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/15 text-lg font-black text-ink transition-colors hover:border-tomato hover:text-tomato disabled:opacity-30"
        >
          −
        </button>
        <span className="w-6 text-center font-display text-lg font-black" aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => step(+1)}
          aria-label={`Ajouter ${node.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/15 text-lg font-black text-ink transition-colors hover:border-tomato hover:text-tomato"
        >
          +
        </button>
      </span>
    </div>
  );
}

/** Groupe de choix : radio si toutes les options sont max_qty=1, sinon compteurs. */
function ChoiceList({
  group,
  selections,
  setSelections,
}: {
  group: MenuNode;
  selections: Selections;
  setSelections: React.Dispatch<React.SetStateAction<Selections>>;
}) {
  const isRadio = group.children.every((c) => c.max_qty === 1);

  const pickRadio = (leafId: string) => {
    const siblingIds = group.children.map((c) => c.id);
    setSelections((s) => setRadioSelection(s, leafId, siblingIds));
  };

  return (
    <fieldset className="mt-3 first:mt-0">
      <legend className="text-[10px] font-extrabold tracking-[0.18em] text-ink/45 uppercase">
        {group.name}
      </legend>
      <ul className="mt-2 space-y-2">
        {group.children.map((leaf) => {
          const qty = selections[leaf.id] ?? 0;
          if (isRadio) {
            return (
              <li key={leaf.id}>
                <label
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                    qty > 0
                      ? "border-tomato bg-tomato/5"
                      : "border-ink/12 bg-cream hover:bg-cream-2"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`radio-${group.id}`}
                      checked={qty > 0}
                      onChange={() => pickRadio(leaf.id)}
                      className="h-4.5 w-4.5 accent-tomato"
                    />
                    <span className="font-bold text-ink/85">{leaf.name}</span>
                  </span>
                  <span className="text-sm font-semibold text-ink/50">
                    {leaf.price_cents === 0 ? "Inclus" : euros(leaf.price_cents ?? 0)}
                  </span>
                </label>
              </li>
            );
          }
          return (
            <li key={leaf.id}>
              <ProductRow node={leaf} selections={selections} setSelections={setSelections} />
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * Produit composé (ex. Box S) : compteur +, quand sélectionné, ses groupes
 * de choix (pâtes, sauces…) se déplient en dessous.
 */
function ProductWithChildren({
  node,
  selections,
  setSelections,
}: {
  node: MenuNode;
  selections: Selections;
  setSelections: React.Dispatch<React.SetStateAction<Selections>>;
}) {
  const qty = selections[node.id] ?? 0;
  const step = (delta: number) =>
    setSelections((s) => addToSelections(s, node.id, delta, node.max_qty));

  return (
    <div
      className={`rounded-2xl border-2 transition-colors ${
        qty > 0 ? "border-tomato bg-tomato/5" : "border-ink/12 bg-cream"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-bold text-ink/85">
          {node.name}
          <span className="ml-2 text-sm font-semibold text-ink/50">
            {euros(node.price_cents ?? 0)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={`Retirer ${node.name}`}
            disabled={qty === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/15 text-lg font-black text-ink transition-colors hover:border-tomato hover:text-tomato disabled:opacity-30"
          >
            −
          </button>
          <span className="w-6 text-center font-display text-lg font-black" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => step(+1)}
            aria-label={`Ajouter ${node.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/15 text-lg font-black text-ink transition-colors hover:border-tomato hover:text-tomato"
          >
            +
          </button>
        </span>
      </div>
      {qty > 0 &&
        node.children
          .filter((child) => child.children.length > 0)
          .map((child) => (
            <div key={child.id} className="border-t border-ink/8 px-4 py-3">
              <ChoiceList group={child} selections={selections} setSelections={setSelections} />
            </div>
          ))}
    </div>
  );
}

/**
 * Section de la carte (Compose ta box, Formules, Boissons…) : produits simples
 * en compteur, produits composés dépliables.
 */
function MenuSection({
  section,
  selections,
  setSelections,
}: {
  section: MenuNode;
  selections: Selections;
  setSelections: React.Dispatch<React.SetStateAction<Selections>>;
}) {
  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6" aria-label={section.name}>
      <h3 className="font-display text-lg font-black">{section.name}</h3>
      <div className="mt-4 space-y-3">
        {section.children.map((product) =>
          product.children.length > 0 ? (
            <ProductWithChildren
              key={product.id}
              node={product}
              selections={selections}
              setSelections={setSelections}
            />
          ) : (
            <ProductRow
              key={product.id}
              node={product}
              selections={selections}
              setSelections={setSelections}
            />
          ),
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// App principale — 3 étapes + confirmation
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

export function OrderApp() {
  const [menuTree, setMenuTree] = useState<MenuNode[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orderingClosed, setOrderingClosed] = useState<string | null>(null);

  const [selections, setSelections] = useState<Selections>({});
  const [step, setStep] = useState<Step>(1);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [chosenSlot, setChosenSlot] = useState<{ startUtc: string; label: string; dateISO: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ code: string; total_cents: number; pickup_at: string } | null>(null);

  const items: FlatItem[] = useMemo(() => (menuTree ? flattenItems(menuTree) : []), [menuTree]);
  const total = useMemo(() => cartTotalCents(selections, items), [selections, items]);
  const count = useMemo(() => cartCount(selections), [selections]);

  const loadMenu = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.menu();
      if (!data.configured) {
        setOrderingClosed(data.ordering.message || "La commande en ligne arrive bientôt !");
        return;
      }
      setMenuTree(data.tree);
      if (!data.ordering.open) {
        setOrderingClosed(data.ordering.message || "La commande en ligne est momentanément fermée.");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const loadSlots = useCallback(async (date: string) => {
    setSlotsLoading(true);
    try {
      const data = await api.slots(date);
      setSlots(data);
    } catch {
      setSlots(null);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  // Charge les créneaux du jour à l'entrée à l'étape 2.
  useEffect(() => {
    if (step !== 2) return;
    const today = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
    const day = chosenDay ?? today;
    setChosenDay(day);
    void loadSlots(day);
  }, [step, chosenDay, loadSlots]);

  // Règle « une sauce par box » — déclarative, dérivée de l'arbre.
  const requiredGaps = useMemo(() => {
    const boxIds = items.filter((i) => i.path.includes("Compose ta box") && i.node.price_cents! > 0).map((i) => i.node.id);
    const sauceIds = items.filter((i) => i.path.includes("Sauces")).map((i) => i.node.id);
    if (boxIds.length === 0 || sauceIds.length === 0) return [];
    return [
      {
        whenAnyOf: boxIds,
        oneOf: sauceIds,
        label: "Choisis ta sauce pour chaque box",
      },
    ];
  }, [items]);

  const gaps = useMemo(() => missingRequired(selections, requiredGaps), [selections, requiredGaps]);

  const submit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const cart = Object.entries(selections)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ id, qty }));
      // Clé d'idempotence générée à la soumission (et régénérée après une
      // commande réussie) : un double-clic ne crée jamais deux commandes.
      const idempotencyKey =
        crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await api.createOrder({
        cart,
        name,
        phone,
        pickup: chosenSlot!.startUtc,
        note: note.trim() || undefined,
        idempotency_key: idempotencyKey,
        website: honeypot,
      });
      setConfirmation(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------- Confirmation ---------------------------
  if (confirmation) {
    const when = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(confirmation.pickup_at));
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-[2rem] border border-olive/30 bg-white p-8 text-center shadow-[0_26px_60px_-34px_rgba(43,26,16,0.5)]">
          <span aria-hidden="true" className="text-5xl">🍝</span>
          <h1 className="h-serif mt-4 text-3xl font-black">
            C'est noté&nbsp;!
          </h1>
          <p className="mt-3 text-ink/70">
            Ta commande est confirmée. Présente-toi à la boutique, donne ton
            numéro, et c'est prêt.
          </p>
          <p className="font-display mt-6 rounded-2xl bg-cream-2 px-6 py-4 text-3xl font-black tracking-wider">
            {confirmation.code}
          </p>
          <dl className="mt-6 space-y-2 text-left text-sm">
            <div className="flex justify-between gap-4 border-b border-dashed border-ink/15 pb-2">
              <dt className="font-semibold text-ink/60">Retrait</dt>
              <dd className="font-bold">{when}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-dashed border-ink/15 pb-2">
              <dt className="font-semibold text-ink/60">Total</dt>
              <dd className="font-bold">{euros(confirmation.total_cents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-ink/60">Paiement</dt>
              <dd className="font-bold">En boutique au retrait</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs leading-relaxed text-ink/50">
            Ruga Pasta — 7 Rue Rifle Rafle, 13100 Aix-en-Provence
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a href="/" className="btn-outline">Retour au site</a>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setConfirmation(null);
                setSelections({});
                setStep(1);
                setChosenSlot(null);
              }}
            >
              Nouvelle commande
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------- C&C fermé ---------------------------
  if (orderingClosed && !menuTree) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="rounded-[2rem] border border-ink/10 bg-white p-8 text-center">
          <span aria-hidden="true" className="text-5xl">🕙</span>
          <h1 className="h-serif mt-4 text-3xl font-black">La commande en ligne est fermée</h1>
          <p className="mt-3 text-ink/70">{orderingClosed}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a href="/#carte" className="btn-outline">Voir la carte</a>
            {/* Repli : Uber Eats (app mobile via intent, web sinon) tant que
                le click & collect n'est pas ouvert. */}
            {restaurant.orderUrl && (
              <a {...orderLink()} className="btn-primary">
                Commander sur {restaurant.orderSource}
              </a>
            )}
          </div>
          <p className="mt-4 text-sm text-ink/60">
            Ou par téléphone :{" "}
            <a
              href={restaurant.phoneHref}
              className="font-bold text-tomato underline decoration-tomato/40 underline-offset-2"
            >
              {restaurant.phoneDisplay}
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <ErrorPanel message={loadError} onRetry={() => void loadMenu()} />
      </div>
    );
  }

  if (!menuTree) {
    return <Spinner label="On prépare la carte…" />;
  }

  // Les sections = enfants directs de la racine (Compose ta box, Formules,
  // Boissons…). La racine « Menu » elle-même n'est pas affichée comme section.
  // ⚠️ Calcul volontairement SANS useMemo : ce bloc s'exécute après les
  // retours conditionnels (confirmation, spinner…), donc un hook ici violerait
  // les règles des Hooks. Le filtrage est O(n) sur un petit arbre : négligeable.
  const roots = menuTree.filter((node) => node.children.length > 0);
  const sections: MenuNode[] =
    roots.length === 1
      ? roots[0].children.filter(
          (c) => c.children.length > 0 || c.price_cents !== null,
        )
      : roots;

  const steps = [
    { num: 1, label: "Ta commande" },
    { num: 2, label: "Retrait" },
    { num: 3, label: "Coordonnées" },
  ];

  return (
    <>
      <Header />
      <div className="mx-auto max-w-3xl px-4 pb-40 pt-8 sm:px-6">
      {/* Fil d'étapes */}
      <ol className="flex items-center gap-2" aria-label="Étapes de commande">
        {steps.map((s, i) => (
          <li key={s.num} className="flex flex-1 items-center gap-2">
            <span
              aria-current={step === s.num ? "step" : undefined}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-black ${
                step > s.num
                  ? "bg-olive text-cream"
                  : step === s.num
                    ? "bg-tomato text-cream"
                    : "bg-ink/10 text-ink/50"
              }`}
            >
              {step > s.num ? "✓" : s.num}
            </span>
            <span
              className={`hidden text-xs font-extrabold tracking-wide uppercase sm:block ${
                step >= s.num ? "text-ink" : "text-ink/40"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="h-0.5 flex-1 bg-ink/10" />
            )}
          </li>
        ))}
      </ol>

      {/* ÉTAPE 1 — composer */}
      {step === 1 && (
        <>
          {orderingClosed && (
            <div className="mt-6 rounded-2xl border border-sun/60 bg-sun/15 p-4 text-sm font-semibold text-[#8a5b0a]">
              {orderingClosed} — tu peux composer ta commande, la soumission est désactivée.
            </div>
          )}
          <h1 className="h-serif mt-8 text-4xl font-black">
            Compose ta commande<span className="text-tomato">.</span>
          </h1>

          <div className="mt-6 space-y-5">
            {sections.map((section) =>
              // Produit isolé (ex. salade de la semaine) : une carte produit,
              // pas une section vide.
              section.children.length === 0 ? (
                <div
                  key={section.id}
                  className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6"
                >
                  <ProductRow
                    node={section}
                    selections={selections}
                    setSelections={setSelections}
                  />
                </div>
              ) : (
                <MenuSection
                  key={section.id}
                  section={section}
                  selections={selections}
                  setSelections={setSelections}
                />
              ),
            )}
          </div>
        </>
      )}

      {/* ÉTAPE 2 — créneau */}
      {step === 2 && (
        <>
          <h1 className="h-serif mt-8 text-4xl font-black">
            Choisis ton retrait<span className="text-tomato">.</span>
          </h1>
          <div className="mt-6 flex gap-2">
            {[
              { key: "today", label: "Aujourd'hui" },
              { key: "tomorrow", label: "Demain" },
            ].map((d) => {
              const iso = d.key === "today"
                ? new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date())
                : new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(
                    new Date(Date.now() + 86_400_000),
                  );
              const active = chosenDay === iso;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setChosenDay(iso);
                    setChosenSlot(null);
                    void loadSlots(iso);
                  }}
                  className={`rounded-full px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide transition-colors ${
                    active ? "bg-tomato text-cream" : "border-2 border-ink/15 text-ink hover:border-tomato"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {slotsLoading ? (
            <Spinner label="On regarde les créneaux…" />
          ) : slots && slots.slots.length > 0 ? (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.slots.map((slot) => (
                <button
                  key={slot.startUtc}
                  type="button"
                  disabled={!slot.available}
                  onClick={() =>
                    setChosenSlot({ startUtc: slot.startUtc, label: slot.label, dateISO: slot.dateISO })
                  }
                  className={`rounded-2xl border-2 px-2 py-3 text-center transition-colors ${
                    chosenSlot?.startUtc === slot.startUtc
                      ? "border-tomato bg-tomato text-cream"
                      : slot.available
                        ? "border-ink/12 bg-white hover:border-tomato"
                        : "border-ink/8 bg-cream-2/60 text-ink/30"
                  }`}
                >
                  <span className="font-display block text-lg font-black">{slot.label}</span>
                  <span className="text-[11px] font-semibold">
                    {slot.available
                      ? `${slot.remaining} place${slot.remaining > 1 ? "s" : ""}`
                      : slot.reason === "past"
                        ? "Passé"
                        : slot.reason === "prep-delay"
                          ? "Trop tôt"
                          : slot.reason === "closed-day"
                            ? "Fermé"
                            : "Complet"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-2xl bg-cream-2 p-4 text-sm text-ink/60">
              Aucun créneau pour ce jour.
            </p>
          )}
        </>
      )}

      {/* ÉTAPE 3 — coordonnées */}
      {step === 3 && (
        <>
          <h1 className="h-serif mt-8 text-4xl font-black">
            Dernière étape<span className="text-tomato">.</span>
          </h1>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {/* Honeypot anti-bot : invisible pour un humain (caché au lecteur
                d'écran aussi), rempli = robot → rejet silencieux côté serveur. */}
            <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px]">
              <label>
                Ne pas remplir
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-extrabold tracking-wide text-ink/70 uppercase">
                Ton prénom et nom
              </span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-2xl border-2 border-ink/12 bg-white px-4 py-3.5 font-semibold text-ink outline-none transition-colors focus:border-tomato"
                placeholder="Marie Dupont"
              />
            </label>
            <label className="block">
              <span className="text-sm font-extrabold tracking-wide text-ink/70 uppercase">
                Téléphone
              </span>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-2 w-full rounded-2xl border-2 border-ink/12 bg-white px-4 py-3.5 font-semibold text-ink outline-none transition-colors focus:border-tomato"
                placeholder="06 12 34 56 78"
                autoComplete="tel"
              />
              <span className="mt-1.5 block text-xs text-ink/50">
                Uniquement pour te retrouver au retrait — jamais de démarchage.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-extrabold tracking-wide text-ink/70 uppercase">
                Une note ? (facultatif)
              </span>
              <textarea
                rows={2}
                maxLength={280}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-2 w-full rounded-2xl border-2 border-ink/12 bg-white px-4 py-3.5 text-ink outline-none transition-colors focus:border-tomato"
                placeholder="Sans oignons frits, bien sauce…"
              />
            </label>

            {submitError && (
              <p className="rounded-2xl border-2 border-tomato/30 bg-tomato/5 p-4 text-sm font-semibold text-tomato-deep" role="alert">
                {submitError}
              </p>
            )}

            <p className="rounded-2xl bg-cream-2 p-4 text-sm text-ink/70">
              🥡 <strong>Paiement en boutique au retrait</strong> — espèces, carte
              ou titres-restaurant. Rien à payer en ligne.
            </p>
          </form>
        </>
      )}

      {/* ---------- Récap collant (bas d'écran) ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-cream/97 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-ink/60 uppercase tracking-wide">
              {count === 0
                ? "Panier vide"
                : `${count} article${count > 1 ? "s" : ""}${chosenSlot ? ` · retrait ${chosenSlot.label}` : ""}`}
            </p>
            <p className="font-display text-xl font-black">{euros(total)}</p>
          </div>
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && (count === 0 || gaps.length > 0)}
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === 1 ? "Choisir le retrait" : "Finaliser"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!chosenSlot || submitting}
              onClick={() => void submit()}
              className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Envoi…" : "Confirmer"}
            </button>
          )}
        </div>
        {step === 1 && gaps.length > 0 && (
          <p className="border-t border-sun/40 bg-sun/15 px-4 py-2 text-center text-xs font-bold text-[#8a5b0a]">
            {gaps.join(" · ")}
          </p>
        )}
        {step === 2 && !chosenSlot && (
          <p className="border-t border-ink/10 bg-cream-2 px-4 py-2 text-center text-xs font-bold text-ink/60">
            Choisis un créneau de retrait pour continuer
          </p>
        )}
      </div>
      </div>
    </>
  );
}
