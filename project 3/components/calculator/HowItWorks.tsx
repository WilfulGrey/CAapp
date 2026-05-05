'use client';

import { Clock, Mail, Check } from 'lucide-react';

export function HowItWorks() {
  const scrollToCalculator = () => {
    const el = document.getElementById('calculator-form'); if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }
  };

  return (
    <section id="ablauf" className="scroll-mt-20 py-14 md:py-16 lg:py-20 px-5 bg-[#F8F7F5]">
      <div className="max-w-[560px] md:max-w-[900px] lg:max-w-[1100px] mx-auto">
        <p className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#A89279] mb-2">
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
                Angebot online einholen
              </h3>
              <p className="text-[14px] md:text-[15px] lg:text-[16px] leading-[1.55] text-[#5A5A5A] mb-2.5 md:text-center">
                Beantworten Sie wenige kurze Fragen zu Ihrer Pflegesituation. Sie sehen sofort Ihr Angebot & passende Pflegekräfte – inklusive möglicher Zuschüsse und Steuervorteile.
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
                Fundierte Entscheidungsgrundlage
              </h3>
              <p className="text-[14px] md:text-[15px] lg:text-[16px] leading-[1.55] text-[#5A5A5A] mb-2.5 md:text-center">
                Sie erhalten eine vollständige Übersicht mit allen Zuschüssen, Steuervorteilen und Finanzierungsoptionen – zum Vergleichen und Besprechen mit der Familie.
              </p>
              <span className="inline-flex items-center gap-1.5 bg-[#E8F5E9] text-[#2E7D32] px-3 py-1.5 rounded-lg text-xs font-semibold md:mx-auto">
                <Mail className="w-3.5 h-3.5" strokeWidth={2} />
                Auch per E-Mail erhältlich
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
                Passende Pflegekräfte erhalten
              </h3>
              <p className="text-[14px] md:text-[15px] lg:text-[16px] leading-[1.55] text-[#5A5A5A] mb-2.5 md:text-center">
                Auf Wunsch übermitteln wir Ihnen direkt passende Pflegekräfte-Profile – ohne weiteren Aufwand für Sie.
              </p>
              <span className="inline-flex items-center gap-1.5 bg-[#E8F5E9] text-[#2E7D32] px-3 py-1.5 rounded-lg text-xs font-semibold md:mx-auto">
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                Mit Bestpreis-Garantie vom Testsieger
              </span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-10 md:mt-12 lg:mt-14 text-center">
          <button
            onClick={scrollToCalculator}
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#E76F63] hover:bg-[#D65E52] text-white font-bold text-base md:text-lg rounded-full transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Kosten & Pflegekräfte ansehen
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
