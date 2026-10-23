// Erinnerungen an eine offene Bewerbung (Vorschau v2, Martin 26.09.2026). Pure Funktion,
// getestet in src/__tests__/erinnerungsplan.test.ts; lead-event plant damit die Zeilen,
// send-scheduled-emails (stopRegeln.ts) prüft beim Versand noch einmal.
//
// Vorher: +1 h, +4 h, +12 h, +70 h ab Eingang. Abend- und Nachtbewerbungen bekamen drei
// Mails gebündelt um 8 Uhr, und die letzte rutschte bei Nachtbewerbungen hinter die
// automatische Absage (die Ruhezeit schob sie auf 8 Uhr, die Reservierung endete vorher).
//
// Jetzt, gerechnet vom Ende der Reservierung (frühester echter Eingang + 72 h, abgerundet):
//   Erinnerung 1   Ende − 52 h („noch 2 Tage"); nachts auf 08:00 danach
//   Erinnerung 2   Ende − 24 h („noch 24 Stunden"); nachts auf 20:00 davor, damit sie nicht
//                  an die letzte heranrückt
//   letzte         Ende − 8 h („nur noch 8 Stunden"); nachts auf 08:00, wenn dann noch
//                  mindestens 6 h bleiben, sonst 20:00 am Vorabend — nie nach dem Ende
// Keine Erinnerung früher als 6 h nach Mail B (jetzt) bzw. 30 min für die letzte, keine
// weniger als 1 h vor dem Ende, 6 h Abstand untereinander. Bleiben weniger als 6 h: keine.
import { ausDerNachtruhe, inNachtruhe, vorDerNachtruhe } from './quiet-hours';

export const RESERVIERUNG_STUNDEN = 72;
const STUNDE = 60 * 60 * 1000;

export type ErinnerungsTyp = 'application_erinnerung_1' | 'application_erinnerung_2' | 'application_erinnerung_letzte';
export type GeplanteErinnerung = { emailType: ErinnerungsTyp; scheduledFor: Date };

/** Ende der Reservierung — dieselbe Regel wie src/lib/reservierung.ts und stopRegeln.ts. */
export function reservierungsEnde(eingaengeMs: number[]): Date | null {
  const gueltig = eingaengeMs.filter((ms) => Number.isFinite(ms));
  if (gueltig.length === 0) return null;
  return new Date(Math.floor((Math.min(...gueltig) + RESERVIERUNG_STUNDEN * STUNDE) / STUNDE) * STUNDE);
}

export function erinnerungsplan(ende: Date, jetzt: Date): GeplanteErinnerung[] {
  const e = ende.getTime();
  const j = jetzt.getTime();
  if (e - j < 6 * STUNDE) return [];

  const plan: GeplanteErinnerung[] = [];
  const passt = (t: Date, frueheste: number) => t.getTime() >= frueheste && e - t.getTime() >= 1 * STUNDE;

  // letzte zuerst: sie ist die wichtigste, die anderen richten sich nach ihr
  const rohL = new Date(e - 8 * STUNDE);
  let letzte = rohL;
  if (inNachtruhe(rohL)) {
    const morgens = ausDerNachtruhe(rohL);
    letzte = e - morgens.getTime() >= 6 * STUNDE ? morgens : vorDerNachtruhe(rohL);
  }
  const mitLetzter = passt(letzte, j + 30 * 60 * 1000);
  if (mitLetzter) plan.push({ emailType: 'application_erinnerung_letzte', scheduledFor: letzte });

  const rohZwei = new Date(e - 24 * STUNDE);
  const zwei = inNachtruhe(rohZwei) ? vorDerNachtruhe(rohZwei) : rohZwei;
  const mitZwei = passt(zwei, j + 6 * STUNDE) && (!mitLetzter || letzte.getTime() - zwei.getTime() >= 6 * STUNDE);
  if (mitZwei) plan.push({ emailType: 'application_erinnerung_2', scheduledFor: zwei });

  const rohEins = new Date(e - 52 * STUNDE);
  const eins = inNachtruhe(rohEins) ? ausDerNachtruhe(rohEins) : rohEins;
  const naechste = mitZwei ? zwei.getTime() : mitLetzter ? letzte.getTime() : e;
  if (passt(eins, j + 6 * STUNDE) && naechste - eins.getTime() >= 6 * STUNDE) {
    plan.push({ emailType: 'application_erinnerung_1', scheduledFor: eins });
  }

  return plan.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}
