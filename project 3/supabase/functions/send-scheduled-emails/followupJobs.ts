// Multi-Job / Folge-Einsatz-Helfer (Bug #25) — pure Funktionen, aus index.ts
// extrahiert, damit sie deno-testbar sind (index.ts zieht nodemailer + Deno.serve
// und ist als Ganzes nicht importierbar).
//
// HINWEIS Duplikat: appendJobParam existiert 1:1 auch in
// `project 3/lib/portal-url.ts` (Next.js-Seite, Bridge-Mails A/B/C). Die
// Edge Function kann NICHT aus app/ bzw. lib/ importieren — der CI-Deploy
// kopiert ausschließlich `project 3/supabase/functions/` (test.yml,
// /tmp/kr-deploy), Cross-Ordner-Importe würden das Bundle brechen. Änderungen
// hier ⇒ auch dort nachziehen (und umgekehrt).

// Hängt &job=<lead_jobs.id> an die Portal-URL — der Kunde landet auf DEM
// Einsatz, um den es in der Mail geht (Portal-Scoping Variant A, seit #296;
// Metafora Michała: Token = Schlüssel zur Wohnung, ?job= = Zimmer).
// Fail-soft: ohne UUID bleibt die URL unverändert (plain Link → Portal
// wählt seit #406 den neuesten geplanten Job).
export function appendJobParam(portalUrl: string, leadJobUuid: string | null | undefined): string {
  if (!portalUrl || !leadJobUuid) return portalUrl;
  return `${portalUrl}${portalUrl.includes("?") ? "&" : "?"}job=${encodeURIComponent(leadJobUuid)}`;
}

// Entscheidet, ob ein Pflegekraft-Reminder wegen "Lead ist beauftragt /
// nicht interessiert" gecancelt wird.
//
// Kern des Bug-#25-Fixes: "beauftragt" ist LEAD-weit (jeder Folge-Einsatz-
// Kunde hat einen alten Accept), der Reminder gehört aber zu EINEM Job.
// Ist dieser Job im lead_jobs-Spiegel AKTUELL 'geplant', betrifft der
// Reminder den NEUEN Einsatz und überlebt. nicht_interessiert cancelt
// weiterhin bedingungslos (expliziter Kundenwunsch schlägt alles).
//
// reminderJobStatus = lead_jobs.status des Reminder-Jobs oder null
// (kein mamamia_job_offer_id in der Reminder-Metadata / kein Spiegel-Wiersz)
// — null verhält sich wie vor dem Fix: beauftragt ⇒ cancel (Legacy-Reminder
// gehören zum alten, gebuchten Job).
export function reminderBookedCancel(opts: {
  isBeauftragt: boolean;
  isNichtInteressiert: boolean;
  reminderJobStatus: string | null;
}): boolean {
  if (opts.isNichtInteressiert) return true;
  if (!opts.isBeauftragt) return false;
  return opts.reminderJobStatus !== "geplant";
}
