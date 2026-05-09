import type { FC } from 'react';
import { Check, X } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { displayName, initials } from './shared';

export const AppCardDone: FC<{
  app: Application;
  onNurseClick: (n: Nurse, app: Application) => void;
  onUndo: (id: string) => void;
}> = ({ app, onNurseClick, onUndo }) => {
  const { nurse, status } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {app.isInvited && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8F7F5] border-b border-[#E5E3DF]">
          <svg className="w-3 h-3 text-[#8B7355] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold text-[#8B7355]">Von Ihnen eingeladen</span>
        </div>
      )}
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
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-700">{name}</span>
        </div>
        {status === 'accepted' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] px-3 py-1.5 rounded-full border border-[#B8E8D4] flex-shrink-0">
            <Check className="w-3 h-3" /> Angenommen
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 flex-shrink-0">
            <X className="w-3 h-3" /> Abgelehnt
          </span>
        )}
      </div>

      {status === 'declined' && (
        <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
          <button
            onClick={() => onUndo(app.id)}
            className="text-xs font-semibold text-[#8B7355] hover:underline"
          >
            ↩ Ablehnung rückgängig machen
          </button>
        </div>
      )}
    </div>
  );
};
