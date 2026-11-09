"use client";

import { Star } from "lucide-react";
import { SterneText } from "@/components/calculator/BewertungsZeile";
import { HERKUNFT_STIMMEN, STIMMEN_STARTSEITE } from "@/lib/kundenstimmen";
import { anzahlText, type SterneStand } from "@/lib/sterne-zeile";

/** „TR“ aus „Thomas R.“: Anfangsbuchstaben von Vor- und Nachname. */
function initialen(name: string): string {
  return name.split(/\s+/).map((teil) => teil.charAt(0)).join("").slice(0, 2).toUpperCase();
}

export function TestimonialCard({ bewertung }: { bewertung: SterneStand | null }) {
  return (
    <div className="w-full">
      {/* Kopfzeile seit 17.09.2026 dieselbe wie im Hero (Martin: „ja alles
          online"). Vorher stand hier fest „Google Bewertungen 4.8 von 5" —
          oben stand dann 4,9, und von den 126 Bewertungen kommen nur 6 von
          Google. Ohne Stand keine Kopfzeile. */}
      {bewertung && (
        <div className="mb-4">
          <SterneText stand={bewertung} />
        </div>
      )}

      {/* Registry #153 (Martin 09.11.: „passe die Bewertungen an. Benutze die von der Bewertungsseite“): echte Stimmen von
          primundus.de/erfahrungen statt der sechs Platzhalter, wörtlich mit Name, Ort und Datum (lib/kundenstimmen.ts). */}
      <div className="overflow-x-auto -mx-5 px-5 pb-2">
        <div className="flex gap-4 min-w-max">
          {STIMMEN_STARTSEITE.map((stimme) => (
            <div
              key={stimme.id}
              className="bg-white rounded-[20px] p-5 w-[280px] flex-shrink-0"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-[#8B7355] to-[#7D6E5D] flex items-center justify-center text-white font-bold text-sm shadow-sm" aria-hidden="true">
                  {initialen(stimme.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-0.5 mb-1" role="img" aria-label={`${stimme.sterne} von 5 Sternen`}>
                    {[...Array(stimme.sterne)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[#FBBC04] text-[#FBBC04]" aria-hidden="true" />
                    ))}
                  </div>
                  <p className="text-[14px] text-[#8B8B8B] font-medium truncate">
                    {stimme.name}, {stimme.ort}
                  </p>
                  <p className="text-[12.5px] text-[#8B8B8B]">{stimme.datum}</p>
                </div>
              </div>
              <p className="text-[16px] text-[#3D3D3D] leading-relaxed">
                „{stimme.text}“
              </p>
            </div>
          ))}
        </div>
      </div>
      {/* Herkunft ohne Link (Martin 09.11.: „keinen Link … damit er da nicht wegspringt“), immer sichtbar (§ 5b UWG, Registry
          #159); erst die Herkunft der gezeigten Stimmen, dann die Auswahl aus allen. */}
      <p className="mt-2 text-[13px] text-[#8B8B8B]">
        {HERKUNFT_STIMMEN}{bewertung && <> Auswahl aus {anzahlText(bewertung.anzahl)} auf primundus.de.</>}
      </p>
    </div>
  );
}
