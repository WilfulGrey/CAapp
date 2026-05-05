"use client";

import { CircleHelp as HelpCircle, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HelpDialog } from "./HelpDialog";

const WA_URL = `https://wa.me/4989200000830?text=${encodeURIComponent("Hallo Frau Wysocki, ich habe eine Rückfrage:")}`;

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

export function Header() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <header className="w-full border-b border-[#E5E3DF] bg-white/95 backdrop-blur-lg sticky top-0 z-50 shadow-sm">
        <div className="max-w-[520px] md:max-w-[720px] lg:max-w-[1200px] mx-auto px-5 h-16 md:h-18 lg:h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/images/primundus_logo_header.webp"
              alt="Primundus Logo"
              width={160}
              height={40}
              className="h-8 md:h-10 lg:h-11 w-auto"
              priority
            />
          </Link>

          <div className="flex items-center gap-3 md:gap-4">
            {/* Desktop: Phone with Ilka's Image */}
            <a
              href="tel:+4989200000830"
              className="hidden md:flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-lg bg-[#F8F7F5] hover:bg-[#8B7355] hover:text-white transition-all duration-200 group"
            >
              <Image
                src="/images/ilka-wysocki_pm-mallorca.webp"
                alt="Ilka Wysocki"
                width={40}
                height={40}
                className="rounded-full w-10 h-10 object-cover"
                style={{ objectPosition: '50% 20%' }}
              />
              <Phone className="w-4 h-4 text-[#8B7355] group-hover:text-white transition-colors" />
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 group-hover:text-white/80 leading-tight">Ilka Wysocki</span>
                <span className="text-sm font-semibold text-[#3D2B1F] group-hover:text-white leading-tight">089 200 000 830</span>
              </div>
            </a>

            {/* Mobile: WhatsApp icon */}
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="md:hidden flex w-10 h-10 rounded-full bg-[#25D366] hover:bg-[#20C05A] transition-all duration-200 items-center justify-center text-white"
              aria-label="WhatsApp"
            >
              <WhatsAppIcon />
            </a>

            {/* Mobile: Anfrage icon (scroll to form) */}
            <button
              onClick={() => {
                const el = document.getElementById('calculator-form');
                if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }
              }}
              className="md:hidden flex w-10 h-10 rounded-full bg-[#E76F63] hover:bg-[#D65E52] transition-all duration-200 items-center justify-center text-white"
              aria-label="Zum Formular"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>

            <button
              onClick={() => setHelpOpen(true)}
              className="flex w-10 h-10 rounded-full bg-[#F8F7F5] hover:bg-[#E5E3DF] transition-all duration-200 items-center justify-center group"
              aria-label="Hilfe"
            >
              <HelpCircle className="w-5 h-5 text-[#8B8B8B] group-hover:text-[#8B7355] transition-colors duration-200" />
            </button>
          </div>
        </div>
      </header>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
