'use client';

import { Star } from 'lucide-react';
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

/** Google-Sterne — dieselbe Angabe wie über den Kundenstimmen der Startseite. */
function GoogleSterne({ mittig }: { mittig?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${mittig ? 'justify-center' : ''}`}>
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-3.5 h-3.5 fill-[#FBBC04] text-[#FBBC04]" />)}
      </span>
      <span className="text-[13px] leading-snug text-[#6B6B6B]"><span className="font-semibold text-[#3D3D3D]">{PREIS_SEITE.bewertung.wert}</span> · {PREIS_SEITE.bewertung.quelle}</span>
    </div>
  );
}

/** `sterne`: Abnahme-Schalter (Martin 17.09.: „Sterne direkt unter die Pflegekräfte, dann die Punkte oder umgekehrt — zeig mal"). */
export function PreisSeite({ daten, onWeiter, onGarantie, sterne = null }: { daten: PreisDaten; onWeiter: () => void; onGarantie: () => void; sterne?: 'a' | 'b' | null }) {
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

      {/* Variante A: Sterne direkt unter den Pflegekräften (mittig, wie die Fotozeile) */}
      {sterne === 'a' && <div className="mt-2.5"><GoogleSterne mittig /></div>}

      {/* Darunter, ruhig und einspaltig */}
      <div className="mt-7 border-t border-[#EEE9E0] pt-5">
        {(() => {
          const garantie = (
            <div>
              <button type="button" onClick={onGarantie} aria-label={`${GARANTIE.titel} – ${PREIS_SEITE.garantieMehr}`} className="block cursor-pointer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={GARANTIE.siegelSrc} alt={GARANTIE.siegelAlt} className="h-[40px] w-auto" />
              </button>
              <p className="mt-2.5 text-[15px] leading-snug text-[#1a1a1a]">
                {GARANTIE.zusage}{' '}
                <button type="button" onClick={onGarantie} className="text-[#6B6B6B] underline underline-offset-2 hover:text-[#1a1a1a]">{PREIS_SEITE.garantieMehr}</button>
              </p>
            </div>
          );
          const punkte = (
            <ul className="space-y-2 text-[15px] text-[#1a1a1a]">
              {PREIS_SEITE.haken.map((h) => (
                <li key={h} className="flex items-start gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 mt-[3px]"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          );
          // Heute live: Garantie → Punkte. Mit Sternen (Abnahme): Punkte rücken nach oben,
          // A = Sterne stehen schon über der Linie; B = Punkte → Sterne. Garantie folgt.
          if (sterne === 'a') return <>{punkte}<div className="mt-5">{garantie}</div></>;
          if (sterne === 'b') return <>{punkte}<div className="mt-4"><GoogleSterne /></div><div className="mt-5">{garantie}</div></>;
          return <>{garantie}<div className="mt-4">{punkte}</div></>;
        })()}
        {heim && (
          <p className="mt-4 text-[13px] leading-relaxed text-[#6B6B6B]">{heim} {PREIS_SEITE.heimQuelle}</p>
        )}
      </div>
    </div>
  );
}
