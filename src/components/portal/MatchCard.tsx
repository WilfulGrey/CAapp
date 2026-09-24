import { useState } from 'react';
import type { FC } from 'react';
import { Check, ChevronDown, Heart, Lock, Sparkles, UserPlus, X } from 'lucide-react';
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
  /** Pflegesituation fehlt noch: „Einladen" als Umriss-Knopf mit Schloss; der Tipp
   *  öffnet über `onInvite` das Pop-up „Warum erst die Pflegesituation?" (Teil 3 des
   *  Redesigns, Martin 24.09. — vorher „Profil vervollständigen & einladen", brach um). */
  profilFehlt?: boolean;
  /** Tipp auf die Stufen-Plakette: Profil mit geöffneter Erklärung (07.09.,
   *  Clarity: Kunden tippten Stammkraft/Bewährt und nichts passierte). */
  onStufeClick?: () => void;
}> = ({ nurse, status, onNurseClick, onInvite, onInviteConfirm, onUndoDecline, hasInterestOrigin, isRecommended, globalInviteLocked, profilFehlt, onStufeClick }) => {
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
    <div className="relative">
      {/* Empfehlung als Zeile ÜBER der Karte, die Karte selbst mit kräftigerem
          Rand (Teil 3 des Redesigns) — vorher ein zweiter Rahmen um die Karte. */}
      {isRecommended && status === 'pending' && (
        <p className="flex items-center gap-2 mb-2 ml-1 text-[14px] font-bold text-pm-taupe">
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
      <div className="px-4 pt-4 pb-3 active:bg-pm-paper">
        <div className="flex items-center gap-3.5">
          <div className="flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-[16px] object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-[16px] flex items-center justify-center text-lg font-bold text-white"
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
              <p className="text-[17px] font-bold leading-snug text-pm-ink">
                {name}
                {nurse.age ? <span className="font-normal text-pm-mute">, {nurse.age}</span> : null}
              </p>
              {/* Öffnen-Hinweis statt „Details"-Link im Footer (11.08.) */}
              <ChevronDown className="w-4 h-4 -rotate-90 flex-shrink-0 text-pm-mute group-hover:text-pm-taupe transition-colors" />
            </div>

            <p className="mt-1"><DeutschZeile nurse={nurse} /></p>
          </div>
        </div>

        {/* Fakten über die VOLLE Kartenbreite (11.08.), nicht in der schmalen
            Spalte neben dem Foto — dort brach die Zeile mitten in der Zahl um
            („· im / Schnitt 12 Wochen"). */}
        <p className="text-[15px] leading-[1.5] mt-3 text-pm-muted">
          {(() => { const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0); return lvl.label ? (
            <span
              role={onStufeClick ? 'button' : undefined}
              onClick={onStufeClick ? (e) => { e.stopPropagation(); onStufeClick(); } : undefined}
              // py/-my: 44-px-Tippfläche, ohne die Zeile höher zu machen.
              className={`font-bold text-pm-ink ${onStufeClick ? 'inline-block py-3 -my-3 px-1 -mx-1 underline decoration-dotted underline-offset-4 cursor-pointer' : ''}`}
            >{lvl.label}:</span>
          ) : null; })()}
          {' '}{nurseFacts(nurse)}
        </p>
      </div>

      <div className="border-t border-pm-line-soft px-4 py-3 flex items-center justify-end gap-3">
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
