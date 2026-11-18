"use client";

import { useState } from "react";
import { faqs } from "./faqData";
import { ABSCHNITT, AUGENBRAUE, H2, SPALTE } from "@/components/calculator/startStil";

/** Häufige Fragen. Die Texte kommen aus faqData.ts (sichtbar und FAQPage-Schema aus einer Quelle).
 *  ENTWURF 16.11.2026: wie primundus.de einzelne weiße Karten, ab md in zwei Spalten über die volle Breite; vorher eine
 *  640 px schmale Liste, rechts daneben blieb am Computer die halbe Seite leer. */
export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className={ABSCHNITT}>
      <div className={SPALTE}>
        <p className={AUGENBRAUE}>Häufige Fragen</p>
        <h2 className={H2}>Noch Fragen? Hier sind Antworten.</h2>

        {/* Am Handy eine Karte mit Trennlinien wie bisher, ab md einzelne Karten in zwei Spalten; items-start: Die offene
            Frage streckt die Karte daneben nicht zu einem leeren weißen Block. */}
        <ul className="mt-8 rounded-[20px] bg-white md:grid md:grid-cols-2 md:items-start md:gap-5 md:bg-transparent">
          {faqs.map((faq, index) => {
            const offen = openIndex === index;
            return (
              <li key={faq.question} className="border-b border-[#F0EDE8] last:border-b-0 md:overflow-hidden md:rounded-[20px] md:border-b-0 md:bg-white">
                <button
                  type="button"
                  onClick={() => setOpenIndex(offen ? null : index)}
                  aria-expanded={offen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors md:px-6 md:py-5 md:hover:bg-[#F8F7F5]"
                >
                  <span className="text-[16px] font-semibold leading-[1.4] text-[#1C1C1C]">{faq.question}</span>
                  <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full transition-all duration-300 ${offen ? "rotate-180 bg-[#8B7355]" : "bg-[#F2EDE6]"}`}>
                    <svg className={`h-5 w-5 ${offen ? "text-white" : "text-[#8B7355]"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {/* Zu, aber im HTML: das FAQ-Schema verlangt den Text sichtbar auf der Seite. */}
                <p hidden={!offen} className="px-5 pb-5 text-[16px] leading-[1.6] text-[#2E2E2E] md:px-6">{faq.answer}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
