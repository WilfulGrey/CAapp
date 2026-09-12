"use client";

import { GARANTIE } from "@/lib/kraefte-vorschau";
import { GARANTIE_OEFFNEN_EVENT } from "@/components/calculator/BestpreisSiegelLink";

/**
 * Karte „Bestpreisgarantie" (Martin 12.09.2026) — Gegenstück zur
 * Testsieger-Karte: gleiche Pille, gleicher Aufbau (Siegel links, Titel,
 * graue Unterzeile, Absatz, Link). Bis dahin hieß die Karte „100 % Sorgenfrei";
 * deren Inhalt (20 Jahre, 60.000 Betreuungen, täglich kündbar, taggenau,
 * Kosten erst ab Anreise) steht jetzt im Absatz. Siegel und „Mehr Infos"
 * öffnen das kompakte Pop-up im Wizard (Fensterereignis), keine neue Seite.
 *
 * `kompakt` = Desktop-Raster neben der Testsieger-Karte (halbe Breite):
 * Siegel oben, Text darunter, kleinere Schrift — wie die Testsieger-Karte
 * dort. Ohne `kompakt` = eigene Sektion (mobil), Siegel links ab lg.
 */
export function BestpreisKarte({ kompakt = false }: { kompakt?: boolean }) {
  const oeffnen = () => window.dispatchEvent(new Event(GARANTIE_OEFFNEN_EVENT));
  const text = kompakt ? "text-[15px]" : "text-[16px]";
  return (
    <div className={`bg-white border-2 border-[#1F8F5F] rounded-2xl relative ${kompakt ? "p-8" : "p-7 md:p-9 lg:p-10"}`}>
      <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#1F8F5F] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
        ★ {GARANTIE.wort}
      </div>

      <div className={`flex mt-4 ${kompakt ? "items-center gap-8" : "flex-col lg:flex-row lg:items-center lg:gap-8 text-center lg:text-left"}`}>
        <button
          type="button"
          onClick={oeffnen}
          className={`flex items-center justify-center flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8F5F]/60 ${kompakt ? "w-44" : "w-56 mx-auto lg:mx-0 mb-5 lg:mb-0"}`}
          aria-haspopup="dialog"
          aria-label="Bestpreisgarantie – mehr Infos"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={256} className={`h-auto ${kompakt ? "w-44" : "w-56"}`} loading="lazy" />
        </button>

        <div className="flex-1">
          <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">{GARANTIE.zusage}</h3>

          <p className={`${kompakt ? "text-[14px]" : "text-[16px]"} text-[#8A8279] mb-4`}>{GARANTIE.warum}</p>

          <p className={`${text} text-[#5A5A5A] leading-relaxed ${kompakt ? "" : "lg:px-0 px-2"}`}>
            Täglich kündbar, taggenau abgerechnet, mit über 20 Jahren Erfahrung aus mehr als 60.000 Betreuungen. Kosten entstehen erst, wenn die Betreuungskraft bei Ihnen ist.
          </p>

          <button
            type="button"
            onClick={oeffnen}
            className={`inline-flex items-center gap-1.5 mt-4 ${text} font-semibold text-[#1E5C3A] hover:text-[#14532D] underline underline-offset-2 transition-colors`}
            aria-haspopup="dialog"
          >
            Was heißt vergleichbar? Mehr Infos
          </button>
        </div>
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
