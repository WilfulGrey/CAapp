'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KennzahlenZeile, KNOPF_ANGEBOT, KOPF_FRAGEN, KostenfreiZeile } from '@/components/calculator/FormularPortal';
import { PersonalContact } from '@/components/calculator/PersonalContact';
import type { SterneStand } from '@/lib/sterne-zeile';

/** Schluss der Startseite (Registry #155, Martin 09.11.2026: „Pass das mal alles an. Genau so“): hell wie Formular und
 *  Portal statt des braunen Bands. Titel wie die H1 und der Titel über den Fragen, Knopf wie oben, darunter „100 % kostenfrei
 *  & unverbindlich“ und die Kennzahlen wie im letzten Schritt des Formulars, dann Marta (einziger Kontaktkasten der Seite). */
export function FinalCTA({ bewertung = null }: { bewertung?: SterneStand | null }) {
  return (
    <section className="px-5 pt-4 pb-14 md:pb-20">
      <div className="mx-auto grid max-w-[560px] gap-4 md:max-w-[640px]">
        <div className="rounded-[20px] bg-white px-5 py-7 text-center md:px-8">
          <h2 className="text-[26px] md:text-[32px] leading-[1.25] font-bold text-[#3D3D3D] mb-6">{KOPF_FRAGEN}</h2>
          <button
            onClick={() => openCalculator('final_cta')}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 sm:px-8 py-4 bg-[#E76F63] hover:bg-[#D65E52] text-white rounded-xl text-base md:text-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            {KNOPF_ANGEBOT}
            <svg className="hidden sm:block w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="mt-3"><KostenfreiZeile /></div>
          <div className="mt-4 border-t border-[#F0EDE8] pt-4 text-left">
            <KennzahlenZeile bewertung={bewertung} />
          </div>
        </div>
        <PersonalContact />
      </div>
    </section>
  );
}
