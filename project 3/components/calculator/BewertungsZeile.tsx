import { schnittText, type BewertungsStand } from "@/lib/bewertungs-stand";

// Stern wie auf primundus.de (components/bewertungen/Sterne.tsx), damit beide
// Seiten dieselben Sterne zeigen. Gold #D4A843 = pm-gold dort und die
// Testsieger-Pille hier.
const STERN = "M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z";

/**
 * „★★★★★ 4,9 von 5 aus 126 Bewertungen" unter den Hero-Punkten, zentriert
 * (Martin 17.09.2026). Ohne Stand keine Zeile — nie eine feste Zahl.
 *
 * Tippbar, Ziel „Das sagen unsere Familien" weiter unten auf DIESER Seite:
 * Beweise werden angetippt (Clarity 29.08.: 17 tote Klicks auf die
 * Gesichter-Plakette in drei Tagen), und ein Sprung nach primundus.de würde
 * den Rechner verlassen.
 */
export function BewertungsZeile({ stand }: { stand: BewertungsStand | null }) {
  if (!stand) return null;
  const schnitt = schnittText(stand.schnitt);
  return (
    // EINE Zeile ab 360 px (gemessen: Sterne 88 px + Abstand 8 + Text 224 px
    // bei 15 px = 320 px = Inhaltsbreite bei 360). Mit 16 px Text und 20-px-
    // Sternen brach „126 / Bewertungen" auf jedem iPhone um.
    <div className="mt-6 flex justify-center">
      <a
        href="#kundenstimmen"
        className="group inline-flex items-center gap-2 whitespace-nowrap rounded-lg py-1"
        aria-label={`${schnitt} von 5 Sternen aus ${stand.anzahl} Bewertungen – zu den Kundenstimmen`}
      >
        <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => {
            const fuellung = Math.max(0, Math.min(1, stand.schnitt - i));
            return (
              <svg key={i} viewBox="0 0 20 20" width={16} height={16} className="flex-none">
                <path d={STERN} fill="#E5E3DF" />
                {fuellung > 0 && (
                  <path
                    d={STERN}
                    fill="#D4A843"
                    style={fuellung < 1 ? { clipPath: `inset(0 ${100 - fuellung * 100}% 0 0)` } : undefined}
                  />
                )}
              </svg>
            );
          })}
        </span>
        <span className="text-[15px] leading-snug text-[#5B5B5B]">
          <strong className="font-semibold text-[#3D3D3D]">{schnitt}</strong> von 5 aus{" "}
          <span className="underline decoration-[#C9C4BC] underline-offset-[3px] transition-colors group-hover:decoration-[#3D3D3D]">
            {stand.anzahl} Bewertungen
          </span>
        </span>
      </a>
    </div>
  );
}
