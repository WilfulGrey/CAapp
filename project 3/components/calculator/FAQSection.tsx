"use client";

import { useState } from "react";
import { faqs } from "./faqData";

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-16 md:py-18 lg:py-20 px-5 bg-gradient-to-b from-white to-[#FAFAF9]">
      <div className="max-w-[640px] md:max-w-[900px] lg:max-w-[1100px] mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#A89279] mb-3">
            Häufige Fragen
          </p>
          <h2 className="text-[32px] md:text-[36px] lg:text-[42px] leading-[1.2] font-bold text-[#3D3D3D] mb-4">
            Noch Fragen? Hier sind Antworten.
          </h2>
          <p className="text-[15px] md:text-[16px] lg:text-[17px] text-[#6B6B6B] max-w-[480px] md:max-w-[600px] mx-auto">
            Wir beantworten die wichtigsten Fragen zur 24-Stunden-Pflege
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white border border-[#E5E3DF] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-[#FAFAF9] transition-colors duration-200"
              >
                <span className="font-semibold text-[16px] text-[#3D3D3D] pr-4 leading-[1.4]">
                  {faq.question}
                </span>
                <div className={`w-8 h-8 rounded-full bg-[#F5F3F0] flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  openIndex === index ? "bg-[#8B7355] rotate-180" : ""
                }`}>
                  <svg
                    className={`w-5 h-5 transition-colors duration-300 ${
                      openIndex === index ? "text-white" : "text-[#8B7355]"
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  openIndex === index ? "max-h-[400px]" : "max-h-0"
                }`}
              >
                <div className="px-6 pb-6 pt-2">
                  <p className="text-[15px] leading-[1.7] text-[#5A5A5A]">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-[#6B6B6B] mb-4">
            Weitere Fragen? Wir beraten Sie gerne persönlich.
          </p>
          <a
            href="tel:+4989200000830"
            className="inline-flex items-center gap-2 text-[#8B7355] font-semibold text-[15px] hover:text-[#6B5738] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Kostenlose Beratung: 089 200 000 830
          </a>
        </div>
      </div>
    </section>
  );
}
