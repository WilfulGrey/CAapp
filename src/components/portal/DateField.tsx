import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// React-Port des SA-Portal-DateField (mamamia-sadash
// resources/js/Components/DateField.vue): gleicher Look wie im
// SA-Kundenformular — eigener deutscher Kalender (Wochenstart Montag)
// statt des nativen, je nach Browser hässlichen type=date-Pickers.
// Wert bleibt ISO (yyyy-mm-dd), damit der Rest des Formulars und der
// Mapper unverändert weiterarbeiten.

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

// Lokales Heute — bewusst NICHT toISOString() (UTC), sonst springt das
// Mindestdatum zwischen 0 und 2 Uhr deutscher Zeit einen Tag zurück.
export function localTodayIso(): string {
  const t = new Date();
  return toIso(t.getFullYear(), t.getMonth(), t.getDate());
}

// Kalenderdatum aus einem mamamia-Wert („2026-10-15 00:00:00" oder
// „2026-10-15") als yyyy-mm-dd, sonst null. Bewusst ohne `new Date()`:
// Safari liest die Form mit Leerzeichen nicht zuverlässig, und ein
// Datum ohne Zeitzone soll der Tag bleiben, der dort steht.
export function kalenderTag(wert: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec((wert ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export const DateField: FC<{
  value: string; // ISO yyyy-mm-dd oder ''
  onChange: (iso: string) => void;
  min?: string; // ISO — frühere Tage sind ausgegraut
  invalid?: boolean; // Pflichtfeld-Optik (rote Umrandung solange leer)
  placeholder?: string;
}> = ({ value, onChange, min, invalid, placeholder = 'Datum wählen' }) => {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      // Beim Öffnen auf den gewählten Monat (sonst heute) springen.
      const base = value ? new Date(`${value}T00:00:00`) : new Date();
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
    setOpen(o => !o);
  };

  // Wochenstart Montag: getDay() liefert So=0 → Offset (getDay()+6)%7.
  const lead = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayIso = localTodayIso();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  };

  const display = value ? value.split('-').reverse().join('.') : '';

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={toggle}
        className={`w-full min-h-[48px] rounded-[14px] border-[1.5px] px-3.5 py-2.5 text-[16px] text-left bg-white flex items-center justify-between gap-2 focus:outline-none focus:border-pm-taupe focus:ring-2 focus:ring-pm-taupe/15 transition-colors ${invalid ? 'border-pm-error' : 'border-pm-chip'}`}
      >
        <span className={display ? 'text-pm-ink' : 'text-pm-mute'}>{display || placeholder}</span>
        <svg aria-hidden="true" className="w-5 h-5 text-pm-taupe flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        // Bewusst KEIN absolute-Dropdown: die Angebots-Karte hat
        // overflow-hidden und würde den Kalender abschneiden (Martin,
        // Screenshot 08.07.). Im Fluss gerendert wächst die Karte mit.
        <div className="mt-2 w-full max-w-[340px] bg-white border-[1.5px] border-pm-line rounded-[18px] p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <button type="button" onClick={prevMonth} aria-label="Voriger Monat" className="w-11 h-11 rounded-full hover:bg-pm-paper flex items-center justify-center text-pm-taupe-ink">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[15.5px] font-bold text-pm-ink">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} aria-label="Nächster Monat" className="w-11 h-11 rounded-full hover:bg-pm-paper flex items-center justify-center text-pm-taupe-ink">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(w => (
              <span key={w} className="h-7 flex items-center justify-center text-[12.5px] font-semibold text-pm-muted">{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const iso = toIso(viewYear, viewMonth, d);
              // !!(...) — sonst wäre disabled bei leerem min der String ''
              // (gleiche Falle wie im Vue-Original, dort als Bug gefixt).
              const disabled = !!(min && iso < min);
              const selected = value === iso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(iso); setOpen(false); }}
                  className={`h-11 rounded-full text-[15px] flex items-center justify-center transition-colors ${
                    selected
                      ? 'bg-pm-taupe text-white font-bold'
                      : disabled
                        ? 'text-[#C9C4BC] cursor-default'
                        : 'text-pm-body hover:bg-pm-paper'
                  }${isToday && !selected ? ' font-bold ring-1 ring-inset ring-pm-taupe/50' : ''}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
