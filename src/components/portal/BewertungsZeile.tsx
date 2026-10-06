// „★★★★★ 4,9 von 5 aus 126 Bewertungen" wie im Kopf der Kostenrechner-Startseite
// (project 3/components/calculator/BewertungsZeile.tsx). Ohne Stand keine Zeile.
import { anzahlText, ERFAHRUNGEN_URL, sternFuellung, type SterneStand } from '../../lib/sterne';

const STERN = 'M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z';

// `klein` (nur Kompakt-Einstieg, Sternzeile unter dem Testsieger-Siegel der Kostenkarte): 12-px-Sterne,
// Text 12,5 / 13,5 / 14 px (360 / 375 / ab 390 px) — so bleibt die Zeile bei 24 px Innenabstand einzeilig.
// Fassung 31: ohne `whitespace-nowrap` — wo die Zeile nicht passt (Bewerbungskarte bei 360 px mit 20 px Seitenrand), bricht
// der Text neben den Sternen um, statt über den Rand zu stehen. Wo sie passt, bleibt sie einzeilig.
export function BewertungsZeile({ stand, className = '', klein = false }: { stand: SterneStand | null; className?: string; klein?: boolean }) {
  if (!stand) return null;
  const stern = klein ? 12 : 16;
  return (
    <a
      href={ERFAHRUNGEN_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-[44px] items-center ${klein ? 'gap-1' : 'gap-2'} ${className}`}
    >
      <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => {
          const fuellung = sternFuellung(stand.wert, i);
          return (
            <svg key={i} viewBox="0 0 20 20" width={stern} height={stern} className="flex-none">
              <path d={STERN} fill="#E5E3DF" />
              {fuellung > 0 && (
                <path d={STERN} fill="#D4A843" style={fuellung < 1 ? { clipPath: `inset(0 ${Math.round((1 - fuellung) * 100)}% 0 0)` } : undefined} />
              )}
            </svg>
          );
        })}
      </span>
      <span className={`${klein ? 'text-[12.5px] min-[375px]:text-[13.5px] min-[390px]:text-[14px]' : 'text-[15px]'} leading-snug text-pm-muted`}>
        <strong className="font-semibold text-pm-ink">{stand.schnitt}</strong> von 5 aus{' '}
        <span className="underline decoration-[#C9C4BC] underline-offset-[3px]">{anzahlText(stand.anzahl)}</span>
      </span>
    </a>
  );
}
