// Echte Kundenstimmen für den Rechner (Registry #153, Martin 09.11.2026: „passe die Bewertungen an. Benutze die von der
// Bewertungsseite“). Wörtliche Kopien aus primundus-main `lib/bewertungen-direkt.ts` (Quelle von primundus.de/erfahrungen,
// „Rückmeldungen direkt an Primundus“): Text, Name, Ort, Datum und Sterne unverändert, nie kürzen oder umformulieren.
// Wird dort eine Bewertung zurückgezogen oder geändert, hier dasselbe tun (id = id der Quelle). Der Rechner kann die Liste
// nicht zur Laufzeit laden (primundus.de liefert nur den Schnitt, /api/bewertungen-stand), daher die Kopie.

export interface Kundenstimme {
  /** id in primundus-main lib/bewertungen-direkt.ts */
  id: string;
  sterne: number;
  name: string;
  ort: string;
  /** Datum wie auf primundus.de/erfahrungen */
  datum: string;
  text: string;
}

const STIMMEN = {
  "k-20260905-thomas": { sterne: 5, name: "Thomas R.", ort: "Köln", datum: "5. September 2026", text: "Ich wollte zuerst eigentlich nur wissen was das ungefähr kostet. Hier konnte ich den Preis und die verfügbaren Betreuungskräfte gleich sehen, das war bei den anderen Anbietern deutlich umständlicher." },
  "k-20260814-andrea": { sterne: 5, name: "Andrea S.", ort: "Düsseldorf", datum: "14. August 2026", text: "Meine Mutter wollte am Anfang auf gar keinen Fall eine fremde Person im Haus. Eine Woche später saßen sie und Agnieszka morgens schon zusammen beim Kaffee. Hätte ich so wirklich nicht erwartet." },
  "k-20260508-robert": { sterne: 5, name: "Robert F.", ort: "Augsburg", datum: "8. Mai 2026", text: "Wir mussten sehr kurzfristig reagieren, nachdem meine Mutter aus dem Krankenhaus gekommen war. Dass innerhalb weniger Tage eine Betreuung organisiert werden konnte, war eine enorme Erleichterung." },
  "k-20260427-andreas": { sterne: 5, name: "Andreas K.", ort: "Köln", datum: "27. April 2026", text: "Kurz und knapp: gute Betreuung, schnelle Organisation, klare Kosten." },
  "k-20260506-elke": { sterne: 5, name: "Elke B.", ort: "Karlsruhe", datum: "6. Mai 2026", text: "Sehr netter Kontakt. Vor allem erreicht man nicht nur Montag bis Freitag jemanden, was mir persönlich viel Sicherheit gibt." },
  "k-20260713-birgit": { sterne: 5, name: "Birgit L.", ort: "Freiburg", datum: "13. Juli 2026", text: "Meine Mutter und Elena gehen jetzt jeden Nachmittag zusammen eine kleine Runde spazieren. Mama bewegt sich wieder mehr und wirkt insgesamt viel ausgeglichener." },
  "k-20250323-florian": { sterne: 5, name: "Florian D.", ort: "Braunschweig", datum: "23. März 2025", text: "Anfrage gestellt, Betreuungskräfte angesehen, entschieden. Ich hatte es mir wesentlich komplizierter vorgestellt." },
  "k-20260221-anke": { sterne: 5, name: "Anke H.", ort: "Regensburg", datum: "21. Februar 2026", text: "Bei so einem persönlichen Thema möchte ich wissen, wer zu meiner Mutter kommt. Die Möglichkeit, die Betreuungskräfte vorher anzusehen, finde ich deshalb richtig." },
  "k-20260627-claudia": { sterne: 5, name: "Claudia N.", ort: "Essen", datum: "27. Juni 2026", text: "Wir wohnen als Geschwister in verschiedenen Städten. Dadurch war es praktisch, dass wir uns die Profile alle ansehen und anschließend gemeinsam entscheiden konnten." },
} as const satisfies Record<string, Omit<Kundenstimme, "id">>;

type StimmenId = keyof typeof STIMMEN;
const auswahl = (ids: readonly StimmenId[]): readonly Kundenstimme[] => ids.map((id) => ({ id, ...STIMMEN[id] }));

/** Startseite, „Das sagen unsere Familien“ (OpenAI 09.11.: Rechner-Nutzen zuerst, dann fremde Person, schnelle Hilfe,
 *  Überblick, Erreichbarkeit, Alltag; Petra K. mit „Hoffentlich bleibt das so :-)“ fiel raus). */
export const STIMMEN_STARTSEITE = auswahl([
  "k-20260905-thomas", "k-20260814-andrea", "k-20260508-robert", "k-20260427-andreas", "k-20260506-elke", "k-20260713-birgit",
]);

/** Letzter Schritt des Rechners unter „So geht es weiter“ (Registry #151): je eine Sorge kurz vor den Kontaktdaten. */
export const STIMMEN_LETZTER_SCHRITT = auswahl(["k-20250323-florian", "k-20260221-anke", "k-20260627-claudia"]);
