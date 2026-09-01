/* Prueft die Default-Regel fuer eingekaufte Leads (lib/portal-lead.ts):
 * fehlende Angaben werden zum TEUREREN Wert angenommen — ausser beim
 * Pflegegrad, wo mehr Grad mehr Zuschuss und damit weniger Eigenanteil
 * bedeutet.
 *
 * Dieses Projekt hat keinen Testrunner; das Skript laeuft eigenstaendig:
 *
 *   deno run --allow-read --no-check scripts/pruef-portal-defaults.ts
 */
// pricing_config-Ausschnitt: pro Kategorie mehrere Werte, unterschiedlich teuer
import { ergaenzeAngaben } from "../lib/portal-lead.ts";
const tabelle = [
  { kategorie: "betreuung_fuer", antwort_key: "elternteil", aufschlag_euro: 0 },
  { kategorie: "betreuung_fuer", antwort_key: "ehepaar", aufschlag_euro: 900 },
  { kategorie: "weitere_personen", antwort_key: "nein", aufschlag_euro: 0 },
  { kategorie: "weitere_personen", antwort_key: "ja", aufschlag_euro: 200 },
  { kategorie: "mobilitaet", antwort_key: "gehfaehig", aufschlag_euro: 0 },
  { kategorie: "mobilitaet", antwort_key: "bettlaegerig", aufschlag_euro: 600 },
  { kategorie: "nachteinsaetze", antwort_key: "nein", aufschlag_euro: 0 },
  { kategorie: "nachteinsaetze", antwort_key: "mehrmals", aufschlag_euro: 800 },
  { kategorie: "deutschkenntnisse", antwort_key: "grund", aufschlag_euro: 0 },
  { kategorie: "deutschkenntnisse", antwort_key: "sehr_gut", aufschlag_euro: 400 },
  { kategorie: "erfahrung", antwort_key: "egal", aufschlag_euro: 0 },
  { kategorie: "erfahrung", antwort_key: "viel", aufschlag_euro: 300 },
  { kategorie: "pflegegrad", antwort_key: "5", aufschlag_euro: 700 },
  { kategorie: "pflegegrad", antwort_key: "1", aufschlag_euro: 0 },
];

let fehler = 0;
const pruefe = (was: string, ist: unknown, soll: unknown) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"} ${was}: ${JSON.stringify(ist)}${ok ? "" : ` (erwartet ${JSON.stringify(soll)})`}`);
};

// 1) Portal liefert gar nichts -> alles teuer, Pflegegrad 0
const leer = ergaenzeAngaben({}, tabelle);
pruefe("leer: betreuung_fuer", leer.daten.betreuung_fuer, "ehepaar");
pruefe("leer: mobilitaet", leer.daten.mobilitaet, "bettlaegerig");
pruefe("leer: nachteinsaetze", leer.daten.nachteinsaetze, "mehrmals");
pruefe("leer: deutschkenntnisse", leer.daten.deutschkenntnisse, "sehr_gut");
pruefe("leer: pflegegrad NICHT teuerster, sondern 0", leer.daten.pflegegrad, 0);
pruefe("leer: alle als angenommen vermerkt", leer.angenommen.length, 7);

// 2) Portal liefert etwas -> das bleibt stehen
const teil = ergaenzeAngaben(
  { pflegegrad: 3, mobilitaet: "gehfaehig", betreuung_fuer: "elternteil" },
  tabelle,
);
pruefe("teil: Pflegegrad uebernommen", teil.daten.pflegegrad, 3);
pruefe("teil: Mobilitaet uebernommen", teil.daten.mobilitaet, "gehfaehig");
pruefe("teil: nur der Rest angenommen", teil.angenommen.sort(), ["deutschkenntnisse","erfahrung","nachteinsaetze","weitere_personen"]);

// 3) Optionale Felder werden NIE geraten
pruefe("optional: kein Fuehrerschein erfunden", leer.daten.fuehrerschein, undefined);
pruefe("optional: kein Geschlecht erfunden", leer.daten.geschlecht, undefined);

// 4) Leerstring gilt als fehlend
const leerstring = ergaenzeAngaben({ mobilitaet: "  " }, tabelle);
pruefe("leerer String zaehlt als fehlend", leerstring.daten.mobilitaet, "bettlaegerig");

console.log(fehler === 0 ? "\nALLES GRUEN" : `\n${fehler} FEHLER`);
if (fehler) Deno.exit(1);
