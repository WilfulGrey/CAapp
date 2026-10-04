// Abschnittskopf wie auf primundus.de: Eyebrow (klein, Versalien, taupe) + H2 in 800 + optional ein Satz.
import type { ReactNode } from 'react';

export const EYEBROW = 'text-[11.5px] font-bold uppercase tracking-[.15em] text-pm-taupe';
export const H2 = 'text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] text-pm-ink';
// Ruhiger Stil (Kompakt-Einstieg, Runde 15): H2 24 px in 700, Unterzeile 16 px — ohne Eyebrow.
export const H2_RUHIG = 'text-[24px] font-bold leading-[1.2] tracking-[-0.02em] text-pm-ink';

export function SectionHeader({
  eyebrow, titel, zeile, rechts, id, ruhig = false,
}: { eyebrow?: string; titel: ReactNode; zeile?: ReactNode; rechts?: ReactNode; id?: string; ruhig?: boolean }) {
  return (
    <div>
      {(eyebrow || rechts) && (
        <div className="flex items-center justify-between gap-3">
          {eyebrow ? <p className={EYEBROW}>{eyebrow}</p> : <span />}
          {rechts}
        </div>
      )}
      <h2 id={id} className={`${ruhig ? H2_RUHIG : H2} ${eyebrow || rechts ? 'mt-1.5' : ''}`}>{titel}</h2>
      {zeile && <div className={`mt-2 ${ruhig ? 'text-[16px] leading-[1.5]' : 'text-[15.5px] leading-[1.55]'} text-pm-muted`}>{zeile}</div>}
    </div>
  );
}
