"use client";

import { useState } from "react";
import { faqs } from "./faqData";

/** Häufige Fragen (Registry #155, Martin 09.11.2026: „Pass das mal alles an. Genau so“): Überschrift und Form wie die Fragen
 *  im Portal: eine weiße Karte mit Zeilen und Trennlinien statt Einzelkästen; Überschrift wie bisher. Die Texte kommen aus faqData.ts (sichtbar und
 *  FAQPage-Schema aus einer Quelle). */
export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="px-5 py-12 md:py-16">
      {/* Registry #160: Spalte wie die Abschnitte darüber (eine linke Kante, am Computer x=90), die Liste bleibt 760 px breit
          (Lesebreite) und steht links. */}
      <div className="mx-auto max-w-[560px] md:max-w-[900px] lg:max-w-[1100px]">
        <p className="text-[14px] font-bold uppercase tracking-wider text-[#A89279] mb-2">Häufige Fragen</p>
        <h2 className="text-[26px] md:text-[32px] lg:text-[38px] leading-[1.25] font-bold text-[#3D3D3D] mb-6 md:mb-8">
          Noch Fragen? Hier sind Antworten.
        </h2>

        <ul className="rounded-[20px] bg-white px-4 md:max-w-[760px] md:px-6">
          {faqs.map((faq, index) => {
            const offen = openIndex === index;
            return (
              <li key={faq.question} className="border-b border-[#F0EDE8] last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenIndex(offen ? null : index)}
                  aria-expanded={offen}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="text-[16px] font-semibold leading-[1.4] text-[#1C1C1C]">{faq.question}</span>
                  <svg className={`h-5 w-5 flex-none text-[#8B7355] transition-transform duration-200 ${offen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {/* Zu, aber im HTML: das FAQ-Schema verlangt den Text sichtbar auf der Seite. */}
                <p hidden={!offen} className="pb-4 text-[16px] leading-[1.6] text-[#5A5A5A]">{faq.answer}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
