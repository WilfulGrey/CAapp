"use client";

import { GARANTIE } from "@/lib/kraefte-vorschau";
import { GARANTIE_OEFFNEN_EVENT } from "@/components/calculator/BestpreisSiegelLink";

/**
 * Karte „Bestpreisgarantie" (Martin 12.09.2026) — Gegenstück zur
 * Testsieger-Karte: gleiche Pille, Siegel OBEN (auch auf dem Desktop,
 * Martin 12.09.), darunter Zusage, Warum und der Link zum kompakten
 * Pop-up. Nicht mehr drin: der Absatz der alten Karte „100 % Sorgenfrei"
 * (20 Jahre, 60.000, täglich kündbar …) — im Desktop-Raster darf die Karte
 * nicht länger sein als die Testsieger-Karte rechts („zur Not den anderen
 * Kram raus"); täglich kündbar/taggenau und keine Vermittlungsgebühr
 * stehen ohnehin in der Hero-Liste. Siegel und Link öffnen das Pop-up im
 * Wizard per Fensterereignis, kein Seitenwechsel.
 *
 * `kompakt` = Desktop-Raster neben der Testsieger-Karte (halbe Breite):
 * feste Innenabstände und etwas kleinere Schrift wie die Karte rechts.
 */
export function BestpreisKarte({ kompakt = false }: { kompakt?: boolean }) {
  const oeffnen = () => window.dispatchEvent(new Event(GARANTIE_OEFFNEN_EVENT));
  return (
    <div className={`bg-white border-2 border-[#1F8F5F] rounded-2xl relative text-center ${kompakt ? "p-8" : "p-7 md:p-9 lg:p-10"}`}>
      <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#1F8F5F] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
        ★ {GARANTIE.wort}
      </div>

      <div className="flex flex-col items-center mt-4">
        <button
          type="button"
          onClick={oeffnen}
          className={`flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8F5F]/60 ${kompakt ? "w-48 mb-3" : "w-56 mb-5"}`}
          aria-haspopup="dialog"
          aria-label="Bestpreisgarantie – mehr Infos"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={256} className="w-full h-auto" loading="lazy" />
        </button>

        <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">{GARANTIE.zusage}</h3>

        <p className={`${kompakt ? "text-[14px]" : "text-[16px]"} text-[#8A8279]`}>{GARANTIE.warum}</p>

        <button
          type="button"
          onClick={oeffnen}
          className={`inline-flex items-center gap-1.5 ${kompakt ? "mt-3 text-[15px]" : "mt-4 text-[16px]"} font-semibold text-[#1E5C3A] hover:text-[#14532D] underline underline-offset-2 transition-colors`}
          aria-haspopup="dialog"
        >
          Was heißt vergleichbar? Mehr Infos
        </button>
      </div>
    </div>
  );
}

/** Eigene Sektion (mobiler Block in app/page.tsx). */
export function BestpriceGuarantee() {
  return (
    <section className="py-14 px-5 bg-white">
      <div className="max-w-[560px] md:max-w-[700px] lg:max-w-[1000px] mx-auto">
        <BestpreisKarte />
      </div>
    </section>
  );
}
