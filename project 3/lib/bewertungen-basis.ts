// Kundenbewertungen — gemeinsame Grundlagen ohne Node-Abhängigkeiten.
//
// Getrennt von lib/bewertungen.ts (das `crypto` braucht), damit die Admin-Seite
// (Client-Komponente) Status, Datum und Moderations-Plan mit dem Server teilen
// kann, ohne Node-Krypto ins Browser-Bundle zu ziehen. lib/bewertungen.ts
// exportiert alles hier weiter; Server-Code importiert wie bisher von dort.

export const STATUS = ['unbestaetigt', 'bestaetigt', 'veroeffentlicht', 'abgelehnt'] as const;
export type BewertungStatus = (typeof STATUS)[number];

/** Woher die Bewertung stammt (Martin, 17.09.2026). */
export const HERKUNFT = ['formular', 'team', 'google'] as const;
export type Herkunft = (typeof HERKUNFT)[number];

// ─── Datum in Europe/Berlin ──────────────────────────────────────────────

function berlinTeile(iso: string): Record<string, string> {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const aus: Record<string, string> = {};
  for (const t of teile) aus[t.type] = t.value;
  return aus;
}

/** YYYY-MM-DD in Europe/Berlin. */
export function berlinDatum(iso: string): string {
  const t = berlinTeile(iso);
  return `${t.year}-${t.month}-${t.day}`;
}

/** „17.09.2026, 09:15 Uhr“ in Europe/Berlin. */
export function berlinDatumZeit(iso: string): string {
  const t = berlinTeile(iso);
  return `${t.day}.${t.month}.${t.year}, ${t.hour}:${t.minute} Uhr`;
}

/** „17.09.2026“ in Europe/Berlin. */
export function berlinTagText(iso: string): string {
  const t = berlinTeile(iso);
  return `${t.day}.${t.month}.${t.year}`;
}

/**
 * Datum wie auf der Seite: coalesce(datum, veroeffentlicht_am) als Tag in
 * Berlin (nicht UTC). Ohne beides (von Hand gesetzter Status) zählt der Eingang.
 */
export function anzeigeDatum(z: { datum: string | null; veroeffentlicht_am: string | null; erstellt_am: string }): string {
  return z.datum ?? berlinDatum(z.veroeffentlicht_am ?? z.erstellt_am);
}

// ─── Text normalisieren ──────────────────────────────────────────────────

// Steuerzeichen außer Tab/Zeilenumbruch. NUL lehnt Postgres in text ab.
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Mehrzeiliger Text: CRLF → LF, Steuerzeichen raus, höchstens eine Leerzeile, getrimmt. */
export function normText(wert: string): string {
  return wert
    .replace(/\r\n?/g, '\n')
    .replace(STEUERZEICHEN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Einzeilig: alle Leerräume zu einem Leerzeichen. */
export function normZeile(wert: string): string {
  return wert.replace(STEUERZEICHEN, '').replace(/\s+/g, ' ').trim();
}

export function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

// ─── Moderation ──────────────────────────────────────────────────────────

export const AKTIONEN = {
  freigeben: { knopf: 'Jetzt freigeben', mailText: 'Freigeben' },
  freigeben_kunde: { knopf: 'Freigeben als bestätigter Kunde', mailText: 'Freigeben, als bestätigter Kunde markieren' },
  ablehnen: { knopf: 'Ablehnen', mailText: 'Ablehnen' },
} as const;
export type ModerationsAktion = keyof typeof AKTIONEN;

export function aktionAus(wert: unknown): ModerationsAktion | null {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(AKTIONEN, wert)
    ? (wert as ModerationsAktion)
    : null;
}

export type ModerationsPlan =
  | { art: 'aendern'; vonStatus: BewertungStatus; update: Record<string, unknown> }
  | { art: 'erledigt' }
  | { art: 'nicht_moeglich'; grund: string };

export const GRUND = {
  unbestaetigt: 'Die Bewertung ist noch nicht per E-Mail bestätigt. Erst danach kann sie freigegeben werden.',
  abgelehnt: 'Die Bewertung wurde bereits abgelehnt.',
  veroeffentlicht: 'Die Bewertung ist bereits veröffentlicht. Zurückziehen geht im Admin unter Bewertungen.',
};

/**
 * Was eine Aktion bei diesem Stand tut. Nur aus „bestaetigt“ heraus wird
 * geändert; steht die Bewertung schon im Zielzustand, ist nichts zu tun.
 * Ausnahme: veröffentlicht ohne Kunden-Haken + freigeben_kunde setzt nur den
 * Haken nach (Datum bleibt). Beim Veröffentlichen wird `datum` auf den Tag der
 * Freigabe gesetzt (Berlin) — das ist das Datum, das die Seite zeigt.
 */
export function moderationsPlan(
  zeile: { status: BewertungStatus; kunde_bestaetigt: boolean },
  aktion: ModerationsAktion,
  jetztIso: string,
): ModerationsPlan {
  const { status } = zeile;
  if (status === 'unbestaetigt') return { art: 'nicht_moeglich', grund: GRUND.unbestaetigt };

  if (aktion === 'ablehnen') {
    if (status === 'bestaetigt') return { art: 'aendern', vonStatus: 'bestaetigt', update: { status: 'abgelehnt', abgelehnt_am: jetztIso } };
    if (status === 'abgelehnt') return { art: 'erledigt' };
    return { art: 'nicht_moeglich', grund: GRUND.veroeffentlicht };
  }

  if (status === 'abgelehnt') return { art: 'nicht_moeglich', grund: GRUND.abgelehnt };

  const veroeffentlichen = { status: 'veroeffentlicht', veroeffentlicht_am: jetztIso, datum: berlinDatum(jetztIso) };

  if (aktion === 'freigeben') {
    if (status === 'bestaetigt') return { art: 'aendern', vonStatus: 'bestaetigt', update: veroeffentlichen };
    return { art: 'erledigt' };
  }

  // freigeben_kunde
  if (status === 'bestaetigt') {
    return { art: 'aendern', vonStatus: 'bestaetigt', update: { ...veroeffentlichen, kunde_bestaetigt: true } };
  }
  if (zeile.kunde_bestaetigt) return { art: 'erledigt' };
  return { art: 'aendern', vonStatus: 'veroeffentlicht', update: { kunde_bestaetigt: true } };
}
