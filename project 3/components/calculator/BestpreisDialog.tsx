"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GARANTIE } from "@/lib/kraefte-vorschau";

/**
 * Pop-up der Bestpreisgarantie (Martin 12.09.2026: „mit Marta als Bild").
 * Ein Versprechen in Martas Stimme, die Bedingungen für „vergleichbar", das
 * Warum — und ein Weg zu ihr, falls Fragen bleiben. Texte liegen in
 * lib/kraefte-vorschau.ts (GARANTIE), damit Tests sie festhalten.
 * Der Wizard ist selbst ein Fenster auf z-90 (Backdrop z-80), deshalb z-110/z-100.
 */
export function BestpreisDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        className="z-[110] max-w-[440px] mx-auto bg-white rounded-3xl border-none shadow-2xl p-0 gap-0 max-h-[92vh] overflow-y-auto"
        overlayClassName="z-[100]"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-6 pt-6 pb-4 bg-[#F4F8F5] rounded-t-3xl">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GARANTIE.fotoSrc}
              alt={GARANTIE.beraterin}
              className="w-[68px] h-[68px] rounded-full object-cover border-[3px] border-white shadow-md flex-shrink-0"
            />
            <div className="text-left">
              <DialogTitle className="text-[21px] font-bold text-[#1a1a1a] leading-tight">{GARANTIE.titel}</DialogTitle>
              <p className="text-[13px] text-[#6B6B6B] mt-1">{GARANTIE.beraterin} · {GARANTIE.rolle}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pt-5 pb-6 space-y-5">
          <blockquote className="relative pl-4 border-l-[3px] border-[#1F8F5F] text-[16px] leading-relaxed text-[#1a1a1a] font-medium">
            „{GARANTIE.stimme}“
          </blockquote>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B6B6B] mb-2">{GARANTIE.bedingungenTitel}</p>
            <ul className="space-y-2">
              {GARANTIE.bedingungen.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[14px] leading-snug text-[#1a1a1a]">
                  <span className="mt-[2px] inline-flex w-[18px] h-[18px] items-center justify-center rounded-full bg-[#E4F3EB] flex-shrink-0" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B6B6B] mb-1.5">{GARANTIE.warumTitel}</p>
            <p className="text-[14px] leading-relaxed text-[#3D3D3D]">{GARANTIE.warum}</p>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-full bg-[#1F8F5F] text-white font-semibold text-[15px] py-3 hover:bg-[#1a7a51] transition-colors"
          >
            {GARANTIE.schliessen}
          </button>
          <p className="text-center text-[13px] text-[#6B6B6B]">
            {GARANTIE.frage}{' '}
            <a href={GARANTIE.telefonHref} className="font-semibold text-[#1F8F5F] underline underline-offset-2">{GARANTIE.telefon}</a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
