import type { FC } from 'react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, displayName, initials } from './shared';

export const AppCard: FC<{
  app: Application;
  exiting?: boolean;
  onReview: () => void;
  onDecline: (id: string) => void;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, exiting, onReview, onDecline, onNurseClick }) => {
  const { nurse, message } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);

  return (
    <div
      className="bg-white rounded-2xl border-2 border-[#E76F63] overflow-hidden shadow-[0_4px_16px_rgba(231,111,99,0.15)]"
      style={exiting ? { animation: 'exitCard 0.32s ease-in forwards' } : undefined}
    >
      <div className="flex items-center justify-between px-5 py-2 bg-[#F8F7F5] border-b border-[#E5E3DF]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#8B7355]">Bewerbung</span>
          {app.status === 'new' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E3F7EF] text-[#22A06B] border border-[#B8E8D4]">Neu</span>
          )}
          {app.isInvited && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EBE2D5] text-[#8B7355] border border-[#E5E3DF]">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Eingeladen
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#8B7355]">{app.appliedAt}</span>
      </div>

      <div className="px-5 pt-5 pb-5 cursor-pointer active:bg-gray-50" onClick={() => onNurseClick(nurse)}>
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: nurse.color }}>
                {inits}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <p className="text-base font-bold text-gray-900 leading-tight">{name}</p>
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
              {nurse.history && <span> · {nurse.history.assignments} Eins. · Ø {Math.round(nurse.history.avgDurationMonths * 4.3)} Wo.</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-4">
        <div className="bg-[#F8F7F5] rounded-xl px-4 py-3 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{app.offer.anreisedatum} – {app.offer.abreisedatum}</p>
              <p className="text-xs text-gray-500">Reisekosten á {app.offer.anreisekosten} €</p>
              <p className="text-xs text-gray-500">{app.offer.kuendigungsfrist}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-500 mb-0.5">Tagessatz</p>
              <p className="text-xl font-bold text-[#8B7355]">{Math.round(app.offer.monatlicheKosten / 30)} €<span className="text-sm font-normal text-gray-500">/Tag</span></p>
            </div>
          </div>
        </div>
        {message && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 border-l-2 border-[#E5E3DF] pl-3">„{message}"</p>
        )}
      </div>

      <div className="flex items-center justify-between px-5 pb-5 pt-1">
        <button
          onClick={() => onDecline(app.id)}
          className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors"
        >
          Ablehnen
        </button>
        <button
          onClick={onReview}
          className="bg-[#E76F63] hover:bg-[#D65E52] text-white rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
        >
          Angebot prüfen →
        </button>
      </div>
    </div>
  );
};
