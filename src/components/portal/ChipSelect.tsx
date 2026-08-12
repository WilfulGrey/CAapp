import type { FC } from 'react';

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
 * Signatur absichtlich identisch zu `CustomSelect`, damit die Aufrufe im
 * Formular 1:1 getauscht werden können.
 *
 * NICHT für lange Listen: Geburtsjahr (70 Optionen) bleibt ein Dropdown —
 * dort ist die Liste das richtige Werkzeug.
 */
export const ChipSelect: FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Pflichtfeld noch leer → dezenter roter Rahmen, wie bei CustomSelect. */
  invalid?: boolean;
}> = ({ value, onChange, options, invalid = false }) => (
  <div className="flex flex-wrap gap-2" data-invalid={invalid ? '1' : undefined}>
    {options.map((o) => {
      const selected = value === o;
      return (
        <button
          key={o}
          type="button"
          aria-pressed={selected}
          onClick={(e) => {
            const wasEmpty = !selected;
            onChange(selected ? '' : o);
            if (!wasEmpty) return;
            // Nächstes Feld im Formular sanft in den Blick holen.
            const field = (e.currentTarget as HTMLElement).closest('div')?.parentElement;
            const next = field?.nextElementSibling as HTMLElement | null;
            next?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="px-3.5 py-2.5 rounded-xl border text-[16px] leading-snug text-left transition-colors"
          style={
            selected
              ? { background: '#8B7355', borderColor: '#8B7355', color: '#FFFFFF', fontWeight: 600 }
              : {
                  background: '#FFFFFF',
                  // Leeres Pflichtfeld bleibt am roten Rahmen erkennbar —
                  // dieselbe Regel wie im Dropdown, damit beide Feldtypen
                  // gleich „sprechen".
                  borderColor: invalid ? '#FCA5A5' : '#D4D4D8',
                  color: '#18181B',
                }
          }
        >
          {o}
        </button>
      );
    })}
  </div>
);
