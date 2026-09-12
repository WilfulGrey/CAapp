"use client";

import { GARANTIE } from "@/lib/kraefte-vorschau";
import { GARANTIE_OEFFNEN_EVENT } from "@/components/calculator/BestpreisSiegelLink";

/**
 * Karte „100 % Sorgenfrei" mit der Bestpreisgarantie (Martin 12.09.2026).
 * Aufbau 1:1 wie die Testsieger-Karte daneben (app/page.tsx, Desktop-Raster)
 * bzw. darunter (TestsiegerSection, mobil): Pille, Siegel links (mobil
 * oben), h3 22 px, graue Zeile, dann der Link zum kompakten Pop-up —
 * gleiche Schriften und Größen wie rechts („das muss einheitlich sein").
 *
 * Das Wort „Bestpreisgarantie" steht nur EINMAL in der Karte, nämlich auf
 * dem Siegel; die Pille heißt deshalb wie vorher „100 % Sorgenfrei"
 * (Martin: „nicht doppelt, sondern 100 % Sorgenfrei, dann das Siegel").
 * Der frühere Absatz (20 Jahre, 60.000, täglich kündbar …) ist raus, damit
 * die Karte nicht länger wird als die Testsieger-Karte.
 * Siegel und Link öffnen das Pop-up im Wizard per Fensterereignis.
 *
 * `kompakt` = Desktop-Raster (halbe Breite): Siegel links, Text rechts,
 * feste Innenabstände und Schriftgrößen wie die Karte rechts daneben.
 */
const PILLE = "100% Sorgenfrei";
const LINK = "Was heißt vergleichbar? Mehr Infos";

export function BestpreisKarte({ kompakt = false }: { kompakt?: boolean }) {
  const oeffnen = () => window.dispatchEvent(new Event(GARANTIE_OEFFNEN_EVENT));

  if (kompakt) {
    return (
      <div className="bg-white border-2 border-[#1F8F5F] rounded-2xl p-8 relative">
        <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#1F8F5F] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
          ★ {PILLE}
        </div>

        <div className="flex items-center gap-8 mt-4">
          <button
            type="button"
            onClick={oeffnen}
            className="w-48 flex items-center justify-center flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8F5F]/60"
            aria-haspopup="dialog"
            aria-label="Bestpreisgarantie – mehr Infos"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={256} className="w-48 h-auto" loading="lazy" />
          </button>

          <div className="flex-1">
            <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">{GARANTIE.zusage}</h3>

            <p className="text-[14px] text-[#8A8279] mb-4">{GARANTIE.warum}</p>

            <button
              type="button"
              onClick={oeffnen}
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#1E5C3A] hover:text-[#14532D] underline underline-offset-2 transition-colors"
              aria-haspopup="dialog"
            >
              {LINK}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-[#1F8F5F] rounded-2xl p-7 md:p-9 lg:p-10 relative">
      <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#1F8F5F] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
        ★ {PILLE}
      </div>

      <div className="flex flex-col items-center text-center mt-4">
        <button
          type="button"
          onClick={oeffnen}
          className="w-56 mb-5 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8F5F]/60"
          aria-haspopup="dialog"
          aria-label="Bestpreisgarantie – mehr Infos"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={256} className="w-56 h-auto" loading="lazy" />
        </button>

        <div>
          <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">{GARANTIE.zusage}</h3>

          <p className="text-[16px] text-[#8A8279] mb-4">{GARANTIE.warum}</p>

          <button
            type="button"
            onClick={oeffnen}
            className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-[#1E5C3A] hover:text-[#14532D] underline underline-offset-2 transition-colors"
            aria-haspopup="dialog"
          >
            {LINK}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Eigene Sektion (mobiler Block in app/page.tsx), Aufbau wie TestsiegerSection. */
export function BestpriceGuarantee() {
  return (
    <section className="py-14 px-5 bg-white">
      <div className="max-w-[560px] md:max-w-[700px] lg:max-w-[1000px] mx-auto">
        <BestpreisKarte />
      </div>
    </section>
  );
}
