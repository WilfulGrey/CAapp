// @vitest-environment node
/**
 * Facebook-/Instagram-Leads (Meta-Sofortformular): Abholung, Team-Mail, Bestätigung.
 * Geprüft an `project 3/lib/meta-leads.ts`, `lib/meta-leads-mails.ts` und der Route
 * `app/api/cron/meta-leads/route.ts` — Graph API per fetch-Attrappe, sendEmail gemockt,
 * fb_leads als Speicher-Attrappe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Gesendet = { an: string; betreff: string; html: string; text: string; optionen?: { replyTo?: string } };
const gesendet: Gesendet[] = [];
let sendenErfolg: (an: string) => boolean = () => true;
const sendEmail = vi.fn(async (an: string, t: { subject: string; html: string; text: string }, _a?: unknown, o?: { replyTo?: string }) => {
  gesendet.push({ an, betreff: t.subject, html: t.html, text: t.text, optionen: o });
  return { success: sendenErfolg(an) };
});
vi.mock('../../project 3/lib/email', () => ({ sendEmail: (...a: unknown[]) => (sendEmail as unknown as (...x: unknown[]) => unknown)(...a) }));

const { nextServer } = vi.hoisted(() => ({
  nextServer: () => ({
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    },
  }),
}));
vi.mock('next/server', () => nextServer());
vi.mock('../../project 3/node_modules/next/server', () => nextServer());
vi.mock('@/lib/meta-leads', async () => import('../../project 3/lib/meta-leads'));

import {
  MetaFehler,
  supabaseSpeicher,
  syncMetaLeads,
  zuZeile,
  type FbLeadsSpeicher,
  type FbLeadZeile,
} from '../../project 3/lib/meta-leads';
import {
  META_LEAD_TEXTE,
  anredeName,
  metaLeadBestaetigung,
  metaLeadTeamMail,
  weitereAntworten,
  zeitraumAus,
  type FbLead,
} from '../../project 3/lib/meta-leads-mails';
import { POST } from '../../project 3/app/api/cron/meta-leads/route';

const STAND = { schnitt: '4,9', anzahl: 126 };

const BASIS = 'https://graph.test/v21.0';
const SYSTEM_TOKEN = 'systemnutzer-token-AAAA1111';
const SEITEN_TOKEN = 'seiten-token-BBBB2222';
const JETZT = new Date('2026-11-25T13:00:00Z');
const FRAGE = 'für_wann_planen_sie_unterstützung_zu_hause?';

const ENV = {
  META_PAGE_ID: 'seite1',
  META_PAGE_TOKEN: SYSTEM_TOKEN,
  META_GRAPH_URL: BASIS,
} as unknown as NodeJS.ProcessEnv;

const SABINE = {
  id: 'lead-sabine',
  created_time: '2026-11-25T12:40:00+0000',
  ad_name: 'Rückruf Winter',
  campaign_name: 'Primundus Rückruf 11-2026',
  platform: 'ig',
  field_data: [
    { name: 'full_name', values: ['Sabine Beispiel'] },
    { name: 'email', values: ['sabine@example.com'] },
    { name: 'phone_number', values: ['+49 151 23456789'] },
    { name: FRAGE, values: ['so_bald_wie_möglich'] },
  ],
};
const HANS = {
  id: 'lead-hans',
  created_time: '2026-11-25T12:50:00+0000',
  ad_name: 'Rückruf Winter',
  platform: 'fb',
  field_data: [
    { name: 'first_name', values: ['hans'] },
    { name: 'last_name', values: ['muster'] },
    { name: 'phone_number', values: ['+4917612345678'] },
  ],
};

type Aufruf = { url: string; auth: string | null };
let aufrufe: Aufruf[] = [];
let graphAntwort: (pfad: string) => { status: number; body: unknown } | 'netzfehler';

function standardGraph(leads: unknown[]) {
  return (pfad: string) => {
    if (pfad === 'seite1') return { status: 200, body: { access_token: SEITEN_TOKEN, id: 'seite1' } };
    if (pfad === 'seite1/leadgen_forms') return { status: 200, body: { data: [{ id: 'form1', name: 'Rückruf 11-2026' }] } };
    if (pfad === 'form1/leads') return { status: 200, body: { data: leads } };
    return { status: 404, body: { error: { message: 'unbekannt' } } };
  };
}

beforeEach(() => {
  aufrufe = [];
  gesendet.length = 0;
  sendenErfolg = () => true;
  sendEmail.mockClear();
  graphAntwort = standardGraph([SABINE, HANS]);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    aufrufe.push({ url, auth: init?.headers?.Authorization ?? null });
    const pfad = url.slice(BASIS.length + 1).split('?')[0];
    const a = graphAntwort(pfad);
    if (a === 'netzfehler') throw new TypeError(`fetch failed: ${url}`);
    return { ok: a.status < 400, status: a.status, json: async () => a.body } as unknown as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** fb_leads-Attrappe: hält ids, liefert nur neu eingefügte zurück (wie ON CONFLICT DO NOTHING). */
function speicherAttrappe(vorhanden: string[] = []) {
  const ids = new Set(vorhanden);
  const eingefuegt: FbLeadZeile[][] = [];
  const markiert: Array<{ ids: string[]; feld: string }> = [];
  const speicher: FbLeadsSpeicher = {
    async neueEinfuegen(zeilen) {
      eingefuegt.push(zeilen);
      const neu = zeilen.filter((z) => !ids.has(z.id));
      neu.forEach((z) => ids.add(z.id));
      return neu;
    },
    async markieren(i, feld) {
      markiert.push({ ids: i, feld });
    },
  };
  return { speicher, eingefuegt, markiert };
}

const lauf = (speicher: FbLeadsSpeicher, env: NodeJS.ProcessEnv = ENV) =>
  syncMetaLeads({ speicher, env, jetzt: () => JETZT, bewertung: async () => STAND });

describe('syncMetaLeads: ohne Zugang inert', () => {
  it('ohne META_PAGE_ID und META_PAGE_TOKEN: nichts abgerufen, nichts verschickt', async () => {
    const { speicher, eingefuegt } = speicherAttrappe();
    const r = await syncMetaLeads({ speicher, env: {} as NodeJS.ProcessEnv });
    expect(r).toEqual({ configured: false, inserted: 0 });
    expect(aufrufe).toHaveLength(0);
    expect(eingefuegt).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('Env leer, Vault liefert Seite und Token: Lauf wie mit Env', async () => {
    const { speicher } = speicherAttrappe();
    const r = await syncMetaLeads({
      speicher,
      env: { META_GRAPH_URL: ENV.META_GRAPH_URL } as unknown as NodeJS.ProcessEnv,
      jetzt: () => JETZT,
      bewertung: async () => STAND,
      zugang: async () => ({ seite: 'seite1', token: SYSTEM_TOKEN }),
    });
    expect(r.configured).toBe(true);
    expect(aufrufe.map((a) => a.url.slice(BASIS.length + 1).split('?')[0])).toEqual(['seite1', 'seite1/leadgen_forms', 'form1/leads']);
  });

  it('Env leer und Vault leer: inert, nichts abgerufen', async () => {
    const { speicher } = speicherAttrappe();
    const r = await syncMetaLeads({ speicher, env: {} as NodeJS.ProcessEnv, zugang: async () => ({}) });
    expect(r).toEqual({ configured: false, inserted: 0 });
    expect(aufrufe).toHaveLength(0);
  });

  it('nur eine der beiden Variablen gesetzt: ebenfalls inert', async () => {
    const { speicher } = speicherAttrappe();
    expect(await lauf(speicher, { META_PAGE_ID: 'seite1' } as unknown as NodeJS.ProcessEnv)).toEqual({ configured: false, inserted: 0 });
    expect(await lauf(speicher, { META_PAGE_TOKEN: SYSTEM_TOKEN } as unknown as NodeJS.ProcessEnv)).toEqual({ configured: false, inserted: 0 });
    expect(aufrufe).toHaveLength(0);
  });
});

describe('Graph API: Token-Weg', () => {
  it('holt erst den Seiten-Token und nutzt ihn für Formulare und Leads; kein Token in einer URL', async () => {
    const { speicher } = speicherAttrappe();
    await lauf(speicher);
    expect(aufrufe.map((a) => a.url.slice(BASIS.length + 1).split('?')[0])).toEqual(['seite1', 'seite1/leadgen_forms', 'form1/leads']);
    expect(aufrufe[0].url).toContain('fields=access_token');
    expect(aufrufe[0].auth).toBe(`Bearer ${SYSTEM_TOKEN}`);
    expect(aufrufe[1].auth).toBe(`Bearer ${SEITEN_TOKEN}`);
    expect(aufrufe[2].auth).toBe(`Bearer ${SEITEN_TOKEN}`);
    for (const a of aufrufe) {
      expect(a.url).not.toContain(SYSTEM_TOKEN);
      expect(a.url).not.toContain(SEITEN_TOKEN);
      expect(a.url).not.toContain('access_token=');
    }
  });
});

describe('Felder', () => {
  it('full_name, E-Mail, Telefon, Zusatzantworten', () => {
    const z = zuZeile(SABINE, { id: 'form1', name: 'Rückruf 11-2026' });
    expect(z).toMatchObject({
      id: 'lead-sabine',
      form_id: 'form1',
      form_name: 'Rückruf 11-2026',
      ad_name: 'Rückruf Winter',
      campaign_name: 'Primundus Rückruf 11-2026',
      platform: 'ig',
      created_time: '2026-11-25T12:40:00.000Z',
      name: 'Sabine Beispiel',
      email: 'sabine@example.com',
      phone: '+49 151 23456789',
    });
    expect(z.fields[FRAGE]).toBe('so_bald_wie_möglich');
    expect(zeitraumAus(z.fields)).toBe('So bald wie möglich');
  });

  it('deutsches Formular: Feldnamen „e-mail-adresse“, „vollständiger_name“, „telefonnummer“ (Graph API 27.11.2026)', () => {
    const z = zuZeile(
      {
        id: 'l9',
        created_time: '2026-11-27T18:45:00+0000',
        field_data: [
          { name: 'wann_benötigen_sie_unterstützung_zu_hause?', values: ['so_bald_wie_möglich'] },
          { name: 'e-mail-adresse', values: ['sabine@example.com'] },
          { name: 'vollständiger_name', values: ['Sabine Beispiel'] },
          { name: 'telefonnummer', values: ['+491511234567'] },
        ],
      },
      { id: '2063543837689805', name: 'Primundus_Anfrage_DE (Stuhl, 27.11.)' },
    );
    expect(z.email).toBe('sabine@example.com');
    expect(z.name).toBe('Sabine Beispiel');
    expect(z.phone).toBe('+491511234567');
    expect(zeitraumAus(z.fields)).toBe('So bald wie möglich');
    // Kontaktfelder erscheinen in der Team-Mail nicht ein zweites Mal als „weitere Antwort“.
    expect(weitereAntworten(z.fields)).toEqual([]);
  });

  it('first_name + last_name ergeben den Namen; fehlende E-Mail bleibt null', () => {
    const z = zuZeile(HANS, { id: 'form1' });
    expect(z.name).toBe('hans muster');
    expect(z.email).toBeNull();
    expect(z.phone).toBe('+4917612345678');
    expect(z.form_name).toBeNull();
  });

  it('Zeitraum: Antworten im Wortlaut des Formulars erkannt, unbekannte lesbar, alte Frage „Ab wann …" auch', () => {
    expect(zeitraumAus({ [FRAGE]: 'Innerhalb der nächsten 4 Wochen' })).toBe('Innerhalb der nächsten 4 Wochen');
    expect(zeitraumAus({ [FRAGE]: 'später_oder_noch_unklar' })).toBe('Später oder noch unklar');
    expect(zeitraumAus({ 'ab_wann_brauchen_sie_betreuung?': 'so_schnell_wie_möglich' })).toBe('So schnell wie möglich');
    expect(zeitraumAus({ email: 'x@y.de' })).toBeNull();
  });

});

describe('Nur frische Leads bekommen Mails', () => {
  it('erster Lauf: beide Leads eingefügt, eine Bestätigung (Sabine), eine Team-Mail mit beiden', async () => {
    const { speicher, eingefuegt, markiert } = speicherAttrappe();
    const r = await lauf(speicher);
    expect(eingefuegt[0].map((z) => z.id).sort()).toEqual(['lead-hans', 'lead-sabine']);
    expect(r).toMatchObject({ configured: true, forms: 1, fetched: 2, inserted: 2, confirmations: 1, withoutConfirmation: 1, teamMail: 'verschickt' });

    expect(gesendet.map((g) => g.an)).toEqual(['sabine@example.com', 'info@primundus.de']);
    expect(gesendet[0].betreff).toBe('Ihre Instagram-Anfrage zur 24-Stunden-Betreuung');
    const team = gesendet[1];
    expect(team.betreff).toBe('2 Facebook-Anfragen');
    expect(team.html).toContain('Sabine Beispiel');
    expect(team.html).toContain('hans muster');
    expect(team.optionen?.replyTo).toBeUndefined(); // mehrere Leads ⇒ Antworten gehen ans Team-Postfach
    // Hans hat keine Bestätigung ⇒ die Einleitung behauptet sie nicht, seine Karte sagt warum.
    expect(team.text).not.toContain('schon verschickt');
    expect(team.text).toContain(META_LEAD_TEXTE.team.ohneBestaetigung.keine_email);

    expect(markiert).toEqual([
      { ids: ['lead-sabine'], feld: 'confirm_sent_at' },
      { ids: ['lead-sabine', 'lead-hans'], feld: 'notified_at' },
    ]);
  });

  it('zweiter Lauf mit denselben Leads: nichts neu, keine Mail', async () => {
    const { speicher } = speicherAttrappe(['lead-sabine', 'lead-hans']);
    const r = await lauf(speicher);
    expect(r).toMatchObject({ configured: true, fetched: 2, inserted: 0, teamMail: 'keine' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('nur der neue von zwei abgerufenen Leads wird gemeldet', async () => {
    const { speicher } = speicherAttrappe(['lead-hans']);
    await lauf(speicher);
    expect(gesendet.map((g) => g.an)).toEqual(['sabine@example.com', 'info@primundus.de']);
    const team = gesendet[1];
    expect(team.betreff).toBe('Facebook-Anfrage: Sabine Beispiel, So bald wie möglich');
    expect(team.html).not.toContain('hans muster');
    expect(team.optionen?.replyTo).toBe('sabine@example.com');
    expect(team.text).toContain(`${META_LEAD_TEXTE.team.einleitungEiner} ${META_LEAD_TEXTE.team.bestaetigtEiner}`);
  });

  it('keine Leads abgerufen: Speicher wird gar nicht berührt', async () => {
    graphAntwort = standardGraph([]);
    const { speicher, eingefuegt } = speicherAttrappe();
    expect(await lauf(speicher)).toMatchObject({ configured: true, fetched: 0, inserted: 0, teamMail: 'keine' });
    expect(eingefuegt).toHaveLength(0);
  });

  it('META_LEADS_TO ersetzt den Empfänger der Team-Mail', async () => {
    const { speicher } = speicherAttrappe(['lead-hans']);
    await lauf(speicher, { ...ENV, META_LEADS_TO: 'rueckruf@primundus.de' } as unknown as NodeJS.ProcessEnv);
    expect(gesendet[1].an).toBe('rueckruf@primundus.de');
  });
});

describe('Bestätigung übersprungen', () => {
  it('ohne E-Mail: nur die Team-Mail, kein confirm_sent_at', async () => {
    const { speicher, markiert } = speicherAttrappe(['lead-sabine']);
    const r = await lauf(speicher);
    expect(r).toMatchObject({ inserted: 1, confirmations: 0, withoutConfirmation: 1 });
    expect(gesendet.map((g) => g.an)).toEqual(['info@primundus.de']);
    expect(gesendet[0].betreff).toBe('Facebook-Anfrage: hans muster');
    expect(gesendet[0].optionen?.replyTo).toBeUndefined();
    expect(markiert).toEqual([{ ids: ['lead-hans'], feld: 'notified_at' }]);
  });

  it('Anfrage älter als 3 Tage (erste Abholung): keine Bestätigung, Grund auf der Karte', async () => {
    graphAntwort = standardGraph([{ ...SABINE, created_time: '2026-11-20T09:00:00+0000' }]);
    const { speicher } = speicherAttrappe();
    await lauf(speicher);
    expect(gesendet.map((g) => g.an)).toEqual(['info@primundus.de']);
    expect(gesendet[0].text).toContain(META_LEAD_TEXTE.team.ohneBestaetigung.zu_alt);
  });

  it('Bestätigung scheitert: Team-Mail sagt das, kein confirm_sent_at', async () => {
    sendenErfolg = (an) => an !== 'sabine@example.com';
    const { speicher, markiert } = speicherAttrappe(['lead-hans']);
    const r = await lauf(speicher);
    expect(r).toMatchObject({ confirmations: 0, teamMail: 'verschickt' });
    expect(gesendet[1].text).toContain(META_LEAD_TEXTE.team.ohneBestaetigung.fehlgeschlagen);
    expect(markiert.map((m) => m.feld)).toEqual(['notified_at']);
  });

  it('Team-Mail scheitert: kein notified_at, Ergebnis sagt fehlgeschlagen', async () => {
    sendenErfolg = (an) => an !== 'info@primundus.de';
    const { speicher, markiert } = speicherAttrappe(['lead-hans']);
    const r = await lauf(speicher);
    expect(r).toMatchObject({ teamMail: 'fehlgeschlagen', confirmations: 1 });
    expect(markiert.map((m) => m.feld)).toEqual(['confirm_sent_at']);
  });
});

describe('Keine Tokens in Fehlern', () => {
  it('Meta-Fehler mit Token im Text: MetaFehler ohne Token', async () => {
    graphAntwort = (pfad) =>
      pfad === 'seite1'
        ? { status: 400, body: { error: { message: `Invalid OAuth access token ${SYSTEM_TOKEN} (access_token=${SYSTEM_TOKEN})`, code: 190 } } }
        : { status: 500, body: {} };
    const { speicher } = speicherAttrappe();
    const fehler = await lauf(speicher).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(MetaFehler);
    const m = (fehler as Error).message;
    expect(m).toContain('Code 190');
    expect(m).not.toContain(SYSTEM_TOKEN);
    expect(m).not.toContain(SEITEN_TOKEN);
    expect(m).not.toContain(BASIS);
  });

  it('Fehler beim Abruf der Leads (Seiten-Token im Text) wird ebenfalls bereinigt', async () => {
    graphAntwort = (pfad) => {
      if (pfad === 'form1/leads') return { status: 403, body: { error: { message: `Token ${SEITEN_TOKEN} lacks leads_retrieval` } } };
      return standardGraph([])(pfad);
    };
    const { speicher } = speicherAttrappe();
    const m = ((await lauf(speicher).catch((e: unknown) => e)) as Error).message;
    expect(m).toContain('leads_retrieval');
    expect(m).not.toContain(SEITEN_TOKEN);
  });

  it('Netzfehler (URL in der Meldung): allgemeine Meldung ohne URL', async () => {
    graphAntwort = () => 'netzfehler';
    const { speicher } = speicherAttrappe();
    const fehler = await lauf(speicher).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(MetaFehler);
    expect((fehler as Error).message).toBe('Meta: Graph API nicht erreichbar');
  });
});

describe('supabaseSpeicher', () => {
  it('fügt mit ignore-duplicates ein und markiert per id-Liste', async () => {
    const protokoll: unknown[] = [];
    const db = {
      from: (t: string) => ({
        upsert: (zeilen: unknown, o: unknown) => {
          protokoll.push(['upsert', t, o]);
          return { select: async () => ({ data: [{ id: 'neu' }], error: null }) };
        },
        update: (d: unknown) => ({
          in: async (f: string, ids: string[]) => {
            protokoll.push(['update', t, d, f, ids]);
            return { error: null };
          },
        }),
      }),
    };
    const s = supabaseSpeicher(db as never);
    expect(await s.neueEinfuegen([zuZeile(SABINE, { id: 'form1' })])).toEqual([{ id: 'neu' }]);
    await s.markieren(['neu'], 'notified_at', '2026-11-25T13:00:00.000Z');
    await s.markieren([], 'notified_at', 'x');
    expect(protokoll).toEqual([
      ['upsert', 'fb_leads', { onConflict: 'id', ignoreDuplicates: true }],
      ['update', 'fb_leads', { notified_at: '2026-11-25T13:00:00.000Z' }, 'id', ['neu']],
    ]);
  });
});

describe('Mails', () => {
  const lead = (p: Partial<FbLead>): FbLead => ({
    id: 'l1', form_id: 'f1', form_name: 'Rückruf', ad_name: 'Rückruf Winter', campaign_name: null, platform: 'fb',
    created_time: '2026-11-25T12:40:00.000Z', name: 'Sabine Beispiel', email: 'sabine@example.com', phone: '+49 151 23456789',
    fields: { [FRAGE]: 'so_bald_wie_möglich' }, ...p,
  });

  it('Anrede: Name wie getippt, klein/groß getippt mit großen Anfangsbuchstaben, ohne Namen „Hallo,“', () => {
    expect(anredeName('Sabine Beispiel')).toBe('Sabine Beispiel');
    expect(anredeName('  hans   muster ')).toBe('Hans Muster');
    expect(anredeName('ANNA-LENA KRÜGER')).toBe('Anna-Lena Krüger');
    expect(anredeName('Heinz von der Heide')).toBe('Heinz von der Heide');
    expect(anredeName('')).toBeNull();
    expect(anredeName(null)).toBeNull();
    const ohne = metaLeadBestaetigung(lead({ name: null }), STAND, 'https://kostenrechner.primundus.de');
    expect(ohne.text.startsWith('Hallo,\n\n')).toBe(true);
    expect(ohne.html).toContain('>Hallo,<');
    const klein = metaLeadBestaetigung(lead({ name: 'hans muster' }), STAND, 'https://kostenrechner.primundus.de');
    expect(klein.html).toContain('>Hallo Hans Muster,<');
    // Name wird escaped (kommt aus dem Formular).
    const boese = metaLeadBestaetigung(lead({ name: 'Eva <b>X</b>' }), STAND, 'https://kostenrechner.primundus.de');
    expect(boese.html).toContain('Hallo Eva &lt;b&gt;X&lt;/b&gt;,');
  });

  it('Bestätigung: Wortlaut aus META_LEAD_TEXTE, Knopf, Punkte der Startseite, Sterne, Martas Karte, Fußzeile', () => {
    const B = META_LEAD_TEXTE.bestaetigung;
    const m = metaLeadBestaetigung(lead({}), STAND, 'https://kostenrechner.primundus.de');
    // Martin 27.11.: Kanal (Facebook/Instagram) in Betreff und Titel.
    expect(m.subject).toBe('Ihre Facebook-Anfrage zur 24-Stunden-Betreuung');
    // Wörter mit Bindestrich bleiben zusammen, letztes Wort hängt per &nbsp; am vorletzten.
    expect(m.html).toContain('Vielen Dank für Ihre <span style="white-space:nowrap;">Facebook-Anfrage</span> zur&nbsp;<span style="white-space:nowrap;">24-Stunden-Betreuung</span>');
    // Fassung 8 (Martin 27.11.): Anrede mit dem Namen aus dem Formular steht über dem Titel.
    expect(m.text.startsWith('Hallo Sabine Beispiel,\n\nVielen Dank für Ihre Facebook-Anfrage zur 24-Stunden-Betreuung\n')).toBe(true);
    expect(m.html.indexOf('>Hallo Sabine Beispiel,<')).toBeGreaterThan(-1);
    expect(m.html.indexOf('>Hallo Sabine Beispiel,<')).toBeLessThan(m.html.indexOf('Vielen Dank für Ihre'));
    expect(m.html).toContain(B.vorschau);
    // Fassung 5 (27.11.): Online-Weg über dem Knopf, Rückruf erst über Martas Karte; letztes Wort hängt per &nbsp; am vorletzten.
    const a1 = m.html.indexOf(B.absatz1.replace(/ (\S+)$/, '&nbsp;$1'));
    const a2 = m.html.indexOf(B.absatz2.replace(/ (\S+)$/, '&nbsp;$1'));
    expect(a1).toBeGreaterThan(-1);
    expect(a2).toBeGreaterThan(-1);
    expect(a1).toBeLessThan(m.html.indexOf('>Angebot &amp; Pflegekräfte ansehen<'));
    expect(a2).toBeGreaterThan(m.html.indexOf('Keine Mindestlaufzeit'));
    expect(m.html).toContain(`href="${B.knopfUrl.replace(/&/g, '&amp;')}"`);
    expect(m.html).toContain('>Angebot &amp; Pflegekräfte ansehen<');
    // Punkte wie unter dem Knopf der Startseite (lib/hero-punkte.ts PORTAL_PUNKTE).
    for (const p of ['Bestpreisgarantie', 'Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit']) expect(m.html).toContain(p);
    expect(m.html).toContain('href="https://kostenrechner.primundus.de/bestpreisgarantie"');
    // Sterne einmal unter dem Knopf, nicht noch einmal in Martas Karte.
    expect(m.html.match(/von 5 aus/g)).toHaveLength(1);
    expect(m.html).not.toContain('class="sig-sterne-desktop"');
    expect(m.html).toContain('Marta Kapcio');
    expect(m.html).toContain('href="tel:+4989200000830"');
    expect(m.html).toContain('/images/media/ard.webp');
    expect(m.html).toContain('href="https://www.primundus.de/impressum"');
    expect(m.html).toContain('href="https://www.primundus.de/datenschutz"');
    expect(m.html).toContain(B.fussGrund);
    expect(m.html).toContain('sabine@example.com');
    expect(m.html).not.toContain('{{EMAIL}}');
    expect(m.html).not.toMatch(/Rückruf/);
    expect(m.text).toContain(`Angebot & Pflegekräfte ansehen: ${B.knopfUrl}`);
    expect(m.text).toContain('Bestpreisgarantie · Keine Vorauszahlung · Keine Vermittlungsgebühr · Keine Mindestlaufzeit');
    expect(m.text).toContain('4,9 von 5 aus 126 Bewertungen');
    expect(m.text).toContain('Marta Kapcio, Pflegeberaterin, Primundus');
    // Sichtbarer Text nennt nie Martin (HTML-/CSS-Kommentare des geteilten Layouts ausgenommen).
    expect(m.html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '') + m.text).not.toMatch(/Martin/);
  });

  it('Bestätigung: Kanal Instagram bzw. unbekannt', () => {
    const ig = metaLeadBestaetigung(lead({ platform: 'ig' }), STAND);
    expect(ig.subject).toBe('Ihre Instagram-Anfrage zur 24-Stunden-Betreuung');
    expect(ig.text).toContain('Vielen Dank für Ihre Instagram-Anfrage zur 24-Stunden-Betreuung\n');
    const ohne = metaLeadBestaetigung(lead({ platform: null }), STAND);
    expect(ohne.subject).toBe('Ihre Anfrage zur 24-Stunden-Betreuung');
    expect(ohne.text).toContain('Vielen Dank für Ihre Anfrage zur 24-Stunden-Betreuung\n');
    expect(ohne.html).not.toContain('{kanal}');
  });

  it('Bestätigung: Name aus dem Formular nie roh ins HTML', () => {
    expect(metaLeadBestaetigung(lead({ name: '<script>alert(1)</script>' }), STAND).html).not.toContain('<script>alert');
  });

  it('Team-Mail: Karte mit Anrufen-Knopf, Zeitraum, Eingang (Berlin), Kanal, Anzeige; Name wird escaped', () => {
    const m = metaLeadTeamMail([{ lead: lead({ platform: 'ig', name: 'Sabine <b>Beispiel</b>' }), bestaetigung: 'verschickt' }]);
    expect(m.subject).toBe('Facebook-Anfrage: Sabine <b>Beispiel</b>, So bald wie möglich');
    expect(m.html).not.toContain('<b>Beispiel</b>');
    expect(m.html).toContain('href="tel:+4915123456789"');
    expect(m.html).toContain('>Anrufen<');
    expect(m.text).toContain('Zeitraum: So bald wie möglich');
    expect(m.text).toContain('Eingang: Mi., 25.11., 13:40 Uhr');
    expect(m.text).toContain('Kanal: Instagram');
    expect(m.text).toContain('Anzeige: Rückruf Winter');
    expect(m.text).toContain(META_LEAD_TEXTE.team.einleitungEiner);
    expect(m.text).toContain(META_LEAD_TEXTE.team.bestaetigtEiner);
  });

  it('Team-Mail mit mehreren Leads: Mehrzahl', () => {
    const m = metaLeadTeamMail([
      { lead: lead({}), bestaetigung: 'verschickt' },
      { lead: lead({ id: 'l2', name: 'Hans Muster' }), bestaetigung: 'verschickt' },
    ]);
    expect(m.subject).toBe('2 Facebook-Anfragen');
    expect(m.text).toContain(`${META_LEAD_TEXTE.team.einleitungMehrere} ${META_LEAD_TEXTE.team.bestaetigtMehrere}`);
  });
});

describe('Route /api/cron/meta-leads', () => {
  const rufe = (auth?: string) =>
    (POST as unknown as (r: unknown) => Promise<{ body: Record<string, unknown>; status: number }>)({
      headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth ?? null : null) },
    });
  const alt = { ...process.env };
  afterEach(() => {
    process.env = { ...alt };
  });

  it('ohne SUPABASE_SERVICE_ROLE_KEY: 503', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await rufe('Bearer x')).status).toBe(503);
  });

  it('falscher Bearer: 401, nichts abgerufen', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect((await rufe('Bearer falsch')).status).toBe(401);
    expect((await rufe()).status).toBe(401);
    expect(aufrufe).toHaveLength(0);
  });

  it('richtiger Bearer ohne Meta-Zugang: 200 {configured:false}', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    delete process.env.META_PAGE_ID;
    delete process.env.META_PAGE_TOKEN;
    const r = await rufe('Bearer service-key');
    expect(r).toEqual({ status: 200, body: { configured: false, inserted: 0 } });
  });

  it('Meta lehnt ab: 502, Antwort ohne Token', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    Object.assign(process.env, ENV);
    graphAntwort = () => ({ status: 400, body: { error: { message: `bad token ${SYSTEM_TOKEN}`, code: 190 } } });
    const r = await rufe('Bearer service-key');
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain(SYSTEM_TOKEN);
    expect(String(r.body.error)).toContain('Meta:');
  });
});
