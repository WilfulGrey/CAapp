// @vitest-environment node
/**
 * GET /api/contract-pdf/[leadId]?token=…&application_id=… (Registry #138): die Gebucht-Seite verlinkt je Einsatz genau
 * den Vertrag dieser Bewerbung. Gehört die Bewerbung nicht zum Lead, gibt es 404 — nie den Vertrag eines anderen
 * Einsatzes. Ohne Parameter bleibt es bei der neuesten Zeile. Geprüft am echten Handler mit Supabase-Attrappe, die
 * jede Filterkette mitschreibt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextServer } = vi.hoisted(() => ({
  nextServer: () => {
    class NextResponse {
      body: unknown; status: number; headers: Record<string, string>;
      constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
        this.body = body; this.status = init?.status ?? 200; this.headers = init?.headers ?? {};
      }
      static json(body: unknown, init?: { status?: number }) { return { body, status: init?.status ?? 200 }; }
    }
    return { NextResponse };
  },
}));
vi.mock('next/server', () => nextServer());
vi.mock('../../project 3/node_modules/next/server', () => nextServer());
vi.mock('@/lib/memlog', () => ({ withMem: (_name: string, fn: unknown) => fn }));
vi.mock('../../project 3/lib/vertrag', () => ({
  buildVertragAttachmentPdf: vi.fn(async () => ({ contentType: 'application/pdf', content: Buffer.from('%PDF-1.4 x'), filename: 'v.pdf' })),
  formatSignedAtBerlin: vi.fn(() => '12.10.2026, 10:00'),
}));

const LEAD_ID = '11111111-2222-3333-4444-555555555555';
const ZEILEN = [
  { application_id: 14728, contract_snapshot: { datum: '12.10.2026' }, signatur: 'A B', signed_at: '2026-10-12T08:00:00Z' },
  { application_id: 14746, contract_snapshot: { datum: '15.10.2026' }, signatur: 'A B', signed_at: '2026-10-15T08:00:00Z' },
];
let filter: [string, unknown][] = [];

function kette(tabelle: string) {
  let eigeneFilter: [string, unknown][] = [];
  const k: Record<string, unknown> = {};
  k.select = () => k;
  k.eq = (spalte: string, wert: unknown) => { eigeneFilter.push([spalte, wert]); if (tabelle !== 'leads') filter.push([spalte, wert]); return k; };
  k.order = () => k;
  k.limit = () => k;
  k.maybeSingle = async () => {
    if (tabelle === 'leads') return { data: { id: LEAD_ID }, error: null };
    const app = eigeneFilter.find(([s]) => s === 'application_id')?.[1];
    const zeile = app === undefined ? ZEILEN[1] : ZEILEN.find((z) => z.application_id === app) ?? null;
    eigeneFilter = [];
    return { data: zeile, error: null };
  };
  return k;
}
function supabaseAttrappe() {
  return {
    createClient: () => ({
      from: (t: string) => kette(t),
      storage: { from: () => ({ download: async () => ({ data: null }) }) },
    }),
  };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

import { GET } from '../../project 3/app/api/contract-pdf/[leadId]/route';

type Antwort = { status: number; body: unknown };
const abrufen = async (suche: string) =>
  (await (GET as unknown as (r: unknown, c: unknown) => Promise<Antwort>)(
    { nextUrl: new URL(`https://kostenrechner.test/api/contract-pdf/${LEAD_ID}?${suche}`), headers: new Headers() },
    { params: { leadId: LEAD_ID } },
  ));

beforeEach(() => { filter = []; });

describe('contract-pdf mit application_id (Registry #138)', () => {
  it('Bewerbung des Leads ⇒ PDF genau dieser Zeile (Filter auf lead_id UND application_id)', async () => {
    const a = await abrufen('token=tok&application_id=14728');
    expect(a.status).toBe(200);
    expect(filter).toEqual([['lead_id', LEAD_ID], ['application_id', 14728]]);
  });
  it('fremde Bewerbung ⇒ 404, nie ein anderer Vertrag', async () => {
    const a = await abrufen('token=tok&application_id=99999');
    expect(a.status).toBe(404);
  });
  it('kaputter Parameter ⇒ 400', async () => {
    expect((await abrufen('token=tok&application_id=fc-12')).status).toBe(400);
    expect((await abrufen('token=tok&application_id=')).status).toBe(400);
  });
  it('ohne Parameter wie bisher (nur lead_id)', async () => {
    const a = await abrufen('token=tok');
    expect(a.status).toBe(200);
    expect(filter).toEqual([['lead_id', LEAD_ID]]);
  });
});
