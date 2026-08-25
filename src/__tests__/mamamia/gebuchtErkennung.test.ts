import { describe, it, expect } from 'vitest';
import {
  pickFinalConfirmedJob,
  synthesizeAcceptedApplicationFromFinalConfirmation,
  applyAcceptedOverlay,
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

describe('Cisar 33981 — die Annahme muss auch gebaut werden', () => {
  /* Die Diagnose-Leiste zeigte am 25.08. genau das:
       fc=33981:Celina#38202 · confirmedJob=33981 · acceptedApp=null
     Erkannt war die Bestaetigung also — gebaut wurde sie nicht, weil
     applyAcceptedOverlay als DRITTE Stelle noch streng auf `number` prueft. */
  const confirmedJob = (kraftId: unknown) => ({
    id: 33981,
    status: 'accepted',
    salary_offered: 3000,
    arrival_at: '2026-09-05',
    final_confirmation: {
      id: 7788,
      final_confirmed_at: '2026-08-25',
      caregiver: { id: kraftId, first_name: 'Celina', last_name: 'M.' },
    },
  }) as any;
  const opts = { nowIso: '2026-08-25T00:00:00.000Z', nowYear: 2026 };
  const leer = { application_ids: [], rows: [] } as any;

  it('Agentur-Annahme ohne Portal-Zeile, Kraft-ID als Zahl → accepted-App', () => {
    const r = applyAcceptedOverlay([], {
      acceptances: leer, confirmedJob: confirmedJob(38202),
      caregiverProfile: null, firstAcceptedCaregiverId: null, opts,
    });
    expect(r.some((a) => a.status === 'accepted')).toBe(true);
  });

  it('dieselbe Lage mit Kraft-ID als ZEICHENKETTE → ebenfalls accepted-App', () => {
    const r = applyAcceptedOverlay([], {
      acceptances: leer, confirmedJob: confirmedJob('38202'),
      caregiverProfile: null, firstAcceptedCaregiverId: null, opts,
    });
    expect(r.some((a) => a.status === 'accepted')).toBe(true);
  });

  it('nur Name, keine Kraft-ID → ebenfalls accepted-App', () => {
    const j = confirmedJob(undefined);
    const r = applyAcceptedOverlay([], {
      acceptances: leer, confirmedJob: j,
      caregiverProfile: null, firstAcceptedCaregiverId: null, opts,
    });
    expect(r.some((a) => a.status === 'accepted')).toBe(true);
  });
});
