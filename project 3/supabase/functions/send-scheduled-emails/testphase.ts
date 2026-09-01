/* Testphase: Kundenmails an das Team umleiten.
 *
 * KOPIE von project 3/lib/portal-schutz.ts (testphaseUmleitung) — die Edge
 * Function kann nicht aus lib/ importieren (gleiche Lage wie names.ts /
 * appendJobParam). Aenderungen SYNCHRON halten.
 *
 * Solange das Supabase-Secret PORTAL_TESTPHASE=1 gesetzt ist, gehen alle
 * Kundenmails an Leads aus eingekauften Portal-Mails (source
 * "portal:<domain>") an das Team statt an den Kunden. Der Lead traegt
 * weiter die echte Adresse — umgeleitet wird erst beim Versand. Der
 * Betreff nennt den eigentlichen Empfaenger. */
export const TESTPHASE_EMPFAENGER = "info@mamamia.app, martin@mamamia.app";

export function testphaseUmleitung(
  lead: { source?: string | null; email?: string | null },
  flagWert: string | undefined,
): { empfaenger: string; betreffPraefix: string } | null {
  if (flagWert !== "1") return null;
  if (!(lead.source ?? "").toLowerCase().startsWith("portal:")) return null;
  return {
    empfaenger: TESTPHASE_EMPFAENGER,
    betreffPraefix: `[TESTPHASE → ${lead.email ?? "?"}] `,
  };
}
