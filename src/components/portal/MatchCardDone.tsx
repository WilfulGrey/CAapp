import type { FC } from 'react';
import { Check, Heart, X } from 'lucide-react';
import type { Nurse } from '../../types';
import { displayName, initials } from './shared';

// Kompakte "fertig"-Karte für die "Bereits bearbeitet"-Sektion.
// Unterstützt zwei Status: 'declined' (Abgelehnt-Pill + Undo) und
// 'invited' (Einladung-gesendet-Pill, kein Undo weil Mamamia keine
// uninvite-Mutation kennt).
//
// hasInterestOrigin: zeigt ein kleines "♥ Interesse"-Label damit der
// Kunde Karten differenzieren kann, die ursprünglich aus einer Interest-
// Karte kamen (proaktiv signalisiertes Interesse) vs. normale Matching-
// Aktionen.
export const MatchCardDone: FC<{
  nurse: Nurse;
  status: 'invited' | 'declined';
  hasInterestOrigin?: boolean;
  onNurseClick: () => void;
  onUndo?: () => void;
}> = ({ nurse, status, hasInterestOrigin, onNurseClick, onUndo }) => {
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  const statusPill = status === 'invited' ? (
    <span className="flex items-center gap-1.5 text-xs font-medium text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-3 py-1.5 rounded-full flex-shrink-0">
      <Check className="w-3 h-3" /> Einladung gesendet
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 flex-shrink-0">
      <X className="w-3 h-3" /> Abgelehnt
    </span>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onNurseClick}
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
          {hasInterestOrigin && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium flex-shrink-0"
              style={{ color: '#C04A40' }}
              title="Pflegekraft hat ursprünglich Interesse signalisiert"
            >
              <Heart className="w-3 h-3" fill="currentColor" /> Interesse
            </span>
          )}
        </div>
        {statusPill}
      </div>
      {onUndo && (
        <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onUndo(); }}
            className="text-xs font-semibold text-[#8B7355] hover:underline"
          >
            ↩ Rückgängig
          </button>
        </div>
      )}
    </div>
  );
};
