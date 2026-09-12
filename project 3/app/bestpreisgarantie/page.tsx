import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { GARANTIE } from '@/lib/kraefte-vorschau';

export const metadata: Metadata = {
  title: 'Bestpreisgarantie | PRIMUNDUS',
  description: 'Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot. Was das heißt und wie es abläuft.',
  alternates: { canonical: '/bestpreisgarantie' },
};

/**
 * Die Seite hinter „Mehr Infos" (Martin 12.09.2026): Siegel, die eine Zusage,
 * Ablauf, was „vergleichbar" heißt, warum wir das können — und der Weg in den
 * Rechner. Texte aus lib/kraefte-vorschau.ts (GARANTIE), damit Pop-up, Mail,
 * Portal und diese Seite nie auseinanderlaufen.
 */
export default function BestpreisgarantiePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück zum Kostenrechner
        </Link>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} width={900} height={296} className="h-[84px] w-auto mb-6" />

        <h1 className="text-[28px] md:text-[34px] font-bold leading-tight text-[#1a1a1a] mb-3">{GARANTIE.zusage}</h1>
        <p className="text-[17px] leading-relaxed text-[#3D3D3D] mb-8">{GARANTIE.warum}</p>

        <div className="rounded-2xl border border-[#E5DFD6] bg-[#FAF8F5] p-6 mb-8">
          <div className="flex items-center gap-4 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={GARANTIE.fotoSrc} alt={GARANTIE.beraterin} className="w-14 h-14 rounded-full object-cover object-top border-2 border-white shadow-sm flex-shrink-0" />
            <div>
              <p className="text-[15px] font-semibold text-[#1a1a1a]">{GARANTIE.beraterin}</p>
              <p className="text-[13px] text-[#6B6B6B]">{GARANTIE.rolle}</p>
            </div>
          </div>
          <p className="text-[16px] leading-relaxed text-[#1a1a1a]">{GARANTIE.ablauf}</p>
        </div>

        <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-3">{GARANTIE.aufklappen}</h2>
        <ul className="space-y-2.5 mb-10">
          {GARANTIE.bedingungen.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[16px] leading-snug text-[#1a1a1a]">
              <span className="mt-[3px] inline-flex w-5 h-5 items-center justify-center rounded-full bg-[#E4F3EB] flex-shrink-0" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/?start=1&src=garantie" className="inline-flex items-center justify-center rounded-full bg-[#E76F63] px-7 py-3.5 text-[16px] font-bold text-white hover:bg-[#d95f53] transition-colors">
            Preis &amp; Pflegekräfte ansehen →
          </Link>
          <a href="tel:+4989200000830" className="inline-flex items-center justify-center rounded-full border border-[#E5DFD6] bg-white px-7 py-3.5 text-[16px] font-semibold text-[#1a1a1a] hover:border-[#B5A184] transition-colors">
            Lieber sprechen? 089 200 000 830
          </a>
        </div>
      </div>
    </div>
  );
}
