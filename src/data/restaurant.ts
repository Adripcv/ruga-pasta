/**
 * ⭐ DONNÉES DU RESTAURANT — tout se modifie ici.
 *
 * Les informations ci-dessous sont les SEULES données réelles fournies
 * (fiche Google de Ruga Pasta). Tout ce qui est marqué « exemple » ou
 * `null` est un placeholder honnête à remplacer par la vraie donnée.
 */

export const restaurant = {
  name: "Ruga Pasta",
  tagline: "La pasta, fatta bene.",
  claim: "La pasta, fatta bene.",

  address: {
    street: "7 Rue Rifle Rafle",
    zip: "13100",
    city: "Aix-en-Provence",
    country: "France",
    full: "7 Rue Rifle Rafle, 13100 Aix-en-Provence",
  },

  phoneDisplay: "04 42 23 37 08",
  phoneHref: "tel:+33442233708",

  /** 🔎 Fiche Google Maps (itinéraire, avis, horaires). */
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Ruga+Pasta%2C+7+Rue+Rifle+Rafle%2C+13100+Aix-en-Provence",

  priceRange: "1–10 €",
  priceNote: "par personne",
  rating: { value: 4.8, count: 25, source: "Google" },

  services: ["Repas sur place", "Vente à emporter", "Livraison sans contact"],

  /**
   * 🔗 Lien de commande en ligne (Click & Collect, Uber Eats, Just Eat…).
   * `null` tant que le restaurant n'a pas fourni son lien officiel :
   * les boutons « Commander » renvoient alors vers l'appel téléphonique.
   * Ex. : orderUrl: "https://mon-lien-de-commande.fr/ruga-pasta"
   */
  orderUrl: null as string | null,

  /**
   * 🕐 Horaires d'ouverture — source : fiche Google de Ruga Pasta.
   * Format : jour → texte affiché. L'ordre de saisie est l'ordre affiché.
   * Ces horaires alimentent aussi le badge « Ouvert / Fermé » en direct
   * (voir `getOpenStatus`).
   */
  hours: {
    lundi: "11:00 – 21:00",
    mardi: "11:00 – 21:00",
    mercredi: "11:00 – 21:00",
    jeudi: "11:00 – 21:00",
    vendredi: "11:00 – 21:00",
    samedi: "11:00 – 21:00",
    dimanche: "Fermé",
  } as Record<string, string> | null,

  /** 🔗 Réseaux sociaux — aucun compte officiel connu : ne pas inventer. */
  social: [] as { label: string; url: string }[],
} as const;

/**
 * 🕐 État d'ouverture calculé à la volée depuis `restaurant.hours`.
 * Renvoie `null` si les horaires ne sont pas renseignés.
 */
export type OpenStatus = {
  isOpen: boolean;
  /** « Ouvert » ou « Fermé ». */
  label: string;
  /** Précision courte : « jusqu'à 21:00 », « ouvre à 11:00 », « ouvre demain à 11:00 ». */
  detail: string;
  /** Jour courant en français, ex. « mardi ». */
  today: string;
  /** Horaires du jour, ex. « 11:00 – 21:00 » ou « Fermé ». */
  todayHours: string;
};

/** Index = `Date.getDay()` (0 = dimanche). */
const DAY_NAMES = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Analyse « 11:00 – 21:00 » → bornes en minutes depuis minuit. */
function parseRange(value: string | undefined | null) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[:h](\d{2})\D+(\d{1,2})[:h](\d{2})/);
  if (!match) return null;
  return {
    open: Number(match[1]) * 60 + Number(match[2]),
    close: Number(match[3]) * 60 + Number(match[4]),
  };
}

export function getOpenStatus(now: Date = new Date()): OpenStatus | null {
  const hours = restaurant.hours;
  if (!hours) return null;

  const todayIndex = now.getDay();
  const today = DAY_NAMES[todayIndex];
  const todayHours = hours[today] ?? "Fermé";
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const range = parseRange(todayHours);

  if (range && minutesNow >= range.open && minutesNow < range.close) {
    return {
      isOpen: true,
      label: "Ouvert",
      detail: `jusqu'à ${formatTime(range.close)}`,
      today,
      todayHours,
    };
  }

  if (range && minutesNow < range.open) {
    return {
      isOpen: false,
      label: "Fermé",
      detail: `ouvre à ${formatTime(range.open)}`,
      today,
      todayHours,
    };
  }

  // Service terminé (ou jour de fermeture) : chercher la prochaine ouverture.
  for (let offset = 1; offset <= 7; offset++) {
    const day = DAY_NAMES[(todayIndex + offset) % 7];
    const next = parseRange(hours[day]);
    if (!next) continue;
    const when = offset === 1 ? "demain" : day;
    return {
      isOpen: false,
      label: "Fermé",
      detail: `ouvre ${when} à ${formatTime(next.open)}`,
      today,
      todayHours,
    };
  }

  return {
    isOpen: false,
    label: "Fermé",
    detail: "horaires à confirmer",
    today,
    todayHours,
  };
}

export const nav = [
  { label: "Accueil", href: "#accueil" },
  { label: "Notre carte", href: "#carte" },
  { label: "Le concept", href: "#concept" },
  { label: "Avis", href: "#avis" },
  { label: "Nous trouver", href: "#trouver" },
] as const;

export const hero = {
  titleTop: "LA PASTA,",
  titleBottom: "FATTA BENE.",
  subtitle:
    "Ruga Pasta — l’Italie généreuse et gourmande au cœur d’Aix-en-Provence.",
  location: "7 Rue Rifle Rafle — Aix-en-Provence",
} as const;

export const about = {
  kicker: "01 · Ruga Pasta",
  title: "PLUS QU’UNE PASTA,",
  titleAccent: "UN ÉTAT D’ESPRIT.",
  paragraphs: [
    "Chez Ruga Pasta, on aime les bonnes pâtes, les bons produits et les bons moments. Une cuisine italienne généreuse, servie rapidement, dans une ambiance conviviale au cœur d’Aix-en-Provence.",
  ],
  chips: ["Sur place", "À emporter", "Livraison sans contact"],
} as const;

export type Dish = {
  name: string;
  desc: string;
  price: string;
  tag?: string;
  img: string;
  alt: string;
};

/**
 * 🍝 LA VRAIE CARTE — fournie par le restaurant (menu officiel Ruga Pasta).
 * Concept : on compose sa box (pâtes + sauce + garnitures), en formule
 * seule ou avec boisson/dessert. Source : menu officiel communiqué.
 */
export const menu = {
  kicker: "02 · La carte",
  title: "LA CARTE",
  subtitle:
    "Compose ta box : pâtes, sauce, garnitures… ton pasta fait comme tu l’aimes.",
  sticker: "Boxes dès 6,50 €",

  /** 📄 Scan officiel du menu (ouvert dans un nouvel onglet). */
  fullMenuImage: "/images/carte-ruga-pasta.png",
  fullMenuLabel: "Voir la carte officielle",

  formules: [
    {
      name: "Formule Classique",
      desc: "1 Box + 1 boisson OU 1 dessert",
      tag: "La préférée du déjeuner",
      prices: { S: "7,90 €", M: "9,90 €" },
    },
    {
      name: "Formule Gourmande",
      desc: "1 Box + 1 boisson + 1 dessert",
      tag: "Pour les grandes faims",
      prices: { S: "9,90 €", M: "11,90 €" },
    },
  ],

  salade: {
    name: "Salade de Pâtes de la Semaine",
    price: "9,50 €",
    desc:
      "La recette fraîcheur qui change chaque semaine — celle que nos clients adorent.",
  },

  /** 📦 La box à composer, en 4 étapes. */
  box: {
    title: "COMPOSE TA BOX",
    prices: { S: "6,50 €", M: "8,50 €" },
    steps: [
      {
        num: "1",
        title: "Choisis ta Box",
        groups: [{ label: "Format", options: ["S", "M"] }],
      },
      {
        num: "2",
        title: "Choisis tes Pâtes",
        groups: [{ label: "Pâtes", options: ["Fusilli", "Penne", "Farfalle"] }],
      },
      {
        num: "3",
        title: "Choisis ta Sauce",
        groups: [
          {
            label: "Sauces",
            options: ["Tomate", "Bolognaise", "Poulet Curry", "Carbonara", "Pesto"],
          },
        ],
      },
      {
        num: "4",
        title: "Choisis tes Garnitures",
        groups: [
          {
            label: "Ton fromage",
            options: ["Parmesan", "Gruyère", "Mozzarella râpée"],
          },
          {
            label: "Tes toppings",
            options: ["Croûtons", "Olives", "Oignons frits"],
          },
        ],
      },
    ],
  },

  boissons: [
    { name: "Cristalline, San Pellegrino 50 cL", price: "1,50 €" },
    { name: "Coca-Cola / Zéro 33 cL", price: "2,00 €" },
    { name: "Orangina, Fuze Tea, Oasis 33 cL", price: "2,00 €" },
  ],

  desserts: ([
    { name: "Cookies", price: "3,00 €" },
    { name: "Donuts", price: "3,00 €" },
    { name: "Fromage blanc", price: "3,00 €" },
    { name: "Tiramisu", price: "4,00 €", note: "Hors formules" },
  ] as { name: string; price: string; note?: string }[]),

  note:
    "Prix TTC indicatifs — la carte évolue chaque semaine avec la salade du moment.",
} as const;

export const concept = {
  kicker: "03 · Le concept",
  title: "SIMPLE. GÉNÉREUX.",
  titleAccent: "ITALIEN.",
  items: [
    {
      emoji: "🍝",
      title: "Des pâtes généreuses",
      text: "Des recettes gourmandes pensées pour être simples, généreuses et savoureuses.",
    },
    {
      emoji: "🇮🇹",
      title: "L’esprit italien",
      text: "Une cuisine inspirée de l’Italie et pensée pour être dégustée sans prise de tête.",
    },
    {
      emoji: "⚡",
      title: "Rapide & gourmand",
      text: "Parfait pour une pause déjeuner, un repas rapide ou une envie de pasta.",
    },
    {
      emoji: "☀️",
      title: "Au cœur d’Aix",
      text: "Une adresse conviviale au cœur d’Aix-en-Provence.",
    },
  ],
} as const;

export const gallery = {
  kicker: "04 · En images",
  title: "UN PEU D’ITALIE",
  titleAccent: "À AIX.",
  note: "Visuels d’ambiance (illustrations) — l’assiette du jour se déguste sur place.",
  photos: [
    {
      img: "/images/pasta2.webp",
      alt: "Visuel d’illustration — grande assiette de pâtes en sauce",
      span: "lg:col-span-7 lg:row-span-2",
      ratio: "aspect-[4/3] lg:aspect-auto lg:h-full",
    },
    {
      img: "/images/gal-resto1.webp",
      alt: "Visuel d’illustration — salle de restaurant chaleureuse",
      span: "lg:col-span-5",
      ratio: "aspect-[4/3]",
    },
    {
      img: "/images/gal-chef.webp",
      alt: "Visuel d’illustration — préparation en cuisine",
      span: "lg:col-span-5",
      ratio: "aspect-[4/3]",
    },
    {
      img: "/images/dessert1.webp",
      alt: "Visuel d’illustration — dessert gourmand",
      span: "lg:col-span-4",
      ratio: "aspect-square",
    },
    {
      img: "/images/gal-ingredients.webp",
      alt: "Visuel d’illustration — ingrédients frais d’inspiration italienne",
      span: "lg:col-span-4",
      ratio: "aspect-square",
    },
    {
      img: "/images/gal-resto2.webp",
      alt: "Visuel d’illustration — table dressée dans le restaurant",
      span: "lg:col-span-4",
      ratio: "aspect-square",
    },
  ],
} as const;

export type Review = { name: string; rating: number; text: string };

/** ⭐ Les SEULS avis réels (Google) — n'en inventer aucun autre. */
export const reviews = {
  kicker: "05 · Ils en parlent",
  title: "ILS SONT VENUS.",
  titleAccent: "ILS ONT AIMÉ. ❤️",
  list: [
    {
      name: "Luca AMAT",
      rating: 5,
      text: "Merci à toute l’équipe de Ruga Pasta, toujours au top et super sympa ! J’ai pris une salade de pâtes et une glace à l’italienne, je me suis régalé. Le rapport qualité-prix est juste exceptionnel. Le cadre est agréable et l’ambiance vraiment sympa. Franchement, une très bonne adresse où je reviendrai avec plaisir !",
    },
    {
      name: "Alexy Lecoq",
      rating: 5,
      text: "Super endroit pour aller manger franchement le service est plus que rapide, l’ambiance est top.",
    },
    {
      name: "SACHA BOSSARD",
      rating: 5,
      text: "Un vrai coup de cœur à Aix-en-Provence ! Ruga Pasta est devenu mon adresse préférée pour des pâtes délicieuses.",
    },
  ] as Review[],
} as const;

export const orderCta = {
  title: "UNE ENVIE DE PASTA ?",
  text: "Sur place, à emporter ou en livraison : à vous de choisir.",
} as const;

export const location = {
  kicker: "06 · Nous trouver",
  title: "VENEZ NOUS VOIR",
  titleAccent: "À AIX.",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Ruga+Pasta%2C+7+Rue+Rifle+Rafle%2C+13100+Aix-en-Provence",
  mapEmbed:
    "https://www.google.com/maps?q=7%20Rue%20Rifle%20Rafle%2C%2013100%20Aix-en-Provence&output=embed",
} as const;

export const marqueeWords = [
  "PASTA TIME",
  "À TABLE",
  "UN PEU D’ITALIE À AIX",
  "PRENDS UNE FOURCHETTE",
  "SIMPLE. GÉNÉREUX. ITALIEN.",
  "FATTA BENE",
] as const;
