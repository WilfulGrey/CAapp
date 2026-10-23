// Wie weit ist der Kunde? Steuert die Profil-Erinnerungen (Abbruch) und die
// Variante der Nachfass-Mails. Pure Funktion, separat wegen Testbarkeit.
//
// Eine eingegangene Bewerbung zählt als fertiges Profil: Bewerbungen gibt es
// nur auf vollständige Profile. Füllt das Team das Profil im SA-Portal aus,
// entsteht kein patient_data_saved, weil das SA-Portal direkt nach Mamamia
// schreibt. Ohne diese Regel liefen die Profil-Erinnerungen („Profil
// unvollständig — Sie können noch keine Bewerbungen erhalten") weiter,
// obwohl schon Bewerbungen da waren (helfer24-Lead 08.09.2026, Registry #69).

export type LeadMilestone = "none" | "portal_opened" | "patient_data_saved" | "caregiver_invited";

/** Ereignisse, die getLeadMilestone aus lead_events liest. */
export const MEILENSTEIN_EREIGNISSE = [
  "portal_opened",
  "patient_data_saved",
  "caregiver_invited",
  "application_received",
] as const;

export function meilensteinAus(ereignisse: Iterable<string>): LeadMilestone {
  const typen = new Set(ereignisse);
  if (typen.has("caregiver_invited")) return "caregiver_invited";
  if (typen.has("patient_data_saved") || typen.has("application_received")) return "patient_data_saved";
  if (typen.has("portal_opened")) return "portal_opened";
  return "none";
}
