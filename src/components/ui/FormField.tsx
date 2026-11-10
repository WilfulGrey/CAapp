// Formularfeld: Label (+ Pflicht-Stern), Hinweis, Fehler direkt am Feld.
// data-field / data-invalid: daran springt das Formular zum ersten offenen Feld
// und ChipSelect zum nächsten Feld (statt über eine zerbrechliche Eltern-Kette).
import { createContext, useContext, useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

/** Größere Schrift im Patientenbogen (Minimal-Einstieg; Martin 09.11.2026: „zu klein … muss lesbarer“). ChipSelect liest
 *  denselben Schalter. */
export const FormLesbar = createContext(false);

export function FormField({
  feld, label, pflicht = false, hinweis, fehler, children, labelZusatz, zeile,
}: {
  feld: string;
  label: ReactNode;
  pflicht?: boolean;
  hinweis?: ReactNode;
  fehler?: string;
  children: ReactNode;
  /** z. B. ein Info-Knopf rechts neben dem Label */
  labelZusatz?: ReactNode;
  /** Frage links, Antwort rechts in einer Zeile: `true` = feste Breite für Ja/Nein, `'frei'` = so breit wie der Inhalt
   *  (feste Werte aus dem Kostenrechner). */
  zeile?: boolean | 'frei';
}) {
  const id = useId();
  const lesbar = useContext(FormLesbar);
  const labelCls = lesbar ? 'text-[17px] font-bold text-pm-ink leading-snug' : 'text-[15.5px] font-bold text-pm-ink leading-snug';
  const kleinCls = lesbar ? 'text-[15px]' : 'text-[13.5px]';
  const labelTeil = (
    <>
      <span id={`${id}-label`} className={labelCls}>
        {label}
        {pflicht && <span className="text-pm-error ml-1" aria-hidden="true">*</span>}
      </span>
      {labelZusatz}
    </>
  );
  const antwort = (cls: string) => (
    <div className={cls} aria-labelledby={`${id}-label`} aria-describedby={fehler ? `${id}-fehler` : undefined} role="group">
      {children}
    </div>
  );
  return (
    <div data-field={feld} data-invalid={fehler ? '1' : undefined} data-zeile={zeile ? '1' : undefined} className="py-[18px] border-t border-pm-line-soft first:border-t-0 first:pt-3">
      {zeile ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">{labelTeil}</div>
          {antwort(zeile === 'frei' ? 'flex-none max-w-[62%]' : 'w-[172px] max-[374px]:w-[150px] flex-none')}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-2.5">{labelTeil}</div>
          {antwort('')}
        </>
      )}
      {hinweis && !fehler && <p className={`mt-2 ${kleinCls} leading-snug text-pm-muted`}>{hinweis}</p>}
      {fehler && (
        <p id={`${id}-fehler`} className={`mt-2 flex items-center gap-1.5 ${kleinCls} leading-snug text-pm-error-ink`}>
          <AlertCircle className="w-4 h-4 flex-none" aria-hidden="true" />
          {fehler}
        </p>
      )}
    </div>
  );
}
