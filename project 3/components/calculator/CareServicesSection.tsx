'use client';

import Image from 'next/image';
import { Check, Award, Calendar, Euro, Clock } from 'lucide-react';

export function CareServicesSection() {
  const services = [
    'Körperpflege & Hygiene',
    'Mahlzeiten zubereiten',
    'Arztbegleitung & Termine',
    'Haushalt & Einkäufe',
    'Gesellschaft & Gespräche',
    'Medikamentenerinnerung'
  ];

  const benefits = [
    {
      icon: Award,
      text: 'Testsieger DIE WELT',
      description: 'Mehrfach ausgezeichnet'
    },
    {
      icon: Calendar,
      text: 'Täglich kündbar',
      description: 'Maximale Flexibilität'
    },
    {
      icon: Euro,
      text: 'Taggenau abrechenbar',
      description: 'Faire Abrechnung'
    },
    {
      icon: Clock,
      text: 'Zahlbar erst ab Einsatzbeginn',
      description: 'Keine Vorauszahlung'
    }
  ];

  const scrollToCalculator = () => {
    const el = document.getElementById('calculator-form'); if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }
  };

  return (
    <section className="bg-white py-12 md:py-16 lg:py-20">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-10 md:mb-14">
          <h2 className="text-[28px] md:text-[36px] lg:text-[42px] leading-[1.2] font-bold text-[#3D3D3D]">
            Rundum versorgt – zu Hause, im gewohnten Alltag
          </h2>
        </div>

        {/* Two Column Layout */}
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-10 lg:gap-12">
            {/* Left Column: Image */}
            <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[500px] rounded-2xl overflow-hidden">
              <Image
                src="/images/primundus_haeusliche_betreuung.webp"
                alt="Häusliche Betreuung bei Primundus"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>

            {/* Right Column: Content */}
            <div className="flex flex-col justify-between">
              {/* Block 1: Intro Text */}
              <div className="mb-6 md:mb-8">
                <p className="text-base md:text-lg text-[#3D3D3D] leading-relaxed">
                  Ihre Betreuungskraft ist täglich für Ihren Angehörigen da – nicht nur für die Pflege, sondern für den ganzen Alltag:
                </p>
              </div>

              {/* Block 2: Services Grid (2x3) */}
              <div className="mb-10 md:mb-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {services.map((service, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[#A89279] to-[#8B7355] flex items-center justify-center shadow-sm">
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </div>
                      <span className="text-[15px] md:text-base text-[#3D3D3D] font-medium leading-tight">
                        {service}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Block 3: Premium Benefits Grid - In Right Column */}
              <div className="mb-10 md:mb-12">
                <div className="bg-gradient-to-br from-[#F8FAF8] to-white rounded-2xl p-6 md:p-8 border border-[#8B7355]/10">
                  <h3 className="text-xl md:text-2xl font-bold text-[#8B7355] mb-6 text-center">
                    Warum Primundus
                  </h3>
                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    {benefits.map((benefit, index) => {
                      const IconComponent = benefit.icon;
                      return (
                        <div
                          key={index}
                          className="group text-center"
                        >
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-white border-2 border-[#8B7355]/20 group-hover:bg-[#8B7355] group-hover:border-[#8B7355] flex items-center justify-center mb-3 mx-auto transition-all duration-300 shadow-sm">
                            <IconComponent className="w-6 h-6 md:w-7 md:h-7 text-[#8B7355] group-hover:text-white transition-colors duration-300" strokeWidth={2} />
                          </div>
                          <h4 className="text-sm md:text-base font-bold text-[#3D3D3D] mb-1 leading-tight">
                            {benefit.text}
                          </h4>
                          <p className="text-xs md:text-sm text-[#5C5C5C]">
                            {benefit.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Block 4: Trust Text */}
              <div className="mb-6 md:mb-8">
                <p className="text-sm text-[#5C5C5C] text-center">
                  Sie gehen kein Risiko ein. Kein Vertrag auf Mindestlaufzeit, keine versteckten Kosten.
                </p>
              </div>

              {/* Block 5: CTA Button */}
              <div className="flex justify-center">
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
          </div>
        </div>
      </div>
    </section>
  );
}
