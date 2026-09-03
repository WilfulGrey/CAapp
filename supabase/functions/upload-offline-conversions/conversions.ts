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
  /** Fester Stufenwert in EUR (Profil 90, Buchung 250) — null = ohne Wert. */
  value: number | null;
}

// Data-Manager-API-Event (events:ingest) — seit 19.08.2026. Der klassische
// uploadClickConversions ist für NEUE Integrationen gesperrt
// (CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE, Google-Plattform-Umstellung).
export interface DmEvent {
  destinationReferences: string[];
  eventTimestamp: string; // RFC 3339
  /** Pflicht trotz "Optional" im Schema (REQUIRED_FIELD_MISSING ohne). */
  eventSource: "WEB";
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
  // Dedup-Schlüssel bei Google; Buchungen nutzen ein Präfix, damit sie nie
  // mit der Qualified-Lead-Conversion desselben Leads kollidieren.
  transactionId: string = c.leadId,
): DmEvent | null {
  const click = pickClickId(c);
  if (!click) return null;
  const event: DmEvent = {
    destinationReferences: [destinationReference],
    eventTimestamp: formatRfc3339(c.conversionAt),
    eventSource: "WEB",
    transactionId,
    adIdentifiers: { [click.type]: click.id },
  };
  if (typeof c.value === "number" && Number.isFinite(c.value) && c.value > 0) {
    event.conversionValue = c.value;
    event.currency = "EUR";
  }
  return event;
}

// Data Manager ist fast-fail pro REQUEST: HTTP 400 = Datenproblem im Batch
// (→ Einzel-Isolierung im Handler), 401/403/5xx = transient (Retry nächster
// Lauf). Eine per-Zeile-Klassifikation wie beim alten Endpoint gibt es
// synchron nicht mehr; asynchrone Verarbeitungs-Diagnostik liefert Google
// separat (Ads-UI/Diagnostics).
