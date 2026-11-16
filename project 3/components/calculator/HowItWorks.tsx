'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KNOPF_ANGEBOT } from '@/components/calculator/FormularPortal';
import { AUGENBRAUE, ABSCHNITT, H2, KNOPF, SPALTE } from '@/components/calculator/startStil';

/** ENTWURF 16.11.2026 (Martin: „die steps/ablauf nicht optimal … im portal macht das ja sinn, aber hier ist das nicht richtig
 *  logisch und gut geschrieben auf der website“): eigener Wortlaut für die Startseite statt der Portal-Schritte
 *  (AblaufSchritte, Registry #154). Jeder Schritt hat Titel und Satz, alle drei Zahlen gleich (die Koralle-Eins ist im Portal
 *  „Ihr nächster Schritt“ und wirkte hier wie ein Formularfortschritt). Kontaktschritt bleibt genannt (Lehre 23.09.).
 *  Der Mustervertrag-Satz unter der Karte ist entfallen (Martin: „warum ist der Mustervertrag plötzlich da verlinkt??“). */
const SCHRITTE = [
  {
    titel: 'Preis und Pflegekräfte sofort sehen',
    text: 'Sie beantworten ein paar kurze Fragen und geben Ihre Kontaktdaten ein. Sofort danach sehen Sie Ihren Monatspreis mit allen Zuschüssen und die passenden Pflegekräfte.',
  },
  {
    titel: 'Bewerbungen innerhalb von 60 Minuten',
    text: 'Beschreiben Sie kurz, was Ihr Angehöriger braucht. Dann bewerben sich passende Pflegekräfte direkt bei Ihnen.',
  },
  {
    titel: 'In Ruhe auswählen und starten',
    text: 'Sie wählen Ihre Pflegekraft, erst dann unterschreiben Sie. Den Rest übernehmen wir, die Anreise ist schon ab 3 Tagen möglich.',
  },
] as const;

export function HowItWorks() {
  return (
    <section id="ablauf" className={`scroll-mt-20 ${ABSCHNITT}`}>
      <div className={SPALTE}>
        <p className={AUGENBRAUE}>So funktioniert&apos;s</p>
        <h2 className={H2}>In 2 Minuten zu Ihrem persönlichen Angebot</h2>

        {/* Am Handy eine Karte mit drei Zeilen (Seite nicht länger als bisher), ab lg drei Karten nebeneinander. */}
        <ol className="mt-8 rounded-[20px] bg-white px-5 lg:mt-10 lg:grid lg:grid-cols-3 lg:gap-5 lg:bg-transparent lg:px-0">
          {SCHRITTE.map((s, i) => (
            <li key={s.titel} className="flex gap-4 border-b border-[#F0EDE8] py-5 last:border-b-0 lg:block lg:rounded-[20px] lg:border-b-0 lg:bg-white lg:p-7">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#3D2314] text-[15px] font-bold text-white lg:h-10 lg:w-10 lg:text-[16px]" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[17px] font-bold leading-snug text-[#1C1C1C] lg:mt-4 lg:text-[19px]">{s.titel}</h3>
                <p className="mt-1.5 text-[15.5px] leading-[1.55] text-[#5A5A5A] lg:mt-2 lg:text-[16px] lg:leading-[1.6]">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 lg:mt-10">
          <button onClick={() => openCalculator('ablauf')} className={KNOPF}>
            {KNOPF_ANGEBOT}{" "}→
          </button>
        </div>
      </div>
    </section>
  );
}
