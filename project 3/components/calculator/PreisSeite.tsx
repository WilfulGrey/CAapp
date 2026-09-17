'use client';

import { PREIS_SEITE, euro, zuschussNamen } from '@/lib/preis-zuerst';

/**
 * Preisseite VOR der Kontaktabfrage (Registry #77, Martin 17.09.2026).
 * Wortlaut = Kostenkarte des Kundenportals; der grüne Kopf darüber
 * („Ihr Preis ist berechnet", Testsieger-Siegel) kommt aus MultiStepForm.
 * Eine Hauptaktion: der Knopf zur Kontaktabfrage.
 */
export interface PreisDaten {
  bruttopreis: number;
  eigenanteil: number;
  zuschüsse: { gesamt: number; items: Array<{ name: string; label: string; in_kalkulation: boolean }> };
}

const FOTOS = ['pk-1', 'pk-2', 'pk-3', 'pk-4', 'pk-5'].map((n) => `/images/caregivers/${n}.jpg`);

export function PreisSeite({ daten, onWeiter, onGarantie }: { daten: PreisDaten; onWeiter: () => void; onGarantie: () => void }) {
  const hatZuschuss = daten.zuschüsse.gesamt > 0 && daten.eigenanteil < daten.bruttopreis;
  const heim = PREIS_SEITE.heim(daten.eigenanteil);
  const namen = zuschussNamen(daten.zuschüsse.items);
  return (
    <div id="preis-seite" className="space-y-3.5">
      {/* Preis + Garantie */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-[#8B8B8B]">{PREIS_SEITE.label}</p>
        <p className="mt-1 flex items-baseline gap-2 text-[#1a1a1a]">
          <span className="text-[40px] leading-none font-extrabold tracking-tight tabular-nums">{euro(daten.bruttopreis)}</span>
          <span className="text-[15px] font-semibold text-[#555]">{PREIS_SEITE.proMonat}</span>
        </p>
        <p className="mt-2 text-[13px] leading-snug text-[#6B6B6B]">{PREIS_SEITE.inklusive}</p>
        <div className="mt-2.5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/bestpreisgarantie-siegel.webp" alt="Primundus Bestpreisgarantie" className="h-[40px] w-auto" />
          <button type="button" onClick={onGarantie} className="text-[14px] font-semibold text-[#1F8F5F] underline underline-offset-2 hover:text-[#176B47]">
            {PREIS_SEITE.garantieMehr}
          </button>
        </div>
      </div>

      {/* Zuschüsse + Heimvergleich */}
      {hatZuschuss && (
        <div className="rounded-2xl border border-[#C4E3CB] bg-[#F0F7F1] px-4 py-3">
          <p className="text-[16px] font-bold leading-snug text-[#1F5A38]">{PREIS_SEITE.nachZuschuessen(daten.eigenanteil)}</p>
          {namen && <p className="text-[13px] leading-snug text-[#2F5A38] mt-0.5">{PREIS_SEITE.eingerechnet(namen)}</p>}
          {heim && (
            <p className="text-[13px] leading-snug text-[#2F5A38] mt-2">
              {heim} <span className="text-[12px] text-[#4C7A5F]">{PREIS_SEITE.heimQuelle}</span>
            </p>
          )}
        </div>
      )}

      {/* Kräfte + Hauptaktion — über der Falz (390×664), die Konditionen stehen darunter */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex flex-shrink-0">
            {FOTOS.map((src, i) => (
              <span key={src} className={`relative w-9 h-9 rounded-full overflow-hidden border-2 border-white flex-shrink-0 ${i > 0 ? '-ml-2.5' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              </span>
            ))}
          </div>
          <p className="text-[14px] font-semibold leading-snug text-[#2F5A38]">{PREIS_SEITE.kraefte}</p>
        </div>
        <button
          type="button"
          onClick={onWeiter}
          className="mt-3 w-full py-4 px-2 font-bold text-[15px] whitespace-nowrap rounded-xl bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer"
        >
          {PREIS_SEITE.knopf}
        </button>
        <p className="mt-2 text-center text-[12px] leading-snug text-[#8B8B8B]">{PREIS_SEITE.unterKnopf}</p>
      </div>

      {/* Konditionen */}
      <div className="border-t border-[#EEE9E0] pt-3">
        <ul className="grid grid-cols-1 gap-y-1.5 text-[15px] text-[#1a1a1a]">
          {PREIS_SEITE.haken.map((h) => (
            <li key={h} className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              {h}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-[#6B6B6B]">{PREIS_SEITE.kostenErst}</p>
      </div>
    </div>
  );
}
