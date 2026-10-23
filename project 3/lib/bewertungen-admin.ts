// Admin → Bewertungen (Martin, 17.09.2026). Pure und ohne Node-Abhängigkeiten:
// die Seite app/admin/bewertungen (Client) und die Routen /api/admin/bewertungen
// teilen sich diese Logik. Tests: src/__tests__/bewertungenAdmin.test.ts.
//
// Drei Dinge:
//   1. Aktionen je Bewertung: wie die Freigabe-Links aus der Mail, dazu
//      „Zurückziehen“ (veröffentlicht → abgelehnt) und Ablehnen vor der
//      E-Mail-Bestätigung (Spam aufräumen).
//   2. Antwort von Primundus speichern, ändern oder entfernen.
//   3. Bewertungen eintragen, die per Mail, Telefon, Brief oder bei Google kamen:
//      sofort veröffentlicht, ohne E-Mail, ohne Mails.

import {
  berlinDatum,
  GRUND,
  HERKUNFT,
  istObjekt,
  moderationsPlan,
  normText,
  normZeile,
  type BewertungStatus,
  type Herkunft,
  type ModerationsPlan,
} from './bewertungen-basis';

export { anzeigeDatum } from './bewertungen-basis';

export const STATUS_LABEL: Record<BewertungStatus, string> = {
  unbestaetigt: 'Unbestätigt',
  bestaetigt: 'Wartet auf Freigabe',
  veroeffentlicht: 'Veröffentlicht',
  abgelehnt: 'Abgelehnt',
};

export const HERKUNFT_LABEL: Record<Herkunft, string> = {
  formular: 'Formular auf primundus.de',
  team: 'Direkt an Primundus (Mail, Telefon, Brief)',
  google: 'Google',
};

export const ADMIN_AKTIONEN = {
  freigeben: 'Freigeben',
  freigeben_kunde: 'Freigeben als bestätigter Kunde',
  ablehnen: 'Ablehnen',
  zurueckziehen: 'Zurückziehen',
} as const;
export type AdminAktion = keyof typeof ADMIN_AKTIONEN;
const AKTIONS_REIHENFOLGE: AdminAktion[] = ['freigeben', 'freigeben_kunde', 'ablehnen', 'zurueckziehen'];

export function adminAktionAus(wert: unknown): AdminAktion | null {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(ADMIN_AKTIONEN, wert)
    ? (wert as AdminAktion)
    : null;
}

/** Spalten für die Admin-Liste. E-Mail ja (nur Admin), IP-Hash und Tokens nie. */
export const ADMIN_SPALTEN =
  'id, erstellt_am, sterne, text, name, ort, email, status, bestaetigt_am, veroeffentlicht_am, abgelehnt_am, kunde_bestaetigt, lead_id, antwort, antwort_am, quelle, herkunft, datum, turnstile_ok';
export const MAX_ADMIN_LISTE = 1000;

export interface AdminBewertung {
  id: string;
  erstellt_am: string;
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  email: string | null;
  status: BewertungStatus;
  bestaetigt_am: string | null;
  veroeffentlicht_am: string | null;
  abgelehnt_am: string | null;
  kunde_bestaetigt: boolean;
  lead_id: string | null;
  antwort: string | null;
  antwort_am: string | null;
  quelle: string;
  herkunft: Herkunft;
  datum: string | null;
  turnstile_ok: boolean | null;
}

const GRUND_ZURUECKZIEHEN = 'Nur veröffentlichte Bewertungen lassen sich zurückziehen.';

export function adminPlan(
  zeile: { status: BewertungStatus; kunde_bestaetigt: boolean },
  aktion: AdminAktion,
  jetztIso: string,
): ModerationsPlan {
  if (aktion === 'zurueckziehen') {
    if (zeile.status === 'veroeffentlicht') {
      return { art: 'aendern', vonStatus: 'veroeffentlicht', update: { status: 'abgelehnt', abgelehnt_am: jetztIso } };
    }
    if (zeile.status === 'abgelehnt') return { art: 'erledigt' };
    return { art: 'nicht_moeglich', grund: GRUND_ZURUECKZIEHEN };
  }
  if (aktion === 'ablehnen' && zeile.status === 'unbestaetigt') {
    return { art: 'aendern', vonStatus: 'unbestaetigt', update: { status: 'abgelehnt', abgelehnt_am: jetztIso } };
  }
  const plan = moderationsPlan(zeile, aktion, jetztIso);
  if (plan.art === 'nicht_moeglich' && plan.grund === GRUND.unbestaetigt) {
    return { art: 'nicht_moeglich', grund: 'Die Bewertung ist noch nicht per E-Mail bestätigt. Freigeben geht erst danach, Ablehnen schon jetzt.' };
  }
  return plan;
}

/** Knöpfe, die bei diesem Stand etwas ändern (in fester Reihenfolge). */
export function moeglicheAktionen(status: BewertungStatus, kundeBestaetigt: boolean): AdminAktion[] {
  const jetzt = new Date(0).toISOString();
  return AKTIONS_REIHENFOLGE.filter((a) => adminPlan({ status, kunde_bestaetigt: kundeBestaetigt }, a, jetzt).art === 'aendern');
}

// ─── Antwort von Primundus ───────────────────────────────────────────────

export const ANTWORT_MAX = 2000;

export type AntwortErgebnis =
  | { ok: true; update: { antwort: string | null; antwort_am: string | null } }
  | { ok: false; fehler: string };

/** Leer ⇒ Antwort entfernen. Sonst speichern mit dem Zeitpunkt der letzten Änderung. */
export function antwortUpdate(wert: unknown, jetztIso: string): AntwortErgebnis {
  if (wert === null || wert === undefined) return { ok: true, update: { antwort: null, antwort_am: null } };
  if (typeof wert !== 'string') return { ok: false, fehler: 'Ungültige Antwort.' };
  const antwort = normText(wert);
  if (!antwort) return { ok: true, update: { antwort: null, antwort_am: null } };
  if (antwort.length > ANTWORT_MAX) return { ok: false, fehler: `Die Antwort darf höchstens ${ANTWORT_MAX} Zeichen lang sein.` };
  return { ok: true, update: { antwort, antwort_am: jetztIso } };
}

// ─── Bewertung eintragen ─────────────────────────────────────────────────

/** Herkünfte, die das Team eintragen kann (das Formular trägt sich selbst ein). */
export const EINTRAG_HERKUNFT: Herkunft[] = HERKUNFT.filter((h) => h !== 'formular');

export interface ManuelleZeile {
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  email: null;
  datum: string;
  herkunft: Herkunft;
  kunde_bestaetigt: boolean;
  status: 'veroeffentlicht';
  veroeffentlicht_am: string;
  quelle: string;
}

export type ManuellErgebnis = { ok: true; zeile: ManuelleZeile } | { ok: false; fehler: Record<string, string> };

export const EINTRAG_FEHLER = {
  sterne: 'Bitte 1 bis 5 Sterne wählen.',
  text: 'Bitte den Text der Bewertung eintragen (höchstens 2000 Zeichen).',
  name: 'Bitte den Namen wie veröffentlicht eintragen (2 bis 60 Zeichen).',
  ort: 'Der Ort darf höchstens 60 Zeichen lang sein.',
  datum: 'Bitte ein gültiges Datum eintragen, nicht in der Zukunft.',
  herkunft: 'Bitte die Herkunft wählen.',
  anfrage: 'Ungültige Anfrage.',
} as const;

function istKalenderdatum(wert: unknown): wert is string {
  if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const [j, m, t] = wert.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t && j >= 2000;
}

export function pruefeManuell(body: unknown, jetzt: Date): ManuellErgebnis {
  if (!istObjekt(body)) return { ok: false, fehler: { _: EINTRAG_FEHLER.anfrage } };
  const fehler: Record<string, string> = {};

  const sterne = body.sterne;
  if (typeof sterne !== 'number' || !Number.isInteger(sterne) || sterne < 1 || sterne > 5) fehler.sterne = EINTRAG_FEHLER.sterne;

  // Kein Mindestumfang wie im Formular: Google-Bewertungen sind oft nur ein Wort.
  const text = typeof body.text === 'string' ? normText(body.text) : '';
  if (!text || text.length > 2000) fehler.text = EINTRAG_FEHLER.text;

  const name = typeof body.name === 'string' ? normZeile(body.name) : '';
  if (name.length < 2 || name.length > 60) fehler.name = EINTRAG_FEHLER.name;

  let ort: string | null = null;
  if (typeof body.ort === 'string') {
    ort = normZeile(body.ort) || null;
    if (ort && ort.length > 60) fehler.ort = EINTRAG_FEHLER.ort;
  } else if (body.ort !== undefined && body.ort !== null) {
    fehler.ort = EINTRAG_FEHLER.ort;
  }

  const heute = berlinDatum(jetzt.toISOString());
  const datum = body.datum;
  // YYYY-MM-DD vergleicht sich als Text richtig.
  if (!istKalenderdatum(datum) || datum > heute) fehler.datum = EINTRAG_FEHLER.datum;

  const herkunft = body.herkunft;
  const herkunftOk = typeof herkunft === 'string' && EINTRAG_HERKUNFT.indexOf(herkunft as Herkunft) >= 0;
  if (!herkunftOk) fehler.herkunft = EINTRAG_FEHLER.herkunft;

  if (Object.keys(fehler).length > 0) return { ok: false, fehler };
  return {
    ok: true,
    zeile: {
      sterne: sterne as number,
      text,
      name,
      ort,
      email: null,
      datum: datum as string,
      herkunft: herkunft as Herkunft,
      kunde_bestaetigt: body.kunde_bestaetigt === true,
      status: 'veroeffentlicht',
      veroeffentlicht_am: jetzt.toISOString(),
      quelle: 'admin/bewertungen',
    },
  };
}
