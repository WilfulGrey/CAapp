/* Testphase: Kundenmails an das Team umleiten.
 *
 * KOPIE von project 3/lib/portal-schutz.ts (flagGiltFuer +
 * testphaseUmleitung) — die Edge Function kann nicht aus lib/ importieren
 * (gleiche Lage wie names.ts / appendJobParam). Aenderungen SYNCHRON halten.
 *
 * Solange das Supabase-Secret PORTAL_TESTPHASE fuer das Portal gilt ("1" =
 * alle Portale, sonst Komma-Liste von Domains wie "pflege-helfer24.de"),
 * gehen alle Kundenmails an Leads aus diesem Portal (source
 * "portal:<domain>") an das Team statt an den Kunden. Der Lead traegt
 * weiter die echte Adresse — umgeleitet wird erst beim Versand. Der
 * Betreff nennt den eigentlichen Empfaenger. */
export const TESTPHASE_EMPFAENGER = "info@mamamia.app, martin@mamamia.app";

export function flagGiltFuer(flagWert: string | undefined, domain: string): boolean {
  const wert = (flagWert ?? "").trim();
  if (!wert) return false;
  if (wert === "1") return true;
  return wert.split(",").map((s) => s.trim().toLowerCase()).includes(domain.trim().toLowerCase());
}

export function testphaseUmleitung(
  lead: { source?: string | null; email?: string | null },
  flagWert: string | undefined,
): { empfaenger: string; betreffPraefix: string } | null {
  const source = (lead.source ?? "").toLowerCase();
  if (!source.startsWith("portal:")) return null;
  if (!flagGiltFuer(flagWert, source.slice("portal:".length))) return null;
  return {
    empfaenger: TESTPHASE_EMPFAENGER,
    betreffPraefix: `[TESTPHASE → ${lead.email ?? "?"}] `,
  };
}
