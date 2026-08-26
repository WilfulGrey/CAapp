// Basis-Adresse des Kundenportals — EINE Quelle fuer alle Stellen.
//
// Vorher las jede der 14 Fundstellen NEXT_PUBLIC_PORTAL_URL selbst und fiel
// bei fehlender Variable auf '' zurueck. Die Mail-Bausteine lassen den
// Portal-Link dann stillschweigend GANZ weg (`if (!portalBase) return ''`)
// — keine Fehlermeldung, nur eine Mail ohne Link. Gemeldet 26.08.2026,
// zusammen mit den verschwundenen Bewertungsknoepfen auf /feedback:
// dieselbe Ursache, eine Adresse hinter einer ungesetzten Variable.
//
// Zwei Stellen trugen den richtigen Wert laengst hart im Code
// (admin/leads/[id] und lead-regenerate-token) — der Wert ist damit aus
// der Codebasis selbst belegt, nicht geraten. Die Variable darf weiterhin
// ueberschreiben (Staging), aber nie mehr der einzige Weg zur Adresse sein.
export const PORTAL_BASIS: string = (
  process.env.NEXT_PUBLIC_PORTAL_URL || 'https://kundenportal.primundus.de'
).replace(/\/$/, '');

// Multi-Job-Deeplink (Bug #25, Metafora Michała: Token = Schlüssel zur
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
