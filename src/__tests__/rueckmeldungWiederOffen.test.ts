// @vitest-environment node
/**
 * Registry #170: Abmelden auf der Rückmeldeseite ist idempotent (zweiter Klick ändert nichts) — aber nur, solange der
 * Kunde danach nicht wieder aktiv wurde. Hat er nach dem Abmelden sein Profil selbst ausgefüllt (`kunde_wieder_aktiv`,
 * lead-event-Bridge), ist er wieder offen, und ein neues Abmelden muss wieder greifen: Status, Mails, Team-Mail.
 * Geprüft am echten Handler (`project 3/app/api/rueckmeldung/route.ts`) mit einer Supabase-Attrappe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn(async () => ({ success: true }));

const { nextServer } = vi.hoisted(() => ({
  nextServer: () => ({
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    },
  }),
}));
vi.mock('next/server', () => nextServer());
vi.mock('../../project 3/node_modules/next/server', () => nextServer());
vi.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => (sendEmail as unknown as (...x: unknown[]) => unknown)(...a) }));
vi.mock('@/lib/rueckmeldung', async () => import('../../project 3/lib/rueckmeldung'));
vi.mock('@/lib/memlog', () => ({ withMem: (_name: string, fn: unknown) => fn }));

type Zugriff = { tabelle: string; art: string; daten?: unknown; typ?: unknown };
let zugriffe: Zugriff[] = [];
let ereignis: Record<string, string | null>; // event_type → created_at des jüngsten

function kette(tabelle: string) {
  const z: Zugriff = { tabelle, art: 'select' };
  zugriffe.push(z);
  const ergebnis = () => {
    if (tabelle === 'leads' && z.art === 'select') {
      return { data: { id: 'lead-1', status: 'angebot_requested', vorname: 'A', nachname: 'B', email: 'k@example.com', telefon: '', source: '' }, error: null };
    }
    if (tabelle === 'lead_events' && z.art === 'select') {
      const t = ereignis[String(z.typ)];
      return { data: t ? [{ created_at: t, metadata: {} }] : [], error: null };
    }
    if (tabelle === 'scheduled_emails' && z.art === 'update') return { data: [{ id: 'm1' }, { id: 'm2' }], error: null };
    return { data: null, error: null };
  };
  const k: Record<string, unknown> = {};
  k.eq = (f: string, w: unknown) => { if (f === 'event_type') z.typ = w; return k; };
  for (const m of ['select', 'order', 'limit']) k[m] = () => k;
  for (const m of ['insert', 'update']) k[m] = (d?: unknown) => { z.art = m; z.daten = d; return k; };
  k.maybeSingle = async () => ergebnis();
  k.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) => Promise.resolve(ergebnis()).then(ok, nok);
  return k;
}
function supabaseAttrappe() {
  return { createClient: () => ({ from: (t: string) => kette(t) }) };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

import { POST } from '../../project 3/app/api/rueckmeldung/route';

const abmelden = async () =>
  (await (POST as unknown as (r: unknown) => Promise<{ body: unknown; status: number }>)({
    json: async () => ({ token: 'tok-12345678', aktion: 'stoppen', knopf: 'nicht_mehr_relevant' }),
  }));
const statusGesetzt = () => zugriffe.some((z) => z.tabelle === 'leads' && z.art === 'update');
const neueAbmeldung = () => zugriffe.some((z) => z.tabelle === 'lead_events' && z.art === 'insert');

beforeEach(() => {
  zugriffe = [];
  ereignis = {};
  sendEmail.mockClear();
});

describe('rueckmeldung stoppen nach Wieder-offen (Registry #170)', () => {
  it('schon abgemeldet, seitdem nicht wieder aktiv: zweiter Klick ändert nichts', async () => {
    ereignis = { kunde_kein_interesse: '2026-11-01T10:00:00Z' };
    const a = await abmelden();
    expect(a.status).toBe(200);
    expect(statusGesetzt()).toBe(false);
    expect(neueAbmeldung()).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('abgemeldet, danach Profil selbst ausgefüllt: neues Abmelden greift wieder', async () => {
    ereignis = { kunde_kein_interesse: '2026-11-01T10:00:00Z', kunde_wieder_aktiv: '2026-11-10T09:00:00Z' };
    await abmelden();
    const status = zugriffe.find((z) => z.tabelle === 'leads' && z.art === 'update');
    expect(status?.daten).toEqual({ status: 'nicht_interessiert' });
    expect(zugriffe.some((z) => z.tabelle === 'scheduled_emails' && z.art === 'update')).toBe(true);
    expect(neueAbmeldung()).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('Wieder-offen VOR der Abmeldung zählt nicht', async () => {
    ereignis = { kunde_wieder_aktiv: '2026-10-01T09:00:00Z', kunde_kein_interesse: '2026-11-01T10:00:00Z' };
    await abmelden();
    expect(statusGesetzt()).toBe(false);
  });
});
