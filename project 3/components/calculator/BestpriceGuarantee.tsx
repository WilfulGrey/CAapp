"use client";

import { GARANTIE } from "@/lib/kraefte-vorschau";
import { GARANTIE_OEFFNEN_EVENT } from "@/components/calculator/BestpreisSiegelLink";
import { TestsiegerKarte } from "@/components/calculator/TestsiegerSection";

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
 * Registry #155 (09.11.2026): Look wie Formular und Portal, weiße Karte ohne
 * grünen Rahmen; Pille, Siegel und Wortlaut unverändert.
 * Registry #160 (Martin 09.11.: „Überschriften linksbündig“): alles linksbündig
 * wie die übrigen Abschnitte, Pille an der linken Inhaltskante statt mittig,
 * Text und Link 16 px, Textgrau #6B6B6B (Portal). EINE Fassung für alle
 * Breiten: die frühere Desktop-Fassung `kompakt` (Siegel links, Text rechts)
 * ließ in der halben Spalte nur 188–304 px für den Text (Titel über 4–5
 * Zeilen) und setzte Pille und Titel an zwei verschiedene Innenkanten.
 */
const PILLE = "100% Sorgenfrei";
const LINK = "Was heißt vergleichbar? Mehr Infos";

export function BestpreisKarte() {
  const oeffnen = () => window.dispatchEvent(new Event(GARANTIE_OEFFNEN_EVENT));

  return (
    <div className="bg-white rounded-[20px] p-7 md:p-9 relative">
      <div className="absolute top-[-14px] left-7 md:left-9 bg-[#1F8F5F] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
        ★ {PILLE}
      </div>

      {/* ENTWURF 16.11.2026: Kopfzeile wie primundus.de und wie die Testsieger-Karte daneben (Siegel links, Titel daneben),
          statt Siegel allein in einem 160 px hohen Feld. Ab xl nebeneinander; darunter reicht die halbe Spalte nicht.
          Wortlaut unverändert, „Bestpreisgarantie“ steht weiter nur auf dem Siegel (Martin 12.09.). */}
      <div className="mt-3 flex flex-col items-start gap-4 xl:min-h-[104px] xl:flex-row xl:items-center xl:gap-6">
        <button
          type="button"
          onClick={oeffnen}
          className="flex-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8F5F]/60"
          aria-haspopup="dialog"
          aria-label="Bestpreisgarantie – mehr Infos"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={256} className="h-[62px] w-auto" loading="lazy" />
        </button>
        <h3 className="text-[21px] font-bold leading-snug text-[#1C1C1C]">{GARANTIE.zusage}</h3>
      </div>

      <p className="mt-5 text-[16px] leading-[1.6] text-[#2E2E2E]">{GARANTIE.warum}</p>
      <button
        type="button"
        onClick={oeffnen}
        className="mt-4 inline-flex items-center gap-1.5 text-left text-[16px] font-semibold text-[#1E5C3A] underline underline-offset-2 transition-colors hover:text-[#14532D]"
        aria-haspopup="dialog"
      >
        {LINK}
      </button>
    </div>
  );
}

/** Garantie und Testsieger als ein Abschnitt (Anker #testsieger an der Testsieger-Karte, Registry #155): am Handy untereinander, ab lg
 *  nebeneinander. Vorher zwei Quelltext-Stellen (mobiler Block und Desktop-Raster in app/page.tsx). Registry #160: Spalte wie
 *  Kopf und Hero (560 px, ab lg 1216 px), beide Karten in der gestapelten Form. */
export function BestpriceGuarantee() {
  return (
    <section className="px-5 py-12 lg:py-16">
      <div className="mx-auto grid max-w-[560px] gap-10 lg:max-w-[1216px] lg:grid-cols-2 lg:gap-6">
        {/* grid streckt die Karte auf die Höhe der Testsieger-Karte daneben. */}
        <div className="lg:grid"><BestpreisKarte /></div>
        {/* Anker direkt an der Testsieger-Karte: das WELT-Siegel im Kopf („zur Original-Veröffentlichung“) springt am Handy
            sonst auf die Garantie-Karte darüber. */}
        <div id="testsieger" className="scroll-mt-28 lg:grid"><TestsiegerKarte /></div>
      </div>
    </section>
  );
}
