// Startdatum als Auswahl statt Kalender (Martin 09.11.2026: „schnellstmöglich, 1-2 wochen, etc. So wie beim pflegechecker und
// dann datum, wer will“). Vorbild: Anreise-Wahl der CG-App (umbrella/.notes/requests/opiekomat-start/makieta-v59.html, `.avt`):
// Liste mit Kreis, fettem Titel und einer Zeile mit dem Zeitraum, „Ab einem Datum“ zeigt erst nach dem Tipp das Datumsfeld.
// Gespeichert wird wie bisher EIN Datum (`startDate`, nach mamamia `arrival_at`): der früheste Tag des gewählten Zeitraums.
import type { ReactNode } from 'react';

export type StartWahlSchluessel = 'sofort' | 'eins_zwei' | 'zwei_vier' | 'datum';

/** Tage ab heute: Beginn des Zeitraums (wird gespeichert) und Ende (nur Anzeige). */
export const START_WAHL: readonly { key: StartWahlSchluessel; titel: string; von?: number; bis?: number; text?: string }[] = [
  { key: 'sofort', titel: 'Schnellstmöglich', von: 3, text: 'Anreise schon ab 3 Tagen möglich' },
  { key: 'eins_zwei', titel: 'In 1–2 Wochen', von: 7, bis: 13 },
  { key: 'zwei_vier', titel: 'In 2–4 Wochen', von: 14, bis: 28 },
  { key: 'datum', titel: 'Ab einem Datum' },
];

const plusTage = (heute: Date, tage: number) => new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + tage);
const tagMonat = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
export const isoTag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Gespeichertes Datum zu einer Wahl (ohne Datum bei „Ab einem Datum“). */
export function startDatumAus(key: StartWahlSchluessel, heute = new Date()): string | null {
  const w = START_WAHL.find((x) => x.key === key);
  return w?.von != null ? isoTag(plusTage(heute, w.von)) : null;
}

export function StartWahl({ wert, onWahl, datumFeld, invalid = false }: {
  wert: StartWahlSchluessel | '';
  onWahl: (key: StartWahlSchluessel) => void;
  /** Das Datumsfeld (DateField), erscheint unter „Ab einem Datum“, wenn das gewählt ist. */
  datumFeld: ReactNode;
  invalid?: boolean;
}) {
  const heute = new Date();
  return (
    <div className={`overflow-hidden rounded-[16px] border-2 ${invalid ? 'border-pm-error' : 'border-pm-chip'} bg-white`} role="radiogroup" data-start-wahl>
      {START_WAHL.map((w, i) => {
        const an = wert === w.key;
        const zeit = w.text ?? (w.von != null && w.bis != null ? `${tagMonat(plusTage(heute, w.von))} bis ${tagMonat(plusTage(heute, w.bis))}` : null);
        return (
          <div key={w.key} className={`${i > 0 ? 'border-t border-pm-line-soft' : ''} ${an ? 'bg-pm-taupe/[0.18]' : ''}`}>
            <button
              type="button"
              role="radio"
              aria-checked={an}
              onClick={() => onWahl(w.key)}
              className="flex w-full min-h-[60px] items-center gap-3.5 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe"
            >
              <span aria-hidden="true" className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-2 bg-white ${an ? 'border-pm-taupe-ink' : 'border-pm-taupe'}`}>
                {an && <span className="h-[11px] w-[11px] rounded-full bg-pm-taupe-ink" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-[16.5px] leading-snug text-pm-ink ${an ? 'font-bold' : 'font-semibold'}`}>{w.titel}</span>
                {zeit && <span className="mt-0.5 block text-[14.5px] leading-snug text-pm-muted tabular-nums">{zeit}</span>}
              </span>
            </button>
            {w.key === 'datum' && an && <div className="px-4 pb-4">{datumFeld}</div>}
          </div>
        );
      })}
    </div>
  );
}
