import type { ReactNode } from "react";
import { GARANTIE } from "@/lib/kraefte-vorschau";

/**
 * Der EINE Inhalt der Bestpreisgarantie — Pop-up (BestpreisDialog) und Seite
 * (/bestpreisgarantie) zeigen ihn identisch aufgebaut (Martin 13.09.2026:
 * „das sollte ja schon gleich sein"). Kopf mit Marta, die Zusage, die
 * Aufklapp-Liste; nur die Überschrift (DialogTitle bzw. h1) und der Fuß
 * (Verstanden bzw. Weg in den Rechner) kommen von außen.
 * `gross` = die Seite: gleiche Reihenfolge, größere Schrift und Abstände
 * (Martin: „wenn es eine ganze Seite ist, kann das ja auch größer sein").
 * Texte aus lib/kraefte-vorschau.ts (GARANTIE).
 */
export function BestpreisInhalt({
  titel,
  aufgeklappt = false,
  gross = false,
  fuss,
}: {
  titel: ReactNode;
  /** Seite: Bedingungen offen; Pop-up: zu, bis man klickt. */
  aufgeklappt?: boolean;
  gross?: boolean;
  fuss: ReactNode;
}) {
  const k = gross
    ? {
        huelle: "px-6 pt-8 pb-7 sm:px-8 sm:pt-9 sm:pb-8 md:px-10 md:pt-11 md:pb-10",
        kopf: "gap-4 sm:gap-5 mb-6 sm:mb-7",
        foto: "w-[72px] h-[72px] sm:w-[96px] sm:h-[96px] md:w-[112px] md:h-[112px]",
        rolle: "text-[15px] md:text-[16px] mt-1",
        zusage: "text-[22px] sm:text-[24px] md:text-[28px]",
        kasten: "mt-6 rounded-2xl px-5 py-4 md:px-6 md:py-5",
        summary: "text-[18px] md:text-[20px]",
        pfeil: "h-5 w-5",
        text: "text-[17px] md:text-[18px]",
        liste: "mt-4 space-y-3",
        punkt: "text-[17px] md:text-[18px]",
        haken: "w-[22px] h-[22px] mt-[2px]",
        hakenSvg: 13,
      }
    : {
        huelle: "px-6 pt-7 pb-6",
        kopf: "gap-4 mb-5",
        foto: "w-[72px] h-[72px]",
        rolle: "text-[13px] mt-0.5",
        zusage: "text-[18px]",
        kasten: "mt-4 rounded-2xl px-4 py-3",
        summary: "text-[15px]",
        pfeil: "h-4 w-4",
        text: "text-[14px]",
        liste: "mt-3 space-y-2",
        punkt: "text-[14px]",
        haken: "w-[18px] h-[18px] mt-[2px]",
        hakenSvg: 11,
      };

  return (
    <div className={k.huelle}>
      <div className={`flex items-center ${k.kopf}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={GARANTIE.fotoSrc}
          alt={GARANTIE.beraterin}
          className={`${k.foto} rounded-full object-cover object-top border-[3px] border-white shadow-md flex-shrink-0`}
        />
        <div className="text-left min-w-0">
          {titel}
          <p className={`${k.rolle} text-[#6B6B6B]`}>
            {GARANTIE.beraterin} · {GARANTIE.rolle}
          </p>
        </div>
      </div>

      <p className={`${k.zusage} leading-snug font-semibold text-[#1a1a1a]`}>{GARANTIE.zusage}</p>

      <details className={`group ${k.kasten} bg-[#F6F4F0]`} open={aufgeklappt || undefined}>
        <summary className={`flex cursor-pointer list-none items-center justify-between ${k.summary} font-semibold text-[#1a1a1a] [&::-webkit-details-marker]:hidden`}>
          {GARANTIE.aufklappen}
          <svg className={`${k.pfeil} flex-shrink-0 text-[#6B6B6B] transition-transform group-open:rotate-180`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <p className={`mt-3 ${k.text} leading-relaxed text-[#1a1a1a]`}>{GARANTIE.ablauf}</p>
        <ul className={k.liste}>
          {GARANTIE.bedingungen.map((b) => (
            <li key={b} className={`flex items-start gap-2.5 ${k.punkt} leading-snug text-[#1a1a1a]`}>
              <span className={`${k.haken} inline-flex items-center justify-center rounded-full bg-[#E4F3EB] flex-shrink-0`} aria-hidden="true">
                <svg width={k.hakenSvg} height={k.hakenSvg} viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${k.text} leading-relaxed text-[#3D3D3D]`}>{GARANTIE.warum}</p>
      </details>

      {fuss}
    </div>
  );
}
