/* ─── pflege-helfer24.de: Leads aus der Partner-API lesen ────────────────
 *
 * Zweites eingekauftes Portal, erster Lieferweg OHNE Mail: der Abholer
 * (api/portal-abholen) holt `GET /partner_portal/leads/api_export` und
 * schickt jede Zeile als denselben Body an /api/portal-lead, den auch der
 * Mailparser baut — der Eingang kennt keine zweite Welt.
 *
 * Die API liefert `{ headers, data }`: Spalten IMMER ueber den Namen
 * zuordnen, nie ueber die Position (Spalten, die fuer alle Zeilen leer
 * waeren, fehlen in der Antwort; der Satz wechselt zwischen Abrufen).
 * Fehlende Werte kommen als String "N/A".
 *
 * Auswahlfelder sind GESCHLOSSENE Listen (Feld-Referenz der API-Doku:
 * https://pflege-helfer24.de/partner_portal/api/docs, Partner-Login) —
 * deshalb exakte Werte
 * statt Regex-Raten. Ein Wert ausserhalb der Liste wird NICHT gesetzt und
 * in `unbekannt[]` gemeldet (Vorlagenwechsel sichtbar machen); dann greift
 * die Annahme aus portal-lead.ts. Ein Wert, den wir kennen, aber bewusst
 * nicht abbilden (z.B. "Nachtschichten: Ja" — sagt nicht, wie oft), steht
 * mit `null` in der Tabelle: bekannt, nicht gesetzt, kein Laerm.
 *
 * Rein (kein Next, kein supabase): wird vom root-vitest quer importiert
 * (src/__tests__/portalHelfer24.test.ts, Muster portalLead.test.ts).
 */

import type { PortalAngaben } from './portal-lead';
import { kgZuBucket, type PortalDetails } from './portal-parser';

export const HELFER24_DOMAIN = 'pflege-helfer24.de';
export const HELFER24_EXPORT_URL = 'https://pflege-helfer24.de/partner_portal/leads/api_export';
/** Unser Produkt beim Portal. Andere Produkte (Hausnotruf, Lift …) waeren
 *  ein Konto-Fehler, kein Lead fuer uns. */
export const HELFER24_PRODUKT = '24h-Pflege';

export interface ApiAntwort {
  headers: string[];
  data: string[][];
}

/** Zeilen als Objekte, Spaltenname → Wert. "N/A" und Leerstring = nicht da. */
export function apiZeilen(antwort: ApiAntwort | null | undefined): Record<string, string>[] {
  const kopf = Array.isArray(antwort?.headers) ? antwort!.headers : [];
  const daten = Array.isArray(antwort?.data) ? antwort!.data : [];
  return daten.map((zeile) => {
    const z: Record<string, string> = {};
    kopf.forEach((spalte, i) => {
      const v = typeof zeile?.[i] === 'string' ? zeile[i].trim() : '';
      if (v && v !== 'N/A') z[spalte] = v;
    });
    return z;
  });
}

/* Auswahl → unser Schluessel. null = bekannt, bewusst nicht gesetzt. */
type Tabelle = Record<string, string | null>;

const ANZAHL_PERSONEN: Tabelle = {
  '1 person': '1-person',
  // pricing_config kennt nur 1 Person / Ehepaar — "Mehr als 2" ist das
  // Maximum, das wir bepreisen koennen; der Rest steht im Kontextblock.
  '2 personen': 'ehepaar',
  'mehr als 2 personen': 'ehepaar',
};
const HAUSHALT: Tabelle = { keine: 'nein', '1': 'ja', '2': 'ja', 'mehr als 2': 'ja' };
const MOBILITAET: Tabelle = {
  gut: 'mobil',
  // pricing-Label unseres Werts: "Eingeschränkt – nur mit Rollator".
  'eingeschränkt': 'rollator',
  'bettlägerig': 'bettlaegerig',
};
/* "Ja" sagt nicht, WIE OFT — unsere Stufen (gelegentlich/taeglich/mehrmals)
 * waeren geraten. Nicht setzen ⇒ Annahme zum teureren Wert, in der Mail
 * ehrlich als "angenommen" markiert. */
const NACHT: Tabelle = { nein: 'nein', ja: null, unsicher: null };
const DEUTSCH: Tabelle = {
  'ohne sprachkenntnisse': 'grundlegend',
  grundkenntnisse: 'grundlegend',
  mittelstufe: 'kommunikativ',
  'fließend': 'sehr-gut',
};
// Die Doku schreibt "Wünschenwert" (Tippfehler) — beide Schreibweisen.
const FUEHRERSCHEIN: Tabelle = {
  erforderlich: 'ja',
  'wünschenwert': 'ja',
  'wünschenswert': 'ja',
  'nicht erforderlich': 'nein',
};
const GESCHLECHT_PK: Tabelle = { weiblich: 'weiblich', 'männlich': 'maennlich', egal: 'egal' };
/* `spaeter` ist UNSER bestehender Legacy-Wert (careStartLabel "zu einem
 * späteren Zeitpunkt", Onboarding OFFSET_DAYS.spaeter = 60 Tage) — kein
 * erfundener Enum. NICHT `unklar` (Mail: "Ich informiere mich nur") und
 * NICHT leer (Portal zeigt "ab sofort", Mamamia arrival_at = +7 Tage). */
const START: Tabelle = {
  sofort: 'sofort',
  'innerhalb von 4 wochen': '2-4-wochen',
  'innerhalb von 3 monaten': '1-2-monate',
  'innerhalb von 6 monaten': 'spaeter',
  'später als 6 monate': 'spaeter',
  'später': 'spaeter',
};
const GESCHLECHT_SENIOR: Tabelle = { 'männlich': 'Herr', weiblich: 'Frau', 'männlich und weiblich': null };
const INTERNET: Tabelle = { vorhanden: 'ja', 'nicht vorhanden': 'nein', 'in arbeit': null };
const DEMENZ: Tabelle = { 'ohne demenz': null, leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };

/* Spalten ohne Preisbezug — verbatim in den Kontextblock fuer die Agentur
 * (JobOffer-Beschreibung), wie bei Pflegehilfe. */
const BLOCK_SPALTEN = [
  'Anzahl betreuter Personen',
  'Startdatum',
  'Dauer der Betreuung',
  'Unterkunft vorhanden',
  'Haustiere im Haushalt',
  'Hilfe beim Transfer benötigt',
  'Mobilitätshilfsmittel vorhanden',
  'Nachtschichten benötigt',
  'Telefonische Erreichbarkeit',
  'Budget',
  'Sonstige Informationen',
  'Leadtyp',
];

export interface Helfer24Ergebnis {
  /** Lead ID (UUID) — Schluessel in portal_api_log. */
  extern_id: string;
  /** "Liefer Datum" als YYYY-MM-DD (Vergleich mit "heute"), undefined wenn unlesbar. */
  lieferTag?: string;
  /** Fertiger Body fuer POST /api/portal-lead. */
  body: Record<string, unknown>;
  /** Gesetzt, wenn die Zeile gar nicht erst gepostet werden soll. */
  uebersprungen?: string;
  /** Auswahlwerte ausserhalb der bekannten Liste — Vorlagenwechsel. */
  unbekannt: string[];
}

/** "23.04.2025" → "2025-04-23". */
export function lieferTagIso(roh: string | undefined): string | undefined {
  const m = roh?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Heutiges Datum in Berlin als YYYY-MM-DD (der Server laeuft in UTC). */
export function heuteBerlin(jetzt = new Date()): string {
  return jetzt.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
}

/** Eine API-Zeile → Body fuer /api/portal-lead. null, wenn keine Lead ID
 *  (ohne Schluessel kein Protokoll — der Aufrufer loggt und laesst sie). */
export function helfer24ZuLeadBody(zeile: Record<string, string>): Helfer24Ergebnis | null {
  const extern_id = zeile['Lead ID'];
  if (!extern_id) return null;

  const unbekannt: string[] = [];
  const wahl = (spalte: string, tabelle: Tabelle): string | undefined => {
    const roh = zeile[spalte];
    if (!roh) return undefined;
    const key = roh.trim().toLowerCase();
    if (!(key in tabelle)) {
      unbekannt.push(`${spalte}: ${roh}`);
      return undefined;
    }
    return tabelle[key] ?? undefined;
  };

  const angaben: PortalAngaben = {};
  const setze = (feld: keyof PortalAngaben, wert: string | undefined) => {
    if (wert !== undefined) (angaben as Record<string, unknown>)[feld] = wert;
  };
  setze('betreuung_fuer', wahl('Anzahl betreuter Personen', ANZAHL_PERSONEN));
  setze('weitere_personen', wahl('Anzahl zusätzl. Personen im Haushalt', HAUSHALT));
  setze('mobilitaet', wahl('Mobilität des Pflegebedürftigen', MOBILITAET));
  setze('nachteinsaetze', wahl('Nachtschichten benötigt', NACHT));
  setze('deutschkenntnisse', wahl('Deutschkenntnisse', DEUTSCH));
  setze('fuehrerschein', wahl('Führerschein erforderlich', FUEHRERSCHEIN));
  setze('geschlecht', wahl('Gewünschtes Geschlecht der Pflegekraft', GESCHLECHT_PK));

  /* Pflegegrad: "Keinen" ist eine echte Kundenangabe (0, siehe
   * ergaenzeAngaben), "Beantragt" ist noch keiner — nicht setzen. */
  const gradRoh = zeile['Pflegegrad'];
  if (gradRoh) {
    const g = gradRoh.trim().toLowerCase();
    const m = g.match(/^pflegegrad\s*([1-5])$/);
    if (m) angaben.pflegegrad = Number(m[1]);
    else if (g === 'keinen') angaben.pflegegrad = 0;
    else if (g !== 'beantragt') unbekannt.push(`Pflegegrad: ${gradRoh}`);
  }

  const care_start_timing = wahl('Startdatum', START);

  // ── Details ohne Preisbezug (Prefill / Onboarding / JobOffer) ──────────
  const details: PortalDetails = {};
  const anrede = wahl('Geschlecht der/des Pflegebedürftigen', GESCHLECHT_SENIOR);
  if (anrede) details.patient_anrede = anrede;
  const kg = zeile['Gewicht der/des Pflegebedürftigen']?.match(/(\d+)/)?.[1];
  const bucket = kg ? kgZuBucket(Number(kg)) : undefined;
  if (bucket) details.gewicht = bucket;
  const internet = wahl('Internetanschluss vorhanden', INTERNET);
  if (internet) details.internet = internet;
  const demenz = wahl('Demenz vorhanden', DEMENZ);
  if (demenz) {
    details.demenz = 'ja';
    details.diagnosen = `Demenz (${demenz})`;
  }
  const block = BLOCK_SPALTEN.filter((s) => zeile[s]).map((s) => `${s}: ${zeile[s]}`);
  if (block.length) details.block = block.join('\n');

  const lieferDatum = zeile['Liefer Datum'] ?? '';
  const leadtyp = zeile['Leadtyp'] ?? 'unbekannt';

  const body: Record<string, unknown> = {
    portal: HELFER24_DOMAIN,
    name: zeile['Name'] ?? '',
    email: zeile['E-mail'] ?? '',
    telefon: zeile['Telefon'] ?? '',
    plz: zeile['Postleitzahl'],
    ort: zeile['Stadt'],
    portal_lead_id: extern_id,
    angaben,
    care_start_timing,
    details: Object.keys(details).length ? details : undefined,
    /* Kein Einwilligungsfeld in der API. Wir bezeugen, was wir wissen:
       Lieferung ueber die Partner-API; die Kundeneinwilligung liegt laut
       Nutzungsbedingungen beim Portal (Entscheidung Michał 04.09.). */
    einwilligung: {
      text:
        `Lead über Partner-API von ${HELFER24_DOMAIN} geliefert am ${lieferDatum || '?'} ` +
        `(Lead-ID ${extern_id}, Leadtyp ${leadtyp}); Kundeneinwilligung liegt gemäß ` +
        'Nutzungsbedingungen beim Portal.',
      zeitpunkt: lieferDatum,
    },
    // Alter (60-Tage-Grenze) und Status pruefen die Schutzregeln im Eingang.
    erstellt_am: lieferDatum,
    status: zeile['Status'],
    // Alle Spalten verbatim — append-only im Ereignislog, nichts geht verloren.
    zusatz: zeile,
  };

  const produkt = zeile['Produkt'];
  const uebersprungen = produkt && produkt.toLowerCase() !== HELFER24_PRODUKT.toLowerCase()
    ? `falsches Produkt: ${produkt}`
    : undefined;

  return { extern_id, lieferTag: lieferTagIso(lieferDatum), body, uebersprungen, unbekannt };
}
