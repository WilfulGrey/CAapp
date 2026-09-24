import type { FC } from 'react';
import { Check } from 'lucide-react';

/**
 * Auswahl als antippbare Chips statt Dropdown (Martin, 11.08.: „wollen wir das
 * Formular nicht leichter ausfüllbar machen mit Chips?").
 *
 * Warum: Von den ~26 Auswahlfeldern im Patientenbogen haben NEUN genau zwei
 * Optionen (Ja/Nein, Männlich/Weiblich) und weitere dreizehn drei oder vier.
 * Ein Dropdown kostet dort drei Interaktionen — antippen, Liste öffnet,
 * auswählen —, ein Chip genau eine. Beim Ehepaar summiert sich das auf über
 * zwanzig gesparte Tipps, und der Kunde sieht alle Möglichkeiten sofort,
 * statt sie erst öffnen zu müssen.
 *
 * Look seit dem Portal-Redesign (24.09.2026) wie im Kostenrechner: 1,5-px-Rahmen,
 * mindestens 48 px hoch, Auswahl wie dort mit Taupe-Rahmen, Tönung und Ring, dazu
 * fette Schrift und Haken (GPT-5-Prüfung: nur Tönung war für Ältere zu schwach).
 * Der Haken sitzt als kleines Abzeichen an der Ecke statt vor dem Wort — vor dem
 * Wort ließ er bei 360 px in drei Spalten „Männlich" umbrechen.
 *
 * Die Spalten ergeben sich aus den Beschriftungen (`chipSpalten`), damit drei
 * kurze Antworten in eine Zeile passen und lange als ganze Zeilen stehen.
 *
 * `labels` zeigt kürzere Beschriftungen („1" statt „Pflegegrad 1"), gespeichert
 * wird weiter der Wert aus `options` — Mapper und mamamia bleiben unberührt.
 */

/** Spaltenzahl aus den angezeigten Beschriftungen (bei 360 px nachgemessen). */
export function chipSpalten(beschriftungen: string[]): 1 | 2 | 3 {
  const n = beschriftungen.length;
  const laengste = Math.max(0, ...beschriftungen.map(b => b.length));
  if (n <= 2) return n === 2 && laengste <= 20 ? 2 : 1;
  // Vier Antworten als 2 × 2 statt 3 + 1.
  if (n === 4) return laengste <= 12 ? 2 : 1;
  if (laengste <= 8) return 3;
  if (laengste <= 12) return 2;
  return 1;
}

const SPALTEN_KLASSE = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' } as const;

export const ChipSelect: FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Pflichtfeld noch leer → roter Rahmen. */
  invalid?: boolean;
  /** Kürzere Anzeige je Wert, z. B. { 'Pflegegrad 1': '1' }. */
  labels?: Record<string, string>;
}> = ({ value, onChange, options, invalid = false, labels }) => {
  const anzeige = (o: string) => labels?.[o] ?? o;
  const spalten = chipSpalten(options.map(anzeige));
  // Unvollständige letzte Zeile: der letzte Chip füllt sie auf (7 Gewichte = 3 + 3 + 1 breit).
  const rest = options.length % spalten;
  return (
    <div className={`grid gap-2 ${SPALTEN_KLASSE[spalten]}`} data-invalid={invalid ? '1' : undefined}>
      {options.map((o, i) => {
        const selected = value === o;
        const letzter = i === options.length - 1;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={selected}
            onClick={(e) => {
              const warLeer = value === '';
              onChange(selected ? '' : o);
              // Nur bei der ersten Antwort weiterscrollen: Wer eine Antwort
              // ändert, will das Feld weiter sehen.
              if (selected || !warLeer) return;
              const feld = (e.currentTarget as HTMLElement).closest('[data-field]');
              if (!feld) return;
              const alle = Array.from(document.querySelectorAll('[data-field]'));
              const naechstes = alle[alle.indexOf(feld) + 1] as HTMLElement | undefined;
              naechstes?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            style={letzter && rest ? { gridColumn: `span ${spalten - rest + 1}` } : undefined}
            className={
              'relative min-h-[48px] rounded-[14px] border-[1.5px] px-2 py-1.5 text-[15.5px] leading-tight text-center ' +
              'flex items-center justify-center transition-colors ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe ' +
              (selected
                ? 'border-pm-taupe bg-pm-taupe/10 ring-2 ring-pm-taupe/25 text-pm-ink font-bold'
                : `bg-white text-pm-body hover:border-pm-taupe-light ${invalid ? 'border-pm-error' : 'border-pm-chip'}`)
            }
          >
            {anzeige(o)}
            {selected && (
              <span aria-hidden="true" className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-pm-taupe text-white ring-2 ring-white">
                <Check className="h-3 w-3" strokeWidth={3.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
