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
  | 'caregiver_declined'     // customer wegklicken einer Matching-Pflegekraft
  | 'application_rejected';  // customer Bewerbung abgelehnt

export interface LeadEventMetadata {
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
  return `${token}:${event}`;
}

export function reportLeadEvent(
  token: string | null | undefined,
  event: LeadEvent,
  metadata?: LeadEventMetadata,
): void {
  if (!token) return;
  const key = dedupeKey(token, event, metadata);
  if (sent.has(key)) return;
  sent.add(key);

  const body: Record<string, unknown> = { token, event };
  if (metadata && Object.keys(metadata).length > 0) {
    body.metadata = metadata;
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
