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

/** Satz am Ende der Abschiedsmail. Ehrlich, weil die Wechsel-Mail nach 7 Wochen noch kommt.
 *  Ich-Form wie die ganze Mail (Vorschau v2, Martin 26.09.2026). */
export const ABSCHIED_SATZ = "Wenn ich nichts von Ihnen höre, melde ich mich erst in einigen Wochen wieder.";

/** Die drei Knöpfe der Abschiedsmail — Spiegel von project 3/lib/rueckmeldung.ts
 *  (Edge Fn kann nicht aus lib/ importieren; ein Test prüft den Gleichlauf). */
export type RueckmeldungKnopf = "interesse" | "aktuell-nicht" | "nicht-relevant";

/** Beschriftung der drei Knöpfe (Vorschau v2, 26.09.2026: „die Knöpfe … nicht professionell").
 *  Wortgleich zu KNOEPFE in lib/rueckmeldung.ts — die Seite zitiert sie in der Team-Mail. */
export const RUECKMELDUNG_KNOEPFE: Record<RueckmeldungKnopf, string> = {
  "interesse": "Ja, ich habe noch Interesse",
  "aktuell-nicht": "Aktuell nicht, vielleicht später",
  "nicht-relevant": "Nicht mehr relevant",
};

/** Ziel der Knöpfe der Abschiedsmail (Registry #72): /rueckmeldung im
 *  Kostenrechner. „Später" wählt dort einen Termin, „nicht relevant" nennt einen
 *  Grund, „Interesse" fordert einen Rückruf an. Vorher öffneten die Knöpfe nur
 *  eine Mail an info@, und bis jemand den Status setzte, liefen die Mails weiter. */
export function rueckmeldungLink(siteUrl: string, token: string, knopf: RueckmeldungKnopf): string {
  return `${siteUrl.replace(/\/$/, "")}/rueckmeldung?token=${encodeURIComponent(token)}&knopf=${knopf}`;
}

/** Kunden-Aktivität nach Beginn einer Pause: dann gilt die Pause als beendet und
 *  die Wiedervorlage entfällt (der Kunde hat sich schon selbst gemeldet).
 *  Bewusst OHNE portal_reopened — das Team öffnet das Portal per Token auch. */
export const AKTIVITAET_NACH_PAUSE = [
  "angebot_requested_duplicate",
  "patient_data_saved",
  "caregiver_invited",
  "application_accepted_internal",
  "rueckruf_erbeten_mail",
] as const;

/** Pause aktiv: Termin liegt in der Zukunft und der Kunde war seitdem nicht aktiv. */
export function pauseAktiv(bis: string | null | undefined, jetzt: Date, aktivSeitPause: boolean): boolean {
  if (aktivSeitPause || !bis) return false;
  const t = Date.parse(bis);
  return Number.isFinite(t) && t > jetzt.getTime();
}

/** Status, bei denen die Wiedervorlage noch Sinn ergibt (offene Anfrage). */
export const OFFENE_STATUS: ReadonlySet<string> = new Set(["angebot_requested", "info_requested", "manuell_pruefen"]);
