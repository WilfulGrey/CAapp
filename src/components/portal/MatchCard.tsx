import { useState } from 'react';
import type { FC } from 'react';
import { Check, ChevronDown, Heart, Sparkles, UserPlus, X } from 'lucide-react';
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
  /** When status='declined', clicking the Undo-Link calls this to restore
   *  the card to pending (UI override + Mamamia mutation handled by parent). */
  onUndoDecline?: () => void;
  /** Pflegekraft hat ursprünglich proaktiv Interesse signalisiert
   *  (caregiver_interest_shown). Wenn true UND status invited/declined,
   *  rendert die Card ein zusätzliches "Hat Interesse"-Badge damit der
   *  Kunde die Pflegekraft im bearbeitet-Bereich klar von normalen
   *  Matchings differenzieren kann. */
  hasInterestOrigin?: boolean;
  /** Setzt einen prominenten "✨ Empfehlung"-Top-Badge mittig auf der
   *  Card. Wird nur für die Top 1-2 pending Matchings vergeben — soll
   *  dem Kunden die Entscheidung erleichtern wenn er sonst überwältigt
   *  von der Auswahl ist. */
  isRecommended?: boolean;
  /** Global "an invite is in flight on this page" lock. When true and
   *  THIS card is still in pending/idle state, render the Einladen button
   *  disabled so the customer cannot fire a parallel invite before the
   *  rate-limit gate finishes processing the in-flight one. Prevents
   *  the race where multiple concurrent clicks all see `used < 5` and
   *  all pass the gate. Local invitePhase='sending' on this card already
   *  hides the button — this prop covers the OTHER cards. */
  globalInviteLocked?: boolean;
}> = ({ nurse, status, onNurseClick, onInvite, onInviteConfirm, onUndoDecline, hasInterestOrigin, isRecommended, globalInviteLocked }) => {
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

  // "Hat Interesse"-Badge nur im bearbeitet-Bereich (invited/declined) —
  // pending Interests werden ohnehin als InterestCard mit eigenem Top-Edge-
  // Badge gerendert.
  const showInterestOriginBadge = hasInterestOrigin && status !== 'pending';

  return (
    <div className="relative">
      {showInterestOriginBadge && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-3 py-1 rounded-full shadow-sm border"
            style={{
              background: 'linear-gradient(135deg, #FFE5DE 0%, #FFCFC4 100%)',
              color: '#C04A40',
              borderColor: '#F0B0A4',
            }}
          >
            <Heart className="w-3 h-3" fill="currentColor" />
            Hat Interesse
          </span>
        </div>
      )}
      {isRecommended && status === 'pending' && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide px-3 py-1 rounded-full shadow-sm border"
            style={{
              background: 'linear-gradient(135deg, #FFF4D6 0%, #FFE3A1 100%)',
              backgroundColor: '#FFE3A1',
              color: '#7A5410',
              borderColor: '#E0AC32',
            }}
          >
            <Sparkles className="w-3 h-3" />
            Empfehlung des Beraters
          </span>
        </div>
      )}
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-all ${
        status === 'declined'
          ? 'opacity-40 border-gray-200'
          : status === 'invited'
          ? 'border-[#C4B49A]'
          : isRecommended
          ? 'border-[#E0AC32] shadow-[0_2px_12px_rgba(224,172,50,0.18)]'
          : 'border-[#C4B49A] hover:border-[#8B7355] hover:shadow-[0_4px_16px_rgba(139,115,85,0.12)]'
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
              {(() => { const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0); return (
                <span className={`flex items-center gap-1 text-xs font-bold pl-1.5 pr-2.5 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                  <span className="text-sm leading-none">{lvl.emoji}</span>
                  {lvl.label}
                </span>
              ); })()}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex gap-0.5">
                {bars.map((f, i) => (
                  <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#8B7355]' : 'bg-gray-200'}`} />
                ))}
              </div>
              <span className="text-sm text-gray-500">Deutsch {nurse.language.level}</span>
            </div>
            <p className="text-sm text-gray-500 truncate">
              <span className="font-semibold text-[#8B7355]">{nurse.experience}</span>
              {nurse.history && <span> · {nurse.history.assignments} Einsätze · Ø {Math.round(nurse.history.avgDurationMonths * 4.3)} Wo.</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <button
          onClick={onNurseClick}
          className="text-sm font-semibold text-[#8B7355] flex items-center gap-1 hover:underline"
        >
          Details <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
        </button>
        {status === 'declined' ? (
          <div className="flex items-center gap-3">
            {onUndoDecline && (
              <button
                onClick={(e) => { e.stopPropagation(); onUndoDecline(); }}
                className="text-xs font-semibold text-[#8B7355] hover:underline"
              >
                ↩ Rückgängig
              </button>
            )}
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-4 py-1.5 rounded-full">
              <X className="w-3 h-3 flex-shrink-0" /> Abgelehnt
            </span>
          </div>
        ) : status === 'invited' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-4 py-1.5 rounded-full">
            <Check className="w-3 h-3 flex-shrink-0" /> Einladung gesendet
          </span>
        ) : invitePhase === 'sending' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#8B7355] bg-[#F8F7F5] border border-[#E5E3DF] px-4 py-1.5 rounded-full">
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
        ) : globalInviteLocked ? (
          // Another card is currently sending an invite. The active card
          // often disappears off-screen (status flips to 'invited' → moved
          // to "Bereits bearbeitet" section), so the only visual signal
          // the customer has is THESE inactive cards. Show a spinner +
          // "Bitte warten…" instead of a dim grey button — makes it
          // obvious the system is working, not stuck.
          <button
            disabled
            aria-disabled="true"
            className="flex items-center gap-1.5 text-xs font-bold text-[#8B7355] bg-[#F8F7F5] border border-[#E5E3DF] px-4 py-1.5 rounded-full cursor-not-allowed shadow-sm"
          >
            <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Bitte warten…
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); handleInvite(); }}
            className="flex items-center gap-1.5 text-xs font-bold bg-[#E76F63] text-white px-4 py-1.5 rounded-full hover:bg-[#D65E52] transition-colors active:scale-95 shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Einladen
          </button>
        )}
      </div>
    </div>
    </div>
  );
};
