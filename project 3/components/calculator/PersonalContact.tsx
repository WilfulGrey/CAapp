"use client";

import Image from "next/image";
import { Phone, Mail } from "lucide-react";

const WA_URL = `https://wa.me/4989200000830?text=${encodeURIComponent("Hallo, ich interessiere mich für die 24-Stunden-Pflege und hätte gerne eine Beratung.")}`;

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

export function PersonalContact() {
  return (
    <div className="bg-gradient-to-br from-[#F8F7F5] to-white rounded-xl p-6 border border-[#E5E3DF] shadow-sm hover:shadow-md transition-shadow duration-200">
      <h3 className="text-center text-lg md:text-xl font-bold text-[#3D3D3D] mb-4">Kann ich helfen?</h3>
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#A89279]">
          <Image
            src="/images/ilka-wysocki_pm-mallorca.webp"
            alt="Ilka Wysocki"
            width={96}
            height={96}
            className="object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 text-center md:text-left">
          <p className="font-bold text-[#3D3D3D] text-lg md:text-xl mb-3">Ilka Wysocki</p>
          <div className="flex flex-col gap-2">
            <a
              href="tel:+4989200000830"
              className="inline-flex items-center justify-center md:justify-start gap-2 text-[#708A95] hover:text-[#62808A] transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-[#708A95] group-hover:bg-[#62808A] flex items-center justify-center transition-colors">
                <Phone className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg md:text-xl">089 200 000 830</span>
            </a>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center md:justify-start gap-2 text-[#25D366] hover:text-[#20C05A] transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-[#25D366] group-hover:bg-[#20C05A] flex items-center justify-center transition-colors">
                <WhatsAppIcon />
              </div>
              <span className="font-semibold text-base md:text-lg">WhatsApp</span>
            </a>
            <a
              href="mailto:info@primundus.de"
              className="inline-flex items-center justify-center md:justify-start gap-2 text-[#8B7355] hover:text-[#6D5A42] transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-[#8B7355] group-hover:bg-[#6D5A42] flex items-center justify-center transition-colors">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium text-base md:text-lg">info@primundus.de</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
