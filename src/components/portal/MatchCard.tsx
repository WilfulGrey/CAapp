import { useState } from 'react';
import type { FC } from 'react';
import { Check, ChevronDown, Heart, Sparkles, UserPlus, X } from 'lucide-react';
import type { Nurse } from '../../types';
import type { NurseStatus } from './shared';
import { nurseFacts, nurseLevel, displayName, initials } from './shared';
import { DeutschZeile } from './SprachBalken';

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
    /* 14.06.: Wenn das "Empfehlung des Beraters"-Badge sichtbar ist, sass
       es zu eng am Text drüber UND zu eng am Pflegekraft-Namen drunter.
       Lösung:
         - Wrapper bekommt mt-4 → mehr Abstand zum vorherigen Element
         - Badge bleibt -top-3 (etwas weiter hoch als die alten -top-2.5)
         - Card-Header (innerhalb) bekommt zusätzlichen pt-1 wenn
           isRecommended → Name rutscht vom Badge weg, sonstige Cards
           bleiben kompakt wie vorher. */
    <div className={isRecommended && status === 'pending'
      ? 'relative rounded-3xl px-3 py-4 border space-y-3'
      : 'relative'}
      style={isRecommended && status === 'pending'
        ? { background: '#FFFFFF', borderColor: '#8B7355' }
        : undefined}
    >
      {isRecommended && status === 'pending' && (
        <p className="flex items-center gap-2 text-[16px] font-semibold leading-relaxed px-1" style={{ color: '#8B7355' }}>
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          Unsere Empfehlung für Sie
        </p>
      )}
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
            Interessiert sich für die Betreuung
          </span>
        </div>
      )}
    <div
      /* Weiss statt #F4F4F6 (Martin, 03.09.2026: „finde weiss besser"): die
         Karten liegen in einem grauen Kasten (#F5F5F6) und hatten fast
         denselben Ton — dadurch wirkten sie flach. Weiss hebt sie heraus,
         genau wie die Karten in der Mail. shadow-sm wie in BookedScreen. */
      className={`group bg-white shadow-sm rounded-2xl border overflow-hidden transition-all ${
        status === 'declined'
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

            <p className="mt-1"><DeutschZeile nurse={nurse} /></p>
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
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#8B7355] bg-[#F5F5F6] border border-[#E9E9EB] px-4 py-1.5 rounded-full">
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
