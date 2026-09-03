/* Reine Auswahl-Logik des Portal-Abholers über portal_mail_log.
 *
 * Bewusst ohne Imports (kein supabase, kein Next): das Modul wird vom
 * root-vitest quer importiert (src/__tests__/portalMailLog.test.ts,
 * Muster portalLead.test.ts) — project 3 hat keinen eigenen Testrunner.
 *
 * Hintergrund (Registry #47): Idempotenz lief über \Seen und damit über
 * Zustand, den wir uns mit Menschen im Webmail teilen. Jetzt entscheidet
 * ausschliesslich das Protokoll, welche UIDs ein Lauf anfasst. */

/** uid=0 markiert ein beim Erstlauf LEERES Postfach als initialisiert.
 *  Echte IMAP-UIDs beginnen bei 1 (RFC 3501) — keine Kollision möglich.
 *  Ohne den Sentinel würde die erste echte Mail eines frischen Postfachs
 *  vom Seed-Zweig als altbestand verschluckt. */
export const SEED_SENTINEL_UID = 0;

export interface LogZeile {
  uid: number;
  status: string;
}

/** UIDs, die dieser Lauf verarbeiten soll: nicht protokolliert ODER
 *  'offen' (transienter Fehler, Retry). Jeder andere Status — auch ein
 *  unbekannter künftiger — zählt als erledigt: im Zweifel lieber eine
 *  Mail liegen lassen als Mail 1 doppelt schicken.
 *  Reihenfolge = Eingabe (die IMAP-Suche liefert aufsteigend). */
export function zuVerarbeiten(uids: number[], zeilen: LogZeile[]): number[] {
  const status = new Map(zeilen.map((z) => [z.uid, z.status]));
  return uids.filter((uid) => {
    const s = status.get(uid);
    return s === undefined || s === 'offen';
  });
}
