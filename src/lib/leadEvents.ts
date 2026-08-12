// Reports customer milestones back to the kostenrechner lead so the Nachfass
// follow-up emails can branch (portal_opened → patient_data_saved →
// caregiver_invited) and so the team gets a notification mail when the lead
// progresses (patient profile filled / caregiver invited).
// Fire-and-forget: never blocks the UI, never throws.
// The kostenrechner /api/lead-event endpoint also dedupes server-side for
// portal_opened / patient_data_saved; caregiver_invited is intentionally NOT
// deduped on the server so each invite produces one team mail.

export const KOSTENRECHNER_URL =
  import.meta.env.VITE_KOSTENRECHNER_URL || 'https://kostenrechner.primundus.de';

export type LeadEvent =
  | 'portal_opened'
  | 'patient_data_saved'
  | 'caregiver_invited'
  | 'caregiver_declined'           // customer hat eine Pflegekraft abgelehnt (matching ODER interest)
  | 'caregiver_declined_undone'    // customer hat die Ablehnung rückgängig gemacht (Undo)
  | 'application_rejected'        // customer Bewerbung abgelehnt
  | 'patient_form_step'           // Patientenbogen: Schritt erreicht (metadata.step) — Abbruch-Analyse
  | 'patient_form_save_failed'    // Patientenbogen: Server-Save gescheitert (metadata.error)
  | 'patient_form_location_unresolved' // Einsatzort eingegeben, aber kein Mamamia-location_id (z. B. AT-PLZ) — Team-Flag, keine Mail
  | 'angebots_feedback';          // Rückmeldung zum Angebot: ein Tap + optionales Detail

// Mini-Snapshot der Nurse-Daten, die wir brauchen um eine declined-from-
// Interest Pflegekraft im bearbeitet-Bereich als virtuelle MatchCard zu
// rendern. Wird beim Dismissen einer Interest-Karte in lead_events
// gespeichert, weil Mamamia die Pflegekraft danach permanent aus den
// Interest-/Matching-Listen entfernt und wir sonst keine Daten mehr für
// Name/Foto/Erfahrung hätten.
export interface CaregiverSnapshot {
  name?: string;
  age?: number;
  image?: string;
  color?: string;
  experience?: string;
  experienceYears?: number;
  languageLevel?: string;
  languageBars?: number;
  historyAssignments?: number;
  historyAvgDurationMonths?: number;
}

export interface LeadEventMetadata {
  // patient_form_step: erreichter Schritt (0-basiert); patient_form_save_failed: Fehlertext.
  step?: number;
  error?: string;
  // caregiver_invited / caregiver_declined / application_rejected:
  // which caregiver (id + display name). Optional — older callers without
  // these fields still work.
  caregiver_id?: number | string;
  caregiver_name?: string;
  // application_rejected: Mamamia-Application-ID + optional Begründung des
  // Kunden — landet im lead_event-metadata für Audit.
  application_id?: string | number;
  reject_message?: string;
  // patient_data_saved: customer's current phone number from the form so
  // the kostenrechner endpoint can refresh leads.telefon (kept in sync with
  // Mamamia Customer.phone after a step-4 edit). Optional.
  phone?: string;
  // caregiver_declined (Interest-Dismiss-Pfad): Nurse-Snapshot damit die
  // declined Pflegekraft im bearbeitet-Bereich als virtual MatchCard
  // rekonstruiert werden kann nach Reload / cross-device.
  caregiver_snapshot?: CaregiverSnapshot;
  // caregiver_declined: Origin-Marker — 'interest' wenn aus Interest-
  // Dismiss-Pfad gekommen (= virtual declined MatchCard rendern),
  // 'matching' (oder undefined) wenn normal aus declineNurse.
  decline_origin?: 'interest' | 'matching';
  // patient_form_location_unresolved: die vom Kunden eingegebene PLZ + Ort,
  // die sich nicht auf einen Mamamia-location_id auflösen ließen (z. B. AT).
  plz?: string;
  ort?: string;
  // patient_data_saved: gesetzt ('1'), wenn der Einsatzort nicht aufgelöst
  // werden konnte → Kostenrechner unterdrückt die "fertig"-Mail.
  location_unresolved?: string;
  // patient_form_location_unresolved: gesetzt ('1') bei 4-stelliger PLZ
  // (Österreich/Schweiz — nicht bedient) → Team weiß: nicht nachfassen.
  outside_germany?: string;
  // angebots_feedback: die Antwort auf „Wie geht es bei Ihnen weiter?" und —
  // sofern der Kunde die Rückfrage nicht übersprungen hat — das Detail
  // (Grund bei „passt_nicht", Zeitpunkt bei „spaeter"). Das Detail kommt in
  // einem ZWEITEN Event nach; das erste trägt nur die Antwort.
  feedback_answer?: 'passt_nicht' | 'spaeter' | 'loslegen';
  feedback_detail?: string;
  // '1' = die ENDGÜLTIGE Meldung, an der die Team-Mail hängt. Der erste Tap
  // wird still aufgezeichnet (notify:false) und trägt die Markierung NICHT.
  // Ohne sie stünden in der Timeline zwei gleich aussehende Zeilen und
  // niemand wüsste, welche eine Mail ausgelöst hat (Lehre aus den Seed-
  // Events, Bug #25).
  feedback_final?: string;
}

// Session-level dedupe so a re-render or repeated save doesn't spam the
// endpoint. For caregiver_invited we include the caregiver id in the key so
// inviting different caregivers in the same session each produces an event.
// For patient_data_saved we include phone so a re-save with an edited
// number actually reaches the server (where leads.telefon gets refreshed).
const sent = new Set<string>();

function dedupeKey(token: string, event: LeadEvent, metadata?: LeadEventMetadata): string {
  if (event === 'caregiver_invited' && metadata?.caregiver_id != null) {
    return `${token}:${event}:${String(metadata.caregiver_id)}`;
  }
  if (event === 'patient_data_saved' && metadata?.phone) {
    return `${token}:${event}:${metadata.phone}`;
  }
  // Rückmeldung zum Angebot: Antwort UND Detail gehören in den Schlüssel.
  // Sonst schluckt der Sitzungs-Dedupe den zweiten Aufruf (erst der Tap, dann
  // das Detail) — das Detail käme nie am Server an, und wer seine Antwort
  // korrigiert, würde ebenfalls ignoriert.
  if (event === 'angebots_feedback') {
    return `${token}:${event}:${metadata?.feedback_answer ?? ''}:${metadata?.feedback_detail ?? ''}`;
  }
  return `${token}:${event}`;
}

export function reportLeadEvent(
  token: string | null | undefined,
  event: LeadEvent,
  metadata?: LeadEventMetadata,
  /** `false` = nur aufzeichnen, keine Mail (Bridge: `silent`). Gebraucht für
   *  Zwischenstände, die den Eintrag sichern sollen, ohne das Team zu
   *  benachrichtigen — z. B. der erste Tap der Angebots-Rückmeldung, bevor
   *  die endgültige Antwort feststeht. */
  notify?: boolean,
): void {
  if (!token) return;
  const key = dedupeKey(token, event, metadata);
  if (sent.has(key)) return;
  sent.add(key);

  const body: Record<string, unknown> = { token, event };
  if (metadata && Object.keys(metadata).length > 0) {
    body.metadata = metadata;
  }
  if (notify === false) {
    body.notify = false;
  }

  fetch(`${KOSTENRECHNER_URL}/api/lead-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    // Fire-and-forget. On failure, drop the dedupe key so a later attempt
    // can retry (e.g. patient_data_saved fires again on the next save).
    sent.delete(key);
  });
}

// Fetch persistent lead_events for the given token. Used by the portal
// on mount to rehydrate Interest-Origin tracking + dismissed-Interest
// reconstruction (überlebt F5, cross-device). Best-effort — failures
// loggen + leeres Array zurückgeben damit das Portal-UI weiterläuft.
export interface FetchedLeadEvent {
  id: string;
  event_type: string;
  metadata: any;
  created_at: string;
}

export async function fetchLeadEvents(
  token: string | null | undefined,
  eventTypes?: LeadEvent[] | string[],
): Promise<FetchedLeadEvent[]> {
  if (!token) return [];
  const params = new URLSearchParams({ token });
  if (eventTypes && eventTypes.length > 0) params.set('types', eventTypes.join(','));
  try {
    const res = await fetch(`${KOSTENRECHNER_URL}/api/lead-event?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({ events: [] }));
    return Array.isArray(json?.events) ? (json.events as FetchedLeadEvent[]) : [];
  } catch {
    return [];
  }
}
