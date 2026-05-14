// Reports customer milestones back to the kostenrechner lead so the Nachfass
// follow-up emails can branch (portal_opened → patient_data_saved →
// caregiver_invited). Fire-and-forget: never blocks the UI, never throws.
// The kostenrechner /api/lead-event endpoint also dedupes server-side.

const KOSTENRECHNER_URL =
  import.meta.env.VITE_KOSTENRECHNER_URL || 'https://kostenrechner.primundus.de';

export type LeadEvent = 'portal_opened' | 'patient_data_saved' | 'caregiver_invited';

// Session-level dedupe so a re-render or repeated save doesn't spam the endpoint.
const sent = new Set<string>();

export function reportLeadEvent(token: string | null | undefined, event: LeadEvent): void {
  if (!token) return;
  const key = `${token}:${event}`;
  if (sent.has(key)) return;
  sent.add(key);

  fetch(`${KOSTENRECHNER_URL}/api/lead-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, event }),
  }).catch(() => {
    // Fire-and-forget. On failure, drop the dedupe key so a later attempt
    // can retry (e.g. patient_data_saved fires again on the next save).
    sent.delete(key);
  });
}
