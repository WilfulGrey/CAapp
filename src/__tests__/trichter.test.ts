// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  anfrageZeilen, anfragenCsv, alleSeiten, berlinTagBeginn, berlinZeit, doppelteAnfragen, hinweise, istTestAnfrage,
  kanalJeAnfrage, keywordBereinigen, kostenLage, mitReife, pruefeZeitraum, pseudonym, reifBis, tageCsv, tageZwischen,
  telefonSchluessel, trichterSummen, zielFarbe, ANFRAGEN_SPALTEN, MAX_TAGE_ZURUECK,
  type TLead, type TEreignis, type TAnnahme, type KostenKampagneTag,
} from '../../project 3/lib/trichter';
import { tagPlus } from '../../project 3/lib/wachstum';

// Cross-App-Import (Muster wachstum.test.ts): lib/trichter.ts lebt im Kostenrechner, ist aber
// pure (nur crypto), so läuft der Test im Pflicht-CI.
/*
 * Trichter je Kanal (Registry #142). Geprüft wird, was die Zahlen der Seite verfälschen oder
 * Daten nach außen tragen würde: Kanal-Regeln, Kette, Doppelte (auch vor dem Zeitraum),
 * Team-Indiz ohne Doppelzählung, Buchung, Reife, Kosten je Profil, Pseudonym und CSV.
 */

const HI = '23745538003';
const PM = '23585162828';
let n = 0;
const lead = (extra: Partial<TLead> = {}): TLead => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    created_at: '2026-10-23T08:00:00Z',
    source: 'rechner',
    email: `kunde${n}@gmx.de`,
    telefon: `0171 55${String(n).padStart(5, '0')}`,
    vorname: 'Anna',
    nachname: 'Muster',
    ...extra,
  };
};
const ev = (l: TLead, event_type: string, created_at = '2026-10-23T08:10:00Z', extra: Partial<TEreignis> = {}): TEreignis =>
  ({ lead_id: l.id, event_type, created_at, ...extra });
const JETZT = new Date('2026-10-27T12:00:00Z');
const zeilenFuer = (alle: TLead[], ereignisse: TEreignis[] = [], annahmen: TAnnahme[] = [], von = '2026-10-01', bis = '2026-10-27') =>
  anfrageZeilen({ alle, ereignisse, annahmen, von, bis, jetzt: JETZT, pseudo: (id) => pseudonym(id, 'geheim') });

describe('Tests ausschließen', () => {
  it('Kennzeichen, eigene Domains, „Test" im Namen, Prüfquellen', () => {
    expect(istTestAnfrage(lead({ ist_test: true }))).toBe(true);
    expect(istTestAnfrage(lead({ email: 'x@mamamia.app' }))).toBe(true);
    expect(istTestAnfrage(lead({ email: 'info@primundus.de' }))).toBe(true);
    expect(istTestAnfrage(lead({ email: 'a@wyzzi.net' }))).toBe(true);
    expect(istTestAnfrage(lead({ vorname: 'Test' }))).toBe(true);
    expect(istTestAnfrage(lead({ nachname: 'Müller-Testlauf' }))).toBe(true);
    expect(istTestAnfrage(lead({ source: 'matrix-10-test' }))).toBe(true);
  });
  it('„test" mitten in einer echten Mail-Adresse ist KEIN Test (echte Anfrage 14.09.2026)', () => {
    expect(istTestAnfrage(lead({ email: 'kontestx@web.de' }))).toBe(false);
    expect(istTestAnfrage(lead({ nachname: 'Contesta' }))).toBe(false);
  });
});

describe('Kanal je Anfrage', () => {
  it('eingekauft geht vor allem anderen — Quelle oder Ereignis', () => {
    expect(kanalJeAnfrage(lead({ source: 'portal:pflegehilfe.org', gclid: 'g' }), []).kanal).toBe('eingekauft');
    const l = lead();
    expect(kanalJeAnfrage(l, [ev(l, 'portal_lead_eingekauft')]).kanal).toBe('eingekauft');
  });
  it('Google: Kampagne aus utm_campaign, ohne UTM „ohne Zuordnung", andere ID „sonstige"', () => {
    expect(kanalJeAnfrage(lead({ gclid: 'g1', utm_campaign: HI }), [])).toEqual({ kanal: 'High Intent', herkunft: 'Google Ads' });
    expect(kanalJeAnfrage(lead({ gbraid: 'b1', utm_campaign: PM }), []).kanal).toBe('PM');
    expect(kanalJeAnfrage(lead({ gclid: 'g2' }), []).kanal).toBe('Google ohne Zuordnung');
    expect(kanalJeAnfrage(lead({ wbraid: 'w', utm_campaign: '99999' }), []).kanal).toBe('Google sonstige');
  });
  it('KI-Assistent, Website mit Einstieg, sonstige Kennung, direkt', () => {
    expect(kanalJeAnfrage(lead({ utm_source: 'chatgpt.com' }), [])).toEqual({ kanal: 'KI-Assistent', herkunft: 'KI-Assistent (chatgpt.com)' });
    const w = lead({ source: 'website:apex-kosten' });
    expect(kanalJeAnfrage(w, [ev(w, 'website_einstieg', undefined, { art: 'neu', herkunft: 'google' })]))
      .toEqual({ kanal: 'Website', herkunft: 'Website primundus.de (Herkunft google)' });
    expect(kanalJeAnfrage(lead({ source: 'website:apex-kosten' }), []).herkunft).toBe('Website primundus.de (Herkunft unbekannt)');
    expect(kanalJeAnfrage(lead({ utm_source: 'newsletter', utm_medium: 'email' }), []))
      .toEqual({ kanal: 'sonstige', herkunft: 'sonstige Kennung (newsletter/email)' });
    expect(kanalJeAnfrage(lead(), []).kanal).toBe('direkt');
  });
  it('Fremdtext aus der Adresse wird nicht durchgereicht', () => {
    expect(kanalJeAnfrage(lead({ utm_source: 'max@mail.de; =HYPERLINK' }), []).herkunft).toBe('sonstige Kennung (unlesbar/)');
  });
});

describe('Doppelte', () => {
  it('gleiche Mail, Telefon (normalisiert) oder gclid wie eine frühere Anfrage — auch vor dem Zeitraum', () => {
    const alt = lead({ created_at: '2026-08-20T10:00:00Z', email: 'Oma@Web.de', telefon: '+49 171 1234567', gclid: 'klick-1' });
    const perMail = lead({ email: ' oma@web.de ', telefon: '' });
    const perTel = lead({ email: 'neu@web.de', telefon: '0171/1234567' });
    const perKlick = lead({ email: 'anders@web.de', telefon: '', gclid: 'klick-1' });
    const neu = lead();
    const d = doppelteAnfragen([perMail, alt, perTel, perKlick, neu]);
    expect(d.get(perMail.id)?.id).toBe(alt.id);
    expect(d.get(perTel.id)?.id).toBe(alt.id);
    expect(d.get(perKlick.id)?.id).toBe(alt.id);
    expect(d.has(neu.id)).toBe(false);
    expect(d.has(alt.id)).toBe(false);
    const { zeilen } = zeilenFuer([alt, perMail, neu]);
    const z = zeilen.find((x) => x.leadId === perMail.id)!;
    expect(z.doppelt).toBe(true);
    expect(z.doppeltZu).toBe(pseudonym(alt.id, 'geheim'));
    expect(z.doppeltZuVorZeitraum).toBe(true);
    expect(zeilen.find((x) => x.leadId === alt.id)).toBeUndefined(); // vor dem Zeitraum
  });
  it('eine Test-Anfrage macht keine spätere echte zur Doppelten', () => {
    const t = lead({ created_at: '2026-10-01T08:00:00Z', email: 'oma@web.de', ist_test: true });
    const echt = lead({ email: 'oma@web.de' });
    expect(doppelteAnfragen([t, echt]).has(echt.id)).toBe(false);
  });
  it('Telefonschlüssel: +49, 0049 und führende Null gleich, zu kurz ⇒ leer', () => {
    expect(telefonSchluessel('+49 (171) 123 4567')).toBe(telefonSchluessel('01711234567'));
    expect(telefonSchluessel('0049 171 1234567')).toBe('711234567');
    expect(telefonSchluessel('123')).toBe('');
  });
});

describe('Kette je Anfrage', () => {
  it('Portal, Bogen, Profil selbst, Einladung, Bewerbung, Buchung', () => {
    const l = lead({ created_at: '2026-10-23T08:00:00Z' });
    const { zeilen, tests } = zeilenFuer([l, lead({ ist_test: true })], [
      ev(l, 'portal_reopened', '2026-10-23T09:00:00Z'), ev(l, 'portal_opened', '2026-10-23T08:01:00Z'),
      ev(l, 'formular_sichtbar'), ev(l, 'feld_beruehrt'), ev(l, 'weiter_blockiert'), ev(l, 'weiter_blockiert'),
      ev(l, 'patient_form_step', '2026-10-23T08:05:00Z', { step: '1' }), ev(l, 'patient_form_step', '2026-10-23T08:07:00Z', { step: '3' }),
      ev(l, 'patient_data_saved', '2026-10-23T08:42:00Z'), ev(l, 'caregiver_invited', '2026-10-24T08:00:00Z'),
      ev(l, 'application_received', '2026-10-24T10:00:00Z'), ev(l, 'patient_form_save_failed'),
    ], [{ lead_id: l.id, accepted_at: '2026-10-26T09:00:00Z', signed_at: '2026-10-26T09:05:00Z' }]);
    expect(tests).toBe(1);
    expect(zeilen).toHaveLength(1);
    const z = zeilen[0];
    expect(z.zeit).toBe('2026-10-23 10:00'); // Berliner Zeit
    expect(z).toMatchObject({
      portalGeoeffnet: true, portalBesuche: 2, portalErstmals: '2026-10-23 10:01', bogenGemessen: true, bogenImBild: true,
      feldBeruehrt: true, weiterBlockiert: 2, bogenBegonnen: true, hoechsterSchritt: 3, profilSelbst: true, profilMinuten: 42,
      teamIndiz: false, einladungen: 1, bewerbungen: 1, speicherfehler: 1, buchung: true, buchungZeit: '2026-10-26 10:00', // Winterzeit seit 25.10.
      vertragUnterschrieben: '2026-10-26 10:05', profilGeoeffnet: false,
    });
  });
  it('vor dem 22.10.2026, 15:29 ist „Bogen im Bild" nicht gemessen, vor dem 14.10. „Profil geöffnet" auch nicht', () => {
    const vor = lead({ created_at: '2026-10-22T13:28:00Z' });
    const alt = lead({ created_at: '2026-10-10T10:00:00Z' });
    const { zeilen } = zeilenFuer([vor, alt], [ev(vor, 'formular_sichtbar')]);
    const z = zeilen.find((x) => x.leadId === vor.id)!;
    expect(z.bogenGemessen).toBe(false);
    expect(z.bogenImBild).toBe(false);
    expect(zeilen.find((x) => x.leadId === alt.id)!.profilGeoeffnet).toBeNull();
  });
  it('Team-Indiz: Einladung oder Bewerbung ohne gespeicherten Bogen — nie zusätzlich zum eigenen Profil', () => {
    const team = lead();
    const selbst = lead();
    const nichts = lead();
    const { zeilen } = zeilenFuer([team, selbst, nichts], [
      ev(team, 'application_received'), ev(selbst, 'patient_data_saved'), ev(selbst, 'caregiver_invited'),
    ]);
    const t = trichterSummen(zeilen, kostenLage({ kampagne: [], gesamt: [], von: '2026-10-23', bis: '2026-10-23', heute: '2026-10-27' }), ['2026-10-23']);
    expect(t.zusammen).toMatchObject({ anfragen: 3, profilSelbst: 1, teamIndiz: 1, profileGesamt: 2, mitEinladung: 1, mitBewerbung: 1 });
  });
  it('Buchung = erste Annahme', () => {
    const l = lead();
    const { zeilen } = zeilenFuer([l], [], [
      { lead_id: l.id, accepted_at: '2026-10-25T10:00:00Z', signed_at: null },
      { lead_id: l.id, accepted_at: '2026-10-24T10:00:00Z', signed_at: '2026-10-24T11:00:00Z' },
    ]);
    expect(zeilen[0].buchungZeit).toBe('2026-10-24 12:00');
    expect(zeilen[0].vertragUnterschrieben).toBe('2026-10-24 13:00');
  });
});

describe('Reife', () => {
  it('Anfrage reif ab 72 Stunden; reifer Tag = ganzer Tag älter als 72 Stunden', () => {
    const alt = lead({ created_at: '2026-10-24T11:59:00Z' });
    const jung = lead({ created_at: '2026-10-24T12:01:00Z' });
    const { zeilen } = zeilenFuer([alt, jung]);
    expect(zeilen.find((z) => z.leadId === alt.id)!.reif).toBe(true);
    expect(zeilen.find((z) => z.leadId === jung.id)!.reif).toBe(false);
    // 27.10. 12:00 UTC − 72 h = 24.10. 12:00 UTC ⇒ der 24.10. ist noch nicht ganz reif
    expect(reifBis(JETZT)).toBe('2026-10-23');
    const tage = mitReife([{ tag: '2026-10-23' }, { tag: '2026-10-24' }] as never, reifBis(JETZT));
    expect(tage.map((t) => t.reif)).toEqual([true, false]);
  });
});

describe('Kosten je Profil', () => {
  const kampagne = (tag: string, id: string, kosten: number): KostenKampagneTag => ({ tag, kampagne_id: id, kosten_netto: kosten });
  const zweiTage = ['2026-10-23', '2026-10-24'];
  const daten = () => {
    const a = lead({ gclid: 'a', utm_campaign: HI, created_at: '2026-10-23T08:00:00Z' });
    const b = lead({ gclid: 'b', utm_campaign: HI, created_at: '2026-10-24T08:00:00Z' });
    const c = lead({ source: 'portal:pflegehilfe.org', created_at: '2026-10-24T08:00:00Z' });
    const d = lead({ source: 'portal:neuesportal.de', created_at: '2026-10-24T09:00:00Z' });
    return zeilenFuer([a, b, c, d], [ev(a, 'patient_data_saved'), ev(b, 'caregiver_invited'), ev(c, 'patient_data_saved')]).zeilen;
  };

  it('High Intent aus den Kampagnen-Kosten, eingekauft zum Stückpreis, Farbe gegen das Ziel', () => {
    const lage = kostenLage({
      kampagne: [kampagne('2026-10-23', HI, 70), kampagne('2026-10-24', HI, 80), kampagne('2026-10-24', PM, 30)],
      gesamt: [{ tag: '2026-10-23', kosten_netto: 70 }, { tag: '2026-10-24', kosten_netto: 110 }],
      von: zweiTage[0], bis: zweiTage[1], heute: '2026-10-27',
    });
    const t = trichterSummen(daten(), lage, zweiTage);
    const hi = t.kanaele.find((k) => k.kanal === 'High Intent')!;
    expect(hi).toMatchObject({ anfragen: 2, profilSelbst: 1, teamIndiz: 1, profileGesamt: 2, kosten: 150, jeProfil: 75, jeProfilSelbst: 150, farbe: 'gruen', farbeSelbst: 'rot' });
    // PM hatte Kosten, aber keine Anfrage: steht trotzdem da, ohne Profil ⇒ kein Wert je Profil.
    expect(t.kanaele.find((k) => k.kanal === 'PM')).toMatchObject({ anfragen: 0, kosten: 30, jeProfil: null });
    const ek = t.kanaele.find((k) => k.kanal === 'eingekauft')!;
    expect(ek).toMatchObject({ anfragen: 2, kosten: 37, profileGesamt: 1, jeProfil: 37 });
    expect(t.ohnePreis).toEqual(['neuesportal.de']);
    expect(t.google).toEqual({ tageskosten: 180, kampagnenkosten: 180 });
    expect(t.zusammen.kosten).toBe(217);
    const tagHi = t.tage.find((x) => x.tag === '2026-10-24' && x.kanal === 'High Intent')!;
    expect(tagHi.kosten).toBe(80);
  });

  it('fehlt ein Tag in der Kampagnen-Tabelle, bleiben die Google-Kosten leer (keine Teilsumme)', () => {
    const lage = kostenLage({
      kampagne: [kampagne('2026-10-24', HI, 80)],
      gesamt: [{ tag: '2026-10-23', kosten_netto: 70 }, { tag: '2026-10-24', kosten_netto: 80 }],
      von: zweiTage[0], bis: zweiTage[1], heute: '2026-10-27',
    });
    expect(lage.fehlendeTage).toEqual(['2026-10-23']);
    const t = trichterSummen(daten(), lage, zweiTage);
    expect(t.kanaele.find((k) => k.kanal === 'High Intent')).toMatchObject({ kosten: null, jeProfil: null, farbe: null });
    expect(t.zusammen.kosten).toBeNull();
    const h = hinweise({ lage, von: zweiTage[0], bis: zweiTage[1], heute: '2026-10-27', reifBis: '2026-10-23', trichter: t });
    expect(h.join(' ')).toContain('Kosten je Kampagne fehlen für 1 Tag');
  });

  it('ein Tag mit 0 € Google-Kosten braucht keine Kampagnen-Zeile; heute fehlt nie', () => {
    const lage = kostenLage({
      kampagne: [kampagne('2026-10-24', HI, 80)],
      gesamt: [{ tag: '2026-10-23', kosten_netto: 0 }, { tag: '2026-10-24', kosten_netto: 80 }],
      von: '2026-10-23', bis: '2026-10-27', heute: '2026-10-27',
    });
    expect(lage.fehlendeTage).toEqual(['2026-10-25', '2026-10-26']);
  });

  it('ohne Tabelle: alle Tage fehlen, Hinweis statt Fehler', () => {
    const lage = kostenLage({ kampagne: null, gesamt: [], von: zweiTage[0], bis: zweiTage[1], heute: '2026-10-27' });
    expect(lage.tabelleDa).toBe(false);
    const t = trichterSummen(daten(), lage, zweiTage);
    const h = hinweise({ lage, von: zweiTage[0], bis: zweiTage[1], heute: '2026-10-27', reifBis: '2026-10-23', trichter: t });
    expect(h[0]).toContain('ads_kosten_kampagne_tag fehlt');
    expect(t.kanaele.find((k) => k.kanal === 'eingekauft')!.kosten).toBe(37); // Einkauf bleibt
  });

  it('Zielkorridor: bis 80 € grün, bis 100 € gelb, darüber rot', () => {
    expect(zielFarbe(60)).toBe('gruen');
    expect(zielFarbe(80)).toBe('gruen');
    expect(zielFarbe(80.01)).toBe('gelb');
    expect(zielFarbe(100)).toBe('gelb');
    expect(zielFarbe(100.5)).toBe('rot');
    expect(zielFarbe(null)).toBeNull();
  });
});

describe('Pseudonym und CSV', () => {
  it('Pseudonym: stabil, Format A-12 Hex, ungleich der ID, abhängig vom Geheimnis', () => {
    const id = '39e4ab12-44d6-49ca-8cda-ad769942f519';
    const p = pseudonym(id, 'geheim');
    expect(p).toMatch(/^A-[0-9a-f]{12}$/);
    expect(pseudonym(id, 'geheim')).toBe(p);
    expect(pseudonym(id, 'anders')).not.toBe(p);
    expect(p).not.toContain(id.slice(0, 8));
  });

  it('Anfragen-CSV: Erlaubnisliste, keine Kontaktdaten, Klickkennungen oder Lead-IDs', () => {
    const l = lead({
      email: 'erika.mustermann@example-mail.de', telefon: '+49 171 9876543', vorname: 'Erika', nachname: 'Mustermann',
      gclid: 'Cj0KCQjw-GEHEIM-KLICK', gbraid: 'GBRAID-GEHEIM', utm_campaign: HI, utm_content: '781234567890', utm_term: '+24 stunden pflege',
    });
    const zweit = lead({ email: 'erika.mustermann@example-mail.de', wbraid: 'WBRAID-GEHEIM' });
    const { zeilen } = zeilenFuer([l, zweit], [ev(l, 'patient_data_saved')]);
    const text = anfragenCsv(zeilen);
    expect(text.startsWith('﻿')).toBe(true);
    const zeilenText = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(zeilenText[0].split(';')).toEqual(ANFRAGEN_SPALTEN);
    for (const verboten of [l.id, zweit.id, 'erika', 'mustermann', '9876543', '1719876543', 'GEHEIM', 'Cj0KCQjw', 'token', 'email', 'telefon']) {
      expect(text.toLowerCase(), verboten).not.toContain(verboten.toLowerCase());
    }
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    const zeileL = zeilenText.find((z) => z.startsWith(pseudonym(l.id, 'geheim')))!;
    const erste = Object.fromEntries(ANFRAGEN_SPALTEN.map((k, i) => [k, zeileL.split(';')[i]]));
    expect(erste).toMatchObject({ kanal: 'High Intent', kampagne_id: HI, google_kampagne: 'High Intent', anzeigen_id: '781234567890', keyword: "'+24 stunden pflege", profil_vollstaendig: 'ja', profil_gesamt: 'ja' });
    expect(erste.anfrage_id).toBe(pseudonym(l.id, 'geheim'));
  });

  it('Keyword mit Kontaktdaten-Anschein bleibt leer', () => {
    expect(keywordBereinigen('Pflege Kosten')).toBe('pflege kosten');
    expect(keywordBereinigen('oma@web.de')).toBe('');
    expect(keywordBereinigen('0171 1234567')).toBe('');
  });

  it('Tage-CSV mit Kosten in deutscher Schreibweise und Reife', () => {
    const lage = kostenLage({ kampagne: [{ tag: '2026-10-23', kampagne_id: HI, kosten_netto: 70.5 }], gesamt: [{ tag: '2026-10-23', kosten_netto: 70.5 }], von: '2026-10-23', bis: '2026-10-23', heute: '2026-10-27' });
    const a = lead({ gclid: 'x', utm_campaign: HI });
    const { zeilen } = zeilenFuer([a], [ev(a, 'patient_data_saved')]);
    const t = trichterSummen(zeilen, lage, ['2026-10-23']);
    const text = tageCsv(mitReife(t.tage, '2026-10-23'));
    expect(text).toContain('2026-10-23;High Intent;1;0;0;0;0;1;0;1;0;0;0;70,50;70,50;ja');
  });
});

describe('Zeitraum und Zeit', () => {
  it('Standard 30 Tage bis heute; höchstens 400 Tage zurück; Zukunft auf heute; Fehler klar', () => {
    expect(pruefeZeitraum(null, null, '2026-10-27')).toEqual({ ok: true, wert: { von: '2026-09-28', bis: '2026-10-27', hinweis: null } });
    const weit = pruefeZeitraum('2024-01-01', '2026-10-27', '2026-10-27');
    expect(weit.ok && weit.wert.von).toBe(tagPlus('2026-10-27', -MAX_TAGE_ZURUECK));
    expect(tageZwischen('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(weit.ok && weit.wert.hinweis).toContain(String(MAX_TAGE_ZURUECK));
    expect(pruefeZeitraum('2026-10-01', '2026-12-31', '2026-10-27')).toMatchObject({ ok: true, wert: { bis: '2026-10-27' } });
    expect(pruefeZeitraum('2026-02-30', null, '2026-10-27').ok).toBe(false);
    expect(pruefeZeitraum('2026-10-20', '2026-10-10', '2026-10-27').ok).toBe(false);
  });
  it('Berliner Tagesbeginn in Sommer- und Winterzeit', () => {
    expect(berlinTagBeginn('2026-09-01').toISOString()).toBe('2026-08-31T22:00:00.000Z');
    expect(berlinTagBeginn('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(berlinTagBeginn('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z'); // Umstellungstag
    expect(berlinZeit('2026-10-25T01:30:00Z')).toBe('2026-10-25 02:30');
  });
  it('alleSeiten liest weiter, bis eine Seite nicht voll ist', async () => {
    const daten = Array.from({ length: 2345 }, (_, i) => i);
    const abrufe: number[] = [];
    const alle = await alleSeiten<number>(async (a, b) => { abrufe.push(a); return { data: daten.slice(a, b + 1), error: null }; });
    expect(alle).toHaveLength(2345);
    expect(abrufe).toEqual([0, 1000, 2000]);
  });
});
