/**
 * Client HTTP du tunnel de commande — parle UNIQUEMENT à nos fonctions API
 * (même origine, CSP `connect-src 'self'` respectée : le navigateur ne
 * contacte jamais Supabase directement).
 */
import type {
  MenuResponse,
  OrderConfirmation,
  SlotsResponse,
} from "./types";

export type {
  MenuNode,
  MenuResponse,
  OrderConfirmation,
  OrderingStatusDto,
  SlotDto,
  SlotsResponse,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* réponse vide : body reste null */
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; message?: string };
    const error = new Error(err.message || err.error || `HTTP ${res.status}`);
    (error as Error & { code?: string }).code = err.error;
    throw error;
  }
  return body as T;
}

export const api = {
  menu: () => request<MenuResponse>("/api/menu"),

  slots: (date: string) =>
    request<SlotsResponse>(`/api/slots?date=${encodeURIComponent(date)}`),

  createOrder: (payload: {
    cart: { id: string; qty: number }[];
    name: string;
    phone: string;
    pickup: string;
    note?: string;
    idempotency_key: string;
    website?: string;
  }) =>
    request<OrderConfirmation>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
