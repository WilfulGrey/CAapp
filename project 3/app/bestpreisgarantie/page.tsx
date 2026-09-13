import Link from 'next/link';
import type { Metadata } from 'next';
import { Header } from '@/components/calculator/Header';
import { Footer } from '@/components/calculator/Footer';
import { GARANTIE } from '@/lib/kraefte-vorschau';

export const metadata: Metadata = {
  title: 'Bestpreisgarantie | PRIMUNDUS',
  description: 'Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot. Was das heißt und wie es abläuft.',
  alternates: { canonical: '/bestpreisgarantie' },
};

/**
 * Die Seite hinter „Mehr Infos" (Martin 12.09.2026) — Ziel der Links aus
 * Angebotsmail, Kundenportal und Sitelink. Texte aus lib/kraefte-vorschau.ts
 * (GARANTIE), damit Pop-up, Mail, Portal und diese Seite nie auseinanderlaufen.
 *
 * Umbau 13.09. (Martin: „zu kleiner Text, alles unproportional, Buttontexte
 * mit Umbrüchen"): gleicher Kopf und Fuß wie der Rechner, Lesespalte 760 px,
 * Schriftgrößen wie im Hero (h1 32/44, Fließtext 19/21), Knöpfe mit
 * whitespace-nowrap und untereinander, bis sie nebeneinander passen.
 */
export default function BestpreisgarantiePage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main>
        <section className="bg-[#F8F7F5] px-5 pt-8 pb-12 md:pt-12 md:pb-16">
          <div className="mx-auto max-w-[760px]">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[15px] md:text-[16px] text-[#6B6B6B] hover:text-[#1a1a1a] transition-colors mb-8"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Zurück zum Kostenrechner
            </Link>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={256} className="h-[88px] md:h-[112px] w-auto mb-7 md:mb-9" />

            <h1 className="text-[32px] md:text-[44px] leading-[1.15] font-bold text-[#1a1a1a] mb-5">{GARANTIE.zusage}</h1>
            <p className="text-[19px] md:text-[21px] leading-relaxed text-[#3D3D3D]">{GARANTIE.warum}</p>
          </div>
        </section>

        <section className="px-5 py-12 md:py-16">
          <div className="mx-auto max-w-[760px]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7 rounded-2xl border border-[#E5DFD6] bg-white p-6 md:p-8 shadow-sm mb-12 md:mb-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={GARANTIE.fotoSrc}
                alt={GARANTIE.beraterin}
                className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover object-top border-4 border-[#F8F7F5] shadow-sm flex-shrink-0"
              />
              <div>
                <p className="text-[18px] md:text-[20px] leading-relaxed text-[#1a1a1a]">{GARANTIE.ablauf}</p>
                <p className="mt-2 text-[15px] md:text-[16px] text-[#6B6B6B]">
                  {GARANTIE.beraterin} · {GARANTIE.rolle}
                </p>
              </div>
            </div>

            <h2 className="text-[24px] md:text-[28px] font-bold text-[#1a1a1a] mb-5">{GARANTIE.aufklappen}</h2>
            <ul className="space-y-3.5 mb-12 md:mb-14">
              {GARANTIE.bedingungen.map((b) => (
                <li key={b} className="flex items-start gap-3.5 text-[18px] md:text-[19px] leading-snug text-[#1a1a1a]">
                  <span className="mt-[1px] inline-flex w-6 h-6 items-center justify-center rounded-full bg-[#E4F3EB] flex-shrink-0" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
              <Link
                href="/?start=1&src=garantie"
                className="inline-flex w-full md:w-auto items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#E76F63] hover:bg-[#D65E52] px-8 py-4 text-[17px] md:text-[18px] font-bold text-white shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Preis &amp; Pflegekräfte ansehen
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <a
                href="tel:+4989200000830"
                className="inline-flex w-full md:w-auto items-center justify-center gap-2.5 whitespace-nowrap rounded-xl border-2 border-[#E5DFD6] bg-white hover:border-[#B5A184] px-6 py-4 text-[17px] md:text-[18px] font-semibold text-[#1a1a1a] transition-colors"
              >
                <svg className="w-5 h-5 text-[#8B7355] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                089 200 000 830
              </a>
            </div>
            <p className="mt-4 text-[15px] md:text-[16px] text-[#6B6B6B]">Kostenlos und unverbindlich. Ihren Preis sehen Sie in 2 Minuten.</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
