import type { FC } from 'react';
import { X } from 'lucide-react';
import type { Nurse } from '../../types';
import { displayName, initials } from './shared';

export const MatchCardDone: FC<{
  nurse: Nurse;
  onNurseClick: () => void;
  onUndo: () => void;
}> = ({ nurse, onNurseClick, onUndo }) => {
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);
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
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-700">{name}</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 flex-shrink-0">
          <X className="w-3 h-3" /> Abgelehnt
        </span>
      </div>
      <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
        <button
          onClick={onUndo}
          className="text-xs font-semibold text-[#8B7355] hover:underline"
        >
          ↩ Ablehnung rückgängig machen
        </button>
      </div>
    </div>
  );
};
