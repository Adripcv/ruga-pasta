/**
 * 🔁 Types publics du contrat API, copiés côté front.
 *
 * Ce fichier est une COPIE des types publics de `api/_lib/domain.ts` : Vite
 * ne compile rien hors de `src/`, donc on duplique la forme des données.
 * La cohérence serveur ↔ front est garantie par les tests (les mêmes cas
 * métier tournent des deux côtés) et par les tests E2E du tunnel.
 */
export type MenuNode = {
  id: string;
  name: string;
  price_cents: number | null;
  max_qty: number;
  children: MenuNode[];
};

export type SlotDto = {
  label: string;
  dateISO: string;
  startUtc: string;
  endUtc: string;
  available: boolean;
  reason: "past" | "prep-delay" | "closed-day" | "closed-now" | null;
  /** Places restantes (renseigné par /api/slots). */
  remaining: number;
};

export type OrderingStatusDto = { open: boolean; message: string };

export type MenuResponse = {
  configured: boolean;
  tree: MenuNode[];
  ordering: OrderingStatusDto;
};

export type SlotsResponse = {
  date: string;
  slots: SlotDto[];
  ordering: OrderingStatusDto;
};

export type OrderConfirmation = {
  code: string;
  total_cents: number;
  pickup_at: string;
};
