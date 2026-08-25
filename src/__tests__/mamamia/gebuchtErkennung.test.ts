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

// ── Mehrere Einsaetze: alte Annahme darf die neue nicht verdecken ────────
// Fall Cisar, 25.08.2026. Der Lead hat drei Einsaetze. Im Juli nahm die
// Kundin Felicja ueber das Portal an (acceptance-Row 4098). Im August nahm
// die Agentur im SA-Portal Celina fuer den September-Einsatz an. Weil
// acceptance-Rows LEAD-weit sind, betrat Felicjas Row den Portal-Zweig,
// wurde vom Mehr-Einsatz-Gatter zu Recht abgewiesen — und der Zweig kehrte
// zurueck, bevor Pfad 3 Celina bauen konnte. Ergebnis: acceptedApp = null.
describe('applyAcceptedOverlay — Annahme aus einem anderen Einsatz', () => {
  const celinaBestaetigt = {
    id: 33981,
    final_confirmation: {
      caregiver: { id: 38202, first_name: 'Celina', last_name: 'M.' },
    },
  } as any;

  const felicjaRow = {
    application_id: 4098,
    caregiver_id: 8678,
    accepted_at: '2026-07-27T09:59:02.612207+00:00',
    contract_snapshot: { datum: '27.07.2026', tagessatz: 'EUR 95,00' },
  } as any;

  const opts = { nowIso: '2026-08-25T18:00:00.000Z', nowYear: 2026 };

  it('baut die Agentur-Annahme des aktiven Einsatzes trotz alter Row', () => {
    const out = applyAcceptedOverlay([], {
      acceptances: { application_ids: [4098], rows: [felicjaRow] },
      confirmedJob: celinaBestaetigt,
      caregiverProfile: null,
      firstAcceptedCaregiverId: 38202,
      opts,
    });
    const angenommen = out.filter((a) => a.status === 'accepted');
    expect(angenommen).toHaveLength(1);
    expect(angenommen[0].nurse.name).toContain('Celina');
    // Felicja darf NICHT als zweite Karte auftauchen.
    expect(out.some((a) => String(a.nurse.name).includes('Felicja'))).toBe(false);
  });

  it('laesst die Portal-Annahme gewinnen, wenn sie zum Einsatz gehoert', () => {
    const felicjaBestaetigt = {
      id: 32591,
      final_confirmation: {
        caregiver: { id: 8678, first_name: 'Felicja', last_name: 'K.' },
      },
    } as any;
    const out = applyAcceptedOverlay([], {
      acceptances: { application_ids: [4098], rows: [felicjaRow] },
      confirmedJob: felicjaBestaetigt,
      caregiverProfile: null,
      firstAcceptedCaregiverId: 8678,
      opts,
    });
    expect(out.filter((a) => a.status === 'accepted')).toHaveLength(1);
    // Aus dem contract_snapshot gebaut, nicht aus der final_confirmation.
    expect(out[0].synthetic).toBe(true);
  });

  it('erzeugt keine Doppelkarte, wenn beide Wege dieselbe Kraft meinen', () => {
    const out = applyAcceptedOverlay([], {
      acceptances: { application_ids: [4098], rows: [felicjaRow] },
      confirmedJob: {
        id: 32591,
        final_confirmation: {
          caregiver: { id: 8678, first_name: 'Felicja', last_name: 'K.' },
        },
      } as any,
      caregiverProfile: null,
      firstAcceptedCaregiverId: 8678,
      opts,
    });
    expect(out.filter((a) => a.status === 'accepted')).toHaveLength(1);
  });
});
