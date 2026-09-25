// „Für Sie reserviert bis …" an einer Bewerbung (Martin 25.09.2026: die 72-Stunden-Frist offen
// nennen, als Reservierung). Die Frist selbst setzt der Server: `detect-caregiver-events` sagt eine
// Bewerbung 72 h nach dem frühesten echten `application_received` desselben Paars (Job,
// Pflegekraft) automatisch ab — außer der Kunde hat auf diese Pflegekraft schon reagiert, und nie
// auf Grund still erfasster (`seeded`) Ereignisse.
//
// Diese Funktion rechnet dieselbe Regel nach und rundet auf die volle Stunde AB: Wir nennen nie
// mehr Zeit, als der Server gibt. Fehlt etwas, gibt es keine Frist (Święta zasada nr 1: nicht raten).
import type { FetchedLeadEvent } from './leadEvents';

/** Muss zu AUTO_REJECT_AFTER_HOURS in supabase/functions/detect-caregiver-events passen. */
export const RESERVIERUNG_STUNDEN = 72;

const STUNDE = 60 * 60 * 1000;

export function reserviertBis(
  events: FetchedLeadEvent[],
  { caregiverId, jobOfferId }: { caregiverId: number | undefined | null; jobOfferId: number | undefined | null },
  jetzt: number = Date.now(),
): Date | null {
  if (!caregiverId) return null;
  const zumPaar = events.filter((e) => {
    const m = e.metadata ?? {};
    if (Number(m.caregiver_id) !== caregiverId) return false;
    // Ältere Ereignisse ohne Job gehören wie beim Server zum Standard-Job.
    const job = m.mamamia_job_offer_id;
    return job == null || jobOfferId == null || Number(job) === jobOfferId;
  });
  if (zumPaar.some((e) => e.event_type === 'application_accepted_internal' || e.event_type === 'application_rejected')) {
    return null;
  }
  const anker = zumPaar
    .filter((e) => e.event_type === 'application_received' && e.metadata?.seeded !== true)
    .map((e) => Date.parse(e.created_at))
    .filter((ms) => Number.isFinite(ms));
  if (anker.length === 0) return null;
  const ende = Math.floor((Math.min(...anker) + RESERVIERUNG_STUNDEN * STUNDE) / STUNDE) * STUNDE;
  return ende > jetzt ? new Date(ende) : null;
}

/** „Fr, 27.09., 14 Uhr" in Berliner Zeit. */
export function reserviertBisText(d: Date): string {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${String(teile.weekday).replace('.', '')}, ${teile.day}.${teile.month}., ${Number(teile.hour)} Uhr`;
}
