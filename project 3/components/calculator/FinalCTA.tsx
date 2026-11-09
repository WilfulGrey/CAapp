'use client';

import { openCalculator } from '@/lib/scroll-to-calculator';
import { KennzahlenZeile, KNOPF_ANGEBOT, KOPF_FRAGEN, KostenfreiZeile } from '@/components/calculator/FormularPortal';
import { PersonalContact } from '@/components/calculator/PersonalContact';
import type { SterneStand } from '@/lib/sterne-zeile';

/** Schluss der Startseite (Registry #155, Martin 09.11.2026: „Pass das mal alles an. Genau so“): hell wie Formular und
 *  Portal statt des braunen Bands. Titel wie die H1 und der Titel über den Fragen, Knopf wie oben, darunter „100 % kostenfrei
 *  & unverbindlich“ und die Kennzahlen wie im letzten Schritt des Formulars, dann Marta (einziger Kontaktkasten der Seite).
 *  Registry #160 (Martin 09.11.: „Überschriften linksbündig“): Spalte wie die Abschnitte darüber (eine linke Kante), Karte und
 *  Marta bleiben 640 px breit und stehen links; Titel links wie im Formular, Knopf über die volle Kartenbreite in der Form des
 *  Hero-Knopfs, „100 % kostenfrei“ darunter mittig wie im Kontaktschritt; Martas Kasten ohne Rand wie die übrigen Karten. */
export function FinalCTA({ bewertung = null }: { bewertung?: SterneStand | null }) {
  return (
    <section className="px-5 pt-4 pb-14 md:pb-20">
      <div className="mx-auto max-w-[560px] md:max-w-[900px] lg:max-w-[1100px]">
        <div className="grid max-w-[640px] gap-4">
          <div className="rounded-[20px] bg-white px-4 py-7 md:px-8">
            <h2 className="text-[26px] md:text-[32px] leading-[1.25] font-bold text-[#3D3D3D] mb-6">{KOPF_FRAGEN}</h2>
            {/* px-1 statt px-4 wie oben: die Karte ist am Handy 32 px schmaler als die Spalte, und „… ansehen →“ braucht bei
                17 px 291 px Platz (bei 375 px Breite sonst zweizeilig). Der Text steht ohnehin mittig im vollen Knopf. */}
            <button
              onClick={() => openCalculator('final_cta')}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#E76F63] px-1 py-[18px] text-[16px] min-[375px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)] transition-all duration-200 hover:bg-[#D65E52]"
            >
              {KNOPF_ANGEBOT}{"\u00a0"}→
            </button>
            <div className="mt-3"><KostenfreiZeile /></div>
            <div className="mt-4 border-t border-[#F0EDE8] pt-4">
              <KennzahlenZeile bewertung={bewertung} />
            </div>
          </div>
          {/* Überschrift wie im bisherigen Schluss; ohne Satz, sonst stünde „unverbindlich“ zweimal untereinander. */}
          <PersonalContact headline="Lieber direkt Kontakt aufnehmen?" body="" ohneRahmen />
        </div>
      </div>
    </section>
  );
}
