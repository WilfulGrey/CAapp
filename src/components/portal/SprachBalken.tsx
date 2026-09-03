import type { FC } from 'react';
import type { Nurse } from '../../types';

/**
 * Sprachstufe als Balken.
 *
 * Es gab sie schon — dreimal: inline im Profil-Modal, als HTML-Tabelle in der
 * Empfehlungs-Karte der Mail und noch einmal in der Fünf-Liste. Auf den Karten
 * fehlten sie ganz (am 11.08. entfernt, weil sie damals direkt neben derselben
 * Angabe im Klartext standen). Jetzt EINE Stelle, damit Portal und Mail nicht
 * wieder auseinanderlaufen (Martin, 03.09.2026: „ich hätte gerne dass es im
 * Kundenportal auch so aussieht").
 *
 * Maße und Farben sind die des Profil-Modals: 12 × 6 px, Brand-Braun an,
 * Hellgrau aus. Die Mail baut dieselben Balken aus Tabellenzellen, weil
 * Outlook kein Flexbox kann — Zahlen dort bewusst gleich gehalten.
 */
export const SprachBalken: FC<{ balken: number; gesamt?: number }> = ({ balken, gesamt = 3 }) => (
  <span className="inline-flex gap-0.5 flex-shrink-0" aria-hidden="true">
    {Array.from({ length: gesamt }, (_, i) => (
      <span
        key={i}
        className={`w-3 h-1.5 rounded-full ${i < balken ? 'bg-[#8B7355]' : 'bg-gray-200'}`}
      />
    ))}
  </span>
);

/**
 * „Deutsch ●●● Gut" — die komplette Zeile für die Pflegekraft-Karten.
 *
 * Reihenfolge wie im SA-Portal und in der Mail: erst das Label, dann die
 * Balken, dann der ausgeschriebene Wert. Ohne bekannte Stufe (bars = 0, z.B.
 * germany_skill fehlt) bleiben die Balken weg — drei leere Kästchen neben
 * einem „—" sind keine Information, sondern Grafik.
 */
export const DeutschZeile: FC<{ nurse: Nurse; klein?: boolean }> = ({ nurse, klein }) => {
  const stufe = nurse.language?.level;
  if (!stufe) return null;
  const balken = nurse.language?.bars ?? 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${klein ? 'text-sm' : 'text-[16px]'}`}
      style={{ color: '#71717A' }}
    >
      Deutsch
      {balken > 0 && <SprachBalken balken={balken} />}
      {stufe}
    </span>
  );
};
