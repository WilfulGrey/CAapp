// Knopfleiste des Formulars: Zurück und Weiter/Speichern gleich hoch, unten im Formular
// mitlaufend (sticky), mit Abstand zum iPhone-Rand. Solange die Tastatur offen ist
// (ein Eingabefeld hat den Fokus), läuft die Leiste normal im Fluss mit, damit sie
// nicht über dem Feld klebt. Ebenso, solange ein Feld unter sich etwas aufgeklappt hat
// (der Startdatum-Kalender, `meldeFeldAufgeklappt`): Seit Registry #86 lag der 339 px
// hohe Kalender am Handy zum großen Teil hinter der 83–117 px hohen Leiste (iPhone SE
// bei 553 px Höhe 0 von 19 Tagen antippbar, Messung 13.10.), und ein Tipp auf einen
// verdeckten Tag traf „Zurück“ oder „Weiter“.
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';

/** Ereignis an `document`: Ein Feld klappt unter sich etwas auf (detail `true`) bzw. wieder zu
 *  (`false`). Solange eins offen ist, läuft die Leiste im Fluss statt unten zu kleben. */
export const FELD_AUFGEKLAPPT = 'pm:feld-aufgeklappt';

export function meldeFeldAufgeklappt(auf: boolean) {
  document.dispatchEvent(new CustomEvent<boolean>(FELD_AUFGEKLAPPT, { detail: auf }));
}

export function FormNav({
  onZurueck, onWeiter, weiterText, laedt = false, ladeText, hinweis, zurueckAlsLink, ruhig = false, stand75b8df8 = false,
}: {
  /** Rückbau Registry #122: vor dem ersten Speichern der Hauptknopf wie im Stand 75b8df8 (ohne die
   *  späteren Klassen `px-2 whitespace-nowrap`). Sonst unverändert. */
  stand75b8df8?: boolean;
  /** Kompakt-Einstieg (Runde 15): im Hinweis-Kasten mit 24 px Innenabstand — Leiste bündig bis an den
   *  Rand (-mx-6), Hauptknopf in 600 wie alle Knöpfe dort. Sonst unverändert. */
  ruhig?: boolean;
  onZurueck?: () => void;
  /** Letzter Schritt: Hauptknopf allein über die volle Breite, „Zurück" als Textlink
   *  darunter (Martin 25.09.: „Bewerbungen anfragen" passte neben „Zurück" nicht). */
  zurueckAlsLink?: string;
  onWeiter: () => void;
  weiterText: string;
  laedt?: boolean;
  ladeText?: string;
  /** z. B. „Pflegegrad fehlt" — Tippen darauf springt zum Feld (Aufrufer) */
  hinweis?: ReactNode;
}) {
  const [tastatur, setTastatur] = useState(false);
  useEffect(() => {
    const istEingabe = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)));
    const an = (e: FocusEvent) => { if (istEingabe(e.target)) setTastatur(true); };
    const aus = (e: FocusEvent) => { if (istEingabe(e.target)) setTastatur(false); };
    document.addEventListener('focusin', an);
    document.addEventListener('focusout', aus);
    return () => { document.removeEventListener('focusin', an); document.removeEventListener('focusout', aus); };
  }, []);
  // Zähler statt Ja/Nein: Mehrere Felder dürfen gleichzeitig offen sein, erst das letzte „zu“ zählt.
  const [aufgeklappt, setAufgeklappt] = useState(0);
  useEffect(() => {
    const melden = (e: Event) => {
      const auf = (e as CustomEvent<boolean>).detail === true;
      setAufgeklappt(n => Math.max(0, n + (auf ? 1 : -1)));
    };
    document.addEventListener(FELD_AUFGEKLAPPT, melden);
    return () => document.removeEventListener(FELD_AUFGEKLAPPT, melden);
  }, []);
  const imFluss = tastatur || aufgeklappt > 0;

  return (
    // data-knopfleiste: daran misst ein aufgeklapptes Feld, wie viel die Leiste unten verdeckt.
    <div data-knopfleiste="" className={`${imFluss ? '' : 'sticky bottom-0'} z-10 ${ruhig ? '-mx-6 px-6' : '-mx-5 px-5'} pt-3.5 pb-[calc(16px+env(safe-area-inset-bottom))] bg-white border-t border-[#EFEBE4] rounded-b-card`}>
      {hinweis && <div className="mb-2.5 text-center text-[13.5px] text-pm-error-ink">{hinweis}</div>}
      <div className={onZurueck && !zurueckAlsLink ? 'grid grid-cols-[auto_1fr] gap-2.5' : ''}>
        {onZurueck && !zurueckAlsLink && (
          <Button variante="sekundaer" onClick={onZurueck} className="px-5 font-semibold text-[16px]">
            Zurück
          </Button>
        )}
        <Button onClick={onWeiter} laedt={laedt} ladeText={ladeText} breit className={stand75b8df8 ? undefined : `px-2 whitespace-nowrap${ruhig ? ' !font-semibold' : ''}`}>
          {weiterText}
        </Button>
      </div>
      {onZurueck && zurueckAlsLink && (
        <div className="mt-1 text-center">
          <Button variante="link" onClick={onZurueck} className="text-[15px]">{zurueckAlsLink}</Button>
        </div>
      )}
    </div>
  );
}
