"use client";

import { useEffect, useState } from "react";

const WA_NUMBER = "4989200000830";
const WA_TEXT = encodeURIComponent("Hallo Frau Wysocki, ich habe eine Rückfrage:");
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_TEXT}`;

export function WhatsAppFloat() {
  const [tooltipPhase, setTooltipPhase] = useState<0 | 1 | 2>(0);
  const [fadingOut, setFadingOut] = useState(false);
  // Hide the float while the calculator form is on screen — it sits over
  // the "Weiter" button otherwise.
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => { setFadingOut(false); setTooltipPhase(1); }, 10000);
    const t2 = setTimeout(() => { setFadingOut(false); setTooltipPhase(2); }, 13500);
    const t3 = setTimeout(() => setFadingOut(true), 16500);
    const t4 = setTimeout(() => setTooltipPhase(0), 17200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    // Observe the form card itself (not the whole #calculator-form wrapper —
    // that also contains the badges + Ilka contact block, which kept the
    // float hidden far too long after scrolling past the form).
    const cards = document.querySelectorAll('[data-calculator-card]');
    if (cards.length === 0) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setFormVisible(visible.size > 0);
    }, { threshold: 0 });
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, []);

  if (formVisible) return null;

  return (
    <div className="md:hidden fixed bottom-5 right-4 z-50 flex flex-col items-end gap-2">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOutDown {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(6px); }
        }
      `}</style>

      {tooltipPhase > 0 && (
        <div
          key={tooltipPhase}
          className="relative bg-white text-[#1a1a1a] text-sm font-medium px-3.5 py-2.5 rounded-2xl rounded-br-sm shadow-lg border border-gray-100 whitespace-nowrap"
          style={{ animation: fadingOut ? 'fadeOutDown 0.4s ease forwards' : 'fadeInUp 0.3s ease forwards' }}
        >
          {tooltipPhase === 1 ? 'Haben Sie Fragen?' : 'Schreiben Sie Frau Wysocki...'}
          <span className="absolute -bottom-1.5 right-3 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45" />
        </div>
      )}

      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex w-14 h-14 items-center justify-center bg-[#25D366] hover:bg-[#20C05A] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95"
        aria-label="WhatsApp Beratung"
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full">
          <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-75" />
        </span>
      </a>
    </div>
  );
}
