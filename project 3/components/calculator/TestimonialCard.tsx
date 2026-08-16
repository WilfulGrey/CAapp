"use client";

import { Star } from "lucide-react";

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

export function TestimonialCard() {
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-sm font-semibold text-[#3D3D3D]">Google Bewertungen</span>
        <div className="flex items-center gap-1 ml-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3.5 h-3.5 fill-[#FBBC04] text-[#FBBC04]" />
          ))}
        </div>
        <span className="text-xs text-[#8B8B8B]">4.8 von 5</span>
      </div>

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
