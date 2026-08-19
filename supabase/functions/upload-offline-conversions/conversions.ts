// Pure Logik für den Offline-Conversion-Upload (Google Ads) — ohne I/O,
// damit sie in _tests/ ohne Netz testbar ist.
//
// Fachlich: „Qualifizierter Lead" = erstes `patient_data_saved` lead_event
// eines Leads. Hochgeladen wird die Klick-ID vom Lead (gclid bevorzugt,
// dann wbraid/gbraid — iOS-Varianten), Bestell-ID = lead_id (Google-seitige
// Dedup zusätzlich zu unserer offline_conversion_uploads-Tabelle).

export interface QualifiedLeadCandidate {
  leadId: string;
  /** ISO-Zeitstempel des ERSTEN patient_data_saved. */
  conversionAt: string;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  /** Monats-Bruttopreis aus leads.kalkulation (EUR) — optionaler Wert. */
  value: number | null;
}

// Data-Manager-API-Event (events:ingest) — seit 19.08.2026. Der klassische
// uploadClickConversions ist für NEUE Integrationen gesperrt
// (CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE, Google-Plattform-Umstellung).
export interface DmEvent {
  destinationReferences: string[];
  eventTimestamp: string; // RFC 3339
  transactionId: string;  // = lead_id (Dedup)
  adIdentifiers: { gclid?: string; wbraid?: string; gbraid?: string };
  conversionValue?: number;
  currency?: string;
}

export type ClickIdType = "gclid" | "wbraid" | "gbraid";

export function pickClickId(
  c: Pick<QualifiedLeadCandidate, "gclid" | "wbraid" | "gbraid">,
): { type: ClickIdType; id: string } | null {
  if (c.gclid) return { type: "gclid", id: c.gclid };
  if (c.wbraid) return { type: "wbraid", id: c.wbraid };
  if (c.gbraid) return { type: "gbraid", id: c.gbraid };
  return null;
}

// Data Manager will RFC 3339 (UTC mit Z).
export function formatRfc3339(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp: ${iso}`);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Klicks müssen bei Google „angekommen" sein, bevor die Conversion dazu
// hochgeladen werden darf (Empfehlung ≥6h). Der Klick liegt VOR dem
// patient_data_saved, also reicht der Abstand auf das Event.
export function isOldEnough(conversionAtIso: string, nowMs: number, minAgeHours = 6): boolean {
  const t = new Date(conversionAtIso).getTime();
  return Number.isFinite(t) && nowMs - t >= minAgeHours * 3_600_000;
}

export function buildDmEvent(
  c: QualifiedLeadCandidate,
  destinationReference: string,
): DmEvent | null {
  const click = pickClickId(c);
  if (!click) return null;
  const event: DmEvent = {
    destinationReferences: [destinationReference],
    eventTimestamp: formatRfc3339(c.conversionAt),
    transactionId: c.leadId,
    adIdentifiers: { [click.type]: click.id },
  };
  if (typeof c.value === "number" && Number.isFinite(c.value) && c.value > 0) {
    event.conversionValue = c.value;
    event.currency = "EUR";
  }
  return event;
}

// bruttopreis aus leads.kalkulation (jsonb) ziehen — fail-soft.
export function extractValue(kalkulation: unknown): number | null {
  if (!kalkulation || typeof kalkulation !== "object") return null;
  const v = (kalkulation as Record<string, unknown>).bruttopreis;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

// Data Manager ist fast-fail pro REQUEST: HTTP 400 = Datenproblem im Batch
// (→ Einzel-Isolierung im Handler), 401/403/5xx = transient (Retry nächster
// Lauf). Eine per-Zeile-Klassifikation wie beim alten Endpoint gibt es
// synchron nicht mehr; asynchrone Verarbeitungs-Diagnostik liefert Google
// separat (Ads-UI/Diagnostics).
