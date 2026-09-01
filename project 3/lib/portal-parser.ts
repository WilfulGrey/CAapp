/* ─── Anfrage-Mails der Lead-Portale lesen ───────────────────────────────
 *
 * Verbund Pflegehilfe (pflegehilfe.org) schickt pro gekauftem Lead eine
 * Mail im Format "Label: Wert". Diese Datei macht daraus die Felder, die
 * unsere Kalkulation braucht.
 *
 * GRUNDREGEL: was der Parser nicht sicher versteht, laesst er WEG. Dann
 * greift die Annahme aus portal-lead.ts (teurerer Wert) und das Feld steht
 * im Nachweis als "angenommen". Ein falsch geratener Wert waere schlimmer
 * als ein fehlender — er sieht aus wie eine Kundenangabe.
 *
 * Die Vorlage aendert sich beim Portal, ohne dass wir es erfahren. Deshalb
 * meldet parsePflegehilfe zurueck, was es NICHT zuordnen konnte
 * (unbekannt[]) — daran sieht man einen Vorlagenwechsel, statt ihn still
 * mit Annahmen zu ueberdecken.
 */

import type { PortalAngaben } from './portal-lead';

export interface PortalKontakt {
  name: string;
  email: string;
  telefon: string;
  plz: string;
  ort: string;
  strasse: string;
}

export interface ParseErgebnis {
  kontakt: PortalKontakt;
  angaben: PortalAngaben;
  care_start_timing?: string;
  /** Anfragen-Nr. des Portals — Dublettenschutz und Reklamationsfrist. */
  portal_lead_id?: string;
  /** "Zustimmung zur Kontaktweitergabe" — unser Einwilligungsnachweis. */
  einwilligung?: { text: string; zeitpunkt: string };
  /** Preisvorstellung des Kunden, in Euro. Nur Information fuers Team. */
  budgetrahmen?: number;
  /** Felder, deren Wert wir nicht kannten — Hinweis auf Vorlagenwechsel. */
  unbekannt: string[];
}

/** "Label: Wert" aus dem Mailtext, erste Fundstelle gewinnt.
 *
 * Der Lookahead ist keine Feinheit, sondern noetig: ohne ihn findet
 * "Bedarf" die Zeile "Bedarfsort: 39615 ..." und "Mobil" die Zeile
 * "Mobilität: ...". Das Label muss an einer Wortgrenze enden. */
function feld(text: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`^[ \\t]*${esc}(?![\\wäöüßÄÖÜ])[ \\t]*:?[ \\t]*(.+)$`, 'im'));
  const wert = m?.[1]?.trim();
  return wert && wert.length > 0 ? wert : null;
}

/** Wert gegen eine Tabelle pruefen — Treffer per enthaltenem Stichwort. */
function zuordnen(
  wert: string | null,
  tabelle: Array<[RegExp, string]>,
): string | null {
  if (!wert) return null;
  for (const [muster, key] of tabelle) {
    if (muster.test(wert)) return key;
  }
  return null;
}

export function parsePflegehilfe(text: string): ParseErgebnis {
  /* Weitergeleitete Mails lesbar machen (Test Zauner 01.09., prod uid 14):
   * ein "Fwd:" verpackt jede Zeile in Zitat-Marker ("> \t...") und streut
   * Soft-Hyphens in die Labels ("Datenschutz­erklärung") — beides
   * unsichtbar, beides toedlich fuer den zeilenweisen "Label: Wert"-Blick
   * (0 Felder, kein Einwilligungsnachweis). Direktmails aendert die
   * Normalisierung nicht: Soft-Hyphens kommen dort nicht vor, und fuehrende
   * Marker/Leerzeichen tragen nie Bedeutung. Tabellen-Umbrueche des
   * weiterleitenden Mailclients (Label und Wert auf getrennten Zeilen)
   * repariert das bewusst NICHT — dann greifen Annahme-Regeln + unbekannt. */
  text = text
    .replace(/\u00AD/g, '')
    .split('\n')
    .map((zeile) => zeile.replace(/^[>\s]+/, ''))
    .join('\n');

  const unbekannt: string[] = [];

  /* Erfasst einen Wert; kann er nicht zugeordnet werden, wird er
   * vermerkt und NICHT gesetzt. */
  const map = (
    label: string,
    tabelle: Array<[RegExp, string]>,
  ): string | undefined => {
    const roh = feld(text, label);
    if (!roh) return undefined;
    const key = zuordnen(roh, tabelle);
    if (!key) {
      unbekannt.push(`${label}: ${roh}`);
      return undefined;
    }
    return key;
  };

  // ── Kontakt ────────────────────────────────────────────────────────────
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g)
    // Absender-/Support-Adressen des Portals gehoeren nicht dem Kunden.
    ?.find((e) => !/pflegehilfe\.(de|org)|primundus\.de/i.test(e)) ?? '';

  const anschrift = text.match(/^[ \t]*(?:DE-)?(\d{5})[ \t]+(.+)$/m);

  // ── Pflegebedarf ───────────────────────────────────────────────────────
  /* Pflegegrad steht ZWEIMAL in der Mail: einmal als echte Angabe im Block
   * "Informationen zum Senior" ("Pflegegrad 1"), einmal in den
   * Anfragedetails als Suchfilter der Agentur ("Pflegegrad/-stufe: 1-5").
   * Der Filter ist KEINE Kundenangabe — nur eine einzelne Ziffer zaehlt. */
  const gradRoh = feld(text, 'Pflegegrad');
  const gradTreffer = gradRoh?.match(/^(?:Pflegegrad\s*)?([1-5])\s*$/i);
  const pflegegrad = gradTreffer ? Number(gradTreffer[1]) : undefined;
  if (gradRoh && !gradTreffer) unbekannt.push(`Pflegegrad: ${gradRoh}`);

  /* "Anzahl Pflegebedürftige" entscheidet ueber Ein-Personen- oder
   * Ehepaar-Preis. */
  const anzahl = feld(text, 'Anzahl Pflegebedürftige');
  const betreuung_fuer = anzahl
    ? (/zwei|2|ehepaar|paar/i.test(anzahl) ? 'ehepaar' : '1-person')
    : undefined;

  /* "Personen im Haushalt: Eine" heisst: ausser der pflegebeduerftigen
   * Person lebt niemand dort. Alles darueber = weitere Personen. */
  const haushalt = feld(text, 'Personen im Haushalt');
  const weitere_personen = haushalt
    ? (/^eine$|^1$/i.test(haushalt.trim()) ? 'nein' : 'ja')
    : undefined;

  const angaben: PortalAngaben = {};
  if (betreuung_fuer) angaben.betreuung_fuer = betreuung_fuer;
  if (weitere_personen) angaben.weitere_personen = weitere_personen;
  if (pflegegrad !== undefined) angaben.pflegegrad = pflegegrad;

  const mobilitaet = map('Mobilität', [
    [/rollstuhl/i, 'rollstuhl'],
    [/bettl|immobil|liegend/i, 'bettlaegerig'],
    [/rollator|hilfsmittel|gehhilfe|eingeschr/i, 'rollator'],
    [/mobil|selbstst|fit/i, 'mobil'],
  ]);
  if (mobilitaet) angaben.mobilitaet = mobilitaet;

  const nachteinsaetze = map('Nächtliche Einsätze', [
    [/nicht erforderlich|nein|keine/i, 'nein'],
    [/mehrmals|mehrfach/i, 'mehrmals'],
    [/t.glich|jede nacht|1x|einmal/i, 'taeglich'],
    [/gelegentlich|selten|manchmal/i, 'gelegentlich'],
  ]);
  if (nachteinsaetze) angaben.nachteinsaetze = nachteinsaetze;

  /* Unsere Stufen heissen grundlegend / kommunikativ / sehr-gut (Label des
   * letzten ist "Gut"). Pflegehilfe schreibt "Gut (B1 & B2)" — das ist
   * unser "sehr-gut". Im Zweifel die hoehere Stufe: sie kostet mehr, und
   * ein Preis, der spaeter faellt, ist die harmlosere Richtung. */
  const deutschkenntnisse = map('Deutschkenntnisse', [
    [/sehr\s*gut|c1|c2|flie/i, 'sehr-gut'],
    [/\bgut\b|b1|b2/i, 'sehr-gut'],
    [/kommunikativ|a2\s*&?\s*b1|mittel/i, 'kommunikativ'],
    [/grund|basis|a1|a2/i, 'grundlegend'],
  ]);
  if (deutschkenntnisse) angaben.deutschkenntnisse = deutschkenntnisse;

  const erfahrung = map('Pflegeerfahrung', [
    [/zwingend|examiniert|fachkraft|ausgebildet/i, 'zwingend'],
    [/grund|erfahren|w.nschenswert|vorhanden/i, 'wuenschenswert'],
    [/keine|egal|nicht erforderlich/i, 'keine'],
  ]);
  if (erfahrung) angaben.erfahrung = erfahrung;

  /* Fuehrerschein und Geschlecht werden nur uebernommen, nie angenommen
   * (siehe portal-lead.ts) — hier duerfen sie also fehlen. */
  const fuehrerschein = map('Führerschein', [
    [/nicht ben.tigt|nein|nicht erforderlich|egal/i, 'nein'],
    [/ben.tigt|ja|erforderlich|erw.nscht/i, 'ja'],
  ]);
  if (fuehrerschein) angaben.fuehrerschein = fuehrerschein;

  const geschlecht = map('Geschlecht', [
    [/weiblich|frau/i, 'weiblich'],
    [/m.nnlich|mann/i, 'maennlich'],
    [/egal|beides/i, 'egal'],
  ]);
  if (geschlecht) angaben.geschlecht = geschlecht;

  const care_start_timing = map('Bedarf', [
    [/schnellst|sofort|umgehend|dringend/i, 'sofort'],
    [/2.4 wochen|wochen/i, '2-4-wochen'],
    [/1.2 monate|monat/i, '1-2-monate'],
    [/unklar|informier/i, 'unklar'],
  ]);

  // ── Nachweise und Kennzahlen ───────────────────────────────────────────
  const anfragenNr = text.match(/Anfragen-N(?:r|ummer)\.?\s*:?\s*(\d+)/i)?.[1];

  /* Der Einwilligungsnachweis, den wir protokollieren: das Portal hat die
   * Kontaktweitergabe an uns dokumentiert. Unser eigener Checkbox-Text
   * waere hier eine Faelschung (siehe api/portal-lead). */
  const weitergabe = feld(text, 'Zustimmung zur Kontaktweitergabe');
  const datenschutz = feld(text, 'Zustimmung zur Datenschutzerklärung');

  const budget = feld(text, 'Budgetrahmen')?.match(/(\d[\d.]*)/)?.[1];

  return {
    kontakt: {
      name: feld(text, 'Ansprechpartner') ?? '',
      email,
      telefon: feld(text, 'Mobil') ?? feld(text, 'Telefon') ?? '',
      plz: anschrift?.[1] ?? '',
      ort: anschrift?.[2]?.trim() ?? '',
      strasse: '',
    },
    angaben,
    care_start_timing,
    portal_lead_id: anfragenNr,
    einwilligung: weitergabe
      ? {
          text:
            'Zustimmung zur Kontaktweitergabe an Partneranbieter, erteilt bei ' +
            'Verbund Pflegehilfe (pflegehilfe.org)' +
            (datenschutz ? `; Datenschutzerklärung bestätigt am ${datenschutz}` : ''),
          zeitpunkt: weitergabe,
        }
      : undefined,
    budgetrahmen: budget ? Number(budget.replace(/\./g, '')) : undefined,
    unbekannt,
  };
}
