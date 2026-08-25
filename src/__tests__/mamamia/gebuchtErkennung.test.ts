import { describe, it, expect } from 'vitest';
import {
  pickFinalConfirmedJob,
  synthesizeAcceptedApplicationFromFinalConfirmation,
} from '../../lib/mamamia/mappers';

/*
 * Uebersicht und Detailansicht muessen denselben Einsatz gleich beurteilen.
 *
 * Warum diese Tests existieren (Fall Cisar, 25.08.2026): In der Einsatz-
 * uebersicht stand „Gebucht · 05.09.–05.10. · Celina M.". Oeffnete man
 * denselben Einsatz — auch gezielt per ?job=-Deeplink —, zeigte das Portal
 * das normale Matching und forderte die Kundin auf, eine Pflegekraft fuer
 * einen laengst besetzten Einsatz auszuwaehlen.
 *
 * Ursache waren strenge JS-Typpruefungen ueber die GraphQL-Grenze hinweg:
 *
 *   pickFinalConfirmedJob:  typeof caregiver?.id === 'number'
 *                           j.id === sessionJobOfferId   (strikt)
 *   synthesize…FromFinalConfirmation:  typeof cg?.id !== 'number' → null
 *
 * Die UEBERSICHT dagegen (supabase/functions/_shared/leadJobsSync.ts)
 * begnuegt sich mit `final_confirmation?.id` und liest den Namen aus
 * `final_confirmation.caregiver`. Dieselbe Quelle, zwei Urteile — und der
 * Widerspruch fiel niemandem auf, weil beide Seiten fuer sich stimmig
 * aussahen und der Fehler nur still zurueckfiel.
 */
describe('Gebucht-Erkennung — robust gegen ID-Typen', () => {
  const job = (kraft: unknown, jobId: unknown = 16226) => ({
    id: jobId,
    status: 'on_job',
    salary_offered: 3000,
    final_confirmation: { id: 5511, final_confirmed_at: '2026-08-25', caregiver: kraft },
  }) as any;

  const celina = { id: 4711, first_name: 'Celina', last_name: 'M.' };

  it('Kraft-ID als Zahl', () => {
    expect(pickFinalConfirmedJob([job(celina)], 16226)).not.toBeNull();
  });

  it('Kraft-ID als Zeichenkette zaehlt genauso', () => {
    expect(pickFinalConfirmedJob([job({ ...celina, id: '4711' })], 16226)).not.toBeNull();
  });

  it('Job-ID als Zeichenkette findet den Session-Job trotzdem', () => {
    expect(pickFinalConfirmedJob([job(celina, '16226')], 16226)).not.toBeNull();
  });

  it('nur Name, keine ID — die Uebersicht zeigt es, die Detailansicht jetzt auch', () => {
    const j = job({ first_name: 'Celina', last_name: 'M.' });
    expect(pickFinalConfirmedJob([j], 16226)).toBe(j);
  });

  it('ganz ohne Kraft weiterhin NICHT gebucht (kein halber Zustand)', () => {
    expect(pickFinalConfirmedJob([job(null)], 16226)).toBeNull();
  });

  it('der Aufbau der Annahme traegt dieselben Faelle', () => {
    const opts = { nowIso: '2026-08-25T00:00:00.000Z', nowYear: 2026 };
    expect(synthesizeAcceptedApplicationFromFinalConfirmation(job({ ...celina, id: '4711' }), null, opts))
      .not.toBeNull();
    expect(synthesizeAcceptedApplicationFromFinalConfirmation(
      job({ first_name: 'Celina', last_name: 'M.' }), null, opts)).not.toBeNull();
    expect(synthesizeAcceptedApplicationFromFinalConfirmation(job(null), null, opts)).toBeNull();
  });
});
