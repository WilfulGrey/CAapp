import { useState } from 'react';
import type { FC } from 'react';
import type { Application } from './shared';
import { initials } from './shared';

export const DeclineConfirmModal: FC<{
  app: Application;
  onCancel: () => void;
  onConfirm: (message: string) => void;
}> = ({ app, onCancel, onConfirm }) => {
  const [message, setMessage] = useState('');
  const { nurse } = app;
  const vorname = nurse.name.split(' ')[0] || nurse.name;
  const jahre = nurse.experienceYears ?? 0;
  const deutsch = nurse.language?.level;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onCancel}
        style={{ animation: 'fadeIn 0.15s ease-out' }} />
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.15s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl"
          style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pt-4 pb-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Bewerbung ablehnen</h2>
              <p className="text-sm text-gray-600 mt-0.5">Die Agentur wird über die Absage informiert.</p>
            </div>

            {/* Registry #164 (Code-Prüfung 14.11.2026): Pflegekraft wie die Zeile der Liste, ohne Stufe und Einsätze (Martin: „das
                mit der Elite … versteht kein Mensch“); hier nur zum Erkennen, nicht antippbar. */}
            <div className="flex items-center gap-4" data-ablehnen-pflegekraft>
              {nurse.image ? (
                <img src={nurse.image} alt="" className="h-[72px] w-[72px] flex-none rounded-full object-cover ring-1 ring-pm-line bg-pm-grund" />
              ) : (
                <span aria-hidden="true" className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-full text-[18px] font-bold text-white ring-1 ring-pm-line" style={{ backgroundColor: nurse.color }}>
                  {initials(nurse.name).slice(0, 2)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[18px] font-semibold leading-6 text-pm-ink">
                  {vorname}{nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
                </span>
                {jahre > 0 && <span className="mt-0.5 block text-[16px] leading-[22px] text-pm-ink">{jahre === 1 ? '1 Jahr Erfahrung' : `${jahre} Jahre Erfahrung`}</span>}
                {deutsch && deutsch !== '—' && <span className="mt-0.5 block text-[16px] leading-[22px] text-pm-ink">Deutsch {deutsch}</span>}
              </span>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Grund der Ablehnung <span className="text-pm-coral-ink">*</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="z.B. Die Pflegekraft passt leider nicht zu unserem Patienten…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-pm-taupe focus:ring-2 focus:ring-pm-taupe/15 transition-all resize-none"
              />
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={onCancel}
                className="flex-1 border-2 border-gray-200 text-gray-700 rounded-xl py-3 text-base font-semibold hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => onConfirm(message.trim())}
                disabled={message.trim() === ''}
                // Koralle wie alle Knöpfe außer „Pflegesituation vervollständigen“ (Martin 14.11.2026), kein Rot.
                className="flex-1 bg-pm-coral text-white rounded-xl py-3 text-base font-bold transition-colors enabled:hover:bg-pm-coral-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
