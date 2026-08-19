"use client";

import { CircleHelp as HelpCircle, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HelpDialog } from "./HelpDialog";

export function Header() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <header className="w-full border-b border-[#E5E3DF] bg-white/95 backdrop-blur-lg sticky top-0 z-50 shadow-sm">
        <div className="max-w-[520px] md:max-w-[720px] lg:max-w-[1200px] mx-auto px-5 h-16 md:h-18 lg:h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {/* Unschaerfe-Fix (Martin 15.08.): width/height waren mit
                160x40 (4:1) angegeben, die Datei ist aber 600x106 (5,66:1).
                Next leitet daraus die srcset-Groessen ab und lieferte fuer
                den ~181px breiten Slot nur eine 320px-Variante — auf einem
                3x-Display 1,8-fach hochskaliert = sichtbar unscharf. Jetzt
                die echten Intrinsic-Masse + sizes, damit die 640er-Variante
                gezogen wird (~3,4x). */}
            <Image
              src="/images/primundus_logo_header.webp"
              alt="Primundus Logo"
              width={600}
              height={106}
              sizes="(max-width: 767px) 190px, (max-width: 1023px) 230px, 250px"
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
                src="/images/ilka-wysocki-2026.webp"
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

            {/* Mobile: EIN Telefon-Icon statt WhatsApp + Briefumschlag
                (Martin 15.08.). Gleiche Nummer wie der Desktop-Block;
                WhatsApp bleibt über den Float-Button unten rechts
                erreichbar, zum Formular führen die CTAs auf der Seite. */}
            <a
              href="tel:+4989200000830"
              className="md:hidden flex w-10 h-10 rounded-full bg-[#E76F63] hover:bg-[#D65E52] transition-all duration-200 items-center justify-center text-white"
              aria-label="Anrufen: 089 200 000 830"
            >
              <Phone className="w-5 h-5" />
            </a>

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
