// Modal shown when the customer tries to invite a 6th caregiver within
// the rolling 60-minute window. Backend gate (mamamia-proxy.inviteCaregiver)
// is the hard limit; this modal is the friendly UX explanation.
//
// Two entry points:
//   - Pre-emptive: portal reads useInviteRateState, disables the
//     "Einladen" CTA on each MatchCard/InterestCard when state.blocked,
//     and opens this modal if the user clicks anyway.
//   - Reactive: if our pre-emptive count was stale (e.g. race between
//     two tabs), backend returns HTTP 429 with retry_after_seconds and
//     the calling code opens this modal with that value.
//
// The countdown ticks down purely client-side from the initial
// retry_after_seconds — no re-fetch needed. When it hits 0 the modal
// auto-closes and the caller is expected to re-query useInviteRateState
// to confirm the slot is actually free (the oldest attempt has aged out).

import { useEffect, useState } from 'react';
import type { FC } from 'react';

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} Sekunde${seconds === 1 ? '' : 'n'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} Minute${minutes === 1 ? '' : 'n'}`;
}

export const InviteRateLimitModal: FC<{
  retryAfterSeconds: number;
  limit: number;
  windowMinutes: number;
  onClose: () => void;
}> = ({ retryAfterSeconds, limit, windowMinutes, onClose }) => {
  // Local countdown — drives the displayed wait time without re-querying
  // the backend. We trust the initial value from props (= server-truth at
  // modal-open time) and decrement locally.
  const [secondsLeft, setSecondsLeft] = useState(retryAfterSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  // Auto-close when slot frees up so the user immediately knows they
  // can try again (caller will refetch useInviteRateState on close).
  useEffect(() => {
    if (secondsLeft === 0) {
      const t = setTimeout(onClose, 500);
      return () => clearTimeout(t);
    }
  }, [secondsLeft, onClose]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.15s ease-out' }}
      />
      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.15s ease-out' }}
      >
        <div
          className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl"
          style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-6 pt-6 pb-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-amber-600"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">
                  Einladungs-Limit erreicht
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Sie haben in der letzten Stunde {limit} Pflegekräfte
                  eingeladen.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-200 space-y-2">
              <p className="text-sm text-gray-700 leading-relaxed">
                Bitte warten Sie, bis sich die bereits eingeladenen
                Pflegekräfte mit Ihren Informationen vertraut gemacht
                haben — so vermeiden Sie viele gleichzeitige Antworten,
                die schwer zu koordinieren sind.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Sie können in etwa{' '}
                <span className="font-bold text-gray-900">
                  {secondsLeft > 0 ? formatWait(secondsLeft) : 'jetzt'}
                </span>{' '}
                wieder einladen.
              </p>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Maximum: {limit} Einladungen pro {windowMinutes} Minuten
            </p>

            <button
              onClick={onClose}
              className="w-full bg-[#9B1FA1] text-white rounded-xl py-3 text-base font-bold hover:bg-[#7c1881] transition-colors"
            >
              OK, verstanden
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
