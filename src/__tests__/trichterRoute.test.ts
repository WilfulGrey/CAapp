// @vitest-environment node
/**
 * GET /api/admin/trichter (Registry #142): ohne Admin-Cookie 401, CSV als Datei mit Semikolon
 * und BOM, ohne Kontaktdaten; fehlt ads_kosten_kampagne_tag, kommt ein Hinweis statt eines
 * Fehlers. Am echten Handler mit einer Supabase-Attrappe (Muster leadEventAnreiseGet.test.ts):
 * die Pakete des Kostenrechners installiert die Test-Umgebung nicht.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextServer } = vi.hoisted(() => ({
  nextServer: () => ({
    NextResponse: {
      json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
        ({ body, status: init?.status ?? 200, headers: new Headers(init?.headers) }),
    },
  }),
}));
vi.mock('next/server', () => nextServer());
vi.mock('../../project 3/node_modules/next/server', () => nextServer());
vi.mock('@/lib/trichter', async () => import('../../project 3/lib/trichter'));
vi.mock('@/lib/wachstum', async () => import('../../project 3/lib/wachstum'));

const LEAD = {
  id: '11111111-2222-4333-8444-555555555555',
  created_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
  source: 'rechner', utm_source: 'google', utm_medium: 'cpc', utm_campaign: '23745538003', utm_content: '123', utm_term: 'pflege',
  gclid: 'GEHEIMER-KLICK', gbraid: null, wbraid: null, ist_test: false,
  email: 'erika@web.de', telefon: '01711234567', vorname: 'Erika', nachname: 'Muster',
};
let fehlendeTabelle = true;
const abgefragt: string[] = [];

function kette(tabelle: string) {
  const k: Record<string, unknown> = {};
  for (const m of ['select', 'lt', 'gte', 'lte', 'in', 'order', 'eq']) k[m] = () => k;
  k.range = async (a: number, b: number) => {
    abgefragt.push(tabelle);
    if (tabelle === 'ads_kosten_kampagne_tag' && fehlendeTabelle) {
      return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.ads_kosten_kampagne_tag' in the schema cache" } };
    }
    const daten: Record<string, unknown[]> = {
      leads: [LEAD],
      lead_events: [{ lead_id: LEAD.id, event_type: 'patient_data_saved', created_at: LEAD.created_at }],
      lead_application_acceptances: [],
      ads_kosten_kampagne_tag: [],
      ads_kosten_tag: [],
    };
    return { data: (daten[tabelle] ?? []).slice(a, b + 1), error: null };
  };
  return k;
}
function supabaseAttrappe() {
  return { createClient: () => ({ from: (t: string) => kette(t) }) };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

import { GET } from '../../project 3/app/api/admin/trichter/route';

type Antwort = { body?: Record<string, unknown>; status: number; headers: Headers; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };
const abrufen = async (suche: string, cookie?: string) =>
  (await (GET as unknown as (r: unknown) => Promise<Antwort>)({
    nextUrl: new URL(`https://kostenrechner.test/api/admin/trichter?${suche}`),
    cookies: { get: (n: string) => (n === 'admin_auth' && cookie ? { value: cookie } : undefined) },
  }));

beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'pw-test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  fehlendeTabelle = true;
  abgefragt.length = 0;
});

describe('/api/admin/trichter', () => {
  it('ohne Admin-Cookie 401 und keine Abfrage', async () => {
    const a = await abrufen('');
    expect(a.status).toBe(401);
    expect(abgefragt).toEqual([]);
    expect((await abrufen('', 'falsch')).status).toBe(401);
  });

  it('ohne ADMIN_PASSWORD kein Zugang, auch nicht mit dem früheren Ersatzpasswort', async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await abrufen('', 'primundus2026')).status).toBe(401);
    expect((await abrufen('', '')).status).toBe(401);
    expect(abgefragt).toEqual([]);
  });

  it('JSON: fehlende Kampagnen-Tabelle ⇒ Hinweis, High Intent ohne Kosten, kein Fehler, keine Kontaktdaten', async () => {
    const a = await abrufen('', 'pw-test');
    expect(a.status).toBe(200);
    const body = a.body as { kostenJeKampagne: boolean; hinweise: string[]; kanaele: { kanal: string; kosten: number | null; profilSelbst: number }[] };
    expect(body.kostenJeKampagne).toBe(false);
    expect(body.hinweise.join(' ')).toContain('ads_kosten_kampagne_tag fehlt');
    expect(body.kanaele[0]).toMatchObject({ kanal: 'High Intent', kosten: null, profilSelbst: 1 });
    const roh = JSON.stringify(a.body);
    for (const v of [LEAD.id, 'GEHEIMER', 'erika', 'Muster', '1234567']) expect(roh, v).not.toContain(v);
  });

  it('CSV Anfragen: Datei, text/csv, BOM, Semikolon, Pseudonym statt Lead-ID', async () => {
    fehlendeTabelle = false;
    const a = await abrufen('format=csv&teil=anfragen', 'pw-test');
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(a.headers.get('content-disposition')).toMatch(/^attachment; filename="trichter-anfragen-\d{4}-\d{2}-\d{2}-bis-\d{4}-\d{2}-\d{2}\.csv"$/);
    const bytes = new Uint8Array(await a.arrayBuffer!());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM für Excel (text() verschluckt es beim Lesen)
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('anfrage_id;anfrage_zeit;anfrage_tag;kanal');
    expect(text).toMatch(/\r\nA-[0-9a-f]{12};/);
    for (const v of [LEAD.id, 'GEHEIMER', 'erika', 'Muster', '1234567']) expect(text, v).not.toContain(v);
  });

  it('CSV Tage und unbekannter Teil', async () => {
    const t = await abrufen('format=csv&teil=tage', 'pw-test');
    expect(t.headers.get('content-disposition')).toContain('trichter-tage-');
    expect((await t.text!()).split('\r\n')[0]).toContain('anfrage_tag;kanal;anfragen');
    expect((await abrufen('format=csv&teil=leads', 'pw-test')).status).toBe(400);
    expect((await abrufen('von=2026-13-01', 'pw-test')).status).toBe(400);
  });
});
