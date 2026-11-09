'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KNOPF_ANGEBOT } from '@/components/calculator/FormularPortal';

/** Kostenvergleich (Anker #kostenvergleich, Sitelink). Registry #155 (Martin 09.11.2026: „Pass das mal alles an. Genau so“):
 *  im Look von Formular und Portal eine weiße Karte mit den zwei Zahlen statt zweier Kästen mit Symbol-Listen. Wortlaut,
 *  Zahlen und Hinweis unverändert; der Satz „deutlich günstiger als ein Pflegeheimplatz“ bleibt (Martin 24./26.10.). */
export function ComparisonSection() {
  return (
    <section id="kostenvergleich" className="scroll-mt-20 px-5 py-12 md:py-16">
      <div className="mx-auto max-w-[560px] md:max-w-[900px] lg:max-w-[1100px]">
        <p className="text-[14px] font-bold uppercase tracking-wider text-[#A89279] mb-2">Kostenvergleich</p>
        <h2 className="text-[26px] md:text-[32px] lg:text-[38px] leading-[1.25] font-bold text-[#3D3D3D] mb-3">
          24h-Pflege vs. Pflegeheim
        </h2>
        <p className="text-[16px] leading-[1.55] text-[#5A5A5A] mb-6 md:mb-8">
          Die 24-Stunden-Betreuung zu Hause ist nicht nur persönlicher, sondern auch deutlich günstiger als ein Pflegeheimplatz.
        </p>

        <div className="rounded-[20px] bg-white p-5 md:p-7">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
            <div>
              <dt className="text-[14px] leading-snug text-[#6B6B6B]"><span className="block text-[16px] font-semibold text-[#3D3D3D]">Pflegeheim</span>Durchschnittlicher Eigenanteil pro Monat</dt>
              <dd className="mt-1.5 text-[26px] md:text-[34px] font-bold tabular-nums text-[#8B8B8B]">3.364 €</dd>
            </div>
            <div className="border-t border-[#F0EDE8] pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6 md:pl-8">
              <dt className="text-[14px] leading-snug text-[#6B6B6B]"><span className="block text-[16px] font-semibold text-[#3D3D3D]">24h-Pflege zu Hause</span>Selbst zu tragen bei Pflegegrad 3</dt>
              <dd className="mt-1.5 text-[26px] md:text-[34px] font-bold tabular-nums text-[#3D7A5C]">ab ca. 923 €</dd>
            </div>
          </dl>
          {/* Wie primundus.de (17.09.2026): 2.150 € − 599 € Pflegegeld − 295 € Entlastungsbudget − 333 € Steuer = 923 €.
              3.364 − 923 = 2.441 → „rund 2.440" beim Grundpreis, kein „bis zu" (§5-UWG-Angriffsfläche). */}
          <p className="mt-4 border-t border-[#F0EDE8] pt-4 text-[16px] font-semibold text-[#2A5C3F]">
            Beim Grundpreis rund 2.440 € weniger im Monat
          </p>
        </div>

        <p className="mt-3 text-[13px] leading-[1.5] text-[#6B6B6B]">
          <strong className="font-semibold text-[#3D3D3D]">Hinweis:</strong> Pflegeheim: bundesweiter Durchschnitt (vdek, Stand 1. Juli 2026).
          24-Stunden-Pflege: eine Person, nach Pflegegeld, Entlastungsbudget und Steuerermäßigung, zzgl. An- und Abreise.
          Mit unserem Kostenrechner erhalten Sie eine individuelle Berechnung für Ihre Situation.
        </p>

        {/* Knopf an der linken Kante, Form wie der Hero-Knopf (Registry #160). */}
        <div className="mt-6">
          <button
            onClick={() => openCalculator('vergleich')}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-[#E76F63] px-4 sm:px-8 py-[18px] text-[16px] min-[375px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)] transition-all duration-200 hover:bg-[#D65E52]"
          >
            {KNOPF_ANGEBOT}{"\u00a0"}→
          </button>
        </div>
      </div>
    </section>
  );
}
