import { useState } from 'react';
import type { FC } from 'react';
import { Check, Heart, Lock, Sparkles, UserPlus, X } from 'lucide-react';
import type { Nurse } from '../../types';
import type { NurseStatus } from './shared';
import { PflegekraftProfil } from './PflegekraftProfil';

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
  /** Pflegesituation fehlt noch: „Einladen" als Umriss-Knopf mit Schloss; der Tipp
   *  öffnet über `onInvite` das Pop-up „Warum erst die Pflegesituation?" (Teil 3 des
   *  Redesigns, Martin 24.09. — vorher „Profil vervollständigen & einladen", brach um). */
  profilFehlt?: boolean;
  /** Tipp auf die Stufen-Plakette: Profil mit geöffneter Erklärung (07.09.,
   *  Clarity: Kunden tippten Stammkraft/Bewährt und nichts passierte). */
  onStufeClick?: () => void;
}> = ({ nurse, status, onNurseClick, onInvite, onInviteConfirm, onUndoDecline, hasInterestOrigin, isRecommended, globalInviteLocked, profilFehlt, onStufeClick }) => {
  const [invitePhase, setInvitePhase] = useState<'idle' | 'sending' | 'done'>('idle');

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
            Interessiert sich für die Betreuung
          </span>
        </div>
      )}
    <div
      /* Ganze Karte öffnet das Profil (Clarity 07.09.: 15,5 % tote Klicks auf
         Name, Plaketten und Faktenzeile). Knöpfe stoppen die Weitergabe. */
      onClick={onNurseClick}
      className={`group bg-white rounded-card overflow-hidden transition-colors cursor-pointer ${
        status === 'declined'
          ? 'opacity-40 border border-[#EFEBE4]'
          : isRecommended && status === 'pending'
          ? 'border-[1.5px] border-[#CDBFA8] hover:border-pm-taupe'
          : 'border border-[#EFEBE4] hover:border-pm-taupe-light'
      }`}
    >
      {/* Empfehlung als Kopfleiste IN der Karte, wie „Unsere Empfehlung" in der Angebotsmail
          (Martin 27.09.2026, „V"). */}
      {isRecommended && status === 'pending' && (
        <div className="flex items-center gap-2 bg-pm-shell px-5 py-3 text-[15px] font-extrabold text-pm-taupe-ink">
          <Sparkles className="w-4 h-4 flex-none" aria-hidden="true" />
          Unsere Empfehlung für Sie
        </div>
      )}
      <div className="px-3.5 pt-3.5">
        <PflegekraftProfil nurse={nurse} onProfil={onNurseClick} onStufeClick={onStufeClick} />
      </div>

      <div className="px-4 py-3 flex items-center justify-end gap-3">
        {status === 'declined' ? (
          <div className="flex items-center gap-3">
            {onUndoDecline && (
              <button
                onClick={(e) => { e.stopPropagation(); onUndoDecline(); }}
                className="min-h-[44px] px-1 text-[13px] font-semibold text-pm-taupe-ink hover:underline"
              >
                ↩ Rückgängig
              </button>
            )}
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-pm-muted bg-pm-paper border border-pm-line px-4 py-1.5 rounded-full">
              <X className="w-3 h-3 flex-shrink-0" /> Abgelehnt
            </span>
          </div>
        ) : status === 'invited' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-pm-green-deep bg-pm-mint border border-[#CFE8D8] px-4 py-1.5 rounded-full">
            <Check className="w-3 h-3 flex-shrink-0" /> Einladung gesendet
          </span>
        ) : invitePhase === 'sending' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-pm-taupe-ink bg-pm-paper border border-pm-line px-4 py-1.5 rounded-full">
            <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            wird eingeladen…
          </span>
        ) : invitePhase === 'done' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-pm-green-deep bg-pm-mint border border-[#CFE8D8] px-4 py-1.5 rounded-full">
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
            className="flex items-center gap-1.5 text-[13px] font-bold text-pm-taupe-ink bg-pm-paper border border-pm-line px-4 py-1.5 rounded-full cursor-not-allowed shadow-sm"
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
            className={`min-h-[44px] inline-flex items-center gap-1.5 px-[18px] rounded-full text-[15px] font-bold whitespace-nowrap transition-colors active:scale-[0.98] ${
              profilFehlt
                ? 'bg-white border-[1.5px] border-[#CDBFA8] text-pm-taupe-ink hover:border-pm-taupe'
                : 'bg-pm-coral text-white hover:bg-pm-coral-deep'
            }`}
          >
            {profilFehlt ? <Lock className="w-4 h-4" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
            Einladen
          </button>
        )}
      </div>
    </div>
    </div>
  );
};
