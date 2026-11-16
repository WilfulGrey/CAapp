'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KNOPF_ANGEBOT } from '@/components/calculator/FormularPortal';
import { ABSCHNITT, AUGENBRAUE, EINLEITUNG, H2, KNOPF, SPALTE } from '@/components/calculator/startStil';

/** Kostenvergleich (Anker #kostenvergleich, Sitelink).
 *  ENTWURF 16.11.2026: zwei Karten mit Punkten wie primundus.de (HeimVergleich), Punkte wörtlich von dort; Einleitung des
 *  Rechners („deutlich günstiger“, Martin 24./26.10.), Zahlen und Hinweis unverändert. Die Punkte erst ab md, damit die
 *  Seite am Handy nicht länger wird. */
const HEIM = ['Umzug in eine fremde Umgebung', 'Doppelzimmer möglich', 'Abläufe nach Dienstplan', 'Pflegepersonal für viele Bewohner'];
const ZUHAUSE = ['Im gewohnten Zuhause bleiben', '1:1-Betreuung, bei Bedarf auch nachts', 'Familie bleibt in der Nähe', 'Individuelle Tagesgestaltung'];

function Kreuz() {
  return (
    <svg className="mt-[3px] h-[18px] w-[18px] flex-none text-[#A1A1A1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function Haken() {
  return (
    <svg className="mt-[3px] h-[18px] w-[18px] flex-none text-[#3D7A5C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ComparisonSection() {
  return (
    <section id="kostenvergleich" className={`scroll-mt-20 ${ABSCHNITT}`}>
      <div className={SPALTE}>
        <p className={AUGENBRAUE}>Kostenvergleich</p>
        <h2 className={H2}>24h-Pflege vs. Pflegeheim</h2>
        <p className={EINLEITUNG}>
          Die 24-Stunden-Betreuung zu Hause ist nicht nur persönlicher, sondern auch deutlich günstiger als ein Pflegeheimplatz.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-[20px] bg-white p-6 lg:p-7">
            <p className="text-[21px] font-bold text-[#1C1C1C]">Pflegeheim</p>
            <ul className="mt-5 hidden gap-2.5 md:grid">
              {HEIM.map((p) => <li key={p} className="flex gap-3 text-[16px] text-[#2E2E2E]"><Kreuz /><span>{p}</span></li>)}
            </ul>
            <div className="mt-4 border-t border-[#ECE9E4] pt-4 md:mt-6 md:pt-5">
              <p className="text-[15px] text-[#5A5A5A]">Durchschnittlicher Eigenanteil pro Monat</p>
              <p className="mt-1 text-[36px] font-extrabold tabular-nums tracking-[-0.02em] text-[#8B8B8B] lg:text-[40px]">3.364 €</p>
            </div>
          </div>
          <div className="relative rounded-[20px] bg-white p-6 lg:p-7">
            <span className="absolute -top-3.5 left-6 rounded-full bg-[#3D7A5C] px-4 py-1 text-[12.5px] font-bold uppercase tracking-[0.08em] text-white lg:left-7">Empfohlen</span>
            <p className="text-[21px] font-bold text-[#1C1C1C]">24h-Pflege zu Hause</p>
            <ul className="mt-5 hidden gap-2.5 md:grid">
              {ZUHAUSE.map((p) => <li key={p} className="flex gap-3 text-[16px] text-[#1C1C1C]"><Haken /><span>{p}</span></li>)}
            </ul>
            <div className="mt-4 border-t border-[#ECE9E4] pt-4 md:mt-6 md:pt-5">
              <p className="text-[15px] text-[#5A5A5A]">Selbst zu tragen bei Pflegegrad 3</p>
              {/* 2.150 € − 599 € Pflegegeld − 295 € Entlastungsbudget − 333 € Steuer = 923 €; 3.364 − 923 = 2.441 → „rund 2.440“. */}
              <p className="mt-1 text-[36px] font-extrabold tabular-nums tracking-[-0.02em] text-[#2A5C3F] lg:text-[40px]">ab ca. 923 €</p>
              <p className="text-[15px] font-semibold text-[#2A5C3F]">Beim Grundpreis rund 2.440 € weniger im Monat</p>
            </div>
          </div>
        </div>

        <p className="mt-5 max-w-[44rem] text-[14px] leading-[1.6] text-[#5A5A5A]">
          <strong className="font-semibold text-[#2E2E2E]">Hinweis:</strong> Pflegeheim: bundesweiter Durchschnitt (vdek, Stand 1. Juli 2026).
          24-Stunden-Pflege: eine Person, nach Pflegegeld, Entlastungsbudget und Steuerermäßigung, zzgl. An- und Abreise.
          Mit unserem Kostenrechner erhalten Sie eine individuelle Berechnung für Ihre Situation.
        </p>

        <div className="mt-8">
          <button onClick={() => openCalculator('vergleich')} className={KNOPF}>
            {KNOPF_ANGEBOT}{" "}→
          </button>
        </div>
      </div>
    </section>
  );
}
