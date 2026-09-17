"use client";

import { Star } from "lucide-react";
import { SterneText } from "@/components/calculator/BewertungsZeile";
import type { SterneStand } from "@/lib/sterne-zeile";

const testimonials = [
  {
    initials: "HM",
    name: "Helga M., Berlin",
    text: "Dank der schnellen Kalkulation hatten wir endlich eine klare Übersicht über die Kosten meiner Mutter.",
    rating: 5,
  },
  {
    initials: "SK",
    name: "Stefan K., München",
    text: "Sehr professionell und zuverlässig. Die Vermittlung verlief reibungslos und wir sind sehr zufrieden.",
    rating: 5,
  },
  {
    initials: "MP",
    name: "Maria P., Hamburg",
    text: "Kompetente Beratung und faire Preise. Unser Vater fühlt sich bei der Pflegekraft sehr wohl.",
    rating: 5,
  },
  {
    initials: "TW",
    name: "Thomas W., Frankfurt",
    text: "Die Online-Berechnung hat uns sehr geholfen. Alles wurde transparent erklärt und schnell umgesetzt.",
    rating: 5,
  },
  {
    initials: "JB",
    name: "Julia B., Köln",
    text: "Hervorragender Service! Die Betreuungskraft ist liebevoll und kümmert sich aufmerksam um meine Mutter.",
    rating: 5,
  },
  {
    initials: "RL",
    name: "Robert L., Stuttgart",
    text: "Faire Konditionen und flexible Vertragsgestaltung. Wir sind rundum zufrieden mit der Betreuung.",
    rating: 5,
  },
];

export function TestimonialCard({ bewertung }: { bewertung: SterneStand | null }) {
  return (
    <div className="w-full">
      {/* Kopfzeile seit 17.09.2026 dieselbe wie im Hero (Martin: „ja alles
          online"). Vorher stand hier fest „Google Bewertungen 4.8 von 5" —
          oben stand dann 4,9, und von den 126 Bewertungen kommen nur 6 von
          Google. Ohne Stand keine Kopfzeile. Die Stimmen darunter bleiben. */}
      {bewertung && (
        <div className="mb-4">
          <SterneText stand={bewertung} />
        </div>
      )}

      <div className="overflow-x-auto -mx-5 px-5 pb-2">
        <div className="flex gap-4 min-w-max">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E3DF] hover:shadow-md transition-all duration-300 w-[280px] flex-shrink-0"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-[#8B7355] to-[#7D6E5D] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {testimonial.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-0.5 mb-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[#FBBC04] text-[#FBBC04]" />
                    ))}
                  </div>
                  <p className="text-[14px] text-[#8B8B8B] font-medium truncate">
                    {testimonial.name}
                  </p>
                </div>
              </div>
              <p className="text-[16px] text-[#3D3D3D] leading-relaxed">
                „{testimonial.text}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
