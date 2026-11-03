// Der Hinweis oben im Portal (Toast) mit Warteschlange — Registry #145, Nachbesserung 2 (03.11.2026).
//
// Nach dem ersten Speichern der Pflegesituation steht der Dank „✓ Vielen Dank! Passende Pflegekräfte können sich jetzt
// bei Ihnen bewerben.“ 7 s lang. Das automatische Einladen der Vorgemerkten meldet sich ca. 1 s danach („{Name} ist
// eingeladen.“ bzw. die übliche Fehlermeldung) und hat den Dank bisher sofort ersetzt. Jetzt:
//   - `geschuetzt`: dieser Toast (der Dank) darf von `hintenAn`-Toasts nicht ersetzt werden, solange er steht;
//   - `hintenAn`: steht gerade ein geschützter Toast, wartet dieser Toast und erscheint, sobald der geschützte endet.
// Alle anderen Toasts verhalten sich wie bisher (ersetzen den aktuellen). Nur der Timer des LETZTEN Toasts blendet aus
// (vorher schloss der Timer eines älteren Toasts einen neueren zu früh).
import { useEffect, useRef, useState } from 'react';

/** Wie lange der Dank nach dem ersten Speichern steht (ms). Eigene Konstante, damit Tests ihn kürzen können. */
export const DANK_DAUER_MS = 7000;

export type ToastOptionen = {
  /** Darf von `hintenAn`-Toasts nicht überschrieben werden, solange er steht. */
  geschuetzt?: boolean;
  /** Wartet hinter einem geschützten Toast, statt ihn zu ersetzen. */
  hintenAn?: boolean;
};

export function useToastWarteschlange() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geschuetzt = useRef(false);
  const warteschlange = useRef<Array<{ msg: string; dauer: number }>>([]);

  const zeigen = (msg: string, dauer: number, schutz: boolean) => {
    setToast(msg);
    geschuetzt.current = schutz;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      geschuetzt.current = false;
      const naechster = warteschlange.current.shift();
      if (naechster) zeigen(naechster.msg, naechster.dauer, false);
      else setToast(null);
    }, dauer);
  };

  const showToast = (msg: string, durationMs = 4000, optionen: ToastOptionen = {}) => {
    if (optionen.hintenAn && geschuetzt.current) {
      warteschlange.current.push({ msg, dauer: durationMs });
      return;
    }
    zeigen(msg, durationMs, !!optionen.geschuetzt);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { toast, showToast };
}
