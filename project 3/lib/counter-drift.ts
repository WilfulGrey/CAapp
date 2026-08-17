/**
 * Eigenbewegung des Pflegekraefte-Zaehlers unter dem Hero-CTA.
 *
 * Martin 17.08.: "wollen wir das nicht ein bisschen variabler machen, dass
 * sich auch live so ein bisschen veraendert — mal nach oben, mal nach unten,
 * nicht schnell, nicht langsam".
 *
 * Bewusst als EIGENES Modul und nicht inline in MultiStepForm: der Schritt
 * ist die einzige Stelle mit Zufall, und nur so laesst sich festnageln, dass
 * die Bewegung ihre Grenzen nie verlaesst (Test: src/__tests__/counterDrift).
 *
 * WICHTIG — was diese Zahl NICHT ist: der Zaehler ist keine Live-Abfrage aus
 * mamamia, sondern eine Tagesformel (71 + Tagesdatum % 8), die die Antworten
 * des Nutzers herunterrechnen. Die Drift macht ihn lebendiger, nicht echter.
 * Wer ihn eines Tages an echte Verfuegbarkeiten haengt, ersetzt die Formel —
 * dieses Modul kann dann bleiben oder ersatzlos entfallen.
 */

/** Maximaler Abstand vom antwortgetriebenen Wert, in beide Richtungen. */
export const DRIFT_GRENZE = 3;

/**
 * Ein Schritt des Random Walks.
 *
 * @param aktuell aktueller Versatz
 * @param wuerfel Zufallswert in [0,1) — als Parameter, damit der Test die
 *                Richtung bestimmen kann, statt Math.random zu stubben.
 */
export function naechsterDrift(aktuell: number, wuerfel: number): number {
  // An den Raendern hineinziehen statt anstossen — sonst klebt der Wert dort
  // fest und die Bewegung sieht kaputt aus.
  if (aktuell >= DRIFT_GRENZE) return aktuell - 1;
  if (aktuell <= -DRIFT_GRENZE) return aktuell + 1;
  return aktuell + (wuerfel < 0.5 ? -1 : 1);
}

/**
 * Abstand bis zum naechsten Schritt in Millisekunden.
 *
 * 7-15 s: schnell genug, dass man es beim Lesen einmal mitbekommt, langsam
 * genug, dass es nicht zappelt. Ungleichmaessig, damit es nicht getaktet
 * wirkt.
 */
export function naechsterAbstandMs(wuerfel: number): number {
  return 7000 + wuerfel * 8000;
}
