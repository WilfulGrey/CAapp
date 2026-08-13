import { useState } from 'react';
import type { FC } from 'react';
import { Check, ChevronDown, FileText, UserPlus } from 'lucide-react';
import type { Nurse } from '../../types';
import { nurseFacts, nurseLevel, displayName, initials } from './shared';

export type InterestActionStatus = 'idle' | 'invited' | 'dismissed';

// Mirror of MatchCard layout with two differences:
// 1. Purple "Hat Interesse" badge in the top-right of the tile (signals
//    proactive caregiver-side interest, distinct from system matchings).
// 2. Footer carries TWO buttons: Einladen (primary, mirrors MatchCard's
//    invite) + Ablehnen (subdued, fires a local-only dismiss that hides
//    the card from this customer's view via lead_dismissed_caregivers).
//
// Once status flips to 'invited' or 'dismissed' the card collapses its
// action area to a confirmation pill — the parent typically removes the
// card from the list right after via state update, the pill is the
// transitional state during the optimistic update.
export const InterestCard: FC<{
  nurse: Nurse;
  status: InterestActionStatus;
  onNurseClick: () => void;
  onInvite?: () => boolean;
  onInviteConfirm?: () => Promise<void>;
  onDismiss?: () => Promise<void>;
  exiting?: boolean;
  /** Global "another card has an invite in flight" lock. When true we
   *  render Einladen disabled so concurrent clicks can't race the
   *  rate-limit gate (the active card still shows its own spinner). */
  globalInviteLocked?: boolean;
}> = ({ nurse, status, onNurseClick, onInvite, onInviteConfirm, onDismiss, exiting, globalInviteLocked }) => {
  const [invitePhase, setInvitePhase] = useState<'idle' | 'sending' | 'done'>('idle');
  const [dismissPhase, setDismissPhase] = useState<'idle' | 'sending'>('idle');
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);

  const handleInvite = async () => {
    const allowed = onInvite ? onInvite() : true;
    if (!allowed) return;
    setInvitePhase('sending');
    try {
      await onInviteConfirm?.();
      setInvitePhase('done');
      // Parent typically removes the card on next render. The brief
      // 'done' flash is a UX fallback in case parent doesn't.
      setTimeout(() => setInvitePhase('idle'), 1500);
    } catch {
      setInvitePhase('idle');
    }
  };

  const handleDismiss = async () => {
    if (!onDismiss) return;
    setDismissPhase('sending');
    try {
      await onDismiss();
      // Parent moves the card aus visibleInterests → erscheint nach kurzem
      // Render-Tick als virtuelle declined MatchCard im bearbeitet-Bereich.
    } catch {
      setDismissPhase('idle');
    }
  };

  return (
    <div className="relative">
      <div
        className={`group bg-[#F4F4F6] rounded-2xl border overflow-hidden transition-all ${
          exiting ? 'opacity-0 -translate-x-2 pointer-events-none' : ''
        } ${
          status === 'dismissed'
            ? 'opacity-40 border-gray-200'
            : status === 'invited'
            ? 'border-zinc-300'
            : 'border-zinc-300 hover:border-zinc-500'
        }`}
      >
      <div className="px-4 pt-4 pb-3 cursor-pointer active:bg-gray-50" onClick={onNurseClick}>
        <div className="flex items-center gap-3.5">
          <div className="flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: nurse.color }}>
                {inits}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Umbau 11.08. (Martin: „CG-Kasten sieht immer noch scheisse aus —
                Farben austauschen bringt nichts"). Es lag an der Struktur:
                drei Kleinschrift-Zeilen neben einem 56px-Foto, die Faktenzeile
                mit `truncate` (der Kunde las „Ø 1…" — eine abgeschnittene
                Zahl), dazu ein Sprachbalken, der genau das wiederholte, was
                daneben im Klartext stand.
                Jetzt: größeres Foto, Name als Zeile, darunter EINE Meta-Zeile,
                darunter die Fakten ausgeschrieben und umbrechend. */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[17px] font-semibold leading-snug" style={{ color: '#18181B' }}>
                {name}
                {nurse.age ? <span className="font-normal" style={{ color: '#71717A' }}>, {nurse.age}</span> : null}
              </p>
              {/* Öffnen-Hinweis statt „Details"-Link im Footer (11.08.) */}
              <ChevronDown className="w-4 h-4 -rotate-90 flex-shrink-0 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
            </div>

            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1">
              <span className="text-[16px]" style={{ color: '#71717A' }}>Deutsch {nurse.language.level}</span>
              {nurse.referencePdfUrl && (
                <span className="inline-flex items-center gap-1 text-[14px]" style={{ color: '#71717A' }} title="Referenzen im Profil">
                  <FileText className="w-3 h-3" />
                  Referenzen
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Fakten über die VOLLE Kartenbreite (11.08.), nicht in der schmalen
            Spalte neben dem Foto — dort brach die Zeile mitten in der Zahl um
            („· im / Schnitt 12 Wochen"). */}
        <p className="text-[16px] mt-3" style={{ color: '#71717A' }}>
          {(() => { const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0); return lvl.label ? (
            <span className="font-semibold" style={{ color: '#18181B' }}>{lvl.label}: </span>
          ) : null; })()}
          {nurseFacts(nurse)}
        </p>
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          {status === 'invited' || invitePhase === 'done' ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-4 py-1.5 rounded-full">
              <Check className="w-3 h-3 flex-shrink-0" /> Einladung gesendet
            </span>
          ) : invitePhase === 'sending' ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#8B7355] bg-[#F5F5F6] border border-[#E9E9EB] px-4 py-1.5 rounded-full">
              <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              wird eingeladen…
            </span>
          ) : (
            <>
              {onDismiss && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
                  disabled={dismissPhase === 'sending'}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {dismissPhase === 'sending' ? 'lehnt ab…' : 'Ablehnen'}
                </button>
              )}
              {globalInviteLocked ? (
                // Another invite is in flight. The active card flips
                // status='invited' optimistically and moves to "Bereits
                // bearbeitet" — leaving the customer with no on-screen
                // sign that the system is working. Show spinner here so
                // it's clear: "yes we heard you, please wait" rather
                // than "this button is broken".
                <button
                  disabled
                  aria-disabled="true"
                  className="flex items-center gap-1.5 text-xs font-bold text-[#8B7355] bg-[#F5F5F6] border border-[#E9E9EB] px-4 py-1.5 rounded-full cursor-not-allowed shadow-sm"
                >
                  <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Bitte warten…
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleInvite(); }}
                  className="flex items-center gap-1.5 text-xs font-bold bg-[#E76F63] text-white px-4 py-1.5 rounded-full hover:bg-[#D65E52] transition-colors active:scale-95 shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Einladen
                </button>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};
