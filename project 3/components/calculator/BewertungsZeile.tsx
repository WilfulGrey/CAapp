import { anzahlText, sternFuellung, type SterneStand } from "@/lib/sterne-zeile";

// Stern wie auf primundus.de (components/bewertungen/Sterne.tsx), damit beide
// Seiten dieselben Sterne zeigen. Gold #D4A843 = pm-gold dort und die
// Testsieger-Pille hier.
const STERN = "M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z";

/**
 * „★★★★★ 4,9 von 5 aus 126 Bewertungen" in EINER Zeile ab 360 px (gemessen:
 * Sterne 88 px + Abstand 8 + Text 224 px bei 15 px = 320 px Inhaltsbreite bei
 * 360). Mit 16-px-Text und 20-px-Sternen brach „126 / Bewertungen" auf jedem
 * iPhone um. Ohne "use client": läuft in der Server-Seite und in der
 * Kundenstimmen-Karte (Client) gleich.
 */
export function SterneText({ stand, unterstrichen = false }: { stand: SterneStand; unterstrichen?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => {
          const fuellung = sternFuellung(stand.wert, i);
          return (
            <svg key={i} viewBox="0 0 20 20" width={16} height={16} className="flex-none">
              <path d={STERN} fill="#E5E3DF" />
              {fuellung > 0 && (
                <path
                  d={STERN}
                  fill="#D4A843"
                  style={fuellung < 1 ? { clipPath: `inset(0 ${Math.round((1 - fuellung) * 100)}% 0 0)` } : undefined}
                />
              )}
            </svg>
          );
        })}
      </span>
      <span className="text-[15px] leading-snug text-[#5B5B5B]">
        <strong className="font-semibold text-[#3D3D3D]">{stand.schnitt}</strong> von 5 aus{" "}
        <span
          className={
            unterstrichen
              ? "underline decoration-[#C9C4BC] underline-offset-[3px] transition-colors group-hover:decoration-[#3D3D3D]"
              : undefined
          }
        >
          {anzahlText(stand.anzahl)}
        </span>
      </span>
    </span>
  );
}

/**
 * Hero: zentriert unter dem letzten Punkt, vor den Logos (Martin 17.09.2026).
 * Ohne Stand keine Zeile, nie eine feste Zahl.
 *
 * Tippbar, Ziel „Das sagen unsere Familien" weiter unten auf DIESER Seite:
 * Beweise werden angetippt (Clarity 29.08.: 17 tote Klicks auf die
 * Gesichter-Plakette in drei Tagen), und ein Sprung nach primundus.de würde
 * den Rechner verlassen.
 */
export function BewertungsZeile({ stand }: { stand: SterneStand | null }) {
  if (!stand) return null;
  return (
    <div className="mt-6 flex justify-center">
      <a
        href="#kundenstimmen"
        className="group inline-flex rounded-lg py-1"
        aria-label={`${stand.schnitt} von 5 Sternen aus ${anzahlText(stand.anzahl)} – zu den Kundenstimmen`}
      >
        <SterneText stand={stand} unterstrichen />
      </a>
    </div>
  );
}
