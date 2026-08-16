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
            nur 38 % beantworteten die erste Frage, danach liefen 95 % durch.
            Deshalb steht der Wizard direkt unter der H1.

            NEUE GEWICHTUNG (Martin 16.08.: "wirkt so billig"): Bis dahin
            galt "alles über dem Cookie-Banner" als harte Regel — dafür
            wurde das Foto auf einen 188px-Briefschlitz gestaucht, Abstände
            gekürzt und zuletzt sogar ein Logo-Balken aufs Bild gelegt. Das
            Ergebnis wirkte gedrängt und billig, und das Banner ist nach
            EINEM Tipp weg. Bindend ist jetzt nur noch: Frage + ERSTER
            Antwort-Button sofort sichtbar (87 % wählen ohnehin Antwort 1);
            Button 2 darf beim Erstkontakt hinterm Banner liegen. Vertrauens-
            würdigkeit ist bei dieser Kaufentscheidung selbst ein
            Conversion-Faktor. */}
        <div className="lg:hidden">
          {/* aspect statt fester Höhe (Martin 15.08.: auf breiteren Handys
              schnitt object-cover unten den Kopf ab): Container = exaktes
              Seitenverhältnis des Zuschnitts (843:427) -> auf JEDER Breite
              ist das komplette Bild sichtbar (375px -> 190px hoch,
              430px -> 218px). */}
          {/* Randloser, hoher Hero statt 229px-Streifen (Martin 16.08. im
              Vergleich mit marta.de: "es ist nicht geiler, nicht schoener,
              nicht groesser"): aspect 1.17:1 statt 1.63:1 -> Foto fast
              dreimal so praesent.

              SIEGEL LINKS IM FOTO (Martin 16.08.: "nur Siegel im Header
              links wie damals"). Ich hatte es am 16.08. vom Foto genommen
              mit dem Argument, aufgeklebte Badges seien ein Merkmal alter
              Pflegeseiten — Martin hat das revidiert, die Entscheidung
              steht. NICHT wieder "aufraeumen". Der Zuschnitt
              PM-Header-Shooting_hero-v3.webp ist genau dafuer gebaut, die
              Personen sitzen rechts.

              Das Siegel ist klickbar und springt auf die Testsieger-Sektion
              mit der Original-Veroeffentlichung als PDF — die
              content-checkliste verlangt Beleg-Link plus sichtbares Jahr. */}
          <div className="relative w-full aspect-[1100/941] overflow-hidden bg-[#F8F7F5]">
            <Image
              src="/images/PM-Header-Shooting_hero-v3.webp"
              alt="Betreuungskraft und Seniorin zu Hause im Wohnzimmer"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 0px"
              className="object-cover"
            />
            <a
              href="#testsieger"
              className="absolute bottom-4 left-4 z-10 block"
              aria-label="Testsieger DIE WELT 2021 — zur Original-Veröffentlichung"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/primundus_testsieger-2021.webp"
                alt="Testsieger DIE WELT Service-Champions 2021"
                className="h-[100px] w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
              />
            </a>
          </div>
          {/* Weisser Grund statt #F8F7F5 (Martin 16.08.). Nicht nur Optik:
              die Medialogo-Dateien bringen eigene weisse Kaesten mit, die
              sich auf dem warmen Ton als graue Rechtecke abzeichnen — genau
              der Effekt, der schon am 15.08. beim Logo-Balken auffiel. Auf
              Weiss verschwindet er. Ob die GANZE Seite auf Weiss geht, ist
              ein eigener Schritt (betrifft jede Sektion). */}
          <div className="bg-white px-5 pb-9 pt-6 text-left">
            {/* DER KERN, NICHT DIE DIENSTLEISTUNG (Martin 16.08.: "warum
                erklaeren wir die Dienstleistung, statt auf den Kern
                einzugehen?"). Acht Fassungen davor haben die Mechanik
                beschrieben ("Sofortangebot in 2 Minuten", "eine
                Betreuungskraft zieht ein und ist rund um die Uhr da").
                Der Kern ist aber die Entscheidung, vor der die Person
                steht: Heim oder nicht.

                Belegt durch die Abstimmung mit SEA/SEO (16.08.): die
                konvertierenden Ads-Suchbegriffe sind Wettbewerber-Namen +
                "erfahrungen" (deutsche seniorenbetreuung, marta de,
                pflegehelden, promedica, hausengel). Wer so sucht, ist in
                der AUSWAHLPHASE und braucht keine Erklaerung des Modells —
                er will wissen, wem er das antun kann. 87 % der
                Warm-up-Antworten sind "fuer eine:n Angehoerige:n"; die
                Ansprache deckt sich mit den freigegebenen Anzeigen
                ("Statt Pflegeheim: zuhause").

                KICKER STEHT IN DER H1 (Martin: "der Kunde muss zumindest
                einen Kontext haben, was wir anbieten" + "vielleicht auch
                24 Stunden Pflege vom Testsieger"). Er traegt Kategorie,
                Keyword und Vertrauensanker in EINER Zeile, und das Siegel
                im Foto darueber belegt ihn. Damit ist die frueher hier
                notierte SEO-Warnung erledigt: "24-Stunden-Pflege" steht
                wieder IN der H1, nicht nur in der Unterzeile.

                UNTERZEILE = Martins Wortlaut (16.08.). Sie beschreibt
                nichts mehr, sie sagt zu, was auf den Klick folgt — fuer den
                Vergleichs-Sucher ist genau das die neue Information.
                "Heim" ist die Alternative, die der Kunde selbst erwaegt,
                kein benannter Wettbewerber (§6 UWG unkritisch). */}
            <h1 className="mb-3.5 tracking-tight text-[#3D3D3D]">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#E76F63]">
                24-Stunden-Pflege vom Testsieger
              </span>
              <span className="block text-[33px] md:text-[42px] font-bold leading-[1.1]">
                Ihre Eltern müssen nicht ins Heim.
              </span>
            </h1>
            <p className="mb-6 max-w-[400px] text-[16px] leading-relaxed text-[#5B5B5B]">
              Wir zeigen Ihnen sofort, was es kostet und welche Pflegekräfte
              verfügbar sind – 100 % kostenfrei und unverbindlich.
            </p>

            {/* CTA statt Fragebogen auf der Seite (Martin 16.08., Muster von
                marta.de). Der Klick oeffnet den Wizard als Overlay und
                ueberspringt die Warm-up-Frage — der Buttonklick ist der
                kleine erste Schritt. Buttontext = die Zusage der Unterzeile
                und wortgleich mit den CTAs in HowItWorks und FinalCTA
                ("Kosten & Pflegekraefte ansehen"); vorher stand hier
                "Betreuungskraft finden" ueber einem Zaehler, der
                "Pflegekraefte" sagt. Die drei Punkte unter dem Button
                stecken in MultiStepForm (mode="cta").
                Desktop bleibt vorerst inline (unten). */}
            <div className="max-w-md mb-7">
              <MultiStepForm mode="cta" />
            </div>

            {/* Testsieger + Erfahrung als Streifen "wie im Kundenportal"
                (Martin 16.08.) — spiegelt die Stats-Leiste aus
                app/kalkulation/[leadId]/page.tsx. Das Siegel selbst sitzt
                oben im Foto, hier stehen nur die Zahlen dazu.

                ACHTUNG: "60.000+ Einsaetze" und "20+ Jahre Erfahrung" sind
                sitewide und in den Anzeigen gesetzt, haben aber im Repo
                KEINE hinterlegte Quelle — anders als der Testsieger, dessen
                Original-PDF unter /downloads liegt. Hier uebernommen, nicht
                neu behauptet; Beleg ist nachzuziehen (content-checkliste). */}
            <div className="grid max-w-md grid-cols-3 gap-3 border-t border-[#E5E3DF] pt-6">
              <div>
                <p className="text-[17px] font-bold leading-tight text-[#3D3D3D]">Testsieger</p>
                <p className="mt-1 text-[13px] leading-tight text-[#8B8B8B]">DIE WELT 2021</p>
              </div>
              <div>
                <p className="text-[17px] font-bold leading-tight text-[#3D3D3D]">20+ Jahre</p>
                <p className="mt-1 text-[13px] leading-tight text-[#8B8B8B]">Erfahrung</p>
              </div>
              <div>
                <p className="text-[17px] font-bold leading-tight text-[#3D3D3D]">60.000+</p>
                <p className="mt-1 text-[13px] leading-tight text-[#8B8B8B]">Einsätze</p>
              </div>
            </div>

            {/* Medialogos als eigene Ebene statt im weissen Trust-Kasten
                (Martin 16.08.: "dann Testsieger mit der Erfahrung wie im
                Kundenportal und die Medialogos"). Der Kasten ist damit
                aufgeloest — er zeigte dieselben Logos und dasselbe
                "20+ Jahre Erfahrung & Testsieger" ein zweites Mal. Seine
                beiden uebrigen Zeilen (persoenlicher Ansprechpartner,
                Startzeit) stehen weiter unten in HowItWorks /
                CareServicesSection / FAQ und werden dort in einem eigenen
                Schritt ueberarbeitet (Martin 16.08.: "startklar in 4-7
                Werktagen klingt nicht schoen ... weiter unten inhaltlich
                anpassen").
                Bild der Frau + FAZ laufen weiter im Desktop-Karussell. */}
            <div className="mt-6 max-w-md border-t border-[#E5E3DF] pt-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8B8B8B]">Bekannt aus</p>
              <div className="flex items-center gap-5">
                <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80" />
                <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80" />
                <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80" />
                <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80" />
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
