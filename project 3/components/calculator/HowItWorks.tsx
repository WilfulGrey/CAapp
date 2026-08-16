'use client';

import { Clock, Check } from 'lucide-react';
import { scrollToCalculator } from '@/lib/scroll-to-calculator';

export function HowItWorks() {
  return (
    <section id="ablauf" className="scroll-mt-20 py-14 md:py-16 lg:py-20 px-5 bg-[#F8F7F5]">
      <div className="max-w-[560px] md:max-w-[900px] lg:max-w-[1100px] mx-auto">
        <p className="text-[14px] font-bold uppercase tracking-wider text-[#A89279] mb-2">
          So funktioniert's
        </p>
        <h2 className="text-[26px] md:text-[32px] lg:text-[38px] leading-[1.25] font-bold text-[#3D3D3D] mb-8 md:mb-10 lg:mb-12">
          In 2 Minuten zu Ihrem persönlichen Angebot
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 lg:gap-10">
          <div className="flex md:flex-col gap-5">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full bg-[#5C4033] text-white flex items-center justify-center font-bold text-lg md:text-xl lg:text-2xl">
                1
              </div>
              <div className="w-0.5 flex-1 md:hidden bg-[#F0EBE3] mt-1.5"></div>
            </div>
            <div className="pt-0.5 md:pt-5 flex-1">
              <h3 className="font-bold text-[17px] md:text-[18px] lg:text-[20px] mb-1.5 md:mb-2.5 text-[#3D3D3D] leading-snug md:text-center">
                Angebot einholen
              </h3>
              <p className="text-[16px] leading-[1.55] text-[#5A5A5A] mb-2.5 md:text-center">
                Wenige kurze Fragen zur Pflegesituation. Danach sehen Sie sofort Ihren Preis und passende Pflegekräfte — mit allen Zuschüssen und Steuervorteilen.
              </p>
              <span className="inline-flex items-center gap-1.5 bg-[#E8F5E9] text-[#2E7D32] px-3 py-1.5 rounded-lg text-xs font-semibold md:mx-auto">
                <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                Dauert unter 2 Minuten
              </span>
            </div>
          </div>

          <div className="flex md:flex-col gap-5">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full bg-[#5C4033] text-white flex items-center justify-center font-bold text-lg md:text-xl lg:text-2xl">
                2
              </div>
              <div className="w-0.5 flex-1 md:hidden bg-[#F0EBE3] mt-1.5"></div>
            </div>
            <div className="pt-0.5 md:pt-5 flex-1">
              <h3 className="font-bold text-[17px] md:text-[18px] lg:text-[20px] mb-1.5 md:mb-2.5 text-[#3D3D3D] leading-snug md:text-center">
                Auswahl Ihrer Pflegekraft
              </h3>
              <p className="text-[16px] leading-[1.55] text-[#5A5A5A] mb-2.5 md:text-center">
                Sie erhalten passende Profile mit Foto, Erfahrung und Verfügbarkeit. Sie entscheiden.
              </p>
              <span className="inline-flex items-center gap-1.5 bg-[#E8F5E9] text-[#2E7D32] px-3 py-1.5 rounded-lg text-xs font-semibold md:mx-auto">
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                Kein Vertrag vor Ihrer Auswahl
              </span>
            </div>
          </div>

          <div className="flex md:flex-col gap-5">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full bg-[#5C4033] text-white flex items-center justify-center font-bold text-lg md:text-xl lg:text-2xl">
                3
              </div>
            </div>
            <div className="pt-0.5 md:pt-5 flex-1">
              <h3 className="font-bold text-[17px] md:text-[18px] lg:text-[20px] mb-1.5 md:mb-2.5 text-[#3D3D3D] leading-snug md:text-center">
                Anreise & Betreuungsbeginn
              </h3>
              <p className="text-[16px] leading-[1.55] text-[#5A5A5A] mb-2.5 md:text-center">
                Wir organisieren den Betreuungsvertrag und den Anreisetermin. Unterschrieben wird online im Portal — den{" "}
                <a href="https://kundenportal.primundus.de/primundus-mustervertrag.pdf" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-[#3D3D3D]">Mustervertrag</a>{" "}
                können Sie vorher lesen.
              </p>
              <span className="inline-flex items-center gap-1.5 bg-[#E8F5E9] text-[#2E7D32] px-3 py-1.5 rounded-lg text-xs font-semibold md:mx-auto">
                <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                Start in 4–7 Werktagen
              </span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-10 md:mt-12 lg:mt-14 text-center">
          <button
            onClick={() => scrollToCalculator()}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 sm:px-8 py-4 bg-[#E76F63] hover:bg-[#D65E52] text-white font-bold text-base md:text-lg rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Kosten & Pflegekräfte ansehen
            <svg className="hidden sm:block w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
