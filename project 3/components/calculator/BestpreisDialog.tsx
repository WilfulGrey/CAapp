"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GARANTIE } from "@/lib/kraefte-vorschau";

/**
 * Pop-up der Bestpreisgarantie (Martin 12.09.2026): Marta als Bild, zwei
 * Sätze, die Bedingungen zum Aufklappen — „ganz klar und nicht so textlich".
 * Ton verbindlich und ruhig. Texte in lib/kraefte-vorschau.ts (GARANTIE).
 * Der Wizard ist selbst ein Fenster auf z-90 (Backdrop z-80), deshalb z-110/z-100.
 */
export function BestpreisDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        className="z-[110] max-w-[420px] mx-auto bg-white rounded-3xl border-none shadow-2xl p-0 gap-0 max-h-[92vh] overflow-y-auto"
        overlayClassName="z-[100]"
        aria-describedby={undefined}
      >
        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center gap-4 mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GARANTIE.fotoSrc}
              alt={GARANTIE.beraterin}
              className="w-[72px] h-[72px] rounded-full object-cover object-top border-[3px] border-white shadow-md flex-shrink-0"
            />
            <div className="text-left">
              <DialogTitle className="text-[22px] font-bold text-[#1a1a1a] leading-tight">{GARANTIE.titel}</DialogTitle>
              <p className="text-[13px] text-[#6B6B6B] mt-0.5">{GARANTIE.beraterin} · {GARANTIE.rolle}</p>
            </div>
          </div>

          <p className="text-[18px] leading-snug font-semibold text-[#1a1a1a]">{GARANTIE.zusage}</p>

          <details className="group mt-4 rounded-2xl bg-[#F6F4F0] px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-semibold text-[#1a1a1a] [&::-webkit-details-marker]:hidden">
              {GARANTIE.aufklappen}
              <svg className="h-4 w-4 flex-shrink-0 text-[#6B6B6B] transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <p className="mt-3 text-[14px] leading-relaxed text-[#1a1a1a]">{GARANTIE.ablauf}</p>
            <ul className="mt-3 space-y-2">
              {GARANTIE.bedingungen.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[14px] leading-snug text-[#1a1a1a]">
                  <span className="mt-[2px] inline-flex w-[18px] h-[18px] items-center justify-center rounded-full bg-[#E4F3EB] flex-shrink-0" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14px] leading-relaxed text-[#3D3D3D]">{GARANTIE.warum}</p>
          </details>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-5 w-full rounded-full bg-[#1F8F5F] text-white font-semibold text-[15px] py-3 hover:bg-[#1a7a51] transition-colors"
          >
            {GARANTIE.schliessen}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
