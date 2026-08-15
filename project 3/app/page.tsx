"use client";

import Image from "next/image";
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
import { homePageGraph, jsonLdString } from "@/lib/seo-schema";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      {/* Service + FAQPage-JSON-LD: landet über den SSR-Prerender im
          initialen HTML, auch wenn diese Page "use client" ist. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(homePageGraph()) }}
      />
      <Header />

      {/* Hero Section - Split Layout on Desktop */}
      <div className="w-full mb-8 lg:mb-0 lg:min-h-[90vh] lg:flex lg:items-center lg:bg-gradient-to-b lg:from-[#F8F7F5] lg:via-white lg:to-white">
        {/* Mobile/Tablet: Stacked Layout.
            CRO 15.08. (Funnel-Befund): Beim Laden war KEIN Antwort-Button
            sichtbar (erster Button bei 824px, Viewport endet bei 812px) —
            nur 38 % der Besucher tippten überhaupt eine erste Antwort an,
            danach liefen 95 % durch. Deshalb: Wizard DIREKT unter die H1
            (Bild 190px, H1 24px, USPs+Preis als 2-Zeilen-Subline). Bewusster
            Trade-off (Martin 15.08.): Bildhöhe schlägt Falz — Button 3 ist
            beim Erstbesuch hinterm Cookie-Banner, Frage + Buttons 1-2 immer
            sichtbar; nach dem Consent-Klick (ohne Reload) alles frei. */}
        <div className="lg:hidden">
          {/* aspect statt fester Höhe (Martin 15.08.: auf breiteren Handys
              schnitt object-cover unten den Kopf ab): Container = exaktes
              Seitenverhältnis des Zuschnitts (843:427) -> auf JEDER Breite
              ist das komplette Bild sichtbar (375px -> 190px hoch,
              430px -> 218px). */}
          <div className="relative w-full aspect-[850/427] overflow-hidden mb-2 bg-[#F8F7F5]">
            {/* LCP element — explicit priority + sizes so the optimizer
                generates a mobile-sized WebP/AVIF and the browser fetches
                it eagerly with fetchpriority="high". */}
            {/* PM-Betreuung_hero_mobil-v4.webp (Martin 15.08., 6. Iteration —
                Personen rechts, Siegel-Zone links freigelegt):
                Personen zur Mitte, Siegel größer): Zuschnitt 850x427 =
                (280,55,1130,482) aus PM-Betreuung_frontal_desktop — Köpfe
                bis Schoß, Paar mittig. Der Rest des einmontierten
                Foto-Siegels ragt unten links rein und wird vom
                Overlay-Siegel exakt überdeckt. Dateiname VERSIONIEREN bei
                jedem neuen Zuschnitt (-v3, …) — Optimizer + Browser cachen
                per URL, sonst sieht man alte Bilder. */}
            <Image
              src="/images/PM-Betreuung_hero_mobil-v4.webp"
              alt="Professionelle 24-Stunden-Betreuung"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 0px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-transparent pointer-events-none"></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* Siegel moderat (Martin 15.08.: 62% buendig war "zu extrem"),
                mit Abstand unten links — die Ecke darunter ist in v3
                wegretuschiert (weicher Decken-Verlauf), kein Doppel-Siegel. */}
            <img
              src="/images/primundus_testsieger-2021.webp"
              alt="DIE WELT Service-Champions — Nr. 1 der Pflegekräfte-Vermittler"
              className="absolute left-2.5 bottom-2.5 h-[52%] w-auto rounded-[5px] shadow-md"
            />
          </div>
          <div className="px-5 text-center mb-8">
            <h1 className="text-[24px] md:text-[40px] leading-[1.2] font-bold text-[#3D3D3D] mb-1.5 tracking-tight">
              24-Stunden-Pflege zu Hause – die bezahlbare Alternative zum Pflegeheim
            </h1>
            {/* CRO 15.08. (Hypothese 4, Platzierung Martin): Preisspanne als
                Hero-Subline statt im Kontakt-Schritt. Bewusst SPANNE statt
                „ab 2.200 €" — ein Ab-Preis ankert am Minimum und enttäuscht
                bei jedem teureren Angebot. Wortlaut deckt sich mit der
                öffentlichen FAQ-Antwort (faqData.ts), kein neues Versprechen. */}
            {/* Zweizeilig (Martin 15.08.): Zeile 1 = die alten USP-Punkte als
                Satz, Zeile 2 = Preisspanne. Die Bullet-Liste unterm Formular
                ist damit redundant und entfernt. <br> ab 360px erzwingt den
                sauberen Umbruch; auf 320ern fließt der Text natürlich. */}
            {/* 14px + dunkleres Grau (Martin 15.08.: 12.5px/#8B8B8B war
                "zu klein, zu grau, kann man nicht lesen"). */}
            <p className="text-[14px] leading-snug text-[#5B5B5B] mb-2.5">
              <strong className="font-semibold text-[#3D3D3D]">Sofortangebot</strong> in 2 Minuten · kein Vertrag vor Auswahl —{' '}
              meist <strong className="font-semibold text-[#3D3D3D]">2.200&#8211;3.500&nbsp;€/Monat</strong>
            </p>

            {/* Direct Form Integration — über der Falz (CRO 15.08.) */}
            <div className="max-w-md mx-auto mb-6">
              <MultiStepForm />
            </div>

            {/* USP-Bullets entfernt (Martin 15.08.): stecken jetzt als
                zweizeiliger Satz unter der H1. */}

            {/* Presse-Logos als einziges Trust-Element, auf weißem Grund (Logos sind weiß hinterlegt) */}
            <div className="max-w-md mx-auto mb-6">
              <div className="bg-white rounded-2xl border border-[#ECE7DF] px-4 py-3.5">
                <p className="text-[11px] font-semibold text-[#B7AC9C] uppercase tracking-[0.1em] text-center mb-2.5">Bekannt aus</p>
                <div className="flex items-center justify-center gap-5">
                  <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[18px] object-contain opacity-80" />
                  <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[18px] object-contain opacity-80" />
                  <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[18px] object-contain opacity-80" />
                  <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[18px] object-contain opacity-80" />
                </div>
              </div>
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
                        <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <div className="flex items-center gap-8 shrink-0 ml-8">
                        <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                        <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
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
            <h1 className="text-[clamp(2rem,3.5vw,3rem)] leading-[1.15] font-bold text-[#3D3D3D] mb-3 tracking-tight">
              24-Stunden-Pflege zu Hause – die bezahlbare Alternative zum Pflegeheim
            </h1>
            {/* CRO 15.08.: Preisspanne im Hero — gleiche Zeile wie mobil. */}
            <p className="text-[16px] leading-snug text-[#8B8B8B] mb-5">
              Meist <strong className="font-semibold text-[#3D3D3D]">2.200–3.500 € im Monat</strong> — die Pflegekasse zahlt einen Teil dazu.
            </p>
            <ul className="flex flex-col gap-3 mb-6">
              <li className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-[#FBEEEA] flex items-center justify-center flex-shrink-0"><svg className="w-[18px] h-[18px] text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></span>
                <span className="text-[18px] text-[#3D3D3D]"><strong className="font-semibold">Sofortangebot</strong> in 2 Minuten</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-[#FBEEEA] flex items-center justify-center flex-shrink-0"><svg className="w-[18px] h-[18px] text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg></span>
                <span className="text-[18px] text-[#3D3D3D]"><strong className="font-semibold">Pflegekräfte</strong> sofort einsehen</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-[#FBEEEA] flex items-center justify-center flex-shrink-0"><svg className="w-[18px] h-[18px] text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></span>
                <span className="text-[18px] text-[#3D3D3D]"><strong className="font-semibold">Kein Vertrag</strong> vor Auswahl nötig</span>
              </li>
            </ul>

            {/* USP Section Desktop */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5E3DF]">
              {/* Media Logos Carousel */}
              <div className="mb-5 pb-4 border-b border-[#E5E3DF]">
                <p className="text-[10px] font-semibold text-[#8B8B8B] uppercase tracking-[0.08em] text-center mb-4">Bekannt aus</p>
                <div className="relative overflow-hidden">
                  <div className="flex animate-scroll">
                    <div className="flex items-center gap-7 shrink-0">
                      <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    <div className="flex items-center gap-7 shrink-0 ml-7">
                      <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                      <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
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

                {/* Wortlaut identisch zu TestsiegerSection.tsx (mit Martin
                    2026-08-14 abgestimmt) — Eigenaussage statt Zitat. */}
                <div className="flex-1">
                  <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">
                    Testsieger bei DIE WELT
                  </h3>

                  <p className="text-[14px] text-[#8A8279] mb-4">
                    Nr. 1 der Pflegekräfte-Vermittler – ausgezeichnet in Deutschlands großer Service-Studie von DIE WELT und ServiceValue
                  </p>

                  <p className="text-[15px] text-[#5A5A5A] leading-relaxed">
                    Als bester Vermittler von 24-Stunden-Pflegekräften ausgezeichnet: Primundus steht für die beste Kombination aus Preis, Qualität und Kundenservice.
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
