// Pure Logik für die OpenAI Ads Conversions API — ohne I/O, in _tests/
// ohne Netz testbar. Vertrag: https://developers.openai.com/ads/conversions-api
//
// Fachlich: Eine Anfrage aus dem Kostenrechner (lead_created) wird OpenAI
// serverseitig gemeldet, wenn der Lead eine Klick-Kennung `oppref` trägt.
// Die Kennung hängt OpenAI selbst an jeden Anzeigenklick (?oppref=…); der
// Rechner merkt sie sich wie die gclid und schreibt sie an den Lead.
// KEINE Personendaten: kein Name, keine E-Mail, kein Telefon, keine IP.
// Dedup mit dem Browser-Pixel: dieselbe id (= lead_id) und dieselbe Pixel-ID.

export interface LeadKandidat {
  leadId: string;
  /** ISO-Zeitstempel der Lead-Erstellung = Zeitpunkt der Conversion. */
  createdAt: string;
  oppref: string;
}

export interface CapiEvent {
  id: string;
  type: "lead_created";
  timestamp_ms: number;
  oppref: string;
  source_url: string;
  action_source: "web";
  data: { type: "customer_action"; amount: number; currency: "EUR" };
}

/** Wert einer Anfrage in EUR — Martins feste Staffelung (20 / 90 / 250). */
export const WERT_ANFRAGE_EUR = 20;
/** Die API rechnet in der kleinsten Einheit (Cent): 2000 = 20,00 €. */
export const WERT_ANFRAGE_MINOR = WERT_ANFRAGE_EUR * 100;
/** Landing der Anzeigen; `source_url` ist bei Web-Ereignissen Pflicht. */
export const SOURCE_URL = "https://kostenrechner.primundus.de/";
/** Die API nimmt nur Ereignisse der letzten 7 Tage; wir bleiben einen Tag darunter. */
export const MAX_ALTER_TAGE = 6;
export const BATCH_GROESSE = 100;

export function capiUrl(pixelId: string): string {
  return `https://bzr.openai.com/v1/events?pid=${encodeURIComponent(pixelId)}`;
}

export function istImFenster(createdAt: string, jetztMs: number, maxTage = MAX_ALTER_TAGE): boolean {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  if (t > jetztMs + 10 * 60_000) return false; // API: höchstens 10 Minuten Zukunft
  return jetztMs - t <= maxTage * 86_400_000;
}

export function baueLeadEvent(k: LeadKandidat, wertMinor = WERT_ANFRAGE_MINOR): CapiEvent {
  return {
    id: k.leadId,
    type: "lead_created",
    timestamp_ms: Date.parse(k.createdAt),
    oppref: k.oppref,
    source_url: SOURCE_URL,
    action_source: "web",
    data: { type: "customer_action", amount: wertMinor, currency: "EUR" },
  };
}

export function inBloecke<T>(liste: T[], groesse = BATCH_GROESSE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) out.push(liste.slice(i, i + groesse));
  return out;
}

/**
 * Wie eine Antwort zu behandeln ist. 2xx = angenommen. 400/404/422 = unser
 * Payload ist kaputt → permanent, sonst probieren wir es alle 15 Minuten
 * ewig. 401/403 (Schlüssel), 429 (Limit), 5xx, Netz = später noch einmal.
 */
export function bewerteAntwort(status: number): "uploaded" | "permanent_failure" | "retry" {
  if (status >= 200 && status < 300) return "uploaded";
  if (status === 400 || status === 404 || status === 422) return "permanent_failure";
  return "retry";
}
