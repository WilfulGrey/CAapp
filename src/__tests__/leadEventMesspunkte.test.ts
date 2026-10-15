// @vitest-environment node
/**
 * Bridge /api/lead-event mit den unsichtbaren Messpunkten des Portals (Registry #123).
 *
 * Martin 14.10.2026: Die Messpunkte dürfen KEINE Team-Mail, keine Kundenmail, keinen Reminder, keine Offline-Conversion
 * und keinen Status-Wechsel auslösen. Geprüft wird der echte Handler (`project 3/app/api/lead-event/route.ts`) mit einer
 * Supabase-Attrappe, die jeden Zugriff mitschreibt: Für einen Messpunkt darf es genau zwei geben — den Lead lesen und EINE
 * Zeile in lead_events schreiben. Mails laufen über `sendEmail` (lib/email) — der Mock darf nie gerufen werden.
 * Offline-Conversions lädt eine Edge Function nur für patient_data_saved bzw. die Buchung hoch (keine Zeile dafür hier).
 *
 * Die Pakete des Kostenrechners installiert die Test-Umgebung nicht (vitest.config.ts) — darum werden `next/server`
 * und die `@/lib`-Module des Handlers hier ersetzt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn(async () => ({ ok: true }));

// Ist der Kostenrechner lokal installiert (`project 3/node_modules`), lädt der Handler `next/server` und Supabase von
// dort, sonst (CI) gibt es die Pakete gar nicht. Ersetzt werden darum beide Wege; der jeweils andere bleibt unbenutzt.
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
  getTeamNotificationTemplate: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
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
vi.mock('@/lib/eigenanteil', async () => import('../../project 3/lib/eigenanteil'));

// Supabase-Attrappe: jede Kette wird als { tabelle, art, daten } mitgeschrieben.
type Zugriff = { tabelle: string; art: string; daten?: unknown };
let zugriffe: Zugriff[] = [];
const LEAD = { id: 'lead-1', token: 'tok-1', email: 'kunde@example.com', telefon: '0170', vorname: 'A', nachname: 'B', status: 'angebot_requested' };

function kette(tabelle: string) {
  let art = 'select';
  let daten: unknown;
  const ergebnis = () => {
    if (tabelle === 'leads' && art === 'select') return { data: LEAD, error: null };
    return { data: art === 'select' ? [] : null, error: null };
  };
  const k: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'filter', 'order', 'limit', 'gte', 'lt', 'is', 'neq', 'not', 'match']) {
    k[m] = () => k;
  }
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    k[m] = (d?: unknown) => { art = m; daten = d; zugriffe.push({ tabelle, art, daten }); return k; };
  }
  k.maybeSingle = async () => ergebnis();
  k.single = async () => ergebnis();
  k.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) => Promise.resolve(ergebnis()).then(ok, nok);
  return k;
}
function supabaseAttrappe() {
  return {
    createClient: () => ({
      from: (tabelle: string) => {
        zugriffe.push({ tabelle, art: 'from' });
        return kette(tabelle);
      },
      storage: { from: () => { throw new Error('Storage darf ein Messpunkt nicht anfassen'); } },
    }),
  };
}
vi.mock('@supabase/supabase-js', () => supabaseAttrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => supabaseAttrappe());

import { POST } from '../../project 3/app/api/lead-event/route';
import { MESSPUNKTE } from '../../project 3/lib/messpunkte';

type Antwort = { body: unknown; status: number };
const senden = async (body: Record<string, unknown>) =>
  (await (POST as unknown as (r: unknown) => Promise<Antwort>)({
    json: async () => body,
    headers: new Headers(),
  }));

const BEISPIEL: Record<string, Record<string, unknown> | undefined> = {
  profil_geoeffnet: { caregiver_id: 4711, quelle: 'karte', vor_speichern: true },
  einladen_getippt: { caregiver_id: 4711, quelle: 'karte', vor_speichern: true },
  faq_geoeffnet: { frage: 'deutsch' },
};

beforeEach(() => {
  zugriffe = [];
  sendEmail.mockClear();
});

describe('lead-event: Messpunkte sind reine Aufzeichnung (Registry #123)', () => {
  for (const punkt of MESSPUNKTE) {
    for (const notify of [false, undefined] as const) {
      it(`${punkt} (notify ${String(notify)}): eine Zeile in lead_events, sonst nichts — keine Mail`, async () => {
        const metadata = BEISPIEL[punkt];
        const antwort = await senden({ token: 'tok-1', event: punkt, ...(metadata ? { metadata } : {}), ...(notify === false ? { notify } : {}) });
        // Fire-and-forget-Mails liefen nach der Antwort an — kurz warten, damit ein Versehen auffiele.
        await new Promise((r) => setTimeout(r, 20));

        expect(antwort.status).toBe(200);
        expect(antwort.body).toEqual({ ok: true });
        expect(sendEmail).not.toHaveBeenCalled();

        const schreiben = zugriffe.filter((z) => z.art !== 'from');
        expect(schreiben).toEqual([
          {
            tabelle: 'lead_events',
            art: 'insert',
            daten: {
              lead_id: 'lead-1',
              event_type: punkt,
              mamamia_job_offer_id: null,
              metadata: { source: 'caapp', ...(metadata ?? {}) },
            },
          },
        ]);
        // Gelesen wird nur der Lead (kein Dedupe-Blick in lead_events, keine Warteschlange, keine Abmeldung).
        expect(zugriffe.filter((z) => z.art === 'from').map((z) => z.tabelle)).toEqual(['leads', 'lead_events']);
      });
    }
  }

  it('nicht dedupliziert: zweimal gemeldet = zwei Zeilen (das Portal zählt je Sitzung)', async () => {
    await senden({ token: 'tok-1', event: 'profil_geoeffnet', metadata: BEISPIEL.profil_geoeffnet, notify: false });
    await senden({ token: 'tok-1', event: 'profil_geoeffnet', metadata: { caregiver_id: 4712, quelle: 'karte', vor_speichern: true }, notify: false });
    expect(zugriffe.filter((z) => z.art === 'insert' && z.tabelle === 'lead_events')).toHaveLength(2);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('unbekannter Messpunkt bleibt abgelehnt (400)', async () => {
    const antwort = await senden({ token: 'tok-1', event: 'profil_angesehen' });
    expect(antwort.status).toBe(400);
    expect(zugriffe).toEqual([]);
  });
});
