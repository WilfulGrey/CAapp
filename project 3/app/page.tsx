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
import { PersonalContact } from "@/components/calculator/PersonalContact";
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
      {/* FESTER Abstand statt vertikaler Zentrierung (Martin 16.08.: "oben
          ist jetzt zu viel Luft zum Menuebalken auf Desktop").
          Vorher: `lg:min-h-[90vh] lg:flex lg:items-center`. Der Hero ist
          aber nur ~580px hoch, der Rest der 90vh wurde als Luft ueber und
          unter dem Inhalt verteilt — gemessen 156px zwischen Header und
          Kicker, und auf hohen Bildschirmen waere es noch mehr geworden.
          Jetzt ein Padding, das auf jeder Bildschirmhoehe gleich bleibt. */}
      <div className="w-full lg:bg-gradient-to-b lg:from-[#F8F7F5] lg:via-white lg:to-white lg:pb-4 lg:pt-12">
       <div className="w-full">
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
        {/* EIN Hero fuer alle Breiten (Martin 16.08.: "Desktop auch anpassen"
            + "warum waechst das Siegel nicht mit, wenn man den Bildschirm
            groesser zieht — du musst es also responsive machen, alles").

            Vorher waren es ZWEI Heroes: `lg:hidden` mit der neuen Botschaft
            und `hidden lg:grid` mit der alten ("die bezahlbare Alternative
            zum Pflegeheim", Preiszeile, drei andere Bullets). Sie sind
            auseinandergedriftet, weil jede Aenderung nur eine Seite traf —
            und beide H1 standen gleichzeitig im HTML.

            Jetzt: ein Block, mobil gestapelt (Foto oben), ab lg zweispaltig
            (Text links, Foto rechts). Eine H1, ein Text, ein Button.

            SIEGEL skaliert mit dem Foto: Breite in PROZENT statt fester
            Pixelhoehe. Das Foto waechst ueber `aspect-[1100/941]` mit der
            Spalte, das Siegel jetzt genauso — bei 375px ~67px wie bisher,
            darueber proportional (gedeckelt, damit es auf sehr breiten
            Schirmen nicht das Motiv frisst). Auch Abstaende prozentual,
            sonst klebt es bei grossen Breiten in der Ecke. */}
        {/* Der Abstand zum Menue sitzt am Wrapper darueber (lg:pt-12), nicht
            hier — sonst addieren sich zwei Paddings. */}
        <div className="mx-auto grid w-full max-w-[1280px] items-center lg:grid-cols-[46fr_54fr] lg:gap-12 lg:px-8 xl:gap-16">

          <div className="relative aspect-[1100/941] w-full overflow-hidden bg-[#F8F7F5] lg:order-2 lg:rounded-2xl">
            <Image
              src="/images/PM-Header-Shooting_hero-v3.webp"
              alt="Betreuungskraft und Seniorin zu Hause im Wohnzimmer"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 54vw"
              className="object-cover"
            />
            {/* Siegel links im Foto (Martin 16.08.: "nur Siegel im Header
                links wie damals"). Ich hatte es zwischenzeitlich vom Foto
                genommen — Martin hat das revidiert, die Entscheidung steht,
                NICHT wieder "aufraeumen". Klickbar auf die Testsieger-
                Sektion, weil die content-checkliste zur Auszeichnung einen
                Beleg-Link verlangt; das Jahr steht auf dem Siegel selbst. */}
            <a
              href="#testsieger"
              className="absolute bottom-[4%] left-[4%] z-10 block w-[18%] min-w-[62px] max-w-[150px]"
              aria-label="Testsieger DIE WELT 2021 — zur Original-Veröffentlichung"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/primundus_testsieger-2021.webp"
                alt="Testsieger DIE WELT Service-Champions 2021"
                className="block h-auto w-full drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
              />
            </a>
          </div>

          {/* Weisser Grund auf dem Handy (Martin 16.08.): die Medialogos
              bringen eigene weisse Kaesten mit, die sich auf dem warmen
              #F8F7F5 als graue Rechtecke abzeichnen. Ab lg traegt der
              Abschnitt ohnehin seinen eigenen Verlauf. */}
          {/* pb klein: die Beweis-Zeile darunter setzt den weissen Bereich
              fort und bringt ihren eigenen Abstand mit. */}
          <div className="bg-white px-5 pb-2 pt-6 text-left lg:order-1 lg:bg-transparent lg:px-0 lg:py-0">
            <div className="mx-auto max-w-[560px] lg:mx-0 lg:max-w-none">

              {/* DER KERN, NICHT DIE DIENSTLEISTUNG (Martin 16.08.: "warum
                  erklaeren wir die Dienstleistung, statt auf den Kern
                  einzugehen?"). Acht Fassungen davor beschrieben die
                  Mechanik. Der Kern ist die Entscheidung, vor der die
                  Person steht: Heim oder nicht.

                  Belegt durch die Abstimmung mit SEA/SEO (16.08.): die
                  konvertierenden Ads-Suchbegriffe sind Wettbewerber-Namen +
                  "erfahrungen". Wer so sucht, ist in der AUSWAHLPHASE und
                  braucht keine Erklaerung des Modells. 87 % der Warm-up-
                  Antworten sind "fuer eine:n Angehoerige:n".

                  KICKER STEHT IN DER H1 (Martin: "der Kunde muss zumindest
                  einen Kontext haben" + "vielleicht auch 24 Stunden Pflege
                  vom Testsieger") — traegt Kategorie, Keyword und
                  Vertrauensanker in EINER Zeile, das Siegel im Foto belegt
                  ihn. Damit steht "24-Stunden-Pflege" wieder IN der H1. */}
              <h1 className="mb-3.5 tracking-tight text-[#3D3D3D]">
                {/* Auf dem Desktop groesser (Martin 16.08.): 14px standen
                    dort unter einer 44px-H1 wie eine Fussnote. */}
                <span className="mb-2.5 block text-[14px] font-semibold uppercase tracking-[0.07em] text-[#E76F63] lg:mb-3 lg:text-[18px] lg:tracking-[0.06em]">
                  24-Stunden-Pflege vom Testsieger
                </span>
                <span className="block text-[33px] font-bold leading-[1.1] sm:text-[40px] lg:text-[44px] xl:text-[50px]">
                  Ihre Eltern müssen nicht ins Heim.
                </span>
              </h1>

              {/* Wortlaut von Martin (16.08.). Beschreibt nichts mehr, sagt
                  zu, was auf den Klick folgt — fuer den Vergleichs-Sucher
                  ist genau das die neue Information. "Heim" ist die
                  Alternative, die der Kunde selbst erwaegt, kein benannter
                  Wettbewerber (§6 UWG unkritisch). */}
              <p className="mb-6 max-w-[520px] text-[16px] leading-relaxed text-[#5B5B5B] lg:text-[18px]">
                Wir zeigen Ihnen sofort, was es kostet und welche Pflegekräfte
                verfügbar sind – 100 % kostenfrei und unverbindlich.
              </p>

              {/* CTA-Modus jetzt auf ALLEN Breiten. Vorher lief auf dem
                  Desktop der Fragebogen inline und mobil der Button — zwei
                  Interaktionsmodelle auf einer Seite. Das Overlay ist seit
                  heute ein echtes Modal (fixed, oben im Bild, eigener
                  Scrollbereich) und funktioniert in jeder Breite.
                  Die drei Punkte unter dem Button stecken in MultiStepForm. */}
              <div className="mb-7 max-w-md">
                <MultiStepForm mode="cta" />
              </div>

            </div>
          </div>
        </div>

        {/* Nur noch die MEDIALOGOS unter Bild und Text, ueber die volle
            Breite (Martin 16.08.).

            Die Testsieger-Zeile stand hier bis eben daneben und ist RAUS:
            "brauchen wir im Header nicht, weil im Bild und darunter sofort
            sichtbar" — das Siegel liegt im Foto, und die Testsieger-Sektion
            mit dem Beleg-PDF folgt weiter unten auf der Seite. Sie dreimal
            zu zeigen war Wiederholung, kein Beweis. */}
        <div className="bg-white lg:bg-transparent">
          <div className="mx-auto w-full max-w-[1280px] px-5 pb-2 lg:px-8 lg:pb-0 lg:pt-10">
            {/* Linie OBEN und UNTEN (Martin 16.08.: "auch unter den Logos
                einen Strich wie drueber") — die Reihe wird dadurch zu einem
                eigenen Band statt zu einem offenen Anhaengsel. */}
            <div className="mx-auto max-w-[560px] border-t border-[#E5E3DF] py-6 lg:mx-0 lg:max-w-none lg:border-b">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8B8B8B]">Bekannt aus</p>
              {/* Ab lg ueber die ganze Breite verteilt statt in einer Ecke
                  geklumpt — dafuer `justify-between`. Bild der Frau + FAZ
                  erst ab sm, sonst wird die Reihe auf dem Handy zu eng. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:gap-x-5 lg:gap-x-8">
                <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" loading="lazy" decoding="async" className="hidden h-[20px] object-contain opacity-80 sm:block sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" loading="lazy" decoding="async" className="hidden h-[20px] object-contain opacity-80 sm:block sm:h-[24px] lg:h-[32px]" />
              </div>
            </div>
          </div>
        </div>
       </div>
      </div>

      {/* Mobile-Reihenfolge nach dem Hero (Martin 16.08.): Ablauf direkt
          unter "Bekannt aus", darunter Ilka, dann erst Bestpreis und
          Testsieger. Der Ablauf beantwortet die naechste Frage, die sich
          nach dem Versprechen stellt ("und wie laeuft das jetzt?"), Ilka
          gibt ihr ein Gesicht.
          HowItWorks steht deshalb HIER fuer mobil und weiter unten in einem
          `hidden lg:block`-Wrapper fuer Desktop — die Desktop-Reihenfolge
          bleibt damit unveraendert. */}
      <div className="lg:hidden">
        <HowItWorks />
        <section className="px-5 pb-12 bg-[#F8F7F5]">
          <div className="mx-auto max-w-[520px]">
            <PersonalContact />
          </div>
        </section>
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

      {/* Desktop behaelt den Ablauf an dieser Stelle; mobil steht er oben
          direkt nach dem Hero (siehe lg:hidden-Block weiter oben). */}
      <div className="hidden lg:block">
        <HowItWorks />
      </div>

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
