// Nachfass-Kette nach Mail 1 (Eingangsbestätigung). Pure Daten, separat wegen
// Testbarkeit. Seit Registry #168 hängt auch nachfass_3 direkt an Mail 1.
//
//   0h    Eingangsbestätigung
//   +4h   profil_nudge_1        (Ihre Pflegekräfte-Auswahl: es fehlt die Pflegesituation)
//   +28h  profil_nudge_2        („Soll ich die Angaben am Telefon mit Ihnen ausfüllen?")
//   +72h  nachfass_3            (Abschied mit einem Knopf und zwei Antwort-Links)
//
// warum_primundus (+48 h, „Vier Dinge, die Primundus anders macht") und
// nachfass_2 (+72 h, „kann ich Ihnen etwas abnehmen?") sind gestrichen
// (Martin 15.11.2026, „A: Angebot + Erinnerungen", Registry #168): 64 gesendet /
// 1 Klick bzw. 43 gesendet / 0 Klicks in 30 Tagen, Nachfass 2 wiederholte die
// Telefon-Hilfe von Nudge 2. Bis dahin plante erst der Versand von nachfass_2
// den Abschied (+48 h, also +120 h nach Mail 1). Laufende Kunden (Mail 1 vor
// dem Deploy) haben noch eine geplante nachfass_2-Zeile und keine
// nachfass_3-Zeile: Verfällt die nachfass_2-Zeile im Gestrichen-Zweig, plant
// index.ts den Abschied sofort nach (abschiedNachholen unten).
//
// reaktivierung_wechsel (+49 d, „Steht bei Ihnen ein Pflegekraft-Wechsel an?") ist
// gestoppt (Martin 15.11.2026, Registry #167): Der Portal-Link gilt 14 Tage
// (project 3/lib/calculation.ts), an Tag 49 war er in 27 von 27 Fällen
// abgelaufen. Ob sie mit frischem Link zurückkommt, entscheidet Martin.
//
// profil_nudge_3 (+7 d, „Können wir Sie bei etwas unterstützen?") ist
// gestrichen (Martin 14.09.2026, Registry #70): Sie kam zwei Tage nach der
// Abschiedsmail. Seit 14.08. bekamen 34 von 65 Kunden sie nach dem Abschied.

export const KETTE_NACH_MAIL1: ReadonlyArray<readonly [typ: string, minuten: number]> = [
  ["profil_nudge_1", 4 * 60],
  ["profil_nudge_2", 28 * 60],
  ["nachfass_3", 72 * 60],
];

/** Nicht mehr versendete Mail-Typen. Schon eingeplante Zeilen verfallen beim Versand. */
export const GESTRICHENE_MAILS: ReadonlySet<string> = new Set([
  "profil_nudge_3", "reaktivierung_wechsel", "warum_primundus", "nachfass_2",
]);

/** Gestrichener Typ, der bis Registry #168 den Abschied (nachfass_3) eingeplant hat. */
export const ABSCHIED_VORGAENGER = "nachfass_2";

/** Eine nachfass_3-Zeile des Leads, so viel wie abschiedNachholen braucht. */
export type AbschiedZeile = { status: string; created_at?: string | null; sent_at?: string | null };

/** Laufende Kunden (Mail 1 vor Registry #168): Verfällt ihre geplante nachfass_2-Zeile im Gestrichen-Zweig, bekommen sie
 *  den Abschied trotzdem, und zwar sofort statt +48 h später (die Kette plant ihn jetzt +72 h nach Mail 1, genau dort
 *  stand nachfass_2). Nur, wenn es für diese Runde noch keinen Abschied gibt, damit nie zwei Abschiede entstehen:
 *  - eine offene Zeile (pending/processing) zählt immer, auch aus einer früheren Runde (die geht ohnehin noch raus);
 *  - sonst zählt jede Zeile, die nach `anker` angelegt oder versendet wurde (`anker` = created_at der verfallenden
 *    nachfass_2-Zeile, also der Versand von Mail 1 dieser Runde). Ein Abschied aus einer älteren Runde (Kunde hat später
 *    neu angefragt) zählt nicht, ein abgebrochener dieser Runde schon (dann hat eine Stopp-Regel gegriffen).
 *  Ohne `anker` zählt jede Zeile. Die Stopp-Regeln laufen unverändert beim Versand der neuen Zeile. */
export function abschiedNachholen(gestrichenerTyp: string, anker: string | null | undefined, zeilen: AbschiedZeile[]): boolean {
  if (gestrichenerTyp !== ABSCHIED_VORGAENGER) return false;
  const ab = anker ? Date.parse(anker) : NaN;
  return !zeilen.some((z) => {
    if (z.status === "pending" || z.status === "processing") return true;
    if (!Number.isFinite(ab)) return true;
    return [z.created_at, z.sent_at].some((t) => !!t && Date.parse(t) >= ab);
  });
}

/** Satz am Ende der Abschiedsmail (Registry #168, OpenAI-Gegencheck 15.11.2026). Stimmt, weil die Wechsel-Mail gestoppt
 *  ist (#167) und „Vier Dinge“ und Nachfass 2 wegfallen; bewusst ohne „letzte E-Mail“, denn Service-Mails wie ein neuer
 *  Zugangslink bleiben möglich. Kommt die Wechsel-Mail mit frischem Link zurück, muss der Satz wieder
 *  „… melde ich mich in einigen Wochen“ sagen. Ich-Form wie die ganze Mail. Bis #168: „Wenn ich nichts von Ihnen höre,
 *  melde ich mich erst in einigen Wochen wieder.“ */
export const ABSCHIED_SATZ = "Ohne Ihre Rückmeldung schreibe ich Ihnen danach nicht mehr zu dieser Anfrage.";

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
