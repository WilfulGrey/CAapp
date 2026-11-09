'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { AblaufSchritte, KNOPF_ANGEBOT, MINI_ABLAUF } from '@/components/calculator/FormularPortal';

/** Ablauf der Startseite (Registry #154, Martin 09.11.2026: „Ja, mach das mal … genau so“): wortgleich mit dem letzten
 *  Schritt des Formulars und dem Portal („So geht es weiter“, eine Quelle in FormularPortal.tsx). Vorher stand hier ein
 *  eigener Ablauf mit „Bewerbungen am selben Werktag“ und „Profil vervollständigen“, also andere Zusagen als im Formular.
 *  Überschrift und Knopf bleiben; Anker #ablauf bleibt (Sitelinks, Pria). */
export function HowItWorks() {
  return (
    <section id="ablauf" className="scroll-mt-20 px-5 py-12 md:py-16">
      <div className="max-w-[560px] md:max-w-[900px] lg:max-w-[1100px] mx-auto">
        <p className="text-[14px] font-bold uppercase tracking-wider text-[#A89279] mb-2">
          So funktioniert's
        </p>
        <h2 className="text-[26px] md:text-[32px] lg:text-[38px] leading-[1.25] font-bold text-[#3D3D3D] mb-3">
          In 2 Minuten zu Ihrem persönlichen Angebot
        </h2>
        {/* Martins Mini-Ablauf (08.11.): nennt den Kontaktschritt, bevor jemand tippt (Lehre vom 23.09.). */}
        <p className="text-[16px] leading-[1.55] text-[#5A5A5A] mb-6 md:mb-8">{MINI_ABLAUF}</p>

        <div className="rounded-[20px] bg-white px-4 pt-4 pb-1 md:px-6 md:py-6">
          <AblaufSchritte quer />
        </div>
        {/* Der Satz zum Mustervertrag stand bisher in Schritt 3 („den Mustervertrag können Sie jederzeit vorher lesen“). */}
        <p className="mt-3 text-[14px] text-[#5A5A5A]">
          Den{" "}
          <a href="https://kundenportal.primundus.de/primundus-mustervertrag.pdf" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-[#3D3D3D]">Mustervertrag</a>{" "}
          können Sie jederzeit vorher lesen.
        </p>

        {/* Knopf an der linken Kante wie Überschrift und Karte (Martin 09.11.: „Überschriften linksbündig“); Form, Schrift,
            Schatten und Pfeil wie der Hero-Knopf (MultiStepForm.tsx), Registry #160. */}
        <div className="mt-8 md:mt-10">
          <button
            onClick={() => openCalculator('ablauf')}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-[#E76F63] px-4 sm:px-8 py-[18px] text-[16px] min-[375px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)] transition-all duration-200 hover:bg-[#D65E52]"
          >
            {KNOPF_ANGEBOT}{"\u00a0"}→
          </button>
        </div>
      </div>
    </section>
  );
}
