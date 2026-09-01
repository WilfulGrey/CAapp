import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Module, Muster wie portalUrl.test.ts) — siehe
// Kommentar in portalLead.test.ts. Fixture: eine echte (anonymisierte)
// Pflegehilfe-Lead-Mail — der Parser muss die Kundendaten treffen, nicht
// die des Portals, und den echten Pflegegrad, nicht den Filter "1-5".
import { parsePflegehilfe } from '../../project 3/lib/portal-parser';
import { ergaenzeAngaben } from '../../project 3/lib/portal-lead';

const mail = `
Verbund Pflegehilfe Kontakt: Elke Preis
An: kundenservice@primundus.de

Sehr geehrte Damen und Herren,
aufgrund Ihrer Kapazitätsmeldung erhalten Sie untenstehend die Kontaktdaten mit der
Anfragen-Nummer 3196061. Wir danken Ihnen für eine zeitnahe Kontaktaufnahme.
Die Kontaktdaten wurden an bis zu drei Anbieter gesendet.

Kontaktinformationen des Interessenten
Ansprechpartner	Frau Elke Preis
Mobil	+49 1731720012
Email	elke.preis@freenet.de
Anschrift	Am Goldfischteich 18
DE-39615 Seehausen
Erreichbarkeit	Tel. ganztags erreichbar

Informationen zum Senior
Beziehung	Mutter
Lebenssituation	Lebt alleine,
Pflegegrad	Pflegegrad 1
Mobilität	Mobil mit Rollator
Medizinischer Hintergrund:
Lendenwirbelbruch, körperliche Einschränkungen, geistig fit

Anfragedetails: 24 Stunden Betreuung (Anfragen-Nr. 3196061)
Bedarfsort: 39615 Seehausen (Altmark)-DE
Auftraggeber/Kontaktperson: Angehörige
Zimmer für Betreuungskraft: Vorhanden
Budgetrahmen: 2590€
Dauer: Befristet
Kundenservice durch Agentur: Vor-Ort / Per Telefon
Geschlecht: Weiblich
Deutschkenntnisse: Gut (B1 & B2)
Pflegeerfahrung: Grundkenntnisse
Führerschein: Nicht benötigt
Internetanschluss: Nicht vorhanden
Nächtliche Einsätze: Nicht erforderlich
Personen im Haushalt: Eine
Anzahl Pflegebedürftige: Eine
Pflegegrad/-stufe: 1-5
Mobilität: Mobil mit Hilfsmittel
Körpergewicht des Patienten: 73kg
Multiresistente Keime: Liegt nicht vor
Bedarf: Schnellstmöglich

Beratungsgespräch durchgeführt: Annalena Hill
Beratungsgespräch durchgeführt: 25. April 08:35

Datenschutz
Zustimmung zur Datenschutzerklärung: 23. April 19:59
Zustimmung zur Kontaktweitergabe: 25. April 08:35

Bei Rückfragen stehen wir Ihnen gerne per E-Mail unter
partnerbetreuung@pflegehilfe.de oder per Telefon 06131/26 52 011 zur Verfügung.
`;

describe('parsePflegehilfe (Portal-Lead-Mail)', () => {
  const r = parsePflegehilfe(mail);

  it('Kontakt: Name, E-Mail des Kunden (nicht die des Portals!), Telefon, PLZ', () => {
    expect(r.kontakt.name).toBe('Frau Elke Preis');
    expect(r.kontakt.email).toBe('elke.preis@freenet.de');
    expect(r.kontakt.telefon).toBe('+49 1731720012');
    expect(r.kontakt.plz).toBe('39615');
  });

  it('Pflegebedarf: echte Werte, nicht die Filter-Zeilen', () => {
    expect(r.angaben.betreuung_fuer).toBe('1-person');
    expect(r.angaben.weitere_personen).toBe('nein');
    // "Pflegegrad 1" (der echte), NICHT "Pflegegrad/-stufe: 1-5" (der Filter).
    expect(r.angaben.pflegegrad).toBe(1);
    expect(r.angaben.mobilitaet).toBe('rollator');
    expect(r.angaben.nachteinsaetze).toBe('nein');
    expect(r.angaben.deutschkenntnisse).toBe('sehr-gut');
    expect(r.angaben.erfahrung).toBe('wuenschenswert');
    expect(r.angaben.fuehrerschein).toBe('nein');
    expect(r.angaben.geschlecht).toBe('weiblich');
    expect(r.care_start_timing).toBe('sofort');
  });

  it('Nachweise: Anfragen-Nr., Einwilligung, Budget — und nichts unverstanden', () => {
    expect(r.portal_lead_id).toBe('3196061');
    expect(r.einwilligung?.zeitpunkt).toBe('25. April 08:35');
    expect(r.budgetrahmen).toBe(2590);
    expect(r.unbekannt).toEqual([]);
  });

  it('Zusammenspiel mit den Annahmen: vollständige Mail → nichts wird angenommen', () => {
    const erg = ergaenzeAngaben(r.angaben, []);
    expect(erg.angenommen).toEqual([]);
  });
});

describe('parsePflegehilfe — weitergeleitete Mail (Fwd)', () => {
  /* Test Zauner 01.09. (prod uid 14): ein "Fwd:" setzt Zitat-Marker vor
   * jede Zeile und streut Soft-Hyphens in die Labels — ohne Normalisierung
   * las der Parser 0 Felder und fand keinen Einwilligungsnachweis. */
  const fwd = mail
    .split('\n')
    .map((z) => `>  \t${z}`)
    .join('\n')
    .replace('Datenschutzerklärung', 'Datenschutz­erklärung');

  it('Zitat-Marker + Soft-Hyphens: Einwilligung und Felder werden trotzdem gelesen', () => {
    const f = parsePflegehilfe(fwd);
    expect(f.einwilligung?.zeitpunkt).toBe('25. April 08:35');
    expect(f.kontakt.email).toBe('elke.preis@freenet.de');
    expect(f.angaben.pflegegrad).toBe(1);
    expect(f.portal_lead_id).toBe('3196061');
  });
});
