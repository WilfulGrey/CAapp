// Stopp- und Zeitregeln der Kundenmails (Martin 26.09.2026: „mach die Mails", Funktion und
// Conversion prüfen). Pure Funktionen, separat wegen Testbarkeit (_tests/stopRegeln.test.ts);
// index.ts liest die Lage aus der Datenbank und fragt hier, was mit der Zeile passiert.
//
// Was vorher schief lief:
//  - „Vier Dinge", Nachfass 2 und Nachfass 3 liefen weiter, obwohl die Pflegesituation schon
//    abgesendet war („kann ich Ihnen beim Ausfüllen helfen?" an jemanden, der fertig ist).
//  - Die Erinnerungen +1 h / +4 h / +12 h landeten bei Abend- und Nachtbewerbungen gebündelt um
//    8 Uhr, die letzte (+70 h) fiel bei Nachtbewerbungen hinter die automatische Absage.
//  - „Neue Pflegekräfte" ging nachts raus und auch dann, wenn gerade eine Bewerbung reserviert war.
import type { LeadMilestone } from "./meilenstein.ts";
import { ausDerNachtruhe, inNachtruhe } from "./quietHours.ts";

const STUNDE = 60 * 60 * 1000;

/** Muss zu AUTO_REJECT_AFTER_HOURS in detect-caregiver-events und src/lib/reservierung.ts passen. */
export const RESERVIERUNG_STUNDEN = 72;

// ── Mails vor dem Absenden ────────────────────────────────────────────────

/** Diese Mails bitten darum, die Pflegesituation zu beschreiben. Steht sie, sind sie erledigt. */
export const VOR_DEM_ABSENDEN: ReadonlySet<string> = new Set(["warum_primundus", "nachfass_2", "nachfass_3"]);

export function vorAbsendenStopp(lage: {
  beauftragt: boolean;
  nichtInteressiert: boolean;
  meilenstein: LeadMilestone;
}): string | null {
  if (lage.meilenstein === "caregiver_invited") return "caregiver_invited";
  if (lage.meilenstein === "patient_data_saved") return "patient_data_saved";
  if (lage.nichtInteressiert) return "nicht_interessiert";
  if (lage.beauftragt) return "betreuung_beauftragt";
  return null;
}

// ── Erinnerungen an eine Bewerbung ────────────────────────────────────────

/** Neue Typen (Plan in lib/erinnerungsplan.ts). Präfix `application_` bleibt: bewertung.ts hält
 *  die Bewertungsanfrage zurück, solange solche Mails offen sind. */
export const ERINNERUNG_NEU = ["application_erinnerung_1", "application_erinnerung_2", "application_erinnerung_letzte"] as const;
/** Alte Typen aus der Warteschlange: laufen durch denselben neuen Baustein. */
export const ERINNERUNG_ALT = ["application_reminder", "application_reminder_4h", "application_reminder_12h", "application_last_chance"] as const;
export const ERINNERUNG_TYPEN: ReadonlySet<string> = new Set<string>([...ERINNERUNG_NEU, ...ERINNERUNG_ALT]);

export type ErinnerungStufe = "1" | "2" | "letzte";

export function erinnerungStufe(typ: string): ErinnerungStufe | null {
  switch (typ) {
    case "application_erinnerung_1":
    case "application_reminder":
    case "application_reminder_4h":
    case "application_reminder_12h":
      return "1";
    case "application_erinnerung_2":
      return "2";
    case "application_erinnerung_letzte":
    case "application_last_chance":
      return "letzte";
    default:
      return null;
  }
}

/** Ende der Reservierung: frühestes echtes `application_received` des Paars + 72 h, auf die
 *  volle Stunde ABgerundet — dieselbe Regel wie der Countdown im Portal (src/lib/reservierung.ts).
 *  Ohne Anker kein Ende (nicht raten). */
export function reservierungsEnde(eingaengeMs: number[]): Date | null {
  const gueltig = eingaengeMs.filter((ms) => Number.isFinite(ms));
  if (gueltig.length === 0) return null;
  return new Date(Math.floor((Math.min(...gueltig) + RESERVIERUNG_STUNDEN * STUNDE) / STUNDE) * STUNDE);
}

/** `metadata.reserviert_bis` der Zeile (neue Zeilen) hat Vorrang, sonst aus den Eingängen. */
export function reserviertBisAus(metaBis: unknown, eingaengeMs: number[]): Date | null {
  if (typeof metaBis === "string") {
    const t = Date.parse(metaBis);
    if (Number.isFinite(t)) return new Date(t);
  }
  return reservierungsEnde(eingaengeMs);
}

/** Unter einer Stunde Rest kommt keine Erinnerung mehr (der Kunde schafft es nicht mehr, und
 *  die Mail käme womöglich nach der Absage an). */
export const MIN_REST_MS = 1 * STUNDE;
/** Mindestabstand zwischen zwei Mails zur selben Bewerbung (Mail B oder Erinnerung). */
export const MIN_ABSTAND_MS = 6 * STUNDE;

/**
 * Soll diese Erinnerung entfallen?
 *  - `reservierung_abgelaufen`: weniger als 1 h Reservierung übrig.
 *  - `zu_dicht`: vor weniger als 6 h kam schon eine Mail zu dieser Bewerbung. Beendet den
 *    8-Uhr-Stau der alten +1 h/+4 h/+12 h-Zeilen. Gilt nicht für die letzte Erinnerung — die ist
 *    die wichtigste, der Plan hält den Abstand selbst ein.
 *  - `doppelt`: die letzte Erinnerung ging zu dieser Bewerbung schon raus.
 */
export function erinnerungStopp(o: {
  stufe: ErinnerungStufe;
  restMs: number | null;
  seitLetzterMailMs: number | null;
  letzteSchonGesendet: boolean;
}): "reservierung_abgelaufen" | "zu_dicht" | "doppelt" | null {
  if (o.restMs != null && o.restMs < MIN_REST_MS) return "reservierung_abgelaufen";
  if (o.stufe === "letzte") return o.letzteSchonGesendet ? "doppelt" : null;
  if (o.seitLetzterMailMs != null && o.seitLetzterMailMs < MIN_ABSTAND_MS) return "zu_dicht";
  return null;
}

/** „noch 2 Tage" / „noch 24 Stunden" / „noch 1 Stunde" — auf die volle Stunde gerundet. Das
 *  Ende ist schon abgerundet, die echte Absage kommt also nie früher als hier genannt. */
export function reserviertRest(restMs: number): string {
  const h = Math.max(1, Math.round(restMs / STUNDE));
  if (h >= 48) return "noch 2 Tage";
  return h === 1 ? "noch 1 Stunde" : `noch ${h} Stunden`;
}

/** „Marias" / „Agnes'" — Genitiv eines Vornamens. */
export function genitiv(vorname: string): string {
  const v = vorname.trim();
  return /(s|ß|x|z|ce)$/i.test(v) ? `${v}'` : `${v}s`;
}

// ── Neue Pflegekräfte, Stand nach 2 Tagen ─────────────────────────────────

export type Entscheidung =
  | { aktion: "senden" }
  | { aktion: "abbrechen"; grund: string }
  | { aktion: "verschieben"; bis: Date };

/** „Neue Pflegekräfte verfügbar" (+24 h nach der letzten Einladung). */
export function neuePflegekraefteEntscheidung(o: {
  jetzt: Date;
  beauftragt: boolean;
  nichtInteressiert: boolean;
  reagiertSeitAnlage: boolean;
  reservierungAktiv: boolean;
}): Entscheidung {
  if (o.nichtInteressiert) return { aktion: "abbrechen", grund: "nicht_interessiert" };
  if (o.beauftragt) return { aktion: "abbrechen", grund: "betreuung_beauftragt" };
  if (o.reagiertSeitAnlage) return { aktion: "abbrechen", grund: "reaction_received" };
  // Während eine Bewerbung reserviert ist, soll der Kunde über DIESE entscheiden.
  if (o.reservierungAktiv) return { aktion: "abbrechen", grund: "reservierung_aktiv" };
  if (inNachtruhe(o.jetzt)) return { aktion: "verschieben", bis: ausDerNachtruhe(o.jetzt) };
  return { aktion: "senden" };
}

/** „Noch keine Bewerbung? So geht es schneller" (+48 h nach dem Absenden). */
export function sucheStandStopp(o: {
  beauftragt: boolean;
  nichtInteressiert: boolean;
  bewerbungDa: boolean;
  interesseSeitAnlage: boolean;
}): string | null {
  if (o.nichtInteressiert) return "nicht_interessiert";
  if (o.beauftragt) return "betreuung_beauftragt";
  if (o.bewerbungDa) return "bewerbung_da";
  if (o.interesseSeitAnlage) return "interesse_da";
  return null;
}

/** Aktive Reservierung: eine echte Bewerbung der letzten 72 h, auf die der Kunde noch nicht
 *  reagiert hat (weder zu- noch abgesagt). Ereignisse wie aus lead_events. */
export function reservierungAktiv(
  ereignisse: { event_type: string; created_at: string; metadata?: Record<string, unknown> | null }[],
  jetzt: Date,
): boolean {
  const beantwortet = new Set(
    ereignisse
      .filter((e) => e.event_type === "application_accepted_internal" || e.event_type === "application_rejected")
      .map((e) => String(e.metadata?.caregiver_id ?? "")),
  );
  return ereignisse.some((e) => {
    if (e.event_type !== "application_received" || e.metadata?.seeded === true) return false;
    const cg = String(e.metadata?.caregiver_id ?? "");
    if (!cg || beantwortet.has(cg)) return false;
    const t = Date.parse(e.created_at);
    return Number.isFinite(t) && jetzt.getTime() - t < RESERVIERUNG_STUNDEN * STUNDE;
  });
}
