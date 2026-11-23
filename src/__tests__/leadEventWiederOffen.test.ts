// @vitest-environment node
/**
 * Registry #170: Ein geschlossener Lead (`nicht_interessiert`), der seinen Patientenbogen selbst speichert, ist wieder
 * offen. Martin 23.11.2026: „… ist er nicht mehr unter den offenen Kunden … und wir finden den nicht. Durch Zufall nur,
 * wenn wir die E-Mail sehen." Geprüft am echten Handler (`project 3/app/api/lead-event/route.ts`) mit einer
 * Supabase-Attrappe (Muster leadEventMesspunkte.test.ts); Rückkehr-Status pure in `project 3/lib/wieder-oeffnen.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn(async () => ({ ok: true }));
const teamVorlage = vi.fn((lead: { status?: string }) => ({ subject: `team ${lead.status}`, html: 'h', text: 't' }));
const mailD = vi.fn(() => ({ subject: 'd', html: 'h', text: 't' }));

const { nextServer } = vi.hoisted(() => ({
  nextServer: () => ({
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    },
  }),
}));
vi.mock('next/server', () => nextServer());
vi.mock('../../project 3/node_modules/next/server', () => nextServer());
vi.mock('@/lib/email', () => ({
  sendEmail: (...a: unknown[]) => (sendEmail as unknown as (...x: unknown[]) => unknown)(...a),
  getTeamNotificationTemplate: (lead: { status?: string }) => teamVorlage({ ...lead }),
  buildCustomerCaregiverMailWithInlinePhoto: vi.fn(),
  getPatientDataSavedEmailTemplate: () => mailD(),
  getOfferUpdatedEmailTemplate: vi.fn(),
}));
vi.mock('@/lib/vertrag', () => ({ buildVertragAttachmentPdf: vi.fn(), formatSignedAtBerlin: vi.fn() }));
vi.mock('@/lib/portal-url', () => ({ appendJobParam: vi.fn((u: string) => u), PORTAL_BASIS: 'https://kundenportal.test' }));
vi.mock('@/lib/quiet-hours', () => ({ sendezeitIso: vi.fn(() => '2026-11-25T08:00:00Z') }));
vi.mock('@/lib/erinnerungsplan', () => ({ erinnerungsplan: vi.fn(() => []), reservierungsEnde: vi.fn() }));
vi.mock('@/lib/portal-schutz', () => ({ testphaseUmleitung: vi.fn() }));
vi.mock('@/lib/empfaenger', () => ({ kundenEmpfaenger: vi.fn(() => ({})) }));
vi.mock('@/lib/bewertungen-stand', () => ({ holeBewertungsStand: vi.fn(async () => ({ schnitt: '4,9', anzahl: 126 })) }));
vi.mock('@/lib/memlog', () => ({ withMem: (_name: string, fn: unknown) => fn }));
vi.mock('@/lib/messpunkte', async () => import('../../project 3/lib/messpunkte'));
vi.mock('@/lib/oeffentliche-ereignisse', async () => import('../../project 3/lib/oeffentliche-ereignisse'));
vi.mock('@/lib/wieder-oeffnen', async () => import('../../project 3/lib/wieder-oeffnen'));

// ── Supabase-Attrappe ──────────────────────────────────────────────────────
type Zugriff = { tabelle: string; art: string; daten?: unknown; filter: Array<[string, string, unknown]> };
let zugriffe: Zugriff[] = [];
let lead: Record<string, unknown>;
let abschluss: Array<{ event_type: string; metadata: Record<string, unknown> }>;
let schonGespeichert: boolean;   // gab es patient_data_saved schon (Dedupe)?
let jemandSchneller: boolean;    // Status-Update trifft keine Zeile mehr

function kette(tabelle: string) {
  const z: Zugriff = { tabelle, art: 'select', filter: [] };
  zugriffe.push(z);
  const ergebnis = () => {
    if (tabelle === 'leads' && z.art === 'select') return { data: lead, error: null };
    if (tabelle === 'leads' && z.art === 'update') return { data: jemandSchneller ? [] : [{ id: lead.id }], error: null };
    if (tabelle === 'lead_events' && z.art === 'select') {
      if (z.filter.some(([m]) => m === 'in')) return { data: abschluss, error: null };
      const typ = z.filter.find(([m, f]) => m === 'eq' && f === 'event_type')?.[2];
      if (typ === 'patient_data_saved' && schonGespeichert) return { data: [{ id: 'e0' }], error: null };
      return { data: [], error: null };
    }
    return { data: z.art === 'select' ? [] : null, error: null };
  };
  const k: Record<string, unknown> = {};
  for (const m of ['eq', 'in', 'neq', 'is', 'gte', 'lt', 'filter', 'not']) {
    k[m] = (f: string, w: unknown) => { z.filter.push([m, f, w]); return k; };
  }
  for (const m of ['select', 'order', 'limit', 'match']) k[m] = () => k;
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    k[m] = (d?: unknown) => { z.art = m; z.daten = d; return k; };
  }
  k.maybeSingle = async () => ergebnis();
  k.single = async () => ergebnis();
  k.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) => Promise.resolve(ergebnis()).then(ok, nok);
  return k;
}
function supabaseAttrappe() {
  return { createClient: () => ({ from: (t: string) => kette(t) }) };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

import { POST } from '../../project 3/app/api/lead-event/route';
import { statusNachWiederOeffnen } from '../../project 3/lib/wieder-oeffnen';

type Antwort = { body: unknown; status: number };
const senden = async (body: Record<string, unknown>) => {
  const a = await (POST as unknown as (r: unknown) => Promise<Antwort>)({ json: async () => body, headers: new Headers() });
  await new Promise((r) => setTimeout(r, 20)); // Fire-and-forget-Mails
  return a;
};
const statusUpdates = () => zugriffe.filter((z) => z.tabelle === 'leads' && z.art === 'update');
const ereignisse = () => zugriffe
  .filter((z) => z.tabelle === 'lead_events' && z.art === 'insert')
  .map((z) => z.daten as { event_type: string; metadata: Record<string, unknown> });

beforeEach(() => {
  zugriffe = [];
  lead = { id: 'lead-1', token: 'tok-1', email: 'kunde@example.com', telefon: '0170', vorname: 'A', nachname: 'B', status: 'nicht_interessiert' };
  abschluss = [];
  schonGespeichert = false;
  jemandSchneller = false;
  sendEmail.mockClear();
  teamVorlage.mockClear();
  mailD.mockClear();
});

describe('lead-event: geschlossener Lead speichert den Patientenbogen (Registry #170)', () => {
  it('erstes Speichern: Lead wieder offen, Ereignis im Verlauf, Team-Mail mit neuem Status, Mail D', async () => {
    const a = await senden({ token: 'tok-1', event: 'patient_data_saved' });
    expect(a.status).toBe(200);

    expect(statusUpdates()).toHaveLength(1);
    const u = statusUpdates()[0];
    expect(u.daten).toEqual({ status: 'angebot_requested' });
    // nur solange er noch geschlossen ist
    expect(u.filter).toContainEqual(['eq', 'status', 'nicht_interessiert']);

    const wieder = ereignisse().find((e) => e.event_type === 'kunde_wieder_aktiv');
    expect(wieder?.metadata).toMatchObject({ ausloeser: 'patient_data_saved', status_vorher: 'nicht_interessiert', status_neu: 'angebot_requested' });
    expect(ereignisse().some((e) => e.event_type === 'patient_data_saved')).toBe(true);

    expect(teamVorlage).toHaveBeenCalledTimes(1);
    expect(teamVorlage.mock.calls[0][0].status).toBe('angebot_requested');
    expect(mailD).toHaveBeenCalledTimes(1);
  });

  it('erneutes Speichern (Profil stand schon): wieder offen und Team-Mail trotz Dedupe, keine zweite Mail D', async () => {
    schonGespeichert = true;
    await senden({ token: 'tok-1', event: 'patient_data_saved' });
    expect(statusUpdates()).toHaveLength(1);
    expect(teamVorlage).toHaveBeenCalledTimes(1);
    expect(mailD).not.toHaveBeenCalled();
  });

  it('im SA-Portal geschlossen: der Status von davor kommt zurück', async () => {
    abschluss = [{ event_type: 'sa_kunde_geschlossen', metadata: { status_vorher: 'vertrag_abgeschlossen', status_gesetzt: true } }];
    await senden({ token: 'tok-1', event: 'patient_data_saved' });
    expect(statusUpdates()[0].daten).toEqual({ status: 'vertrag_abgeschlossen' });
  });

  it('offener Lead: kein Status-Update, kein Wieder-offen-Ereignis', async () => {
    lead.status = 'angebot_requested';
    await senden({ token: 'tok-1', event: 'patient_data_saved' });
    expect(statusUpdates()).toHaveLength(0);
    expect(ereignisse().some((e) => e.event_type === 'kunde_wieder_aktiv')).toBe(false);
  });

  it('zweites Speichern gleichzeitig: wer zu spät kommt, schreibt kein zweites Ereignis und keine Extra-Team-Mail', async () => {
    jemandSchneller = true;
    schonGespeichert = true;
    await senden({ token: 'tok-1', event: 'patient_data_saved' });
    expect(ereignisse().some((e) => e.event_type === 'kunde_wieder_aktiv')).toBe(false);
    expect(teamVorlage).not.toHaveBeenCalled();
  });

  it('stiller Lauf (notify:false) und andere Ereignisse öffnen nicht', async () => {
    await senden({ token: 'tok-1', event: 'patient_data_saved', notify: false });
    await senden({ token: 'tok-1', event: 'portal_opened' });
    expect(statusUpdates()).toHaveLength(0);
  });
});

describe('statusNachWiederOeffnen', () => {
  it('ohne SA-Schließen: angebot_requested (wie „Lead reaktivieren")', () => {
    expect(statusNachWiederOeffnen(null)).toBe('angebot_requested');
    expect(statusNachWiederOeffnen({ event_type: 'kunde_kein_interesse', metadata: {} })).toBe('angebot_requested');
    expect(statusNachWiederOeffnen({ event_type: 'kunde_wieder_aktiv', metadata: { status_neu: 'folge_einsatz' } })).toBe('angebot_requested');
  });
  it('SA-Schließen: status_vorher nur, wenn das Schließen ihn gesetzt hat und er bekannt ist', () => {
    expect(statusNachWiederOeffnen({ event_type: 'sa_kunde_geschlossen', metadata: { status_vorher: 'folge_einsatz', status_gesetzt: 'true' } })).toBe('folge_einsatz');
    expect(statusNachWiederOeffnen({ event_type: 'sa_kunde_geschlossen', metadata: { status_vorher: 'folge_einsatz', status_gesetzt: false } })).toBe('angebot_requested');
    expect(statusNachWiederOeffnen({ event_type: 'sa_kunde_geschlossen', metadata: { status_vorher: 'nicht_interessiert', status_gesetzt: true } })).toBe('angebot_requested');
    expect(statusNachWiederOeffnen({ event_type: 'sa_kunde_geschlossen', metadata: { status_vorher: 'erfunden', status_gesetzt: true } })).toBe('angebot_requested');
  });
});
