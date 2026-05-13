import { useState } from 'react';
import type { FC } from 'react';
import type { Application } from './shared';
import { nurseLevel, displayName, initials } from './shared';

export const DeclineConfirmModal: FC<{
  app: Application;
  onCancel: () => void;
  onConfirm: (message: string) => void;
}> = ({ app, onCancel, onConfirm }) => {
  const [message, setMessage] = useState('');
  const { nurse } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);
  const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0);

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

            <div className="flex items-center gap-3.5 bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-200">
              <div className="flex-shrink-0">
                {nurse.image ? (
                  <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                    style={{ backgroundColor: nurse.color }}>
                    {inits}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-base text-gray-900">{name}</span>
                  <span className="text-sm text-gray-500">{nurse.age} J.</span>
                  <span className={`flex items-center gap-0.5 text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                    <span className="text-xs leading-none">{lvl.emoji}</span>{lvl.label}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{nurse.experience}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Nachricht an die Agentur <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="z.B. Die Pflegekraft passt leider nicht zu unserem Patienten…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#9B1FA1] focus:ring-2 focus:ring-[#9B1FA1]/10 transition-all resize-none"
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
                onClick={() => onConfirm(message)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-3 text-base font-bold transition-colors"
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
