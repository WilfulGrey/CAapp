import { useState } from 'react';
import type { FC } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Nurse } from '../../types';
import type { NurseStatus } from './shared';
import { nurseLevel, displayName, initials } from './shared';

export const MatchCard: FC<{
  nurse: Nurse;
  status: NurseStatus;
  onNurseClick: () => void;
  onInvite?: () => boolean;
  /** Performs the actual backend mutation. Spinner stays up until the
   *  promise resolves; on rejection MatchCard rolls back to idle and the
   *  parent surfaces the error (CLAUDE.md §1 — no fake "done" animation). */
  onInviteConfirm?: () => Promise<void>;
}> = ({ nurse, status, onNurseClick, onInvite, onInviteConfirm }) => {
  const [invitePhase, setInvitePhase] = useState<'idle' | 'sending' | 'done'>('idle');
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);

  const handleInvite = async () => {
    const allowed = onInvite ? onInvite() : true;
    if (!allowed) return;
    setInvitePhase('sending');
    try {
      await onInviteConfirm?.();
      // Backend confirmed — show short success flash then hand off to
      // status='invited' (rendered by parent on the next render cycle).
      setInvitePhase('done');
      setTimeout(() => setInvitePhase('idle'), 1500);
    } catch {
      // Parent already shows the error toast and clears optimistic status.
      setInvitePhase('idle');
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-all ${
        status === 'declined'
          ? 'opacity-40 border-gray-200'
          : status === 'invited'
          ? 'border-gray-200'
          : 'border-gray-200 hover:border-[#9B1FA1] hover:shadow-[0_4px_16px_rgba(155,31,161,0.12)]'
      }`}
    >
      <div className="px-4 pt-4 pb-3 cursor-pointer active:bg-gray-50" onClick={onNurseClick}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-14 h-14 rounded-2xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: nurse.color }}>
                {inits}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-bold text-gray-900 leading-tight">{name}</span>
                <span className="text-sm text-gray-400 flex-shrink-0">{nurse.age} J.</span>
              </div>
              {(() => { const lvl = nurseLevel(nurse.history?.assignments ?? 0); return (
                <span className={`flex items-center gap-1 text-xs font-bold pl-1.5 pr-2.5 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                  <span className="text-sm leading-none">{lvl.emoji}</span>
                  {lvl.label}
                </span>
              ); })()}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex gap-0.5">
                {bars.map((f, i) => (
                  <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />
                ))}
              </div>
              <span className="text-sm text-gray-500">Deutsch {nurse.language.level}</span>
            </div>
            <p className="text-sm text-gray-500 truncate">
              <span className="font-semibold text-[#9B1FA1]">{nurse.experience}</span>
              {nurse.history && <span> · {nurse.history.assignments} Eins. · Ø {Math.round(nurse.history.avgDurationMonths * 4.3)} Wo.</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <button
          onClick={onNurseClick}
          className="text-sm font-semibold text-[#9B1FA1] flex items-center gap-1 hover:underline"
        >
          Details <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
        </button>
        {status === 'invited' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-4 py-1.5 rounded-full">
            <Check className="w-3 h-3 flex-shrink-0" /> Einladung gesendet
          </span>
        ) : invitePhase === 'sending' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#9B1FA1] bg-[#F5EDF6] border border-[#D8A9DC] px-4 py-1.5 rounded-full">
            <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            wird eingeladen…
          </span>
        ) : invitePhase === 'done' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-4 py-1.5 rounded-full">
            <Check className="w-3 h-3 flex-shrink-0" /> wurde eingeladen!
          </span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); handleInvite(); }}
            className="text-xs font-bold bg-[#F5EDF6] text-[#9B1FA1] border border-[#D8A9DC] px-4 py-1.5 rounded-full hover:bg-[#EDD9EF] transition-colors active:scale-95"
          >
            Einladen
          </button>
        )}
      </div>
    </div>
  );
};
