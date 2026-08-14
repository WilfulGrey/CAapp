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

export interface ClickConversionPayload {
  conversionAction: string;
  conversionDateTime: string;
  orderId: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  conversionValue?: number;
  currencyCode?: string;
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

// Google verlangt "yyyy-MM-dd HH:mm:ss+HH:MM". Wir liefern UTC mit
// explizitem +00:00 — Google rechnet selbst in die Konto-Zeitzone um.
export function formatConversionDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp: ${iso}`);
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
  );
}

// Klicks müssen bei Google „angekommen" sein, bevor die Conversion dazu
// hochgeladen werden darf (Empfehlung ≥6h). Der Klick liegt VOR dem
// patient_data_saved, also reicht der Abstand auf das Event.
export function isOldEnough(conversionAtIso: string, nowMs: number, minAgeHours = 6): boolean {
  const t = new Date(conversionAtIso).getTime();
  return Number.isFinite(t) && nowMs - t >= minAgeHours * 3_600_000;
}

export function buildClickConversion(
  c: QualifiedLeadCandidate,
  conversionAction: string,
): ClickConversionPayload | null {
  const click = pickClickId(c);
  if (!click) return null;
  const payload: ClickConversionPayload = {
    conversionAction,
    conversionDateTime: formatConversionDateTime(c.conversionAt),
    orderId: c.leadId,
    [click.type]: click.id,
  };
  if (typeof c.value === "number" && Number.isFinite(c.value) && c.value > 0) {
    payload.conversionValue = c.value;
    payload.currencyCode = "EUR";
  }
  return payload;
}

// bruttopreis aus leads.kalkulation (jsonb) ziehen — fail-soft.
export function extractValue(kalkulation: unknown): number | null {
  if (!kalkulation || typeof kalkulation !== "object") return null;
  const v = (kalkulation as Record<string, unknown>).bruttopreis;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

// Partial-Failure-Klassifikation: permanente Fehler werden in
// offline_conversion_uploads als 'permanent_failure' festgeschrieben
// (kein Endlos-Retry), alles andere bleibt unmarkiert → Retry beim
// nächsten Lauf. Konservativ: unbekannt = retriable.
const PERMANENT_CODES = new Set([
  "CLICK_NOT_FOUND",
  "EXPIRED_CLICK",
  "EXPIRED_EVENT",
  "CONVERSION_PRECEDES_CLICK",
  "CONVERSION_PRECEDES_EVENT",
  "UNPARSEABLE_GCLID",
  "INVALID_CONVERSION_ACTION",
  "INVALID_CONVERSION_ACTION_TYPE",
  "GBRAID_WBRAID_BOTH_SET",
  "VALUE_MUST_BE_UNSET",
  "ORDER_ID_NOT_PERMITTED_FOR_EXTERNALLY_ATTRIBUTED_CONVERSION_ACTION",
  "DUPLICATE_ORDER_ID",
]);

export function classifyFailure(conversionUploadError: string | undefined): "permanent" | "retriable" {
  if (conversionUploadError && PERMANENT_CODES.has(conversionUploadError)) return "permanent";
  return "retriable";
}

// GoogleAdsFailure aus partialFailureError → Map Index → Fehler.
// Shape: details[].errors[] mit errorCode.conversionUploadError und
// location.fieldPathElements[{fieldName:"conversions", index}].
export function parsePartialFailures(
  partialFailureError: unknown,
): Map<number, { code: string; message: string }> {
  const out = new Map<number, { code: string; message: string }>();
  if (!partialFailureError || typeof partialFailureError !== "object") return out;
  const details = (partialFailureError as Record<string, unknown>).details;
  if (!Array.isArray(details)) return out;
  for (const d of details) {
    const errors = (d as Record<string, unknown>)?.errors;
    if (!Array.isArray(errors)) continue;
    for (const e of errors) {
      const rec = e as Record<string, any>;
      const idx = (rec?.location?.fieldPathElements ?? []).find(
        (p: Record<string, unknown>) => p?.fieldName === "conversions" && typeof p?.index === "number",
      )?.index;
      if (typeof idx !== "number") continue;
      const codeObj = rec?.errorCode ?? {};
      const code = String(Object.values(codeObj)[0] ?? "UNKNOWN");
      out.set(idx, { code, message: String(rec?.message ?? "") });
    }
  }
  return out;
}
