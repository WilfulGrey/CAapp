'use client';

import { GARANTIE } from '@/lib/kraefte-vorschau';
import { HERO_PUNKTE } from '@/lib/hero-punkte';
import { PREIS_SEITE, euro, zuschussNamen } from '@/lib/preis-zuerst';
import type { SterneStand } from '@/lib/sterne-zeile';
import { SterneText } from '@/components/calculator/BewertungsZeile';
import { PersonalContact } from '@/components/calculator/PersonalContact';

/**
 * Preisseite VOR der Kontaktabfrage (Registry #77, Martin 17.09.2026).
 * Ruhig: ein Blickfang (Preis), eine Stütze (nach Zuschüssen), ein Knopf.
 * Unter dem Knopf dasselbe Muster wie auf der Startseite (Martin: „lös das
 * doch so wie auf der Startseite ohne das Bestpreisgarantie-Logo. Dann
 * darunter Kontakt zu Marta"): die Hero-Punkte mit „Bestpreisgarantie · Mehr
 * Infos", die Sterne-Zeile, Martas Karte, zuletzt der Heimvergleich als Fußnote.
 * Der grüne Kopf darüber kommt aus MultiStepForm.
 */
export interface PreisDaten {
  bruttopreis: number;
  eigenanteil: number;
  zuschüsse: { gesamt: number; items: Array<{ name: string; label: string; in_kalkulation: boolean }> };
}

const FOTOS = ['pk-1', 'pk-2', 'pk-3', 'pk-4', 'pk-5'].map((n) => `/images/caregivers/${n}.jpg`);

function Haken() {
  return (
    <svg className="h-[18px] w-[18px] flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function PreisSeite({ daten, bewertung = null, onWeiter, onGarantie }: { daten: PreisDaten; bewertung?: SterneStand | null; onWeiter: () => void; onGarantie: () => void }) {
  const hatZuschuss = daten.zuschüsse.gesamt > 0 && daten.eigenanteil < daten.bruttopreis;
  const heim = PREIS_SEITE.heim(daten.eigenanteil);
  const namen = zuschussNamen(daten.zuschüsse.items);
  return (
    <div id="preis-seite" className="pt-2">
      {/* 1 · Der Preis */}
      <p className="flex items-baseline gap-2.5 text-[#1a1a1a]">
        <span className="text-[46px] leading-none font-extrabold tracking-tight tabular-nums">{euro(daten.bruttopreis)}</span>
        <span className="text-[16px] text-[#6B6B6B]">{PREIS_SEITE.proMonat}</span>
      </p>
      <p className="mt-3 text-[14px] leading-relaxed text-[#6B6B6B] [text-wrap:pretty]">{PREIS_SEITE.inklusive} {PREIS_SEITE.zuzueglich}</p>

      {/* 2 · Die eine Stütze */}
      {hatZuschuss && (
        <div className="mt-5 rounded-2xl bg-[#F0F7F1] px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] text-[#2F5A38]">{PREIS_SEITE.zuschussLabel}</span>
            <span className="text-[22px] leading-none font-extrabold tabular-nums text-[#1F5A38] whitespace-nowrap">{PREIS_SEITE.zuschussWert(daten.eigenanteil)}</span>
          </div>
          {namen && <p className="mt-1 text-[13px] leading-snug text-[#4C7A5F] [text-wrap:balance]">{PREIS_SEITE.eingerechnet(namen)}</p>}
        </div>
      )}

      {/* 3 · Der eine Knopf */}
      <button
        type="button"
        onClick={onWeiter}
        className="mt-6 w-full py-4 px-2 font-bold text-[15px] min-[400px]:text-base whitespace-nowrap rounded-xl bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer"
      >
        {PREIS_SEITE.knopf}
      </button>
      <div className="mt-3 flex items-center justify-center gap-2.5">
        <div className="flex flex-shrink-0">
          {FOTOS.map((src, i) => (
            <span key={src} className={`relative w-7 h-7 rounded-full overflow-hidden border-2 border-white flex-shrink-0 ${i > 0 ? '-ml-2' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            </span>
          ))}
        </div>
        <p className="text-[13px] leading-snug text-[#6B6B6B]">{PREIS_SEITE.unterKnopf}</p>
      </div>

      {/* Darunter wie auf der Startseite: Punkte, Sterne — dann Marta */}
      <div className="mt-7 border-t border-[#EEE9E0] pt-5">
        <ul className="flex flex-col gap-3">
          {HERO_PUNKTE.map((punkt) => (
            <li key={punkt} className="flex items-center gap-2.5">
              <Haken />
              <span className="text-[16px] leading-snug text-[#3D3D3D]">{punkt}</span>
            </li>
          ))}
          <li className="flex items-center gap-2.5">
            <Haken />
            <span className="text-[16px] leading-snug text-[#3D3D3D]">
              {GARANTIE.wort}{' '}
              <button type="button" onClick={onGarantie} className="font-semibold text-[#1E5C3A] underline underline-offset-[3px]" aria-haspopup="dialog">
                {PREIS_SEITE.garantieMehr}
              </button>
            </span>
          </li>
        </ul>
        {/* Sterne wie im Hero, hier ohne Sprungziel — niemand soll die Preisseite verlassen. */}
        {bewertung && (
          <div className="mt-6 flex justify-center">
            <span aria-label={`${bewertung.schnitt} von 5 Sternen`}><SterneText stand={bewertung} /></span>
          </div>
        )}
        <div className="mt-6">
          <PersonalContact headline={PREIS_SEITE.marta.frage} body={PREIS_SEITE.marta.text} />
        </div>
        {heim && (
          <p className="mt-5 text-[13px] leading-relaxed text-[#6B6B6B]">{heim} {PREIS_SEITE.heimQuelle}</p>
        )}
      </div>
    </div>
  );
}
