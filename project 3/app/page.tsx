"use client";

import { Header } from "@/components/calculator/Header";
import { TestimonialCard } from "@/components/calculator/TestimonialCard";
import { HowItWorks } from "@/components/calculator/HowItWorks";
import { BestpriceGuarantee } from "@/components/calculator/BestpriceGuarantee";
import { TestsiegerSection } from "@/components/calculator/TestsiegerSection";
import { FAQSection } from "@/components/calculator/FAQSection";
import { ComparisonSection } from "@/components/calculator/ComparisonSection";
import { FinalCTA } from "@/components/calculator/FinalCTA";
import { Footer } from "@/components/calculator/Footer";
import { CareServicesSection } from "@/components/calculator/CareServicesSection";
import { MultiStepForm } from "@/components/calculator/MultiStepForm";
import { WhatIs24hCare } from "@/components/calculator/WhatIs24hCare";
import { RequirementsSection } from "@/components/calculator/RequirementsSection";
import { KeyBenefitsBar } from "@/components/calculator/KeyBenefitsBar";
import { WhatsAppFloat } from "@/components/calculator/WhatsAppFloat";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <Header />

      {/* Hero Section - Split Layout on Desktop */}
      <div className="w-full mb-8 lg:mb-0 lg:min-h-[90vh] lg:flex lg:items-center lg:bg-gradient-to-b lg:from-[#F8F7F5] lg:via-white lg:to-white">
        {/* Mobile/Tablet: Stacked Layout */}
        <div className="lg:hidden">
          <div className="relative w-full h-[240px] md:h-[280px] overflow-hidden mb-8 bg-[#F8F7F5]">
            <img
              src="/images/PM-Betreuung_frontal_desktop.webp"
              alt="Professionelle 24-Stunden-Betreuung"
              className="w-full h-full object-contain scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-transparent pointer-events-none"></div>
          </div>
          <div className="px-5 text-center mb-8">
            <h1 className="text-[28px] md:text-[40px] leading-[1.2] font-bold text-[#3D3D3D] mb-3 tracking-tight">
              24-Stunden-Pflege im eigenen Zuhause
            </h1>
            <p className="text-[18px] md:text-[19px] leading-[1.5] text-[#5A5A5A] mb-8">
              Bezahlbare Alternative zum Pflegeheim – <strong>Angebot & Pflegekräfte sofort einsehen,</strong> Betreuung in 4–7 Werktagen organisiert.
            </p>

            {/* Direct Form Integration */}
            <div className="max-w-md mx-auto mb-8">
              <MultiStepForm />
            </div>

            {/* USP Section */}
            <div className="mt-6 max-w-md mx-auto">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E3DF]">
                {/* Media Logos Carousel */}
                <div className="mb-6 pb-6 border-b border-[#E5E3DF]">
                  <p className="text-[11px] font-semibold text-[#8B8B8B] uppercase tracking-[0.08em] text-center mb-5">Bekannt aus</p>
                  <div className="relative overflow-hidden">
                    <div className="flex animate-scroll">
                      <div className="flex items-center gap-8 shrink-0">
                        <img src="/images/media/ard.webp" alt="ARD" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/ndr.webp" alt="NDR" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/sat1.webp" alt="SAT.1" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/die-welt.webp" alt="Die Welt" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <div className="flex items-center gap-8 shrink-0 ml-8">
                        <img src="/images/media/ard.webp" alt="ARD" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/ndr.webp" alt="NDR" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/sat1.webp" alt="SAT.1" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/die-welt.webp" alt="Die Welt" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                      <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">Persönlicher Ansprechpartner 7 Tage/Woche</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                      <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">Täglich kündbar & taggenaue Abrechnung</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                      <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">Betreuung startklar in 4–7 Werktagen</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                      <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">20+ Jahre Erfahrung & Testsieger</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop: Side-by-side Layout */}
        <div className="hidden lg:grid lg:grid-cols-[55fr_45fr] items-center max-w-[1280px] mx-auto px-8 gap-12 xl:gap-16 w-full">
          <div className="text-left">
            <h1 className="text-[clamp(2rem,3.5vw,3rem)] leading-[1.15] font-bold text-[#3D3D3D] mb-4 tracking-tight">
              24-Stunden-Pflege im eigenen Zuhause
            </h1>
            <p className="text-[18px] xl:text-[18px] leading-[1.5] text-[#5A5A5A] mb-8">
              Bezahlbare Alternative zum Pflegeheim – <strong>Angebot & Pflegekräfte sofort einsehen,</strong> Betreuung in 4–7 Werktagen organisiert.
            </p>

            {/* USP Section Desktop */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5E3DF]">
              {/* Media Logos Carousel */}
              <div className="mb-5 pb-4 border-b border-[#E5E3DF]">
                <p className="text-[10px] font-semibold text-[#8B8B8B] uppercase tracking-[0.08em] text-center mb-4">Bekannt aus</p>
                <div className="relative overflow-hidden">
                  <div className="flex animate-scroll">
                    <div className="flex items-center gap-7 shrink-0">
                      <img src="/images/media/ard.webp" alt="ARD" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/ndr.webp" alt="NDR" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/sat1.webp" alt="SAT.1" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/die-welt.webp" alt="Die Welt" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    <div className="flex items-center gap-7 shrink-0 ml-7">
                      <img src="/images/media/ard.webp" alt="ARD" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/ndr.webp" alt="NDR" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/sat1.webp" alt="SAT.1" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/die-welt.webp" alt="Die Welt" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                    <svg className="w-[16px] h-[16px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-[16px] text-[#3D3D3D] font-semibold text-left">Rechtssicher & ohne Risiko</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                    <svg className="w-[16px] h-[16px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[16px] text-[#3D3D3D] font-semibold text-left">Täglich kündbar & taggenaue Abrechnung</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                    <svg className="w-[16px] h-[16px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-[16px] text-[#3D3D3D] font-semibold text-left">Betreuung startklar in 4–7 Werktagen</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                    <svg className="w-[16px] h-[16px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <p className="text-[16px] text-[#3D3D3D] font-semibold text-left">20+ Jahre Erfahrung & Testsieger</p>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full">
            <MultiStepForm />
          </div>
        </div>
      </div>

      {/* Bestpreis & Testsieger Sections - direkt nach Hero */}
      {/* Mobile: Stacked */}
      <div className="lg:hidden">
        <BestpriceGuarantee />
        <TestsiegerSection />
      </div>

      {/* Desktop: Side-by-side */}
      <section className="hidden lg:block py-14 px-5 bg-white">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-[#FAF8F5] to-[#F2EDE6] border-2 border-[#E5DFD6] rounded-2xl p-8 relative">
              <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#5C9F6E] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
                ★ 100% Sorgenfrei
              </div>

              <div className="relative flex items-start gap-6 mt-4">
                <div className="w-14 h-14 bg-[#708A95] rounded-2xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>

                <div className="flex-1">
                  <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-3">
                   Überlassen Sie die Betreuung nicht dem Zufall.
                  </h3>
                  <p className="text-[15px] leading-relaxed text-[#5A5A5A]">
                     Vertrauen Sie auf über 20 Jahre Erfahrung aus mehr als 60.000 Betreuungen – mit einem 100 % sorgenfreien Modell: Bestpreis-Garantie, täglich kündbar, taggenaue Abrechnung und Kosten immer nur, wenn die Betreuungskraft tatsächlich bei Ihnen ist.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-[#D4A843] rounded-2xl p-8 relative">
              <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#D4A843] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
                ★ Testsieger
              </div>

              <div className="flex items-center gap-8 mt-4">
                <div className="w-40 h-40 flex items-center justify-center flex-shrink-0">
                  <img
                    src="/images/primundus_testsieger-2021.webp"
                    alt="Testsieger 2021"
                    className="w-40 h-40 object-contain"
                  />
                </div>

                <div className="flex-1">
                  <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">
                    Testsieger bei DIE WELT
                  </h3>

                  <p className="text-[14px] text-[#8A8279] mb-4">
                    Deutschlands größter Vergleichstest für 24-Stunden-Pflege
                  </p>

                  <p className="text-[15px] italic text-[#5A5A5A] leading-relaxed">
                    „Primundus überzeugte mit der besten Kombination aus Preis, Qualität und Kundenservice."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      <WhatIs24hCare />
      <RequirementsSection />
      <ComparisonSection />
      <CareServicesSection />

      <main className="w-full mx-auto px-5 max-w-[520px] md:max-w-[720px] lg:max-w-[900px] xl:max-w-[1000px]">
        <div className="mt-12 mb-6 max-w-3xl mx-auto">
          <p className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#A89279] mb-2">
            Kundenstimmen
          </p>
          <h2 className="text-[26px] md:text-[32px] lg:text-[36px] leading-[1.25] font-bold text-[#3D3D3D] mb-6">
            Das sagen unsere Familien
          </h2>
        </div>

        <div className="max-w-3xl mx-auto">
          <TestimonialCard />
        </div>
      </main>

      <FAQSection />
      <FinalCTA />
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
