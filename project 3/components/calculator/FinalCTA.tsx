'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KNOPF_ANGEBOT } from '@/components/calculator/FormularPortal';
import { GARANTIE_OEFFNEN_EVENT } from '@/components/calculator/BestpreisSiegelLink';
import { BewertungsZeile } from '@/components/calculator/BewertungsZeile';
import { ProduktBuehne } from '@/components/calculator/ProduktBuehne';
import { AUGENBRAUE, KNOPF } from '@/components/calculator/startStil';
import { GARANTIE } from '@/lib/kraefte-vorschau';
import { PORTAL_PUNKTE } from '@/lib/hero-punkte';
import type { SterneStand } from '@/lib/sterne-zeile';

/** Schluss der Startseite. ENTWURF 16.11.2026 (Martin: „diesen Schlusspunkt … das aufwendige, schöne Teil, was wir haben mit
 *  diesem Handy da drin“): Aufbau, Titel und Text wie der Schluss von primundus.de (SchlussAufruf + MartaBand dort), rechts die
 *  Produktbühne. Unter dem Knopf dieselben Punkte wie im Hero und im Portal (Martin: „die Punkte darunter würde ich ändern, so
 *  wie wir sie jetzt überall haben“); primundus.de zeigt dort noch die Punkte von vor dem 09.11. */
const TITEL = 'In 2 Minuten wissen\u00A0Sie, was es kostet und wer zu Ihnen passt.';
const TEXT = 'Sie beantworten ein paar Fragen zur Pflegesituation. Danach sehen Sie den Monatspreis und die Betreuungskräfte, die dafür in Frage kommen, mit Foto, Erfahrung und Deutschniveau.';
const PK_FOTOS = ['/images/caregivers/pk-1.jpg', '/images/caregivers/pk-2.jpg', '/images/caregivers/pk-3.jpg', '/images/caregivers/pk-4.jpg'];

function Haken() {
  return (
    <svg className="h-[18px] w-[18px] flex-none text-[#3D7A5C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** „Lieber erst sprechen?“ wie das MartaBand von primundus.de. */
function MartaBand() {
  const knopf = 'inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-full px-5 text-[16.5px] font-bold transition-colors lg:px-6';
  return (
    <div className="border-t border-[#E5E3DF] bg-[#F2EDE6] px-5">
      <div className="mx-auto flex max-w-[1216px] flex-col gap-6 py-10 md:py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="flex items-center gap-4 md:gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/marta-kapcio-gesicht.jpg" alt="Marta Kapcio" width={88} height={88} loading="lazy" className="h-[68px] w-[68px] flex-none rounded-full object-cover md:h-[88px] md:w-[88px]" />
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[20px] font-extrabold leading-[1.15] tracking-[-0.025em] text-[#1C1C1C] min-[390px]:text-[22px] md:text-[28px]">Lieber erst sprechen?</p>
            <p className="mt-1.5 text-[15.5px] leading-[1.45] text-[#2E2E2E] min-[390px]:text-[16px] md:text-[17px]">
              Marta Kapcio, Ihre Beraterin · <span className="whitespace-nowrap">täglich 8–20 Uhr</span>
            </p>
          </div>
        </div>
        <div className="grid flex-none grid-cols-2 gap-3 sm:flex">
          <a href="tel:+4989200000830" aria-label="Marta Kapcio anrufen: 089 200 000 830" className={`${knopf} border-2 border-[#1C1C1C]/15 bg-white text-[#1C1C1C] hover:border-[#8B7355] sm:min-w-[170px]`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
            </svg>
            <span className="lg:hidden">Anrufen</span>
            <span className="hidden whitespace-nowrap lg:inline">089 200 000 830</span>
          </a>
          <a href="https://wa.me/4989200000830" target="_blank" rel="noopener noreferrer" className={`${knopf} bg-[#25D366] text-white hover:bg-[#1FB854] sm:min-w-[170px]`}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" />
            </svg>
            <span className="lg:hidden">WhatsApp</span>
            <span className="hidden whitespace-nowrap lg:inline">WhatsApp schreiben</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export function FinalCTA({ bewertung = null }: { bewertung?: SterneStand | null }) {
  return (
    <aside aria-labelledby="schluss-titel">
      <div className="bg-white px-5">
        <div className="mx-auto grid max-w-[1216px] gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] xl:gap-16">
          <div className="min-w-0">
            <p className={AUGENBRAUE}>Kostenlos und unverbindlich</p>
            <h2 id="schluss-titel" className="mt-4 text-[clamp(30px,4vw,48px)] font-extrabold leading-[1.06] tracking-[-0.035em] text-[#1C1C1C] [text-wrap:balance]">{TITEL}</h2>
            <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.6] text-[#2E2E2E]">{TEXT}</p>

            {/* Knopf, Plakette, Punkte und Sterne in der Reihenfolge des Hero (MultiStepForm, Modus cta). */}
            <div className="mt-8 max-w-md">
              <button onClick={() => openCalculator('final_cta')} className={KNOPF}>
                {KNOPF_ANGEBOT}{"\u00a0"}→
              </button>
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={() => openCalculator('final_badge')} aria-label="Passende Pflegekräfte sofort verfügbar — jetzt ansehen"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#A8D5B0] bg-[#F0F7F1] py-1 pl-1.5 pr-3 transition-all duration-200 hover:border-[#7FBF8C] hover:bg-[#E7F3E9]">
                  <span className="flex">
                    {PK_FOTOS.map((src, i) => (
                      <span key={src} className={`relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full border-2 border-white ${i > 0 ? '-ml-2' : ''}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                      </span>
                    ))}
                  </span>
                  <span className="text-[12px] text-[#3A6B42]">Passende Pflegekräfte sofort verfügbar</span>
                  <span aria-hidden="true" className="text-[13px] leading-none text-[#3A6B42]">→</span>
                </button>
              </div>
              <ul className="mt-5 flex flex-col gap-3 lg:pl-1.5">
                <li className="flex items-center gap-2.5 text-[16px] leading-snug text-[#3D3D3D]">
                  <Haken />
                  <span>
                    {GARANTIE.wort}{' '}
                    <button type="button" onClick={() => window.dispatchEvent(new Event(GARANTIE_OEFFNEN_EVENT))}
                      className="font-semibold text-[#1E5C3A] underline underline-offset-[3px]" aria-haspopup="dialog">Mehr Infos</button>
                  </span>
                </li>
                {PORTAL_PUNKTE.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-[16px] leading-snug text-[#3D3D3D]"><Haken /><span>{p}</span></li>
                ))}
              </ul>
              <BewertungsZeile stand={bewertung} />
            </div>
          </div>
          <ProduktBuehne />
        </div>
      </div>
      <MartaBand />
    </aside>
  );
}
