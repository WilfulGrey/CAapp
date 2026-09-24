// Pop-up im Portal (Martin 24.09.2026): auf dem Handy von unten, am Desktop mittig im Handyrahmen.
// Oben rechts IMMER ein X zum Schließen (40 px), dazu Esc und Tippen auf den Hintergrund.
// Fokus springt beim Öffnen ins Pop-up und bleibt dort (Tab läuft im Kreis).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Sheet({
  offen, titel, icon, onClose, children, fuss,
}: { offen: boolean; titel: string; icon?: ReactNode; onClose: () => void; children: ReactNode; fuss?: ReactNode }) {
  const titelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const zuvor = useRef<HTMLElement | null>(null);
  // onClose über eine Ref: Aufrufer übergeben oft eine neue Funktion je Render —
  // als Abhängigkeit würde der Effekt dann bei jedem Render den Fokus zurücksetzen.
  const schliessen = useRef(onClose);
  schliessen.current = onClose;

  useEffect(() => {
    if (!offen) return;
    zuvor.current = document.activeElement as HTMLElement | null;
    const fokusierbar = () => [...(box.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    fokusierbar()[0]?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); schliessen.current(); return; }
      if (e.key !== 'Tab') return;
      const el = fokusierbar();
      if (!el.length) return;
      const erstes = el[0]; const letztes = el[el.length - 1];
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes.focus(); }
    };
    document.addEventListener('keydown', taste);
    const ueberlauf = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', taste);
      document.body.style.overflow = ueberlauf;
      zuvor.current?.focus?.();
    };
  }, [offen]);

  if (!offen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center font-pm">
      <div data-testid="sheet-hintergrund" className="absolute inset-0 bg-[rgba(28,28,28,.45)]" onClick={onClose} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        className="relative w-full md:max-w-[390px] max-h-[88vh] overflow-y-auto bg-white rounded-t-[24px] md:rounded-[24px] px-5 pt-4 pb-[calc(22px+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 id={titelId} className="flex-1 min-w-0 text-[21px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink">{titel}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="w-10 h-10 rounded-full bg-pm-shell text-pm-ink flex items-center justify-center flex-none hover:bg-[#EAE3D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pm-taupe"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-3 text-[15px] leading-[1.55] text-pm-body">{children}</div>
        {fuss && <div className="mt-5">{fuss}</div>}
      </div>
    </div>
  );
}
