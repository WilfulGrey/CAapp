import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Module, Muster wie portalUrl.test.ts).
import { parseCsv, csvZuLeadZeile, csvZeileBrauchbar } from '../../project 3/lib/portal-csv';
import { parsePflegehilfe } from '../../project 3/lib/portal-parser';

/* Die ECHTE CSV aus der ersten Portal-Mail (Zauner, prod uid 14) —
 * verbatim, inkl. mehrzeiligem, gequotetem RequestDetail. Genau dieser
 * Anhang bewies, dass der Mailtext (zumal weitergeleitet) die schlechtere
 * Quelle ist: dort fehlten Name, Telefon, Pflegegrad und Mobilität. */
const zaunerCsv = `RequestNumber,Sex,AcademicDegree,FirstName,SurName,AddressLine1,ZipCode,City,CountryIso2,Email,PhoneType,Phone,Availability,SeniorSex,SeniorAcademicDegree,SeniorFirstName,SeniorSurName,SeniorRelationship,SeniorLiveSituation,SeniorCareLevel,SeniorMobility,SeniorAge,SeniorMedicalProcess,RequestZipCode,RequestRegion,RequestCountryIso2,RequestDetail,ProductName,EmployeeFirstName,EmployeeSurName,FinishedDateTime,CreateDateTime
13535387,Herr,,Michael,Zauner,,,,DE,family.zauner@gmail.com,Mobile,+49 17641239037,Ganztägig telefonisch gut erreichbar,,,,,Schwiegervater,Lebt alleine,Pflegegrad 3,Mobil ohne Hilfsmittel,,Demenz,95703,Plößberg,DE,"Auftraggeber/Kontaktperson: Angehörige/Betreuer
Budgetrahmen: 2900€ bis 3500€
Dauer: Unbefristet
Kundenservice durch Agentur: Vor-Ort oder Per Telefon
Geschlecht: Weiblich
Deutschkenntnisse: Gut (B1 & B2)
Pflegeerfahrung: Grundkenntnisse
Führerschein: Benötigt
Zimmer für Betreuungskraft: Vorhanden
Internetanschluss: Vorhanden
Nächtliche Einsätze: Nicht erforderlich
Personen im Haushalt: Eine
Anzahl Pflegebedürftige: Eine
Pflegegrad/-stufe: 3
Mobilität: Mobil ohne Hilfsmittel
Körpergewicht des Patienten: 70 kg
Krankheiten: Demenz
Bedarf: In Wochen",24 Stunden Betreuung,Robin,Ottermann,01.09.2026 11:05:32,01.09.2026 10:59:54
`;

describe('parseCsv (RFC 4180)', () => {
  it('liest gequotete, mehrzeilige Felder als EINE Zeile', () => {
    const zeilen = parseCsv(zaunerCsv);
    expect(zeilen).toHaveLength(2); // Kopf + eine Datenzeile
    expect(zeilen[1][0]).toBe('13535387');
    expect(zeilen[1][26]).toContain('Bedarf: In Wochen'); // RequestDetail komplett
  });

  it('escapte Anführungszeichen ("")', () => {
    expect(parseCsv('a,"x ""y"" z",b')).toEqual([['a', 'x "y" z', 'b']]);
  });
});

describe('CSV → parsePflegehilfe (Zauner end-to-end)', () => {
  const zeilen = parseCsv(zaunerCsv);
  const { text, zusatz } = csvZuLeadZeile(zeilen[0], zeilen[1]);
  const r = parsePflegehilfe(text);

  it('Kontakt vollständig — genau die Felder, die der Fwd-Text verlor', () => {
    expect(r.kontakt.name).toBe('Herr Michael Zauner');
    expect(r.kontakt.email).toBe('family.zauner@gmail.com');
    expect(r.kontakt.telefon).toBe('+49 17641239037');
    expect(r.kontakt.plz).toBe('95703');
    expect(r.kontakt.ort).toBe('Plößberg');
  });

  it('Pflegegrad 3 (Spalte schlägt den "/-stufe"-Filter) + Mobilität "ohne Hilfsmittel" = mobil', () => {
    expect(r.angaben.pflegegrad).toBe(3);
    expect(r.angaben.mobilitaet).toBe('mobil');
  });

  it('übrige Angaben aus dem RequestDetail-Block', () => {
    expect(r.angaben.betreuung_fuer).toBe('1-person');
    expect(r.angaben.weitere_personen).toBe('nein');
    expect(r.angaben.nachteinsaetze).toBe('nein');
    expect(r.angaben.deutschkenntnisse).toBe('sehr-gut');
    expect(r.angaben.erfahrung).toBe('wuenschenswert');
    expect(r.angaben.fuehrerschein).toBe('ja');
    expect(r.angaben.geschlecht).toBe('weiblich');
    expect(r.care_start_timing).toBe('2-4-wochen');
    expect(r.portal_lead_id).toBe('13535387');
    expect(r.budgetrahmen).toBe(2900);
  });

  it('zusatz archiviert die Spalten ohne Zuhause bei uns', () => {
    expect(zusatz.SeniorMedicalProcess).toBe('Demenz');
    expect(zusatz.SeniorRelationship).toBe('Schwiegervater');
    expect(zusatz.RequestDetail).toContain('Körpergewicht des Patienten: 70 kg');
    expect(zusatz.CreateDateTime).toBe('01.09.2026 10:59:54');
  });

  it('Einwilligung kommt bewusst NICHT aus der CSV (nur der Mailtext trägt sie)', () => {
    expect(r.einwilligung).toBeUndefined();
  });

  it('details (Registry #43): Gewicht-Bucket, Internet, Diagnosen, Demenz-Flag', () => {
    expect(r.details?.gewicht).toBe('61-70');        // 70 kg
    expect(r.details?.internet).toBe('ja');          // Vorhanden
    expect(r.details?.diagnosen).toBe('Demenz');
    expect(r.details?.demenz).toBe('ja');
  });

  it('Senior-Geschlecht: SeniorSex leer, aber "Schwiegervater" IST ein Mann (Registry #45)', () => {
    expect(r.details?.patient_anrede).toBe('Herr');
  });

  it('details.block: Kontext für die JobOffer-Beschreibung', () => {
    expect(r.details?.block).toContain('Beziehung: Schwiegervater');
    expect(r.details?.block).toContain('Lebenssituation: Lebt alleine');
    expect(r.details?.block).toContain('Dauer: Unbefristet');
    expect(r.details?.block).toContain('Zimmer für Betreuungskraft: Vorhanden');
    expect(r.details?.block).toContain('Körpergewicht des Patienten: 70 kg');
  });
});

describe('parsePflegehilfe — "Mobil ohne Hilfsmittel" auch im Mailtext', () => {
  it('rutscht nicht mehr in rollator', () => {
    expect(parsePflegehilfe('Mobilität\tMobil ohne Hilfsmittel').angaben.mobilitaet).toBe('mobil');
    expect(parsePflegehilfe('Mobilität\tMobil mit Hilfsmittel').angaben.mobilitaet).toBe('rollator');
  });
});


describe('csvZeileBrauchbar (Registry #46 — handverstümmelte CSV)', () => {
  it('die GANZE Zeile in einem Anführungszeichenpaar → 1 Feld → unbrauchbar', () => {
    /* Test „Marcin Testerowany" 03.09. (uid 28): manuell editierte CSV,
       Datenzeile komplett gequotet. RFC-4180-korrekt = EIN Riesenfeld. */
    const kopf = 'A,B,C,D,E,F,G,H'.split(',');
    const zeilen = parseCsv('A,B,C,D,E,F,G,H\n"1,Herr,,X,,DE,x@y.de,+49"');
    expect(zeilen[1].length).toBe(1);
    expect(csvZeileBrauchbar(kopf, zeilen[1])).toBe(false);
  });

  it('auch der KOPF verklumpt zu 1 Feld (Realfall uid 28) → unbrauchbar', () => {
    /* Live-Befund: parseCsv lieferte kopf=1 Feld UND zeile=1 Feld —
       das Verhaeltnis 1>=1 bestand, die Spaltennamen fehlten trotzdem. */
    const kopf = ['RequestNumber,Sex,AcademicDegree,Email,Phone'];
    expect(csvZeileBrauchbar(kopf, ['1,Herr,,x@y.de,+49'])).toBe(false);
  });

  it('normale Zeile (auch mit fehlenden hinteren Spalten) bleibt brauchbar', () => {
    const kopf = ['Email', ...new Array(31).fill('k')];
    expect(csvZeileBrauchbar(kopf, new Array(32).fill(''))).toBe(true);
    expect(csvZeileBrauchbar(kopf, new Array(16).fill(''))).toBe(true);
    expect(csvZeileBrauchbar(kopf, new Array(15).fill(''))).toBe(false);
  });
});
