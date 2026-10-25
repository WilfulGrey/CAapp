// @vitest-environment node
/**
 * GET /api/lead-event gibt Anreise-Ereignisse an das Portal (Gebucht-Seite, Registry #139) — aber NUR die Felder der
 * Anreise-Mail. Die Notiz der Agentur (`hinweis`), Foto-URL, Name, `confirmation_id` und `arrival_key` gehen nie an den
 * Browser. Geprüft am echten Handler (`project 3/app/api/lead-event/route.ts`) mit einer Supabase-Attrappe; die Pakete
 * des Kostenrechners installiert die Test-Umgebung nicht — darum werden `next/server` und die `@/lib`-Module ersetzt
 * (Muster leadEventMesspunkte.test.ts).
 */
import { describe, expect, it, vi } from 'vitest';

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
  sendEmail: vi.fn(),
  getTeamNotificationTemplate: vi.fn(),
  buildCustomerCaregiverMailWithInlinePhoto: vi.fn(),
  getPatientDataSavedEmailTemplate: vi.fn(),
  getOfferUpdatedEmailTemplate: vi.fn(),
}));
vi.mock('@/lib/vertrag', () => ({ buildVertragAttachmentPdf: vi.fn(), formatSignedAtBerlin: vi.fn() }));
vi.mock('@/lib/portal-url', () => ({ appendJobParam: vi.fn((u: string) => u), PORTAL_BASIS: 'https://kundenportal.test' }));
vi.mock('@/lib/quiet-hours', () => ({ sendezeitIso: vi.fn() }));
vi.mock('@/lib/erinnerungsplan', () => ({ erinnerungsplan: vi.fn(() => []), reservierungsEnde: vi.fn() }));
vi.mock('@/lib/portal-schutz', () => ({ testphaseUmleitung: vi.fn() }));
vi.mock('@/lib/empfaenger', () => ({ kundenEmpfaenger: vi.fn() }));
vi.mock('@/lib/bewertungen-stand', () => ({ holeBewertungsStand: vi.fn() }));
vi.mock('@/lib/memlog', () => ({ withMem: (_name: string, fn: unknown) => fn }));
vi.mock('@/lib/messpunkte', async () => import('../../project 3/lib/messpunkte'));
vi.mock('@/lib/oeffentliche-ereignisse', async () => import('../../project 3/lib/oeffentliche-ereignisse'));

const ANREISE_VOLL = {
  source: 'detect',
  mamamia_job_offer_id: 38118,
  confirmation_id: 4711,
  arrival_key: '38118|4711|2026-10-19|14:00|16:00|1',
  anreise_datum: '2026-10-19',
  anreise_von: '14:00',
  anreise_bis: '16:00',
  verkehrsmittel: 'Minibus',
  hinweis: 'Osobus +48 600 000 000, Fahrer ruft an',
  einsatzort_strasse: 'Musterstraße 1',
  einsatzort_plz_ort: '12345 Musterstadt',
  caregiver_name: 'Maria Kowalska',
  caregiver_photo_url: 'https://example.test/foto.jpg',
};
const EREIGNISSE = [
  { id: 'e1', event_type: 'caregiver_arrival_scheduled', metadata: ANREISE_VOLL, created_at: '2026-10-15T08:00:00Z' },
  { id: 'e2', event_type: 'application_received', metadata: { caregiver_id: 15184, application_id: 14746 }, created_at: '2026-10-14T08:00:00Z' },
];
let angefragteTypen: unknown = null;

function kette(tabelle: string) {
  const k: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'filter', 'order', 'limit']) k[m] = () => k;
  k.in = (_s: string, typen: unknown) => { angefragteTypen = typen; return k; };
  k.maybeSingle = async () => ({ data: tabelle === 'leads' ? { id: 'lead-1' } : null, error: null });
  k.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) =>
    Promise.resolve({ data: tabelle === 'lead_events' ? EREIGNISSE : [], error: null }).then(ok, nok);
  return k;
}
function supabaseAttrappe() {
  return { createClient: () => ({ from: (t: string) => kette(t) }) };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

import { GET } from '../../project 3/app/api/lead-event/route';
import { ANREISE_OEFFENTLICH, oeffentlicheMetadata } from '../../project 3/lib/oeffentliche-ereignisse';

type Antwort = { body: { events?: { event_type: string; metadata: Record<string, unknown> }[] }; status: number };
const abrufen = async (suche: string) =>
  (await (GET as unknown as (r: unknown) => Promise<Antwort>)({
    nextUrl: new URL(`https://kostenrechner.test/api/lead-event?${suche}`),
    headers: new Headers(),
  }));

describe('lead-event GET: Anreise-Ereignisse nur mit den Feldern der Anreise-Mail (Registry #139)', () => {
  it('caregiver_arrival_scheduled ist abrufbar; Notiz, Foto, Name, Schlüssel bleiben auf dem Server', async () => {
    const antwort = await abrufen('token=tok-1&types=caregiver_arrival_scheduled');
    expect(antwort.status).toBe(200);
    expect(angefragteTypen).toEqual(['caregiver_arrival_scheduled']);
    const anreise = antwort.body.events!.find((e) => e.event_type === 'caregiver_arrival_scheduled')!;
    expect(anreise.metadata).toEqual({
      mamamia_job_offer_id: 38118,
      anreise_datum: '2026-10-19',
      anreise_von: '14:00',
      anreise_bis: '16:00',
      verkehrsmittel: 'Minibus',
      einsatzort_strasse: 'Musterstraße 1',
      einsatzort_plz_ort: '12345 Musterstadt',
    });
    const roh = JSON.stringify(antwort.body);
    for (const verboten of ['hinweis', 'Osobus', '+48', 'caregiver_photo_url', 'caregiver_name', 'arrival_key', 'confirmation_id', 'source']) {
      expect(roh, verboten).not.toContain(verboten);
    }
  });

  it('andere Typen bleiben unverändert (Portal liest dort application_id, caregiver_id …)', async () => {
    const antwort = await abrufen('token=tok-1');
    const eingang = antwort.body.events!.find((e) => e.event_type === 'application_received')!;
    expect(eingang.metadata).toEqual({ caregiver_id: 15184, application_id: 14746 });
  });

  it('oeffentlicheMetadata: nur die Liste, nichts ergänzt, kaputte Metadaten ⇒ leeres Objekt', () => {
    expect(ANREISE_OEFFENTLICH).not.toContain('hinweis');
    expect(oeffentlicheMetadata('caregiver_arrival_scheduled', { anreise_datum: '2026-10-19', hinweis: 'x', test: true }))
      .toEqual({ anreise_datum: '2026-10-19', test: true });
    expect(oeffentlicheMetadata('caregiver_arrival_scheduled', null)).toEqual({});
    expect(oeffentlicheMetadata('caregiver_arrival_scheduled', 'text')).toEqual({});
    const andere = { hinweis: 'bleibt', a: 1 };
    expect(oeffentlicheMetadata('caregiver_invited', andere)).toBe(andere);
  });
});
