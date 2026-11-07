// @vitest-environment node
/**
 * POST/OPTIONS /api/rueckmeldung (project 3/app/api/rueckmeldung/route.ts) — Registry #147: „Rückruf vereinbaren“ aus dem
 * Kundenportal. Geprüft am echten Handler mit einer Supabase-Attrappe; die Pakete des Kostenrechners installiert die
 * Test-Umgebung nicht, darum werden `next/server`, `@/lib/email` und `@/lib/memlog` ersetzt (Muster
 * leadEventAnreiseGet.test.ts). `@/lib/rueckmeldung` ist die echte Datei.
 *
 *  - Portal-Origin + { token, aktion: 'rueckruf', quelle: 'portal_einstieg' } ⇒ Team-Mail an info@ mit Portal-Text,
 *    Ereignis `rueckruf_erbeten_mail` mit quelle portal_einstieg, CORS-Origin-Echo
 *  - 24-h-Sperre (gemeinsam für beide Quellen), Mail-Fehler ⇒ 502 ohne Ereignis
 *  - unbekannter Token: Portal 404, Rückmeldeseite weiter {ok:true}
 *  - aus dem Portal nur Rückruf (403 ohne DB-Zugriff), unbekannte Quelle 400
 *  - ohne `quelle` (Rückmeldeseite) alles wie bisher
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextServer } = vi.hoisted(() => ({
  nextServer: () => {
    class NextResponse {
      body: unknown;
      status: number;
      headers: Record<string, string>;
      constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.headers = init?.headers ?? {};
      }
      static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
        return new NextResponse(body, init);
      }
    }
    return { NextResponse };
  },
}));
vi.mock('next/server', () => nextServer());
vi.mock('../../project 3/node_modules/next/server', () => nextServer());

const sendEmail = vi.fn();
vi.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/memlog', () => ({ withMem: (_name: string, fn: unknown) => fn }));
vi.mock('@/lib/rueckmeldung', async () => import('../../project 3/lib/rueckmeldung'));

// ── Supabase-Attrappe ────────────────────────────────────────────────────────────────────────────────────────────────
type Ereignis = { created_at: string; metadata: Record<string, unknown> };
const db = {
  lead: null as Record<string, unknown> | null,
  letzte: [] as Ereignis[],
  eingefuegt: [] as { tabelle: string; zeile: Record<string, unknown> }[],
  aufrufe: 0,
};
function kette(tabelle: string) {
  db.aufrufe += 1;
  const k: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'update']) k[m] = () => k;
  k.maybeSingle = async () => ({ data: tabelle === 'leads' ? db.lead : null, error: null });
  k.insert = async (zeile: Record<string, unknown>) => { db.eingefuegt.push({ tabelle, zeile }); return { error: null }; };
  k.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) =>
    Promise.resolve({ data: tabelle === 'lead_events' ? db.letzte : [], error: null }).then(ok, nok);
  return k;
}
function supabaseAttrappe() {
  return { createClient: () => ({ from: (t: string) => kette(t) }) };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

import { OPTIONS, POST } from '../../project 3/app/api/rueckmeldung/route';

type Antwort = { body: Record<string, unknown> | null; status: number; headers: Record<string, string> };
const PORTAL = 'https://kundenportal.primundus.de';
const TOKEN = 'token-portal-12345';
const anfrage = (body: unknown, origin: string | null = PORTAL) => ({
  headers: new Headers(origin ? { origin } : {}),
  json: async () => body,
});
const senden = async (body: unknown, origin: string | null = PORTAL) =>
  (await (POST as unknown as (r: unknown) => Promise<Antwort>)(anfrage(body, origin)));
const portalBitte = { token: TOKEN, aktion: 'rueckruf', quelle: 'portal_einstieg' };

beforeEach(() => {
  db.lead = { id: 'lead-1', status: 'angebot_requested', vorname: 'Erika', nachname: 'Muster', email: 'erika@example.de', telefon: '0170 1234567', source: 'rechner' };
  db.letzte = [];
  db.eingefuegt = [];
  db.aufrufe = 0;
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ success: true });
});

describe('POST /api/rueckmeldung aus dem Kundenportal (Registry #147)', () => {
  it('Portal-Rückruf: 200, CORS-Echo, Team-Mail „Kundenportal“ an info@, Ereignis mit quelle portal_einstieg', async () => {
    const r = await senden(portalBitte);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(r.headers['Access-Control-Allow-Origin']).toBe(PORTAL);
    expect(r.headers.Vary).toBe('Origin');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [an, mail, , opts] = sendEmail.mock.calls[0] as [string, { subject: string; text: string }, unknown, { skipBcc?: boolean }];
    expect(an).toBe('info@primundus.de');
    expect(opts).toEqual({ skipBcc: true });
    expect(mail.subject).toBe('📞 Rückruf erbeten (Kundenportal): Erika Muster');
    expect(mail.text).toContain('„Rückruf vereinbaren“ im Kundenportal');
    expect(mail.text).toContain('„Danke, Marta ruft Sie an.“');
    expect(mail.text).not.toContain('Nachfass-Mail');
    expect(db.eingefuegt).toEqual([{ tabelle: 'lead_events', zeile: { lead_id: 'lead-1', event_type: 'rueckruf_erbeten_mail', metadata: { knopf: null, quelle: 'portal_einstieg' } } }]);
  });

  it('Ereignis jünger als 24 h (auch aus der Abschiedsmail): 200 ohne Mail und ohne Eintrag', async () => {
    db.letzte = [{ created_at: new Date(Date.now() - 2 * 3600_000).toISOString(), metadata: { quelle: 'nachfass_3' } }];
    const r = await senden(portalBitte);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.eingefuegt).toEqual([]);
  });

  it('Ereignis älter als 24 h: neue Mail', async () => {
    db.letzte = [{ created_at: new Date(Date.now() - 25 * 3600_000).toISOString(), metadata: {} }];
    expect((await senden(portalBitte)).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('Team-Mail schlägt fehl: 502 und kein Ereignis (Wiederholen ist sicher)', async () => {
    sendEmail.mockResolvedValue({ success: false, error: 'smtp' });
    const r = await senden(portalBitte);
    expect(r.status).toBe(502);
    expect(r.headers['Access-Control-Allow-Origin']).toBe(PORTAL);
    expect(db.eingefuegt).toEqual([]);
  });

  it('unbekannter Token: Portal 404 (keine Schein-Bestätigung), Rückmeldeseite weiter {ok:true}', async () => {
    db.lead = null;
    const portal = await senden(portalBitte);
    expect(portal.status).toBe(404);
    expect(portal.headers['Access-Control-Allow-Origin']).toBe(PORTAL);
    const seite = await senden({ token: TOKEN, aktion: 'rueckruf', knopf: 'interesse' }, 'https://kostenrechner.primundus.de');
    expect(seite.status).toBe(200);
    expect(seite.body).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('aus dem Portal nur Rückruf: stoppen/pausieren/grund ⇒ 403 ohne DB-Zugriff; portal_einstieg mit anderer Aktion ⇒ 403', async () => {
    for (const aktion of ['stoppen', 'pausieren', 'grund']) {
      const r = await senden({ token: TOKEN, aktion, quelle: 'portal_einstieg', wann: '1m', anlass: 'zu-teuer' });
      expect(r.status).toBe(403);
      const ohneQuelle = await senden({ token: TOKEN, aktion, wann: '1m', anlass: 'zu-teuer' });
      expect(ohneQuelle.status).toBe(403);
    }
    expect((await senden({ token: TOKEN, aktion: 'stoppen', quelle: 'portal_einstieg' }, 'https://kostenrechner.primundus.de')).status).toBe(403);
    expect(db.aufrufe).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('unbekannte Quelle ⇒ 400; fehlender Token ⇒ 400', async () => {
    expect((await senden({ ...portalBitte, quelle: 'xyz' })).status).toBe(400);
    expect((await senden({ ...portalBitte, quelle: 'PORTAL_EINSTIEG' })).status).toBe(400);
    expect((await senden({ ...portalBitte, token: 'kurz' })).status).toBe(400);
    expect(db.aufrufe).toBe(0);
  });

  it('Rückmeldeseite ohne quelle: Ereignis mit quelle nachfass_3 und Mailtext wie bisher', async () => {
    const r = await senden({ token: TOKEN, aktion: 'rueckruf', knopf: 'interesse' }, 'https://kostenrechner.primundus.de');
    expect(r.status).toBe(200);
    expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined();
    const mail = sendEmail.mock.calls[0][1] as { subject: string; text: string };
    expect(mail.subject).toBe('📞 Rückruf erbeten: Erika Muster');
    expect(mail.text).toContain('in der letzten Nachfass-Mail');
    expect(db.eingefuegt[0].zeile).toEqual({ lead_id: 'lead-1', event_type: 'rueckruf_erbeten_mail', metadata: { knopf: 'interesse', quelle: 'nachfass_3' } });
  });
});

describe('OPTIONS /api/rueckmeldung (Preflight des Portals)', () => {
  const preflight = async (origin: string) =>
    (await (OPTIONS as unknown as (r: unknown) => Promise<Antwort>)({ headers: new Headers({ origin }) }));
  it('Portal-Origin ⇒ 204 mit Origin-Echo; fremder Origin ⇒ 204 ohne', async () => {
    const ja = await preflight('https://caapp-staging.onrender.com');
    expect(ja.status).toBe(204);
    expect(ja.headers['Access-Control-Allow-Origin']).toBe('https://caapp-staging.onrender.com');
    expect(ja.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    const nein = await preflight('https://evil.test');
    expect(nein.status).toBe(204);
    expect(nein.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
