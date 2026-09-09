import { describe, it, expect } from 'vitest';
/* Cross-App-Import (pures Modul, Muster wie portalHelfer24.test.ts): der
 * Vermittler-Parser lebt im Kostenrechner und wird hier im root-vitest
 * geprüft, weil project 3 keinen eigenen Runner hat. */
import { pruefeAnfrage, betreffAntwort, WERKZEUG, VERMITTLER_MAILS, type MailKopf, modellNachricht, waehleDokumente, modellBloecke, DOK_MAX_BYTES_GESAMT} from '../../project 3/lib/pflegena';

/* Echte Anfrage von Pflegena (Bernd Walde), wie sie im Postfach liegt.
 * Sie ist der Grund, warum hier ein Modell statt eines Regelparsers steht:
 * kein einziges "Label: Wert", die Preisfelder stecken in Nebensätzen. */
const ANFRAGE = `Guten Tag,

wenigstens mittlere Deutschkenntnisse sind gewünscht,
Tagessatz IHR PREISANGEBOT + 10 Pflegena = ??  € plus Reisekosten
WLAN vorhanden, Führerschein egal

Der Senior benötigt Unterstützung im Haushalt, Körperhygiene, ein liebes Ehepaar,
sie ist nicht pflegebedürftig, er ist aktuell sehr geschwächt, es soll eine liebe
erfahrene Betreuerin sein, Hebetechnik erforderlich, falls Transfer Bett/Rollstuhl,
er kann kurz stehen, die Ehefrau hilft mit beim Transfer Bett/Rollstuhl

Haben Sie Vorschläge ?

Besten Dank und freundliche Grüße

Bernd Walde
Seniorenbetreuung Pflegena`;

const kopf: MailKopf = {
  von: 'b.walde@pflegena.com',
  vonName: 'Bernd Walde',
  betreff: 'Anfrage Ehepaar',
  messageId: '<abc-123@pflegena.com>',
  datum: new Date('2026-09-08T09:00:00.000Z'),
  text: ANFRAGE,
};

/* Die Werkzeug-Antwort für diese Mail — VERBATIM aus einem echten Lauf gegen
 * claude-sonnet-5 (08.09.2026, 537 Tokens rein / 520 raus), nicht ausgedacht.
 *
 * Bemerkenswert und beabsichtigt: `mobilitaet` fehlt. Der Text sagt nur etwas
 * über den TRANSFER ("Hebetechnik erforderlich, falls Transfer Bett/Rollstuhl,
 * er kann kurz stehen") — und nicht, wie der Patient sich fortbewegt. Genau
 * das verlangt die Regel im SYSTEM-Prompt; "Rollstuhl" daraus abzuleiten wäre
 * ein erfundenes Mapping (heilige Regel 1.5). Die Lücke füllt später
 * ergaenzeAngaben sichtbar als Annahme. */
const gelesen = {
  ist_anfrage: true,
  mehrere_anfragen: false,
  nachtrag: false,
  betreuung_fuer: '1-person',      // sie ist NICHT pflegebedürftig
  weitere_personen: 'ja',          // ...lebt aber im Haushalt und hilft mit
  deutschkenntnisse: 'kommunikativ', // "wenigstens mittlere"
  erfahrung: 'erfahren',           // "eine liebe erfahrene Betreuerin"
  fuehrerschein: 'egal',
  geschlecht: 'weiblich',          // "Betreuerin"
  mobilitaet: null,                // der Text sagt nichts über die Fortbewegung
  nachteinsaetze: null,            // steht nicht im Text
  pflegegrad: null,                // steht nicht im Text
  care_start_timing: null,
  kunde_vorname: null,
  kunde_nachname: null,
  plz: null,
  ort: null,
  provision_pro_tag: 10,
  kontext: 'Ehepaar; die Ehefrau ist nicht pflegebedürftig und hilft beim Transfer. '
    + 'Der Senior ist sehr geschwächt, braucht Unterstützung im Haushalt und bei der '
    + 'Körperhygiene. Hebetechnik erforderlich bei Transfer Bett/Rollstuhl, er kann '
    + 'kurz stehen. WLAN vorhanden.',
};

const ausgabe = (patch: Record<string, unknown> = {}) =>
  pruefeAnfrage({ ...gelesen, ...patch }, kopf, 10);

describe('pruefeAnfrage — echte Anfrage Walde', () => {
  it('liest sechs Felder und lässt drei Lücken offen', () => {
    const r = ausgabe();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.angaben).toEqual({
      betreuung_fuer: '1-person',
      weitere_personen: 'ja',
      deutschkenntnisse: 'kommunikativ',
      erfahrung: 'erfahren',
      fuehrerschein: 'egal',
      geschlecht: 'weiblich',
    });
    /* Die Lücken sind ABWESEND, nicht null: erst ergaenzeAngaben füllt sie
       (mit dem teureren Wert) und schreibt sie nach angenommene_felder.
       Käme hier null an, würde die Kalkulation es als Angabe lesen. */
    expect(r.body.angaben).not.toHaveProperty('mobilitaet');
    expect(r.body.angaben).not.toHaveProperty('nachteinsaetze');
    expect(r.body.angaben).not.toHaveProperty('pflegegrad');
    expect(r.unbekannt).toEqual([]);
    expect(r.hinweise).toEqual([]);
  });

  it('„Hebetechnik erforderlich" wird nicht zu einer Mobilitätsstufe', () => {
    // Beobachtet im Live-Lauf: das Modell lässt mobilitaet leer, statt aus
    // „Transfer Bett/Rollstuhl" eine Stufe zu erfinden. Der Satz gehört in
    // den Kontext — dort steht er auch.
    const r = ausgabe();
    expect(r.ok && r.body.angaben.mobilitaet).toBeUndefined();
    expect(r.ok && r.body.details.block).toMatch(/Hebetechnik/);
  });

  it('Kopfzeile des Kontextblocks kennzeichnet den Haushalt', () => {
    const r = pruefeAnfrage({ ...gelesen, kunde_nachname: 'Schmidt', ort: 'Kassel' }, kopf, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Im Mamamia-Panel trägt der Kunde die Daten des Vermittlers — diese
    // Zeile ist das Einzige, was zwei Anfragen unterscheidet.
    expect(r.body.details.block.split('\n')[0]).toBe('Familie Schmidt, Kassel');
    expect(r.body.details.patient_nachname).toBe('Schmidt');
  });

  it('Einwilligung wird bezeugt, nicht erfunden', () => {
    const r = ausgabe();
    expect(r.ok && r.body.einwilligung.text).toMatch(/liegt beim Vermittler/);
    expect(r.ok && r.body.einwilligung.text).toContain('b.walde@pflegena.com');
    expect(r.ok && r.body.einwilligung.zeitpunkt).toBe('2026-09-08T09:00:00.000Z');
  });

  it('Absendername bleibt der Vermittler, nicht der Kunde', () => {
    const r = pruefeAnfrage({ ...gelesen, kunde_nachname: 'Schmidt' }, kopf, 10);
    expect(r.ok && r.body.name).toBe('Bernd Walde');
    expect(r.ok && r.body.email).toBe('b.walde@pflegena.com');
  });
});

describe('pruefeAnfrage — Werte ausserhalb des Kanons', () => {
  it('sehr-gut-sa wird verworfen und gemeldet', () => {
    // Der L4-Wert existiert in pricing_config (600 €), ist aber nicht
    // wählbar und lässt mapGermanySkill im Onboarding werfen.
    const r = ausgabe({ deutschkenntnisse: 'sehr-gut-sa' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.angaben).not.toHaveProperty('deutschkenntnisse');
    expect(r.unbekannt).toContain('deutschkenntnisse: "sehr-gut-sa"');
  });

  it('Pflegegrad ausserhalb 0-5 und als String wird verworfen', () => {
    expect(ausgabe({ pflegegrad: 7 }).ok && (ausgabe({ pflegegrad: 7 }) as any).unbekannt)
      .toContain('pflegegrad: 7');
    // String-"3" ist keine Zahl: die Koerzierung wäre der Weg, auf dem ''
    // zu 0 und damit zu einem Phantom-„Kein Pflegegrad" würde.
    const s = ausgabe({ pflegegrad: '3' });
    expect(s.ok && (s as any).unbekannt).toContain('pflegegrad: "3"');
  });

  it('explizites pflegegrad 0 ist eine Angabe und wird übernommen', () => {
    const r = ausgabe({ pflegegrad: 0 });
    expect(r.ok && r.body.angaben.pflegegrad).toBe(0);
  });

  it('unbekanntes care_start_timing wird gemeldet statt gesetzt', () => {
    const r = ausgabe({ care_start_timing: 'irgendwann' });
    expect(r.ok && r.body.care_start_timing).toBeUndefined();
    expect(r.ok && (r as any).unbekannt).toContain('care_start_timing: "irgendwann"');
  });
});

describe('pruefeAnfrage — was ein Mensch anschauen muss', () => {
  it('keine Anfrage (Danke, Rückfrage) → abgelehnt, keine Auto-Antwort', () => {
    const r = ausgabe({ ist_anfrage: false });
    expect(r).toEqual({ ok: false, grund: 'keine neue Betreuungsanfrage' });
  });

  it('zwei Haushalte in einer Mail → abgelehnt', () => {
    expect(ausgabe({ mehrere_anfragen: true }).ok).toBe(false);
  });

  it('Nachtrag zu einer früheren Anfrage → abgelehnt', () => {
    expect(ausgabe({ nachtrag: true }).ok).toBe(false);
  });

  it('nichts lesbar → abgelehnt statt Preis aus reiner Annahme', () => {
    const leer: Record<string, unknown> = { ist_anfrage: true, mehrere_anfragen: false, nachtrag: false, kontext: 'x' };
    for (const k of ['betreuung_fuer', 'weitere_personen', 'mobilitaet', 'nachteinsaetze',
      'deutschkenntnisse', 'erfahrung', 'fuehrerschein', 'geschlecht', 'pflegegrad']) leer[k] = null;
    expect(pruefeAnfrage(leer, kopf, 10)).toEqual({ ok: false, grund: 'keine einzige Angabe lesbar' });
  });

  it('Müll statt Objekt → abgelehnt', () => {
    expect(pruefeAnfrage(null, kopf, 10).ok).toBe(false);
    expect(pruefeAnfrage('nope', kopf, 10).ok).toBe(false);
  });
});

describe('pruefeAnfrage — PLZ und Provision', () => {
  it('PLZ ohne Beleg im Mailtext wird verworfen', () => {
    // Eine halluzinierte PLZ steuert den Locations-Lookup und damit, welche
    // Betreuungskräfte der Partner zu sehen bekommt.
    const r = ausgabe({ plz: '34117' });
    expect(r.ok && r.body.plz).toBeUndefined();
    expect(r.ok && (r as any).hinweise[0]).toMatch(/steht weder im Betreff noch im Mailtext/);
  });

  it('PLZ mit Beleg wird übernommen', () => {
    const mitPlz = { ...kopf, text: `${ANFRAGE}\nAdresse: 34117 Kassel` };
    const r = pruefeAnfrage({ ...gelesen, plz: '34117' }, mitPlz, 10);
    expect(r.ok && r.body.plz).toBe('34117');
  });

  it('Teiltreffer in einer längeren Zahl zählt nicht als Beleg', () => {
    const mitTel = { ...kopf, text: `${ANFRAGE}\nTelefon: 0561341179988` };
    expect(pruefeAnfrage({ ...gelesen, plz: '34117' }, mitTel, 10).ok
      && (pruefeAnfrage({ ...gelesen, plz: '34117' }, mitTel, 10) as any).body.plz).toBeUndefined();
  });

  it('abweichende Provision ist ein Hinweis, kein neuer Preis', () => {
    const r = ausgabe({ provision_pro_tag: 15 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hinweise[0]).toMatch(/15 EUR\/Tag, konfiguriert: 10 EUR\/Tag/);
    // Die Zahl fährt NICHT im Body mit — der Preis kommt aus der Konfiguration.
    expect(r.body).not.toHaveProperty('provision_pro_tag');
  });
});

describe('betreffAntwort', () => {
  it('setzt genau ein Re: und räumt gestapelte Präfixe ab', () => {
    expect(betreffAntwort('Anfrage Ehepaar')).toBe('Re: Anfrage Ehepaar');
    expect(betreffAntwort('AW: Re: Anfrage Ehepaar')).toBe('Re: Anfrage Ehepaar');
    expect(betreffAntwort('Fwd: WG: Anfrage')).toBe('Re: Anfrage');
    expect(betreffAntwort('Re[2]: Anfrage')).toBe('Re: Anfrage');
    expect(betreffAntwort('')).toBe('Re: Ihre Anfrage');
    expect(betreffAntwort(null)).toBe('Re: Ihre Anfrage');
  });
});

describe('WERKZEUG-Schema', () => {
  it('bietet dem Modell nur wählbare Werte an', () => {
    const de = (WERKZEUG.input_schema.properties as any).deutschkenntnisse.enum;
    expect(de).toContain('sehr-gut');
    // Was der Kanon verbietet, darf das Modell gar nicht erst sehen.
    expect(de).not.toContain('sehr-gut-sa');
    expect(de).toContain(null);
    expect(de).not.toContain('');
  });
});

describe('VERMITTLER_MAILS', () => {
  it('genau zwei Typen — und niemals die Kundenmail', () => {
    expect([...VERMITTLER_MAILS]).toEqual(['vermittler_angebot', 'vermittler_kraefte']);
    /* 'eingangsbestaetigung' hier hiesse: der Vermittler bekommt die
       Kundenfassung (Portal-Button, Angaben-Tabelle, Abmelde-Link mit
       seinem Token) UND die sechsteilige Nurture-Kette, die
       send-scheduled-emails nach genau diesem Typ scharfschaltet. */
    expect([...VERMITTLER_MAILS]).not.toContain('eingangsbestaetigung');
    expect([...VERMITTLER_MAILS]).not.toContain('angebot');
  });
});

describe('Betreff ist eine vollwertige Quelle', () => {
  /* Echte Betreffs aus dem Postfach (09.09.): Pflegena schreibt Name, Ort
     und Termin dorthin, der Fliesstext wiederholt sie nicht. Ein Beleg-Check
     nur gegen den Text hätte die PLZ jedes zweiten Auftrags verworfen. */
  const mitBetreff = {
    ...kopf,
    betreff: 'Neue Stelle ab sofort Brunhilde Weber 79780 Stühlingen',
    text: 'Guten Tag,\n\nEhepaar, gute Deutschkenntnisse gewünscht.\n\nBernd Walde',
  };

  it('PLZ nur im Betreff zählt als Beleg', () => {
    const r = pruefeAnfrage({ ...gelesen, plz: '79780', ort: 'Stühlingen' }, mitBetreff, 10);
    expect(r.ok && r.body.plz).toBe('79780');
    expect(r.ok && (r as any).hinweise).toEqual([]);
  });

  it('PLZ, die nirgends steht, fliegt weiterhin raus', () => {
    const r = pruefeAnfrage({ ...gelesen, plz: '10115' }, mitBetreff, 10);
    expect(r.ok && r.body.plz).toBeUndefined();
    expect(r.ok && (r as any).hinweise[0]).toMatch(/weder im Betreff noch im Mailtext/);
  });

  it('WERKZEUG bietet dem Modell ein Feld für den Kundennamen an', () => {
    // Der Nachname steht im Betreff — ohne dieses Feld gäbe es im Panel und
    // in der Mail nur „Ihren Kunden".
    expect(WERKZEUG.input_schema.properties).toHaveProperty('kunde_nachname');
  });
});

/* Regression: die Route nahm den Betreff entgegen und baute den Request
   trotzdem nur aus dem Fliesstext. Auf einer echten Mail fiel es nicht auf,
   weil Outlook den Betreff als erste Textzeile wiederholt — bei jedem
   anderen Client waeren Name, PLZ und Termin verschwunden. */
describe('modellNachricht: der Betreff kommt wirklich mit', () => {
  const betreff = 'Neue Stelle ab sofort Brunhilde Weber 79780 Stuehlingen wohnt alleine, bitte kein Mann';

  it('stellt Betreff UND Anfrage als getrennte Bloecke zu', () => {
    const n = modellNachricht(betreff, 'Guten Tag, wenigstens mittlere Deutschkenntnisse.');
    expect(n).toContain('<betreff>');
    expect(n).toContain(betreff);
    expect(n).toContain('<anfrage>');
    expect(n).toContain('wenigstens mittlere Deutschkenntnisse');
    expect(n.indexOf('<betreff>')).toBeLessThan(n.indexOf('<anfrage>'));
  });

  it('traegt die PLZ auch dann, wenn nur der Betreff sie nennt', () => {
    expect(modellNachricht(betreff, 'Guten Tag, haben Sie Vorschlaege?')).toContain('79780');
  });

  it('vertraegt fehlenden Betreff', () => {
    expect(modellNachricht(null, 'Text')).toContain('<betreff>\n\n</betreff>');
  });

  it('kappt einen ausufernden Betreff bei 400 Zeichen', () => {
    const lang = 'A'.repeat(900);
    const n = modellNachricht(lang, 'Text');
    expect(n).toContain('A'.repeat(400));
    expect(n).not.toContain('A'.repeat(401));
  });
});

/* ─── Anhänge ────────────────────────────────────────────────────────────
 *
 * Der Anlass steht in Registry #60: die erste echte Anfrage (09.09., uid
 * 17318) trug ein dreiseitiges Kundenblatt, das der Abholer nie geöffnet
 * hat — er suchte in den Anhängen nur nach ".csv". Pflegegrad, Mobilität
 * und Nachteinsätze wurden geraten, obwohl alle drei im PDF standen.
 *
 * Die Anhang-Liste unten ist die ECHTE aus jener Mail (Logo der Signatur +
 * Kundenblatt), nur der Dateiname des PDFs ist neutralisiert: der Original-
 * name trägt Nachname und Wohnort einer echten Patientin, und die gehören
 * nicht dauerhaft ins Repository. */
describe('waehleDokumente', () => {
  const logo = { contentType: 'image/jpeg', filename: 'image001.jpg', size: 16241, related: true };
  const pdf = { contentType: 'application/pdf', filename: 'Kundenblatt.pdf', size: 764019 };

  it('nimmt das PDF und lässt das Signatur-Logo still liegen', () => {
    const { nehmen, hinweise } = waehleDokumente([logo, pdf]);
    expect(nehmen).toEqual([{ index: 1, name: 'Kundenblatt.pdf' }]);
    // Das Logo hängt in JEDER Mail — ein Hinweis dafür wäre nur Rauschen.
    expect(hinweise).toEqual([]);
  });

  it('erkennt ein PDF auch an der Endung, wenn der Typ octet-stream ist', () => {
    const { nehmen } = waehleDokumente([
      { contentType: 'application/octet-stream', filename: 'Profil.PDF', size: 1000 },
    ]);
    expect(nehmen).toHaveLength(1);
  });

  it('meldet fremde Dateitypen, statt sie stumm zu verschlucken', () => {
    const { nehmen, hinweise } = waehleDokumente([
      { contentType: 'application/msword', filename: 'Bogen.doc', size: 4000 },
    ]);
    expect(nehmen).toEqual([]);
    expect(hinweise[0]).toContain('Bogen.doc');
    expect(hinweise[0]).toContain('application/msword');
  });

  it('hält die Gesamtgrenze ein und sagt, was liegen blieb', () => {
    const gross = { contentType: 'application/pdf', filename: 'gross.pdf', size: DOK_MAX_BYTES_GESAMT };
    const { nehmen, hinweise } = waehleDokumente([gross, { ...pdf, filename: 'zweites.pdf' }]);
    expect(nehmen.map((n) => n.name)).toEqual(['gross.pdf']);
    expect(hinweise.join(' ')).toContain('zweites.pdf');
  });

  it('vergibt einen Namen, wenn der Anhang keinen trägt', () => {
    const { nehmen } = waehleDokumente([{ contentType: 'application/pdf', size: 10 }]);
    expect(nehmen[0].name).toBe('Anhang 1');
  });
});

describe('modellBloecke', () => {
  const dok = { name: 'Kundenblatt.pdf', daten: 'JVBERi0xLjc=' };

  it('ohne Anhang genau ein Textblock — Wort für Wort wie bisher', () => {
    const bloecke = modellBloecke('Betreff', 'Text');
    expect(bloecke).toHaveLength(1);
    expect(bloecke[0]).toEqual({ type: 'text', text: modellNachricht('Betreff', 'Text') });
  });

  it('Dokument zuerst, Text zuletzt', () => {
    const bloecke = modellBloecke('Betreff', 'Text', [dok]);
    expect(bloecke[0].type).toBe('document');
    expect(bloecke[bloecke.length - 1].type).toBe('text');
  });

  it('reicht die Bytes unverändert durch', () => {
    const b = modellBloecke('B', 'T', [dok])[0] as any;
    expect(b.source).toEqual({ type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjc=' });
  });

  /* Diese Zusicherung ist die eigentliche Absicherung: ein unbekanntes Feld
     im Dokumentblock beantwortet die API mit HTTP 400, und 400 heißt im
     Abholer "diese Mail nie wieder". */
  it('der Dokumentblock trägt NICHTS außer type und source', () => {
    const b = modellBloecke('B', 'T', [dok])[0];
    expect(Object.keys(b).sort()).toEqual(['source', 'type']);
  });

  it('nennt die Dateinamen im Textblock', () => {
    const bloecke = modellBloecke('B', 'T', [dok]);
    const text = (bloecke[bloecke.length - 1] as any).text;
    expect(text).toContain('<anhaenge>');
    expect(text).toContain('Kundenblatt.pdf');
  });
});

/* ─── Was aus dem Anhang kommt ───────────────────────────────────────────
 *
 * Die Werte hier sind KANARIENVÖGEL: alles, was in Betreff oder Mailtext
 * ebenfalls vorkommt, taugt nicht als Nachweis, dass das Dokument gelesen
 * wurde. Bei der echten Mail wiederholte Outlook den Betreff als erste
 * Textzeile — eine Zusicherung auf PLZ oder Nachname wäre grün geworden,
 * ohne dass je ein PDF geöffnet wurde.
 *
 * Personenbezug neutralisiert: Straße, Nachname und Geburtsjahr stammen
 * nicht aus dem echten Dokument (Registry #60). Die PLZ bleibt echt, weil
 * genau sie geprüft wird. */
describe('Angaben aus dem Anhang', () => {
  const mitAnhang = (betreff: string | null, anhaenge: number): MailKopf => ({
    von: 'info@pflegena.com',
    vonName: '',
    betreff,
    messageId: '<x@pflegena.com>',
    datum: new Date('2026-09-09T06:25:00.000Z'),
    anhaenge,
    text: 'Guten Tag, siehe Anhang. Freundliche Grüße',
  });
  const roh = (extra: Record<string, unknown>) => ({ ...gelesen, ...extra });

  it('PLZ aus dem Anhang gilt, wenn der Betreff keine nennt', () => {
    const r = pruefeAnfrage(roh({ plz: '79780', ort: 'Stühlingen' }), mitAnhang('Neue Stelle ab sofort', 1), 10);
    expect(r.ok && r.body.plz).toBe('79780');
    expect(r.ok && r.hinweise.join(' ')).toContain('aus dem Anhang');
  });

  /* Der Betreff ist die einzige unabhängige, von einem Menschen geschriebene
     Quelle für den Einsatzort — das PDF können wir nicht gegenlesen. */
  it('bei Widerspruch gewinnt der Betreff, nicht der Anhang', () => {
    const r = pruefeAnfrage(
      roh({ plz: '10115', ort: 'Berlin' }),
      mitAnhang('Neue Stelle 79780 Stühlingen', 1),
      10,
    );
    expect(r.ok && r.body.plz).toBe('79780');
    expect(r.ok && r.hinweise.join(' ')).toContain('weicht vom Betreff');
  });

  it('ohne mitgeschicktes Dokument zählt eine "Anhang"-PLZ gar nicht', () => {
    // Sonst könnte das Modell sich die Tür selbst öffnen.
    const r = pruefeAnfrage(roh({ plz: '79780', ort: 'Stühlingen' }), mitAnhang('Neue Stelle', 0), 10);
    expect(r.ok && r.body.plz).toBeUndefined();
    expect(r.ok && r.hinweise.join(' ')).toContain('verworfen');
  });

  it('Gewicht kommt in Kilogramm und geht als Mamamia-Stufe raus', () => {
    const r = pruefeAnfrage(roh({ gewicht_kg: 50 }), mitAnhang('x', 1), 10);
    expect(r.ok && r.body.details.gewicht).toBe('40-50');
  });

  it('Geburtsjahr nur als plausible Jahreszahl', () => {
    expect(pruefeAnfrage(roh({ geburtsjahr: 1943 }), mitAnhang('x', 1), 10).ok
      && pruefeAnfrage(roh({ geburtsjahr: 1943 }), mitAnhang('x', 1), 10).body.details.geburtsjahr).toBe('1943');
    const unsinn = pruefeAnfrage(roh({ geburtsjahr: 83 }), mitAnhang('x', 1), 10);
    expect(unsinn.ok && unsinn.body.details.geburtsjahr).toBeUndefined();
  });

  it('Geschlecht der betreuten Person genau als Herr/Frau', () => {
    const r = pruefeAnfrage(roh({ patient_geschlecht: 'Frau' }), mitAnhang('x', 1), 10);
    expect(r.ok && r.body.details.patient_anrede).toBe('Frau');
    const falsch = pruefeAnfrage(roh({ patient_geschlecht: 'weiblich' }), mitAnhang('x', 1), 10);
    expect(falsch.ok && falsch.body.details.patient_anrede).toBeUndefined();
  });

  /* "nein" darf NICHT gesetzt werden: der Eingang schneidet diesen Schlüssel
     auf zwei Zeichen ("ne"), und der Mamamia-Mapper vergleicht auf "ja". */
  it('Demenz nur bei ja', () => {
    expect(pruefeAnfrage(roh({ demenz: 'ja' }), mitAnhang('x', 1), 10).ok
      && pruefeAnfrage(roh({ demenz: 'ja' }), mitAnhang('x', 1), 10).body.details.demenz).toBe('ja');
    const nein = pruefeAnfrage(roh({ demenz: 'nein' }), mitAnhang('x', 1), 10);
    expect(nein.ok && nein.body.details.demenz).toBeUndefined();
  });

  it('Straße aus der Adresszeile, ohne PLZ und Ort', () => {
    const r = pruefeAnfrage(
      roh({ einsatzort_adresse: 'Musterweg 4, 79780 Stühlingen', plz: '79780', ort: 'Stühlingen' }),
      mitAnhang('Neue Stelle 79780', 1),
      10,
    );
    expect(r.ok && r.body.details.patient_strasse).toBe('Musterweg 4');
  });

  /* Erkrankungen erreichen Mamamia beim Onboarding nur als Demenz-Beschreibung.
     Damit die Agentur sie überhaupt sieht, müssen sie in den Block, der als
     JobOffer-Beschreibung im Panel steht. */
  it('Diagnosen landen im Block für die Agentur', () => {
    const r = pruefeAnfrage(roh({ diagnosen: 'Parkinson seit 20 Jahren' }), mitAnhang('x', 1), 10);
    expect(r.ok && r.body.details.diagnosen).toBe('Parkinson seit 20 Jahren');
    expect(r.ok && r.body.details.block).toContain('Parkinson seit 20 Jahren');
  });
});
