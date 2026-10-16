// „Für Sie reserviert bis …" an einer Bewerbung (Martin 25.09.2026: die 72-Stunden-Frist offen
// nennen, als Reservierung). Die Frist selbst setzt der Server: `detect-caregiver-events` sagt eine
// Bewerbung 72 h nach ihrem frühesten echten `application_received` automatisch ab — außer der
// Kunde hat auf DIESE Bewerbung schon reagiert, und nie auf Grund still erfasster (`seeded`)
// Ereignisse.
//
// Je Bewerbung (Registry #126, 16.10.2026): Anker ist der Eingang mit derselben `application_id`;
// eine Reaktion zählt, wenn sie dieselbe `application_id` trägt oder zum Paar (Job, Pflegekraft)
// gehört und NACH diesem Eingang liegt. Vorher galt alles je Paar: eine neu eingestellte
// Bewerbung derselben Kraft erbte den Eingang der alten (Frist zu früh) und deren Absage (keine
// Frist). Bewerbungen ohne eigenen Eingang mit `application_id` (vor Registry #35) rechnen wie
// der Server mit den Eingängen des Paars OHNE `application_id`; Bewerbungen mit Eingang vor
// `JE_BEWERBUNG_AB` wie der Server weiter je Paar (Übergang).
//
// Diese Funktion rechnet dieselbe Regel nach und rundet auf die volle Stunde AB: Wir nennen nie
// mehr Zeit, als der Server gibt. Fehlt etwas, gibt es keine Frist (Święta zasada nr 1: nicht raten).
import type { FetchedLeadEvent } from './leadEvents';

/** Muss zu AUTO_REJECT_AFTER_HOURS in supabase/functions/detect-caregiver-events passen. */
export const RESERVIERUNG_STUNDEN = 72;

/** Übergang Registry #126, muss zu JE_BEWERBUNG_AB in detect-caregiver-events passen: Bewerbungen
 *  mit eigenem Eingang davor rechnen wie der Server weiter je Paar. */
export const JE_BEWERBUNG_AB = '2026-10-13T00:00:00Z';

const STUNDE = 60 * 60 * 1000;

const istReaktion = (e: FetchedLeadEvent) =>
  e.event_type === 'application_accepted_internal' || e.event_type === 'application_rejected';
const idText = (v: unknown) => (v == null ? '' : String(v));

export function reserviertBis(
  events: FetchedLeadEvent[],
  { caregiverId, jobOfferId, standardJobId, applicationId }: {
    caregiverId: number | undefined | null;
    /** Job der Bewerbung (Sitzungs-Job). Unbekannt → keine Frist. */
    jobOfferId: number | undefined | null;
    /** `leads.mamamia_job_offer_id`: Ereignisse ohne Job gehören wie im Server zu ihm. */
    standardJobId?: number | null;
    /** mamamia application_id der Bewerbung (Registry #126). Ohne: Regel je Paar wie bisher. */
    applicationId?: number | string | null;
  },
  jetzt: number = Date.now(),
): Date | null {
  if (!caregiverId || jobOfferId == null) return null;
  const zurKraft = events.filter((e) => Number((e.metadata ?? {}).caregiver_id) === caregiverId);
  const zumPaar = zurKraft.filter((e) => {
    const job = (e.metadata ?? {}).mamamia_job_offer_id ?? standardJobId;
    // Weder Ereignis noch Lead kennen einen Job (Altbestand, ein Job): zählt.
    return job == null || Number(job) === jobOfferId;
  });
  const echteEingaenge = (liste: FetchedLeadEvent[]) =>
    liste.filter((e) => e.event_type === 'application_received' && e.metadata?.seeded !== true);
  const msVon = (liste: FetchedLeadEvent[]) =>
    liste.map((e) => Date.parse(e.created_at)).filter((ms) => Number.isFinite(ms));

  const app = idText(applicationId);
  let anker: number[];
  if (!app) {
    // Ohne Bewerbung: die alte Regel je Paar.
    if (zumPaar.some(istReaktion)) return null;
    anker = msVon(echteEingaenge(zumPaar));
  } else {
    anker = msVon(echteEingaenge(zurKraft).filter((e) => idText(e.metadata?.application_id) === app));
    const gleicheId = (e: FetchedLeadEvent) => idText(e.metadata?.application_id) === app;
    if (anker.length > 0 && Math.min(...anker) >= Date.parse(JE_BEWERBUNG_AB)) {
      const eingang = Math.min(...anker);
      const beantwortet = zurKraft.some((e) => istReaktion(e) && (
        gleicheId(e) || (zumPaar.includes(e) && Date.parse(e.created_at) > eingang)
      ));
      if (beantwortet) return null;
    } else if (anker.length > 0) {
      // Übergang: Eingang vor JE_BEWERBUNG_AB → wie der Server je Paar.
      if (zumPaar.some(istReaktion) || zurKraft.some((e) => istReaktion(e) && gleicheId(e))) return null;
      anker = msVon(echteEingaenge(zumPaar));
    } else {
      // Kein eigener Eingang: wie der Server die Eingänge des Paars ohne application_id.
      if (zumPaar.some(istReaktion)) return null;
      anker = msVon(echteEingaenge(zumPaar).filter((e) => !idText(e.metadata?.application_id)));
    }
  }
  if (anker.length === 0) return null;
  const ende = Math.floor((Math.min(...anker) + RESERVIERUNG_STUNDEN * STUNDE) / STUNDE) * STUNDE;
  return ende > jetzt ? new Date(ende) : null;
}

/** Volle Stunden bis zum Ende der Reservierung (abgerundet, nie negativ). */
export function stundenBis(d: Date, jetzt: number = Date.now()): number {
  return Math.max(0, Math.floor((d.getTime() - jetzt) / STUNDE));
}

/** „Noch 52 Stunden für Sie reserviert" — der Countdown im Kopf. Unter 24 h „Nur noch …"
 *  (Martin 25.09.: Zeit ja, aber nicht zu negativ — deshalb Wortwahl statt Rot). */
export function nochReserviertText(d: Date, jetzt: number = Date.now()): string {
  const h = stundenBis(d, jetzt);
  if (h < 1) return 'Nur noch kurz für Sie reserviert';
  const stunden = `${h} ${h === 1 ? 'Stunde' : 'Stunden'}`;
  return h < 24 ? `Nur noch ${stunden} für Sie reserviert` : `Noch ${stunden} für Sie reserviert`;
}

/** Unter 24 Stunden: dringend (andere Farbe). */
export function istDringend(d: Date, jetzt: number = Date.now()): boolean {
  return stundenBis(d, jetzt) < 24;
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
