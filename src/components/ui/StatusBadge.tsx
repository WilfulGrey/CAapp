// Kleiner Status (z. B. „Unvollständig" / „✓ Vollständig") — Farbe nur für den Status, nie für Knöpfe.
import type { ReactNode } from 'react';

const TON = {
  offen: 'bg-pm-coral-tint text-pm-coral-ink',
  fertig: 'bg-pm-mint text-pm-green-deep',
  warnung: 'bg-pm-amber-tint text-pm-amber-ink',
  // Abgeschlossener Stand ohne Signalfarbe (Gebucht-Seite „Beendet", texte_final Nachtrag 3, N3.3): weiß mit Rand.
  neutral: 'bg-white text-pm-taupe-ink ring-1 ring-inset ring-pm-chip',
} as const;

export function StatusBadge({ ton, children }: { ton: keyof typeof TON; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center text-[12.5px] font-bold leading-none px-2.5 py-1.5 rounded-full whitespace-nowrap ${TON[ton]}`}>
      {children}
    </span>
  );
}
