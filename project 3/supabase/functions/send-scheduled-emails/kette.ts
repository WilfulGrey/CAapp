// Nachfass-Kette nach Mail 1 (Eingangsbestätigung). Pure Daten, separat wegen
// Testbarkeit. nachfass_3 hängt nicht hier, sondern an nachfass_2 (+48 h).
//
//   0h    Eingangsbestätigung
//   +4h   profil_nudge_1        (das Warum: ohne Profil keine Bewerbungen)
//   +28h  profil_nudge_2        („Soll ich Ihnen beim Ausfüllen helfen?")
//   +48h  warum_primundus       (Trust/USPs)
//   +72h  nachfass_2            (kurze persönliche Nachfrage)
//   +120h nachfass_3            (Abschied mit drei Antwortknöpfen)
//   +49d  reaktivierung_wechsel (Wechsel-Fenster nach 6–8 Wochen)
//
// profil_nudge_3 (+7 d, „Können wir Sie bei etwas unterstützen?") ist
// gestrichen (Martin 14.09.2026, Registry #70): Sie kam zwei Tage nach der
// Abschiedsmail. Seit 14.08. bekamen 34 von 65 Kunden sie nach dem Abschied.

export const KETTE_NACH_MAIL1: ReadonlyArray<readonly [typ: string, minuten: number]> = [
  ["profil_nudge_1", 4 * 60],
  ["profil_nudge_2", 28 * 60],
  ["warum_primundus", 48 * 60],
  ["nachfass_2", 72 * 60],
  ["reaktivierung_wechsel", 49 * 24 * 60],
];

/** Nicht mehr versendete Mail-Typen. Schon eingeplante Zeilen verfallen beim Versand. */
export const GESTRICHENE_MAILS: ReadonlySet<string> = new Set(["profil_nudge_3"]);

/** Satz am Ende der Abschiedsmail. Ehrlich, weil die Wechsel-Mail nach 7 Wochen noch kommt. */
export const ABSCHIED_SATZ = "Falls wir nichts hören, melden wir uns erst in einigen Wochen noch einmal.";
