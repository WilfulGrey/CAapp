/*
 * Abgleich Kostenrechner → Mamamia nach einer erneuten Anfrage (Registry #113).
 *
 * Martin 06.10.2026, Kunde 11228: erste Anfrage 2.600 €, zweite Anfrage mit
 * „Weitere Personen im Haushalt: Ja" 2.800 € — Kundenportal und Mail zeigten
 * 2.800 €, Job und SA-Portal blieben bei 2.600 €. Jetzt zieht derselbe Weg wie
 * die Admin-Korrektur (#55) Angaben und Preis nach, mit Budget auch den Jobpreis.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://attrappe.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'attrappe';
});

// Attrappe der Datenbank (wird mamamiaNachAnfrage übergeben): zeichnet Updates und Events auf.
const db = {
  kalkulation: null as unknown,
  updates: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
};
const fakeDb = {
  from: (tabelle: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: tabelle === 'leads' ? { kalkulation: db.kalkulation } : null, error: null }) }),
    }),
    update: (patch: Record<string, unknown>) => ({ eq: async () => { db.updates.push(patch); return { error: null }; } }),
    insert: async (zeile: Record<string, unknown>) => { db.events.push(zeile); return { error: null }; },
  }),
} as never;

import { abgleichNachAnfrage, pendingNachAbgleich, resyncAufrufen } from '../../project 3/lib/mamamia-abgleich';
import { erneuteAnfrage, mamamiaNachAnfrage, type Lead } from '../../project 3/lib/lead-management';

const FD = {
  betreuung_fuer: '1-person', pflegegrad: 2, weitere_personen: 'nein', mobilitaet: 'rollator',
  nachteinsaetze: 'nein', deutschkenntnisse: 'kommunikativ', fuehrerschein: 'ja', geschlecht: 'weiblich',
};
const kalk = (bruttopreis: number, fd: Record<string, unknown> = FD, extra: Record<string, unknown> = {}) =>
  ({ bruttopreis, eigenanteil: bruttopreis - 975, formularDaten: fd, ...extra }) as never;
const ERSTE = kalk(2600);
const ZWEITE = kalk(2800, { ...FD, weitere_personen: 'ja' });

function fetchMit(status: number, body: unknown) {
  const aufrufe: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    aufrufe.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return { fn: fn as unknown as typeof fetch, aufrufe };
}
const OK_MIT_JOB = { resync: { patients_before: 1, patients_after: 1, removed_ids: [], felder: ['weitere_personen'], job: { status: 'aktualisiert', job_offer_id: 36297, alt: 2600, neu: 2800 } } };

describe('abgleichNachAnfrage', () => {
  it('Kunde 11228: weitere Person dazu ⇒ Feld und neuer Preis', () => {
    expect(abgleichNachAnfrage(ERSTE, ZWEITE, 'sofort')).toEqual({ felder: ['weitere_personen'], budget: 2800 });
  });

  it('gleiche Angaben, gleicher Preis ⇒ nichts zu tun', () => {
    expect(abgleichNachAnfrage(ERSTE, kalk(2600), 'sofort')).toBeNull();
  });

  it('gleiche Angaben, anderer Preis (z. B. vorher vom Berater angepasst) ⇒ nur der Preis', () => {
    expect(abgleichNachAnfrage(kalk(2700), kalk(2800), null)).toEqual({ felder: [], budget: 2800 });
  });

  it('Angaben ohne Ziel in Mamamia (Erfahrung) und unzulässige Werte gehen nicht mit, der Preis schon', () => {
    expect(abgleichNachAnfrage(ERSTE, kalk(2600, { ...FD, erfahrung: 'erfahren' }), null)).toBeNull();
    expect(abgleichNachAnfrage(ERSTE, kalk(2750, { ...FD, deutschkenntnisse: 'sehr-gut-sa' }), null)).toEqual({ felder: [], budget: 2750 });
  });

  it('ein früher gescheiterter Abgleich wird vereinigt, nie verloren', () => {
    const alt = kalk(2600, FD, { mamamia_sync_pending: { felder: ['pflegegrad'], budget: 2650, error: 'x', at: 't' } });
    expect(abgleichNachAnfrage(alt, kalk(2600), null)).toEqual({ felder: ['pflegegrad'], budget: 2650 });
    expect(abgleichNachAnfrage(alt, ZWEITE, null)).toEqual({ felder: ['pflegegrad', 'weitere_personen'], budget: 2800 });
  });

  it('ohne neue Kalkulation nichts', () => {
    expect(abgleichNachAnfrage(ERSTE, null)).toBeNull();
  });
});

describe('resyncAufrufen', () => {
  it('mit Budget immer auch der Jobpreis; Antwort mit Job wird lesbar', async () => {
    const { fn, aufrufe } = fetchMit(200, OK_MIT_JOB);
    const r = await resyncAufrufen({ supabaseUrl: 'https://s', serviceKey: 'srv', leadId: 'l1', felder: ['weitere_personen'], budget: 2800, fetchFn: fn });
    expect(aufrufe[0].url).toBe('https://s/functions/v1/onboard-to-mamamia');
    expect((aufrufe[0].init.headers as Record<string, string>).Authorization).toBe('Bearer srv');
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual({ lead_id: 'l1', resync: { felder: ['weitere_personen'], budget: 2800, jobPreis: true } });
    expect(r.status).toBe('ok');
    expect(r.job).toEqual({ status: 'aktualisiert', job_offer_id: 36297, alt: 2600, neu: 2800 });
    expect(r.message).toContain('Job 2.600 € → 2.800 €');
  });

  it('ohne Budget kein Jobpreis; gebuchter Job steht in der Meldung', async () => {
    const a = fetchMit(200, { resync: { patients_before: 1, patients_after: 1 } });
    await resyncAufrufen({ supabaseUrl: 'https://s', serviceKey: 'srv', leadId: 'l1', felder: ['mobilitaet'], fetchFn: a.fn });
    expect(JSON.parse(String(a.aufrufe[0].init.body)).resync).toEqual({ felder: ['mobilitaet'] });

    const b = fetchMit(200, { resync: { patients_before: 1, patients_after: 1, job: { status: 'gebucht', alt: 2600, neu: 2800 } } });
    const r = await resyncAufrufen({ supabaseUrl: 'https://s', serviceKey: 'srv', leadId: 'l1', felder: [], budget: 2800, fetchFn: b.fn });
    expect(r.message).toContain('Job gebucht – Preis dort nicht geändert');
  });

  it('Fehler von Mamamia ⇒ status error mit Klartext', async () => {
    const { fn } = fetchMit(502, { error: 'resync failed: Mamamia down' });
    const r = await resyncAufrufen({ supabaseUrl: 'https://s', serviceKey: 'srv', leadId: 'l1', felder: [], budget: 2800, fetchFn: fn });
    expect(r).toMatchObject({ status: 'error', http: 502 });
    expect(r.message).toContain('Mamamia down');
  });
});

describe('pendingNachAbgleich', () => {
  it('ok räumt, Fehler setzt felder + budget + Fehlertext', () => {
    const mitPending = kalk(2800, FD, { mamamia_sync_pending: { felder: ['x'], error: 'alt', at: 't' } });
    expect('mamamia_sync_pending' in pendingNachAbgleich(mitPending, { status: 'ok', message: '' }, [], 2800)).toBe(false);
    const p = (pendingNachAbgleich(ZWEITE, { status: 'error', http: 502, message: 'kaputt' }, ['weitere_personen'], 2800) as { mamamia_sync_pending: Record<string, unknown> }).mamamia_sync_pending;
    expect(p).toMatchObject({ felder: ['weitere_personen'], budget: 2800, error: 'kaputt', http: 502 });
  });
});

describe('mamamiaNachAnfrage (erneute Anfrage)', () => {
  const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://s', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
  const lead = (over: Partial<Lead> = {}) =>
    ({ id: 'lead-11228', care_start_timing: 'sofort', kalkulation: ERSTE, mamamia_customer_id: 11228, mamamia_job_offer_id: 36297, ...over }) as Lead;
  beforeEach(() => { db.kalkulation = ZWEITE; db.updates = []; db.events = []; });

  it('nicht in Mamamia angelegt ⇒ nichts (die Anlage nimmt später ohnehin die neue Kalkulation)', async () => {
    const { fn, aufrufe } = fetchMit(200, OK_MIT_JOB);
    expect(await mamamiaNachAnfrage(lead({ mamamia_customer_id: null }), ZWEITE, { fetchFn: fn, env: ENV, db: fakeDb })).toBeNull();
    expect(aufrufe).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });

  it('Kunde 11228: Abgleich mit Jobpreis, Ereignis für die Nachvollziehbarkeit, kein unnötiges Schreiben', async () => {
    const { fn, aufrufe } = fetchMit(200, OK_MIT_JOB);
    const r = await mamamiaNachAnfrage(lead(), ZWEITE, { fetchFn: fn, env: ENV, db: fakeDb });
    expect(r?.status).toBe('ok');
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual({ lead_id: 'lead-11228', resync: { felder: ['weitere_personen'], budget: 2800, jobPreis: true } });
    expect(db.updates).toHaveLength(0);
    expect(db.events[0]).toMatchObject({
      lead_id: 'lead-11228',
      event_type: 'mamamia_abgleich_nach_anfrage',
      metadata: { felder: ['weitere_personen'], alt_preis: 2600, neu_preis: 2800, status: 'ok', job: { status: 'aktualisiert', alt: 2600, neu: 2800 } },
    });
  });

  it('Fehler ⇒ mamamia_sync_pending (Admin wiederholt), aber nur auf derselben Kalkulation', async () => {
    const { fn } = fetchMit(502, { error: 'resync failed' });
    await mamamiaNachAnfrage(lead(), ZWEITE, { fetchFn: fn, env: ENV, db: fakeDb });
    expect(db.updates).toHaveLength(1);
    expect((db.updates[0].kalkulation as { mamamia_sync_pending: { budget: number } }).mamamia_sync_pending.budget).toBe(2800);

    db.updates = []; db.kalkulation = kalk(2650); // inzwischen eine neuere Anfrage
    await mamamiaNachAnfrage(lead(), ZWEITE, { fetchFn: fn, env: ENV, db: fakeDb });
    expect(db.updates).toHaveLength(0);
  });

  it('findOrCreateLead hält den Verlauf fest und löst den Abgleich aus (erneute Anfrage + Hochstufen) — Abgleich nicht abgewartet', () => {
    const quelle = readFileSync(join(__dirname, '..', '..', 'project 3', 'lib', 'lead-management.ts'), 'utf8');
    expect(quelle.match(/await anfrageVerlaufFesthalten\(latestLead, data\.kalkulation, data\.quelle\);\n\s+mamamiaImHintergrund\(latestLead, data\.kalkulation\);/g)).toHaveLength(2);
    expect(quelle).not.toMatch(/await\s+mamamiaImHintergrund/);
  });
});

describe('erneuteAnfrage (Verlauf für die SA-Historie)', () => {
  it('Kunde 11228: weitere Person dazu ⇒ Vorher/Nachher mit Preis und geänderter Angabe', () => {
    expect(erneuteAnfrage(ERSTE, ZWEITE, 'rechner')).toEqual({
      quelle: 'rechner',
      alt: { bruttopreis: 2600, eigenanteil: 1625, formularDaten: FD },
      neu: { bruttopreis: 2800, eigenanteil: 1825, formularDaten: { ...FD, weitere_personen: 'ja' } },
      geaendert: [{ key: 'weitere_personen', alt: 'nein', neu: 'ja' }],
      preis_geaendert: true,
    });
  });

  it('identische Anfrage ⇒ kein Eintrag; nur Preis oder nur Angabe ⇒ Eintrag', () => {
    expect(erneuteAnfrage(ERSTE, kalk(2600))).toBeNull();
    expect(erneuteAnfrage(kalk(2700), kalk(2800))).toMatchObject({ geaendert: [], preis_geaendert: true, quelle: null });
    expect(erneuteAnfrage(ERSTE, kalk(2600, { ...FD, erfahrung: 'erfahren' }))).toMatchObject({
      geaendert: [{ key: 'erfahrung', alt: null, neu: 'erfahren' }], preis_geaendert: false,
    });
  });

  it('ohne neue Kalkulation nichts; Alt-Lead ohne Kalkulation ⇒ alle Angaben neu', () => {
    expect(erneuteAnfrage(ERSTE, null)).toBeNull();
    const r = erneuteAnfrage(null, ZWEITE);
    expect(r?.alt).toEqual({ bruttopreis: null, eigenanteil: null, formularDaten: {} });
    expect(r?.geaendert.map((g) => g.key)).toEqual(['betreuung_fuer', 'pflegegrad', 'weitere_personen', 'mobilitaet', 'nachteinsaetze', 'deutschkenntnisse', 'fuehrerschein', 'geschlecht']);
    expect(r?.preis_geaendert).toBe(true);
  });
});
