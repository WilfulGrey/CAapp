'use client';

import Link from 'next/link';
import Image from 'next/image';
import { cookieConsent } from '@/lib/cookie-consent';

export function Footer() {
  const handleCookieSettings = () => {
    cookieConsent.revokeConsent();
    window.location.reload();
  };
  return (
    <footer className="bg-[#3D3D3D] text-white">
      <div className="max-w-[1200px] mx-auto px-5 py-12">
        <div className="flex justify-between items-start mb-10">
          <div>
            <Link href="/">
              <h3 className="text-[28px] font-bold mb-4 hover:text-gray-300 transition-colors cursor-pointer">Primundus</h3>
            </Link>
            <p className="text-[16px] leading-[1.6] text-gray-300 max-w-md">
              24-Stunden-Pflege & Betreuung mit über 20 Jahren Erfahrung.
            </p>
          </div>
          <div className="flex-shrink-0">
            <Image
              src="/images/primundus_testsieger-2021.webp"
              alt="Service Champions"
              width={100}
              height={120}
              className="rounded-lg"
            />
          </div>
        </div>

        <div className="mb-8">
          <h4 className="text-[18px] font-bold mb-4 uppercase tracking-wider text-gray-400">
            Kontakt
          </h4>
          <ul className="space-y-3">
            <li>
              <a href="tel:+4989200000830" className="text-[20px] font-bold text-white hover:text-gray-300 transition-colors">
                089 200 000 830
              </a>
            </li>
            <li>
              <a href="mailto:info@primundus.de" className="text-[16px] text-gray-300 hover:text-white transition-colors">
                info@primundus.de
              </a>
            </li>
            <li className="text-[14px] text-gray-400 pt-2">
              Mo-So: 8-20 Uhr
            </li>
          </ul>
        </div>

        <div className="border-t border-gray-600 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} Primundus
            </p>
            <div className="flex gap-6">
              <Link href="/datenschutz" className="text-sm text-gray-400 hover:text-white transition-colors">
                Datenschutz
              </Link>
              <Link href="/impressum" className="text-sm text-gray-400 hover:text-white transition-colors">
                Impressum
              </Link>
              <button
                onClick={handleCookieSettings}
                className="text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Cookie-Einstellungen
              </button>
              <Link href="/admin" className="text-sm text-gray-400 hover:text-white transition-colors">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
