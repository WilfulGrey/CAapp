'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KennzahlenZeile, KNOPF_ANGEBOT, KOPF_FRAGEN, KostenfreiZeile } from '@/components/calculator/FormularPortal';
import { ABSCHNITT, H2, SPALTE } from '@/components/calculator/startStil';
import type { SterneStand } from '@/lib/sterne-zeile';

const PHONE_HREF = 'tel:+4989200000830';
const WHATSAPP_HREF = 'https://wa.me/4989200000830';

/** Schluss der Startseite (Registry #155/#160: hell, Titel über der Karte, Knopf, „100 % kostenfrei“, Kennzahlen, Marta).
 *  ENTWURF 16.11.2026 (Martin: „sieht als Desktop nicht schön aus“): Knopf-Karte und Marta ab lg nebeneinander über die volle
 *  Breite, gleich hoch; vorher beide 640 px schmal links, rechts daneben die halbe Seite leer. Marta wie auf primundus.de
 *  („Lieber erst sprechen?“-Band): größeres Foto, Erreichbarkeit, Nummer sichtbar. */
export function FinalCTA({ bewertung = null }: { bewertung?: SterneStand | null }) {
  return (
    <section className={`${ABSCHNITT} pb-14 md:pb-20`}>
      <div className={SPALTE}>
        <h2 className={`${H2} !mt-0`}>{KOPF_FRAGEN}</h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="flex flex-col justify-center rounded-[20px] bg-white px-4 py-7 md:px-8">
            <button
              onClick={() => openCalculator('final_cta')}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#E76F63] px-2 py-[18px] text-[15px] min-[375px]:text-[16px] min-[400px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)] transition-all duration-200 hover:bg-[#D65E52]"
            >
              {KNOPF_ANGEBOT}{" "}→
            </button>
            <div className="mt-3"><KostenfreiZeile /></div>
            <div className="mt-4 border-t border-[#F0EDE8] pt-4">
              <KennzahlenZeile bewertung={bewertung} />
            </div>
          </div>

          <div className="flex flex-col justify-center rounded-[20px] bg-white px-4 py-6 md:px-8 md:py-7">
            <p className="text-[17px] font-bold leading-tight text-[#1C1C1C] lg:text-[19px]">Lieber direkt Kontakt aufnehmen?</p>
            <div className="mt-4 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/marta-kapcio.jpg" alt="Marta Kapcio" className="h-14 w-14 flex-none rounded-full border border-[#E9E9EB] object-cover object-top lg:h-[72px] lg:w-[72px]" loading="lazy" />
              <div>
                <p className="text-[16px] font-semibold text-[#1C1C1C]">Marta Kapcio</p>
                <p className="text-[15px] text-[#8B7355]">Ihre Beraterin · täglich 8–20 Uhr</p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <a href={PHONE_HREF} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E9E9EB] bg-white px-4 py-3 text-[15px] font-semibold text-[#3D2B1F] transition-colors hover:bg-gray-50">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
                </svg>
                <span className="lg:hidden">Anrufen</span><span className="hidden lg:inline">089 200 000 830</span>
              </a>
              <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#1FB854]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" />
                </svg>
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
