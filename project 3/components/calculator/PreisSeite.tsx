'use client';

import { useEffect, useState } from 'react';
import { GARANTIE } from '@/lib/kraefte-vorschau';
import { PREIS_SEITE, euro, zuschussNamen } from '@/lib/preis-zuerst';

/**
 * Preisseite VOR der Kontaktabfrage (Registry #77, Martin 17.09.2026).
 * Runde 2 — ruhig: ein Blickfang (Preis), eine Stütze (nach Zuschüssen), ein
 * Knopf; alles Weitere einspaltig unter dem Knopf. Der grüne Kopf darüber
 * („Ihr Preis ist berechnet", Testsieger-Siegel) kommt aus MultiStepForm.
 */
export interface PreisDaten {
  bruttopreis: number;
  eigenanteil: number;
  zuschüsse: { gesamt: number; items: Array<{ name: string; label: string; in_kalkulation: boolean }> };
}

const FOTOS = ['pk-1', 'pk-2', 'pk-3', 'pk-4', 'pk-5'].map((n) => `/images/caregivers/${n}.jpg`);

/** Ruhige Sterne wie auf primundus.de: gedecktes Gold auf hellem Grund, letzter Stern anteilig gefüllt. */
const STERN = 'M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z';
function Sterne({ wert, label }: { wert: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-[2px] align-middle">
      {[0, 1, 2, 3, 4].map((i) => {
        const fuellung = Math.max(0, Math.min(1, wert - i));
        return (
          <svg key={i} viewBox="0 0 20 20" width={18} height={18} aria-hidden="true" className="flex-none">
            <path d={STERN} fill="#E8E2D6" />
            {fuellung > 0 && <path d={STERN} fill="#D4A843" style={fuellung < 1 ? { clipPath: `inset(0 ${100 - fuellung * 100}% 0 0)` } : undefined} />}
          </svg>
        );
      })}
    </span>
  );
}
type BewertungsStand = { schnitt: string; wert: number; anzahl: number };

export function PreisSeite({ daten, onWeiter, onGarantie }: { daten: PreisDaten; onWeiter: () => void; onGarantie: () => void }) {
  // Bewertungen live über die eigene Domain; ohne echte Zahl bleibt die Zeile weg.
  const [stand, setStand] = useState<BewertungsStand | null>(null);
  useEffect(() => {
    let weg = false;
    fetch('/api/bewertungen-stand')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!weg && j && typeof j.schnitt === 'string' && Number(j.anzahl) > 0 && Number(j.wert) > 0) setStand({ schnitt: j.schnitt, wert: Number(j.wert), anzahl: Number(j.anzahl) }); })
      .catch(() => { /* keine Zeile */ });
    return () => { weg = true; };
  }, []);
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
      <p className="mt-3 text-[14px] leading-relaxed text-[#6B6B6B] [text-wrap:pretty]">
        {PREIS_SEITE.inklusive}{' '}
        <span className="whitespace-nowrap">{PREIS_SEITE.mitGarantie}{' '}<button type="button" onClick={onGarantie} className="font-medium text-[#3D3D3D] underline underline-offset-2 hover:text-[#1a1a1a]">{GARANTIE.wort}</button>.</span>{' '}
        {PREIS_SEITE.zuzueglich}
      </p>

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

      {/* Darunter, ruhig und einspaltig: Garantie, Punkte, Bewertungen (wie im Hero von primundus.de), Heimvergleich */}
      <div className="mt-7 border-t border-[#EEE9E0] pt-5">
        <button type="button" onClick={onGarantie} aria-label={`${GARANTIE.titel} – ${PREIS_SEITE.garantieMehr}`} className="block cursor-pointer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} className="h-[40px] w-auto" />
        </button>
        <p className="mt-2.5 text-[15px] leading-snug text-[#1a1a1a]">
          {GARANTIE.zusage}{' '}
          <button type="button" onClick={onGarantie} className="text-[#6B6B6B] underline underline-offset-2 hover:text-[#1a1a1a]">{PREIS_SEITE.garantieMehr}</button>
        </p>
        <ul className="mt-4 space-y-2 text-[15px] text-[#1a1a1a]">
          {PREIS_SEITE.haken.map((h) => (
            <li key={h} className="flex items-start gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 mt-[3px]"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <span>{h}</span>
            </li>
          ))}
        </ul>
        {stand && (
          <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] leading-snug text-[#555]">
            <Sterne wert={stand.wert} label={`${stand.schnitt} von 5 Sternen`} />
            <span><strong className="text-[#1a1a1a]">{stand.schnitt}</strong> {PREIS_SEITE.bewertungVon} {PREIS_SEITE.bewertungAnzahl(stand.anzahl)}</span>
          </p>
        )}
        {heim && (
          <p className="mt-4 text-[13px] leading-relaxed text-[#6B6B6B]">{heim} {PREIS_SEITE.heimQuelle}</p>
        )}
      </div>
    </div>
  );
}
