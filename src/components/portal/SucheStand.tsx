// „Stand heute" nach dem Absenden (Martin 25.09.2026: nach dem Speichern sah die Seite „nicht mehr
// gut aus", Fokus soll auf Bewerbungen liegen). Ersetzt in diesem Zustand „So geht es weiter".
// Die Karte bekommt nur fertige Werte; fehlt einer, fällt die Zeile weg statt zu raten.
import { Check } from 'lucide-react';
import { Card } from '../ui/Card';
import { EYEBROW } from '../ui/SectionHeader';
import { RESERVIERUNG_STUNDEN } from '../../lib/reservierung';

/** „24.09." aus einem ISO-Zeitpunkt oder Datum, in Berliner Zeit. */
export function kurzDatum(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' }).format(d);
}

export function SucheStand({ angefragtAm, passende, wunschstart, onAngaben, bisherigeBewerbungen = 0 }: {
  /** `leads.patient_form_at` */
  angefragtAm: string | null | undefined;
  /** Sichtbare passende Pflegekräfte; null = noch unbekannt. */
  passende: number | null;
  /** Anreise laut Job (`arrival_at`) */
  wunschstart: string | null | undefined;
  onAngaben: () => void;
  /** Schon erhaltene (entschiedene) Bewerbungen — dann ist „Bewerbung erhalten" kein reines Zukunftsversprechen. */
  bisherigeBewerbungen?: number;
}) {
  const am = kurzDatum(angefragtAm);
  const start = kurzDatum(wunschstart);
  const schritte: { titel: string; text: string | null }[] = [
    { titel: 'Bewerbungen angefragt', text: am ? `am ${am}` : null },
    {
      titel: 'Anfrage für Pflegekräfte sichtbar',
      text: passende == null ? null
        : passende === 0 ? 'Wir suchen passende Pflegekräfte'
        : `${passende} passende ${passende === 1 ? 'Pflegekraft' : 'Pflegekräfte'} gefunden`,
    },
    {
      titel: 'Bewerbung erhalten',
      text: bisherigeBewerbungen > 0
        ? `bisher ${bisherigeBewerbungen} ${bisherigeBewerbungen === 1 ? 'Bewerbung' : 'Bewerbungen'}, weitere kommen per E-Mail`
        : 'meist in den nächsten Tagen, per E-Mail',
    },
    { titel: 'Sie entscheiden', text: `Jede Bewerbung ist ${RESERVIERUNG_STUNDEN} Stunden für Sie reserviert` },
    { titel: 'Anreise', text: `ab 3 Tagen nach Ihrer Zusage${start ? ` · Wunschstart ${start}` : ''}` },
  ];
  return (
    <Card className="px-5 pt-4 pb-3 shadow-lift">
      <p className={EYEBROW}>Stand heute</p>
      <ol className="mt-2">
        {schritte.map((s, i) => {
          const fertig = i === 0;
          const jetzt = i === 1;
          return (
            <li key={s.titel} className="flex gap-3 py-2" aria-current={jetzt ? 'step' : undefined}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-none text-[13px] font-bold ${
                  fertig ? 'bg-pm-mint text-pm-green-deep' : jetzt ? 'bg-pm-taupe text-white' : 'bg-pm-shell text-pm-taupe'
                }`}
              >
                {fertig ? <Check className="w-3.5 h-3.5" strokeWidth={3} aria-label="erledigt" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-[15px] font-bold leading-snug ${fertig ? 'text-pm-mute' : 'text-pm-ink'}`}>{s.titel}</p>
                {s.text && <p className="mt-0.5 text-[13.5px] leading-[1.45] text-pm-muted">{s.text}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={onAngaben}
        className="mt-1 w-full min-h-[44px] flex items-center justify-between border-t border-pm-line-soft text-left text-[14.5px] font-semibold text-pm-taupe-ink"
      >
        Angaben ansehen oder ändern
        <span aria-hidden="true">›</span>
      </button>
    </Card>
  );
}
