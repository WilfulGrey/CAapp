import type { FC } from 'react';
import { Check, Mail, X } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { displayName, initials } from './shared';

// Kompakte "fertig"-Karte für bearbeitete Bewerbungen in der "Bereits
// bearbeitet"-Sektion. Visuell konsistent zu MatchCardDone (Interest-
// Aktionen) — gleiches Layout: Avatar + Name + inline-Badge + Status-Pill
// + Undo-Link. Inline-"📨 Bewerbung"-Label analog zu "♥ Interesse" damit
// der Kunde direkt sieht, dass die Karte ursprünglich eine Bewerbung war
// (nicht nur ein normales Matching).
export const AppCardDone: FC<{
  app: Application;
  onNurseClick: (n: Nurse, app: Application) => void;
  onUndo: (id: string) => void;
}> = ({ app, onNurseClick, onUndo }) => {
  const { nurse, status } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  const statusPill = status === 'accepted' ? (
    <span className="flex items-center gap-1.5 text-xs font-medium text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-3 py-1.5 rounded-full flex-shrink-0">
      <Check className="w-3 h-3" /> Angenommen
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full flex-shrink-0">
      <X className="w-3 h-3" /> Abgelehnt
    </span>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onNurseClick(nurse, app)}
      >
        {nurse.image ? (
          <img src={nurse.image} alt={nurse.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ backgroundColor: nurse.color }}>
            {inits}
          </div>
        )}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-700 truncate">{name}</span>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium flex-shrink-0"
            style={{ color: '#8B7355' }}
            title="Pflegekraft hat sich offiziell beworben"
          >
            <Mail className="w-3 h-3" /> Bewerbung
          </span>
        </div>
        {statusPill}
      </div>
      {status === 'declined' && (
        <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onUndo(app.id); }}
            className="text-xs font-semibold text-[#8B7355] hover:underline"
          >
            ↩ Rückgängig
          </button>
        </div>
      )}
    </div>
  );
};
