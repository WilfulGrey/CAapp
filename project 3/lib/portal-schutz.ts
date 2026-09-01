/* ─── Wer NICHT angeschrieben wird ───────────────────────────────────────
 *
 * Eingekaufte Leads gehen an Menschen, die uns nicht kennen. Zwei Fehler
 * sind hier teurer als jede verpasste Chance:
 *
 *  1. Jemanden anschreiben, der beim Portal schon "kein Interesse" gesagt
 *     hat. Der Pflegebund-Export vom 31.08. enthielt 63 solche Faelle,
 *     dazu 85 "Ungeeignet" und 118 bereits verkaufte — von 432 Zeilen
 *     waren nur 80 ueberhaupt ansprechbar.
 *  2. Eine alte Anfrage aufwaermen. Die Einwilligung zur Kontakt-
 *     weitergabe traegt zeitlich nicht beliebig weit; wer im Februar
 *     angefragt hat, erinnert sich im August nicht und liest "vielen Dank
 *     für Ihre Anfrage" als Kaltwerbung. Im selben Export waren von den
 *     80 ansprechbaren nur 10 hoechstens 60 Tage alt.
 *
 * Die Pruefung sitzt im Eingang (api/portal-lead), nicht im Laeufer:
 * dann gilt sie fuer jeden Weg — Mailparser, CSV-Import, Handeingabe.
 */

/** Aelter als das ⇒ nicht anschreiben. Zwei Monate, in Anlehnung an die
 *  Rechtsprechung zur Aktualitaet einer Werbeeinwilligung. */
export const HOECHSTALTER_TAGE = 60;

/* Status-Werte aus dem Lead-Point-Export. Bewusst eine ALLOWLIST: ein
 * unbekannter neuer Status bedeutet "nicht anschreiben", nicht
 * "wahrscheinlich schon ok". Leads ohne Status (z. B. die frische
 * Pflegehilfe-Mail) sind erlaubt — dort gibt es keine Vorgeschichte. */
export const ANSPRECHBARE_STATUS = ['neu', 'versendet', 'kunde ruft zurück', 'kunde ruft zurueck'];

export interface SchutzEingabe {
  /** Status beim Portal, falls der Export einen liefert. */
  status?: string | null;
  /** Wann die Anfrage beim Portal entstand (ISO oder Date). */
  erstellt_am?: string | Date | null;
}

export interface SchutzErgebnis {
  ok: boolean;
  /** Klartext fuer Log und Antwort — warum abgelehnt wurde. */
  grund?: string;
}

export function darfAngeschriebenWerden(
  eingabe: SchutzEingabe,
  jetzt: Date,
): SchutzErgebnis {
  const status = (eingabe.status ?? '').trim().toLowerCase();
  if (status && !ANSPRECHBARE_STATUS.includes(status)) {
    return { ok: false, grund: `Status "${eingabe.status}" ist nicht ansprechbar` };
  }

  const roh = eingabe.erstellt_am;
  if (roh) {
    const datum = roh instanceof Date ? roh : new Date(roh);
    if (Number.isNaN(datum.getTime())) {
      // Unlesbares Datum ⇒ wir wissen das Alter nicht ⇒ nicht senden.
      return { ok: false, grund: `Datum nicht lesbar: ${String(roh)}` };
    }
    const tage = Math.floor((jetzt.getTime() - datum.getTime()) / 86_400_000);
    if (tage > HOECHSTALTER_TAGE) {
      return { ok: false, grund: `Anfrage ist ${tage} Tage alt (Grenze ${HOECHSTALTER_TAGE})` };
    }
    if (tage < -1) {
      return { ok: false, grund: `Datum liegt in der Zukunft: ${String(roh)}` };
    }
  }

  return { ok: true };
}
