// „So geht es weiter" (Portal-Redesign Teil 3). Liste mit feinen Trennlinien, ohne Knopf —
// das Formular steht direkt darüber. Texte: Martin 24.09.2026 (Entwurf v4). Der Hauptweg sind
// Bewerbungen; Einladen ist nur ein Angebot für die Wartezeit. Anreise wie `VORLAUF` auf
// primundus.de: „ab 3 Tagen" (vorher „4–7 Werktagen").
import { Check } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';

export const SCHRITTE = [
  { titel: 'Pflegesituation vervollständigen', text: '2 Minuten. Vieles ist schon ausgefüllt.' },
  { titel: 'Bewerbungen erhalten', text: 'Passende Pflegekräfte bewerben sich bei Ihnen. Gerne können Sie Ihre Favoriten einladen, sich zu bewerben.' },
  { titel: 'Auswählen und starten', text: 'Wir übernehmen den Rest. Anreise schon ab 3 Tagen möglich.' },
] as const;

export function SoGehtEsWeiter({ erledigt }: {
  /** erledigt[i] = Schritt i ist abgeschlossen (Pflegesituation gespeichert, Bewerbung da). */
  erledigt: readonly boolean[];
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
              <div className="min-w-0">
                <p className={`mt-[3px] text-[16px] font-bold ${fertig ? 'text-pm-mute' : 'text-pm-ink'}`}>{s.titel}</p>
                <p className={`mt-1 text-[14.5px] leading-[1.5] ${fertig ? 'text-pm-mute' : 'text-pm-muted'}`}>{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
