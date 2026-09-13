"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BestpreisInhalt } from "@/components/calculator/BestpreisInhalt";
import { GARANTIE } from "@/lib/kraefte-vorschau";

/**
 * Pop-up der Bestpreisgarantie (Martin 12.09.2026): Marta als Bild, zwei
 * Sätze, die Bedingungen zum Aufklappen — „ganz klar und nicht so textlich".
 * Inhalt kommt aus BestpreisInhalt, derselbe wie auf /bestpreisgarantie.
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
        <BestpreisInhalt
          titel={<DialogTitle className="text-[22px] font-bold text-[#1a1a1a] leading-tight">{GARANTIE.titel}</DialogTitle>}
          fuss={
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-5 w-full rounded-full bg-[#1F8F5F] text-white font-semibold text-[15px] py-3 hover:bg-[#1a7a51] transition-colors"
            >
              {GARANTIE.schliessen}
            </button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
