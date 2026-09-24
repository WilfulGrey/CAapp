// Formularfeld: Label (+ Pflicht-Stern), Hinweis, Fehler direkt am Feld.
// data-field / data-invalid: daran springt das Formular zum ersten offenen Feld
// und ChipSelect zum nächsten Feld (statt über eine zerbrechliche Eltern-Kette).
import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export function FormField({
  feld, label, pflicht = false, hinweis, fehler, children, labelZusatz,
}: {
  feld: string;
  label: ReactNode;
  pflicht?: boolean;
  hinweis?: ReactNode;
  fehler?: string;
  children: ReactNode;
  /** z. B. ein Info-Knopf rechts neben dem Label */
  labelZusatz?: ReactNode;
}) {
  const id = useId();
  return (
    <div data-field={feld} data-invalid={fehler ? '1' : undefined} className="py-[18px] border-t border-pm-line-soft first:border-t-0 first:pt-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span id={`${id}-label`} className="text-[15.5px] font-bold text-pm-ink leading-snug">
          {label}
          {pflicht && <span className="text-pm-error ml-1" aria-hidden="true">*</span>}
        </span>
        {labelZusatz}
      </div>
      <div aria-labelledby={`${id}-label`} aria-describedby={fehler ? `${id}-fehler` : undefined} role="group">
        {children}
      </div>
      {hinweis && !fehler && <p className="mt-2 text-[13.5px] leading-snug text-pm-muted">{hinweis}</p>}
      {fehler && (
        <p id={`${id}-fehler`} className="mt-2 flex items-center gap-1.5 text-[13.5px] leading-snug text-pm-error-ink">
          <AlertCircle className="w-4 h-4 flex-none" aria-hidden="true" />
          {fehler}
        </p>
      )}
    </div>
  );
}
