import Link from 'next/link';
import type { Metadata } from 'next';
import { Header } from '@/components/calculator/Header';
import { Footer } from '@/components/calculator/Footer';
import { BestpreisInhalt } from '@/components/calculator/BestpreisInhalt';
import { GARANTIE } from '@/lib/kraefte-vorschau';

export const metadata: Metadata = {
  title: 'Bestpreisgarantie | PRIMUNDUS',
  description: 'Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot. Was das heißt und wie es abläuft.',
  alternates: { canonical: '/bestpreisgarantie' },
};

/**
 * Die Seite hinter „Mehr Infos" — Ziel der Links aus Angebotsmail, Kundenportal
 * und Sitelink. Sie zeigt GENAU das Pop-up der Startseite (BestpreisInhalt),
 * nur als Karte auf der Seite, Bedingungen offen, und statt „Verstanden" der
 * Weg in den Rechner (Martin 13.09.2026: „das sollte ja schon gleich sein").
 */
export default function BestpreisgarantiePage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="bg-[#F8F7F5] px-5 py-8 md:py-14">
        <div className="mx-auto max-w-[680px]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[15px] md:text-[16px] text-[#6B6B6B] hover:text-[#1a1a1a] transition-colors mb-6 md:mb-8"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Zurück zum Kostenrechner
          </Link>

          <div className="bg-white rounded-3xl shadow-xl">
            <BestpreisInhalt
              titel={<h1 className="text-[22px] sm:text-[28px] md:text-[34px] font-bold text-[#1a1a1a] leading-tight">{GARANTIE.titel}</h1>}
              aufgeklappt
              gross
              weiterHref="/?start=1&src=garantie"
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
