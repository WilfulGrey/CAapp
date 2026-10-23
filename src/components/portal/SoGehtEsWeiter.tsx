// „So geht es weiter" (Portal-Redesign Teil 3). Liste mit feinen Trennlinien. Steht nur vor dem
// Absenden (danach ersetzt „Stand heute" sie). Texte seit Registry #109 (Martin 02.10.) wieder wie
// bis 24.09.: Schritt 1 ist die Handlung und trägt den Knopf ins Formular, Schritt 2 nennt Einladen
// und Bewerbungen zusammen. Anreise wie `VORLAUF` auf primundus.de: „ab 3 Tagen".
import { Check } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';
import { Button } from '../ui/Button';

export const SCHRITTE = [
  { titel: 'Pflegesituation vervollständigen', text: 'Dauert etwa 2 Minuten, vieles ist schon ausgefüllt.' },
  { titel: 'Pflegekräfte einladen und Bewerbungen erhalten', text: 'Passende Pflegekräfte bewerben sich bei Ihnen mit Foto, Erfahrung, Anreisedatum und Preis.' },
  { titel: 'Auswählen und starten', text: 'Wir übernehmen den Rest. Anreise schon ab 3 Tagen möglich.' },
] as const;

export function SoGehtEsWeiter({ erledigt, onVervollstaendigen }: {
  /** erledigt[i] = Schritt i ist abgeschlossen (Pflegesituation gespeichert, Bewerbung da). */
  erledigt: readonly boolean[];
  /** Knopf „Jetzt vervollständigen →" unter Schritt 1, solange der offen ist: springt ins Formular. */
  onVervollstaendigen?: () => void;
}) {
  const aktiv = SCHRITTE.findIndex((_, i) => !erledigt[i]);
  return (
    <section>
      <SectionHeader eyebrow="In drei Schritten" titel="So geht es weiter" />
      <ol className="mt-3.5 border-b border-pm-line">
        {SCHRITTE.map((s, i) => {
          const fertig = !!erledigt[i];
          const jetzt = i === aktiv;
          return (
            <li key={s.titel} className="flex gap-3.5 py-4 border-t border-pm-line" aria-current={jetzt ? 'step' : undefined}>
              <span
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center flex-none text-[14px] font-bold ${
                  fertig ? 'bg-pm-mint text-pm-green-deep' : jetzt ? 'bg-pm-taupe text-white' : 'bg-pm-shell text-pm-taupe'
                }`}
              >
                {fertig ? <Check className="w-4 h-4" strokeWidth={3} aria-label="erledigt" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`mt-[3px] text-[16px] font-bold ${fertig ? 'text-pm-mute' : 'text-pm-ink'}`}>{s.titel}</p>
                <p className={`mt-1 text-[14.5px] leading-[1.5] ${fertig ? 'text-pm-mute' : 'text-pm-muted'}`}>{s.text}</p>
                {i === 0 && jetzt && onVervollstaendigen && (
                  <Button groesse="sm" breit onClick={onVervollstaendigen} className="mt-3 whitespace-nowrap">
                    Jetzt vervollständigen →
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
