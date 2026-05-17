// Reports customer milestones back to the kostenrechner lead so the Nachfass
// follow-up emails can branch (portal_opened → patient_data_saved →
// caregiver_invited) and so the team gets a notification mail when the lead
// progresses (patient profile filled / caregiver invited).
// Fire-and-forget: never blocks the UI, never throws.
// The kostenrechner /api/lead-event endpoint also dedupes server-side for
// portal_opened / patient_data_saved; caregiver_invited is intentionally NOT
// deduped on the server so each invite produces one team mail.

const KOSTENRECHNER_URL =
  import.meta.env.VITE_KOSTENRECHNER_URL || 'https://kostenrechner.primundus.de';

export type LeadEvent = 'portal_opened' | 'patient_data_saved' | 'caregiver_invited';

export interface LeadEventMetadata {
  // caregiver_invited: which caregiver was invited (id + name shown in the
  // team mail). Optional — older callers without these fields still work.
  caregiver_id?: number | string;
  caregiver_name?: string;
}

// Session-level dedupe so a re-render or repeated save doesn't spam the
// endpoint. For caregiver_invited we include the caregiver id in the key so
// inviting different caregivers in the same session each produces an event.
const sent = new Set<string>();

function dedupeKey(token: string, event: LeadEvent, metadata?: LeadEventMetadata): string {
  if (event === 'caregiver_invited' && metadata?.caregiver_id != null) {
    return `${token}:${event}:${String(metadata.caregiver_id)}`;
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
