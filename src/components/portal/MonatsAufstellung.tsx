import type { FC } from 'react';
import type { OfferDetails } from './shared';
import { buildMonthlyBreakdown, computeZuschlagRelevance } from './konditionen';

// Einsatz-Zeitraum (Anreise/Abreise) + monatliche Kosten-Zusammenfassung.
// Nutzt dieselbe Berechnung wie die Bewerbungsprüfung (konditionen.ts).
export const MonatsAufstellung: FC<{ offer: OfferDetails; title?: string }> = ({
  offer,
  title = 'Einsatz-Zeitraum & Kosten',
}) => {
  const tagessatz = Math.round(offer.monatlicheKosten / 30);
  const summary = buildMonthlyBreakdown(
    offer.anreisedatum,
    offer.abreisedatum,
    tagessatz,
    offer.anreisekosten,
    offer.abreisekosten,
    tagessatz,
  );
  const zuschlag = computeZuschlagRelevance(offer.anreisedatum, offer.abreisedatum);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-gray-700">{title}</p>
        <p className="text-xs text-gray-400">Tagessatz {tagessatz} €/Tag</p>
      </div>
      <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        <div className="flex items-center justify-between px-4 py-2.5 bg-white">
          <span className="text-sm text-gray-500">Anreise</span>
          <span className="text-sm font-semibold text-gray-700">{offer.anreisedatum}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-white">
          <span className="text-sm text-gray-500">Abreise</span>
          <span className="text-sm font-semibold text-gray-700">{offer.abreisedatum}</span>
        </div>
        {summary.map((m) => (
          <div key={m.monat} className="px-4 py-2.5 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{m.monat}</span>
              <span className="text-sm font-bold text-gray-900">{m.betrag.toLocaleString('de-DE')} €</span>
            </div>
            {m.details.map((d) => (
              <p key={d} className="text-xs text-gray-400 text-right mt-0.5">{d}</p>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[12px] text-gray-400 mt-2.5 leading-relaxed">
        An- und Abreisetage werden mit vollem Tagessatz berechnet.
        {zuschlag.hasSummer && (
          <> Im Juli und August fällt ein Sommerzuschlag von 6,67 €/Tag (200 €/Monat) an.</>
        )}
        {zuschlag.relevantHolidayNames.length > 0 && (
          <> An {zuschlag.relevantHolidayNames.join(', ')} wird der doppelte Tagessatz berechnet.</>
        )}
      </p>
    </div>
  );
};
