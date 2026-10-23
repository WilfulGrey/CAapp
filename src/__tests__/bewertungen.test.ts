import { describe, expect, it } from 'vitest';
import {
  AKTIVE_STATUS,
  aktionAus,
  apiBasis,
  berlinDatum,
  berlinDatumZeit,
  bestaetigungsErgebnis,
  clientIp,
  corsHeaders,
  EMAIL_SPERRE_MS,
  enthaeltLink,
  erlaubterOrigin,
  FEHLER,
  ilikeExakt,
  ipHash,
  IP_LIMIT_24H,
  istTokenFormat,
  limitFehler,
  LINK_GUELTIG_MS,
  listenAntwort,
  LISTEN_SPALTEN,
  MAX_LISTE,
  moderationsLinks,
  moderationsPlan,
  neuerToken,
  pruefeEingabe,
  sterneText,
  teamEmpfaenger,
  tokenHash,
  turnstileFormular,
  turnstileOk,
  verwerfGrund,
  zielUrl,
  type BewertungZeile,
} from '../../project 3/lib/bewertungen';

// Kundenbewertungen für primundus.de/erfahrungen (Backend im Kostenrechner).
// Die Seite selbst baut eine andere Sitzung gegen den API-Vertrag — die Werte
// hier (Meldungen, Grenzen, Form der Antwort) SIND der Vertrag.

const JETZT = Date.UTC(2026, 8, 17, 10, 0, 0); // 17.09.2026 12:00 Berlin

function gueltig(overrides: Record<string, unknown> = {}) {
  return {
    sterne: 4,
    text: 'Die Pflegekraft kam pünktlich und spricht gut Deutsch.',
    name: 'Renate M.',
    ort: 'Augsburg',
    email: 'Renate.M@Example.de',
    einwilligung: true,
    website: '',
    gestartet_ms: JETZT - 60_000,
    ...overrides,
  };
}

describe('Zeitfalle und Honeypot (stilles Verwerfen)', () => {
  it('normale Eingabe wird nicht verworfen', () => {
    expect(verwerfGrund(gueltig(), JETZT)).toBeNull();
  });
  it('ausgefülltes Honeypot-Feld', () => {
    expect(verwerfGrund(gueltig({ website: 'https://spam.example' }), JETZT)).toBe('honeypot');
    expect(verwerfGrund(gueltig({ website: 42 }), JETZT)).toBe('honeypot');
  });
  it('leeres oder fehlendes Honeypot-Feld ist in Ordnung', () => {
    expect(verwerfGrund(gueltig({ website: '   ' }), JETZT)).toBeNull();
    expect(verwerfGrund(gueltig({ website: undefined }), JETZT)).toBeNull();
    expect(verwerfGrund(gueltig({ website: null }), JETZT)).toBeNull();
  });
  it('schneller als 4 Sekunden', () => {
    expect(verwerfGrund(gueltig({ gestartet_ms: JETZT - 3_999 }), JETZT)).toBe('zu_schnell');
    expect(verwerfGrund(gueltig({ gestartet_ms: JETZT - 4_000 }), JETZT)).toBeNull();
  });
  it('Formular älter als 24 Stunden', () => {
    expect(verwerfGrund(gueltig({ gestartet_ms: JETZT - 24 * 3600_000 - 1 }), JETZT)).toBe('zu_alt');
    expect(verwerfGrund(gueltig({ gestartet_ms: JETZT - 24 * 3600_000 }), JETZT)).toBeNull();
  });
  it('Startzeit in der Zukunft', () => {
    expect(verwerfGrund(gueltig({ gestartet_ms: JETZT + 1 }), JETZT)).toBe('zukunft');
  });
  it('fehlende oder unbrauchbare Startzeit', () => {
    expect(verwerfGrund(gueltig({ gestartet_ms: undefined }), JETZT)).toBe('ohne_zeit');
    expect(verwerfGrund(gueltig({ gestartet_ms: '1726560000000' }), JETZT)).toBe('ohne_zeit');
    expect(verwerfGrund(gueltig({ gestartet_ms: Number.NaN }), JETZT)).toBe('ohne_zeit');
  });
  it('Honeypot schlägt die Zeit (Reihenfolge)', () => {
    expect(verwerfGrund(gueltig({ website: 'x', gestartet_ms: JETZT }), JETZT)).toBe('honeypot');
  });
});

describe('Link-Erkennung', () => {
  it.each([
    'Mehr unter http://example.org',
    'Mehr unter https://example.org',
    'Schaut auf www.beispiel',
    'Bestellt über pflege-billig.de, war gut',
    'siehe primundus.com!',
    'Vergleich: sub.domain.eu',
    'Adresse: HTTPS://EXAMPLE.ORG',
  ])('erkennt Link: %s', (t) => {
    expect(enthaeltLink(t)).toBe(true);
  });
  it.each([
    'Sehr zufrieden, z.B. mit der Kommunikation u.a. am Wochenende.',
    'Frankfurt a.M. ist unser Wohnort, ca. 3 Wochen gewartet.',
    'Alles gut.Die Pflegekraft war freundlich.',
    'Das war gut.der Rest auch',
    'Frau Dr. Meier hat uns beraten, bzw. ihr Team.',
    'Die Rechnung kam am 12.08.2026 pünktlich.',
    'Kontakt lief per E-Mail an info@primundus.de problemlos',
  ])('kein Link: %s', (t) => {
    expect(enthaeltLink(t)).toBe(false);
  });
});

describe('Eingabe prüfen', () => {
  it('gültige Eingabe wird normalisiert', () => {
    const r = pruefeEingabe(gueltig({ text: '  Die Pflegekraft kam\r\n\r\n\r\n\r\npünktlich und war freundlich.  ', name: '  Renate   M. ', ort: '  ' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.daten).toEqual({
      sterne: 4,
      text: 'Die Pflegekraft kam\n\npünktlich und war freundlich.',
      name: 'Renate M.',
      ort: null,
      email: 'renate.m@example.de',
    });
  });

  it('Steuerzeichen (z. B. NUL, das Postgres ablehnt) fliegen raus', () => {
    const r = pruefeEingabe(gueltig({ text: 'Sehr gute Betreuung\u0000 durch Frau K.\u0007 Danke!' }));
    expect(r.ok && r.daten.text).toBe('Sehr gute Betreuung durch Frau K. Danke!');
  });

  it('kein Objekt ⇒ allgemeiner Fehler', () => {
    for (const b of [null, 'x', 3, []]) {
      const r = pruefeEingabe(b);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler._).toBe(FEHLER.anfrage);
    }
  });

  it('Sterne: nur ganze Zahlen 1–5', () => {
    for (const s of [0, 6, 3.5, '4', null, undefined]) {
      const r = pruefeEingabe(gueltig({ sterne: s }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.sterne).toBe('Bitte wählen Sie 1 bis 5 Sterne.');
    }
    for (const s of [1, 5]) expect(pruefeEingabe(gueltig({ sterne: s })).ok).toBe(true);
  });

  it('Text: 20 bis 2000 Zeichen nach dem Trimmen', () => {
    const kurz = pruefeEingabe(gueltig({ text: '   neunzehn Zeichen.   ' }));
    expect(kurz.ok).toBe(false);
    if (!kurz.ok) expect(kurz.fehler.text).toBe('Bitte schreiben Sie mindestens 20 Zeichen.');
    expect(pruefeEingabe(gueltig({ text: 'x'.repeat(20) })).ok).toBe(true);
    expect(pruefeEingabe(gueltig({ text: 'x'.repeat(2000) })).ok).toBe(true);
    const lang = pruefeEingabe(gueltig({ text: 'x'.repeat(2001) }));
    expect(lang.ok).toBe(false);
    if (!lang.ok) expect(lang.fehler.text).toBe(FEHLER.textLang);
    const fehlt = pruefeEingabe(gueltig({ text: undefined }));
    if (!fehlt.ok) expect(fehlt.fehler.text).toBe('Bitte schreiben Sie mindestens 20 Zeichen.');
  });

  it('Text mit Link', () => {
    const r = pruefeEingabe(gueltig({ text: 'Super Service, mehr dazu auf www.beispiel.de' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.text).toBe('Bitte keine Links in der Bewertung.');
  });

  it('Name: 2 bis 60 Zeichen, keine Links', () => {
    for (const n of ['R', '', '   ', 'x'.repeat(61), undefined, 5]) {
      const r = pruefeEingabe(gueltig({ name: n }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.name).toBe(FEHLER.name);
    }
    const link = pruefeEingabe(gueltig({ name: 'billig-pflege.de' }));
    if (!link.ok) expect(link.fehler.name).toBe(FEHLER.nameLink);
    expect(link.ok).toBe(false);
  });

  it('Ort: optional, höchstens 60 Zeichen', () => {
    expect(pruefeEingabe(gueltig({ ort: undefined })).ok).toBe(true);
    expect(pruefeEingabe(gueltig({ ort: null })).ok).toBe(true);
    const lang = pruefeEingabe(gueltig({ ort: 'x'.repeat(61) }));
    expect(lang.ok).toBe(false);
    if (!lang.ok) expect(lang.fehler.ort).toBe(FEHLER.ort);
    const typ = pruefeEingabe(gueltig({ ort: 12345 }));
    expect(typ.ok).toBe(false);
  });

  it('E-Mail: gültig und höchstens 254 Zeichen', () => {
    for (const e of ['keine-mail', 'a@b', 'a b@c.de', '', undefined, `${'x'.repeat(250)}@a.de`]) {
      const r = pruefeEingabe(gueltig({ email: e }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.email).toBe(FEHLER.email);
    }
    expect(pruefeEingabe(gueltig({ email: ' max.mustermann+pflege@t-online.de ' })).ok).toBe(true);
  });

  it('Einwilligung muss true sein', () => {
    for (const w of [false, 'true', 1, undefined]) {
      const r = pruefeEingabe(gueltig({ einwilligung: w }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.einwilligung).toBe('Bitte bestätigen Sie die Einwilligung.');
    }
  });

  it('meldet alle Fehler auf einmal', () => {
    const r = pruefeEingabe({ sterne: 9, text: 'kurz', name: '', email: 'x', einwilligung: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fehler).sort()).toEqual(['einwilligung', 'email', 'name', 'sterne', 'text']);
  });
});

describe('Sterne als Text', () => {
  it('★ gefüllt, ☆ leer', () => {
    expect(sterneText(4)).toBe('★★★★☆');
    expect(sterneText(1)).toBe('★☆☆☆☆');
    expect(sterneText(5)).toBe('★★★★★');
  });
});

describe('Tokens', () => {
  it('32 Byte base64url, jedes Mal neu', () => {
    const a = neuerToken();
    const b = neuerToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(istTokenFormat(a)).toBe(true);
  });
  it('Hash ist sha256-hex und deterministisch', () => {
    expect(tokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(tokenHash('abc')).toBe(tokenHash('abc'));
  });
  it('Format-Prüfung vor jeder Datenbankabfrage', () => {
    for (const t of [null, undefined, '', 'kurz', 'a'.repeat(44), `${'a'.repeat(42)}=`, 7]) {
      expect(istTokenFormat(t)).toBe(false);
    }
  });
});

describe('IP und IP-Hash', () => {
  const h = (werte: Record<string, string>) => (name: string) => werte[name.toLowerCase()] ?? null;
  it('cf-connecting-ip hat Vorrang', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.9');
  });
  it('sonst erster Eintrag von x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' }))).toBe('198.51.100.1');
  });
  it('ohne Header null', () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ 'x-forwarded-for': ' , ' }))).toBeNull();
  });
  it('Hash = sha256(salt + ip), ohne IP null', () => {
    expect(ipHash('1.2.3.4', 'salz')).toBe(tokenHash('salz1.2.3.4'));
    expect(ipHash(null, 'salz')).toBeNull();
  });
  it('ohne Salz fester Ersatzwert (nicht leer)', () => {
    const ohne = ipHash('1.2.3.4', undefined);
    expect(ohne).toMatch(/^[0-9a-f]{64}$/);
    expect(ohne).not.toBe(tokenHash('1.2.3.4'));
    expect(ipHash('1.2.3.4', '')).toBe(ohne);
  });
});

describe('Rate-Limits', () => {
  it('Grenzen', () => {
    expect(IP_LIMIT_24H).toBe(3);
    expect(EMAIL_SPERRE_MS).toBe(30 * 24 * 3600_000);
    expect([...AKTIVE_STATUS]).toEqual(['unbestaetigt', 'bestaetigt', 'veroeffentlicht']);
  });
  it('bis 3 Bewertungen je IP in 24 h, die vierte wird abgewiesen', () => {
    expect(limitFehler({ ipAnzahl24h: 2, emailAnzahl30Tage: 0 })).toBeNull();
    expect(limitFehler({ ipAnzahl24h: 3, emailAnzahl30Tage: 0 })).toBe(FEHLER.limitIp);
  });
  it('ohne IP kein IP-Limit', () => {
    expect(limitFehler({ ipAnzahl24h: null, emailAnzahl30Tage: 0 })).toBeNull();
  });
  it('eine aktive Bewertung derselben E-Mail in 30 Tagen sperrt', () => {
    expect(limitFehler({ ipAnzahl24h: 0, emailAnzahl30Tage: 1 })).toBe(
      'Mit dieser E-Mail-Adresse wurde in den letzten 30 Tagen bereits eine Bewertung abgegeben.',
    );
  });
  it('ILIKE-Muster ohne Platzhalter-Wirkung', () => {
    expect(ilikeExakt('a_b%c\\d@x.de')).toBe('a\\_b\\%c\\\\d@x.de');
  });
});

describe('Öffentliche Liste', () => {
  const zeile = (o: Partial<BewertungZeile> = {}): BewertungZeile => ({
    id: '11111111-1111-4111-8111-111111111111',
    sterne: 5,
    text: 'Sehr gute Betreuung für meine Mutter.',
    name: 'Klaus B.',
    ort: 'Köln',
    erstellt_am: '2026-09-01T08:00:00Z',
    veroeffentlicht_am: '2026-09-02T22:30:00Z', // 03.09. 00:30 in Berlin
    kunde_bestaetigt: true,
    antwort: null,
    antwort_am: null,
    datum: null,
    herkunft: 'formular',
    ...o,
  });

  it('Datum in Europe/Berlin', () => {
    expect(berlinDatum('2026-09-02T22:30:00Z')).toBe('2026-09-03');
    expect(berlinDatum('2026-01-15T23:30:00Z')).toBe('2026-01-16');
    expect(berlinDatum('2026-01-15T22:59:00Z')).toBe('2026-01-15');
    expect(berlinDatumZeit('2026-09-02T22:30:00Z')).toBe('03.09.2026, 00:30 Uhr');
  });

  it('genau die Vertragsfelder, nie E-Mail/IP/Tokens', () => {
    const roh = { ...zeile(), email: 'x@y.de', ip_hash: 'h', bestaetigen_token_hash: 't', moderation_token_hash: 'm', status: 'veroeffentlicht' };
    const a = listenAntwort([roh as BewertungZeile], new Date(JETZT));
    expect(a).toEqual({
      bewertungen: [{
        id: '11111111-1111-4111-8111-111111111111',
        sterne: 5,
        text: 'Sehr gute Betreuung für meine Mutter.',
        name: 'Klaus B.',
        ort: 'Köln',
        datum: '2026-09-03',
        kunde_bestaetigt: true,
        antwort: null,
        antwort_datum: null,
        herkunft: 'formular',
      }],
      stand: '2026-09-17T10:00:00.000Z',
    });
  });

  it('Antwort mit Datum; ohne veroeffentlicht_am zählt erstellt_am', () => {
    const [b] = listenAntwort([zeile({ antwort: 'Danke!', antwort_am: '2026-09-05T10:00:00Z', veroeffentlicht_am: null, ort: null })], new Date(JETZT)).bewertungen;
    expect(b.datum).toBe('2026-09-01');
    expect(b.ort).toBeNull();
    expect(b.antwort).toBe('Danke!');
    expect(b.antwort_datum).toBe('2026-09-05');
    const [ohne] = listenAntwort([zeile({ antwort: null, antwort_am: '2026-09-05T10:00:00Z' })], new Date(JETZT)).bewertungen;
    expect(ohne.antwort_datum).toBeNull();
  });

  it('datum-Spalte hat Vorrang (coalesce(datum, veroeffentlicht_am))', () => {
    const [b] = listenAntwort([zeile({ datum: '2024-05-06', herkunft: 'google' })], new Date(JETZT)).bewertungen;
    expect(b.datum).toBe('2024-05-06');
    expect(b.herkunft).toBe('google');
  });

  it('sortiert nach angezeigtem Datum, neueste zuerst (eingetragene alte Bewertungen rutschen nach unten)', () => {
    const liste = listenAntwort([
      zeile({ id: 'alt-eingetragen', datum: '2024-05-06', herkunft: 'team', veroeffentlicht_am: '2026-09-16T10:00:00Z' }),
      zeile({ id: 'neu', datum: '2026-09-10' }),
      zeile({ id: 'ohne-datum', datum: null, veroeffentlicht_am: '2026-09-12T10:00:00Z' }),
    ], new Date(JETZT)).bewertungen.map((b) => b.id);
    expect(liste).toEqual(['ohne-datum', 'neu', 'alt-eingetragen']);
  });

  it('Spalten der öffentlichen Abfrage', () => {
    expect(LISTEN_SPALTEN.split(',').map((s) => s.trim()).sort()).toEqual(
      ['antwort', 'antwort_am', 'datum', 'erstellt_am', 'herkunft', 'id', 'kunde_bestaetigt', 'name', 'ort', 'sterne', 'text', 'veroeffentlicht_am'],
    );
  });

  it('höchstens 200', () => {
    expect(MAX_LISTE).toBe(200);
    const viele = Array.from({ length: 250 }, () => zeile());
    expect(listenAntwort(viele, new Date(JETZT)).bewertungen).toHaveLength(200);
  });
});

describe('CORS', () => {
  it('primundus.de und www erlaubt', () => {
    expect(erlaubterOrigin('https://primundus.de')).toBe(true);
    expect(erlaubterOrigin('https://www.primundus.de')).toBe(true);
  });
  it('fremde, ähnliche und leere Origins nicht', () => {
    for (const o of ['http://primundus.de', 'https://primundus.de.evil.com', 'https://evilprimundus.de', 'null', '', null]) {
      expect(erlaubterOrigin(o)).toBe(false);
    }
  });
  it('Zusätze aus BEWERTUNG_CORS_EXTRA', () => {
    expect(erlaubterOrigin('http://localhost:3000', 'http://localhost:3000, https://staging.example ')).toBe(true);
    expect(erlaubterOrigin('https://staging.example', 'http://localhost:3000, https://staging.example/ ')).toBe(true);
    expect(erlaubterOrigin('http://localhost:3001', 'http://localhost:3000')).toBe(false);
  });
  it('Header: Origin nur gespiegelt, wenn erlaubt; Vary immer', () => {
    const ok = corsHeaders('https://www.primundus.de');
    expect(ok['Access-Control-Allow-Origin']).toBe('https://www.primundus.de');
    expect(ok['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(ok['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(ok.Vary).toBe('Origin');
    const nein = corsHeaders('https://evil.example');
    expect(nein['Access-Control-Allow-Origin']).toBeUndefined();
    expect(nein.Vary).toBe('Origin');
  });
});

describe('Konfiguration aus der Umgebung', () => {
  it('API-Basis: eigene Variable, sonst Site-URL, sonst Prod', () => {
    expect(apiBasis({ BEWERTUNG_API_BASIS: 'https://x.example/' })).toBe('https://x.example');
    expect(apiBasis({ NEXT_PUBLIC_SITE_URL: 'https://kostenrechner-staging.onrender.com' })).toBe('https://kostenrechner-staging.onrender.com');
    expect(apiBasis({})).toBe('https://kostenrechner.primundus.de');
    expect(apiBasis({ BEWERTUNG_API_BASIS: '  ' })).toBe('https://kostenrechner.primundus.de');
  });
  it('Team-Empfänger: Liste, Standard info@primundus.de (Martin, 17.09.2026)', () => {
    expect(teamEmpfaenger(undefined)).toEqual(['info@primundus.de']);
    expect(teamEmpfaenger(' ')).toEqual(['info@primundus.de']);
    expect(teamEmpfaenger('a@x.de, b@y.de ,')).toEqual(['a@x.de', 'b@y.de']);
  });
});

describe('Bestätigungslink', () => {
  const erstellt = new Date(JETZT - 60_000).toISOString();
  it('unbestätigt und frisch ⇒ bestätigen', () => {
    expect(bestaetigungsErgebnis({ status: 'unbestaetigt', erstellt_am: erstellt }, new Date(JETZT))).toBe('bestaetigen');
  });
  it('nach 7 Tagen ungültig', () => {
    expect(LINK_GUELTIG_MS).toBe(7 * 24 * 3600_000);
    const alt = new Date(JETZT - LINK_GUELTIG_MS).toISOString();
    expect(bestaetigungsErgebnis({ status: 'unbestaetigt', erstellt_am: alt }, new Date(JETZT))).toBe('ungueltig');
  });
  it('schon bestätigt/veröffentlicht/abgelehnt nach Bestätigung ⇒ bereits', () => {
    for (const status of ['bestaetigt', 'veroeffentlicht', 'abgelehnt'] as const) {
      expect(bestaetigungsErgebnis({ status, erstellt_am: erstellt, bestaetigt_am: erstellt }, new Date(JETZT))).toBe('bereits');
    }
  });
  it('im Admin vor der Bestätigung abgelehnt ⇒ ungültig', () => {
    expect(bestaetigungsErgebnis({ status: 'abgelehnt', erstellt_am: erstellt, bestaetigt_am: null }, new Date(JETZT))).toBe('ungueltig');
  });
  it('unbekannt ⇒ ungültig', () => {
    expect(bestaetigungsErgebnis(null, new Date(JETZT))).toBe('ungueltig');
  });
  it('Ziel-URLs', () => {
    expect(zielUrl('bestaetigt')).toBe('https://primundus.de/erfahrungen?bewertung=bestaetigt#bewerten');
    expect(zielUrl('ungueltig')).toBe('https://primundus.de/erfahrungen?bewertung=ungueltig#bewerten');
  });
});

describe('Moderation', () => {
  const ISO = '2026-09-17T10:00:00.000Z';
  it('Aktionen nur aus fester Liste', () => {
    expect(aktionAus('freigeben')).toBe('freigeben');
    expect(aktionAus('freigeben_kunde')).toBe('freigeben_kunde');
    expect(aktionAus('ablehnen')).toBe('ablehnen');
    for (const a of ['', 'loeschen', 'toString', '__proto__', null, 1]) expect(aktionAus(a)).toBeNull();
  });

  it('Links für die Team-Mail', () => {
    expect(moderationsLinks('https://k.example', 'TOK_en-1')).toEqual({
      freigeben: 'https://k.example/api/bewertungen/moderation?t=TOK_en-1&aktion=freigeben',
      freigeben_kunde: 'https://k.example/api/bewertungen/moderation?t=TOK_en-1&aktion=freigeben_kunde',
      ablehnen: 'https://k.example/api/bewertungen/moderation?t=TOK_en-1&aktion=ablehnen',
    });
  });

  it('bestätigt → freigeben', () => {
    expect(moderationsPlan({ status: 'bestaetigt', kunde_bestaetigt: false }, 'freigeben', ISO)).toEqual({
      art: 'aendern',
      vonStatus: 'bestaetigt',
      update: { status: 'veroeffentlicht', veroeffentlicht_am: ISO, datum: '2026-09-17' },
    });
  });
  it('bestätigt → freigeben als Kunde', () => {
    expect(moderationsPlan({ status: 'bestaetigt', kunde_bestaetigt: false }, 'freigeben_kunde', ISO)).toEqual({
      art: 'aendern',
      vonStatus: 'bestaetigt',
      update: { status: 'veroeffentlicht', veroeffentlicht_am: ISO, datum: '2026-09-17', kunde_bestaetigt: true },
    });
  });
  it('bestätigt → ablehnen', () => {
    expect(moderationsPlan({ status: 'bestaetigt', kunde_bestaetigt: false }, 'ablehnen', ISO)).toEqual({
      art: 'aendern',
      vonStatus: 'bestaetigt',
      update: { status: 'abgelehnt', abgelehnt_am: ISO },
    });
  });
  it('schon im Zielzustand ⇒ erledigt (idempotent)', () => {
    expect(moderationsPlan({ status: 'veroeffentlicht', kunde_bestaetigt: false }, 'freigeben', ISO).art).toBe('erledigt');
    expect(moderationsPlan({ status: 'veroeffentlicht', kunde_bestaetigt: true }, 'freigeben', ISO).art).toBe('erledigt');
    expect(moderationsPlan({ status: 'veroeffentlicht', kunde_bestaetigt: true }, 'freigeben_kunde', ISO).art).toBe('erledigt');
    expect(moderationsPlan({ status: 'abgelehnt', kunde_bestaetigt: false }, 'ablehnen', ISO).art).toBe('erledigt');
  });
  it('veröffentlicht ohne Kunden-Haken → nachträglich als Kunde markieren, Datum bleibt', () => {
    expect(moderationsPlan({ status: 'veroeffentlicht', kunde_bestaetigt: false }, 'freigeben_kunde', ISO)).toEqual({
      art: 'aendern',
      vonStatus: 'veroeffentlicht',
      update: { kunde_bestaetigt: true },
    });
  });
  it('nicht möglich: unbestätigt, abgelehnt freigeben, veröffentlicht ablehnen', () => {
    for (const a of ['freigeben', 'freigeben_kunde', 'ablehnen'] as const) {
      expect(moderationsPlan({ status: 'unbestaetigt', kunde_bestaetigt: false }, a, ISO).art).toBe('nicht_moeglich');
    }
    expect(moderationsPlan({ status: 'abgelehnt', kunde_bestaetigt: false }, 'freigeben', ISO).art).toBe('nicht_moeglich');
    expect(moderationsPlan({ status: 'abgelehnt', kunde_bestaetigt: false }, 'freigeben_kunde', ISO).art).toBe('nicht_moeglich');
    expect(moderationsPlan({ status: 'veroeffentlicht', kunde_bestaetigt: true }, 'ablehnen', ISO).art).toBe('nicht_moeglich');
  });
});

describe('Turnstile', () => {
  it('Formular für siteverify', () => {
    const f = turnstileFormular('geheim', 'tok', '1.2.3.4');
    expect(f.get('secret')).toBe('geheim');
    expect(f.get('response')).toBe('tok');
    expect(f.get('remoteip')).toBe('1.2.3.4');
    expect(turnstileFormular('geheim', 'tok', null).has('remoteip')).toBe(false);
  });
  it('nur success === true zählt', () => {
    expect(turnstileOk({ success: true })).toBe(true);
    for (const a of [{ success: false }, { success: 'true' }, null, undefined, 'ok']) expect(turnstileOk(a)).toBe(false);
  });
});
