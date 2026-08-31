/* Prueft den Parser fuer Verbund-Pflegehilfe-Mails (lib/portal-parser.ts)
 * gegen eine echte Anfrage (Elke Preis, 25.04., Anfragen-Nr. 3196061 —
 * Kontaktdaten unveraendert aus der Original-Mail, die Martin am 31.08.
 * bereitgestellt hat).
 *
 * Dieses Projekt hat keinen Testrunner; das Skript laeuft eigenstaendig:
 *
 *   deno run --allow-read --no-check scripts/pruef-portal-parser.ts
 */

import { parsePflegehilfe } from "../lib/portal-parser.ts";
import { ergaenzeAngaben } from "../lib/portal-lead.ts";
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

const r = parsePflegehilfe(mail);
let fehler = 0;
const p = (was: string, ist: unknown, soll: unknown) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"} ${was}: ${JSON.stringify(ist)}${ok ? "" : `  ERWARTET ${JSON.stringify(soll)}`}`);
};

console.log("— Kontakt —");
p("Name", r.kontakt.name, "Frau Elke Preis");
p("E-Mail (nicht die des Portals!)", r.kontakt.email, "elke.preis@freenet.de");
p("Telefon", r.kontakt.telefon, "+49 1731720012");
p("PLZ", r.kontakt.plz, "39615");

console.log("\n— Pflegebedarf —");
p("betreuung_fuer", r.angaben.betreuung_fuer, "1-person");
p("weitere_personen", r.angaben.weitere_personen, "nein");
p("pflegegrad (echt, nicht der Filter 1-5)", r.angaben.pflegegrad, 1);
p("mobilitaet", r.angaben.mobilitaet, "rollator");
p("nachteinsaetze", r.angaben.nachteinsaetze, "nein");
p("deutschkenntnisse", r.angaben.deutschkenntnisse, "sehr-gut");
p("erfahrung", r.angaben.erfahrung, "wuenschenswert");
p("fuehrerschein", r.angaben.fuehrerschein, "nein");
p("geschlecht", r.angaben.geschlecht, "weiblich");
p("Startzeitpunkt", r.care_start_timing, "sofort");

console.log("\n— Nachweise —");
p("Anfragen-Nr.", r.portal_lead_id, "3196061");
p("Einwilligung Zeitpunkt", r.einwilligung?.zeitpunkt, "25. April 08:35");
p("Budgetrahmen", r.budgetrahmen, 2590);
p("nichts unverstanden", r.unbekannt, []);

console.log("\n— Zusammenspiel mit den Annahmen —");
const erg = ergaenzeAngaben(r.angaben, []);
p("nichts musste angenommen werden", erg.angenommen, []);

console.log(fehler === 0 ? "\nALLES GRUEN" : `\n${fehler} FEHLER`);
if (fehler) Deno.exit(1);
