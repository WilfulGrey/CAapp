// Knopfleiste des Formulars: Zurück und Weiter/Speichern gleich hoch, unten im Formular
// mitlaufend (sticky), mit Abstand zum iPhone-Rand. Solange die Tastatur offen ist
// (ein Eingabefeld hat den Fokus), läuft die Leiste normal im Fluss mit, damit sie
// nicht über dem Feld klebt.
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';

export function FormNav({
  onZurueck, onWeiter, weiterText, laedt = false, ladeText, hinweis, notiz,
}: {
  onZurueck?: () => void;
  onWeiter: () => void;
  weiterText: string;
  laedt?: boolean;
  ladeText?: string;
  /** z. B. „Pflegegrad fehlt" — Tippen darauf springt zum Feld (Aufrufer) */
  hinweis?: ReactNode;
  notiz?: ReactNode;
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

  return (
    <div className={`${tastatur ? '' : 'sticky bottom-0'} z-10 -mx-5 px-5 pt-3.5 pb-[calc(16px+env(safe-area-inset-bottom))] bg-white border-t border-[#EFEBE4] rounded-b-card`}>
      {hinweis && <div className="mb-2.5 text-center text-[13.5px] text-pm-error-ink">{hinweis}</div>}
      <div className={onZurueck ? 'grid grid-cols-[auto_1fr] gap-2.5' : ''}>
        {onZurueck && (
          <Button variante="sekundaer" onClick={onZurueck} className="px-5 font-semibold text-[16px]">
            Zurück
          </Button>
        )}
        <Button onClick={onWeiter} laedt={laedt} ladeText={ladeText} breit>
          {weiterText}
        </Button>
      </div>
      {notiz && <p className="mt-2.5 text-center text-[12.5px] text-pm-muted">{notiz}</p>}
    </div>
  );
}
