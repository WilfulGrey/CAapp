// Multi-Job-Deeplink (Bug #24, Metafora Michała: Token = Schlüssel zur
// Wohnung, ?job= = Zimmer): Kunden-Mails über eine Bewerbung auf einem
// KONKRETEN Job verlinken das Portal mit &job=<lead_jobs.id> — das Portal
// scoped die Session dann exakt auf diesen Einsatz (Variant A, seit #296).
//
// Pure Modul ohne Next-Imports, damit es aus route.ts UND aus dem Root-
// vitest (src/__tests__) importierbar ist. 1:1-Duplikat lebt in
// `project 3/supabase/functions/send-scheduled-emails/followupJobs.ts`
// (Edge Fn kann nicht aus lib/ importieren — CI-Deploy kopiert nur den
// functions-Ordner). Änderungen hier ⇒ dort nachziehen (und umgekehrt).
export function appendJobParam(portalUrl: string, leadJobUuid: string | null | undefined): string {
  if (!portalUrl || !leadJobUuid) return portalUrl;
  return `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}job=${encodeURIComponent(leadJobUuid)}`;
}
