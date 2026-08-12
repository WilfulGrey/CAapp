import type { FC } from 'react';
import { FileText } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, displayName, initials } from './shared';

export const AppCard: FC<{
  app: Application;
  exiting?: boolean;
  onReview: () => void;
  onDecline: (id: string) => void;
  onNurseClick: (n: Nurse) => void;
  // Öffnet den (übersetzten) Chat mit der beworbenen Pflegekraft.
  onChat?: (n: Nurse) => void;
}> = ({ app, exiting, onReview, onDecline, onNurseClick, onChat }) => {
  const { nurse } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const vorname = nurse.name.split(' ')[0];
  const bars = Array.from({ length: 3 }, (_, i) => i < nurse.language.bars);

  return (
    <div
      className="bg-white rounded-2xl border-2 border-[#E76F63] overflow-hidden shadow-[0_4px_16px_rgba(231,111,99,0.15)]"
      style={exiting ? { animation: 'exitCard 0.32s ease-in forwards' } : undefined}
    >
      <div className="flex items-center justify-between px-5 py-2 bg-[#F5F5F6] border-b border-[#E9E9EB]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#8B7355]">Bewerbung</span>
          {app.status === 'new' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E3F7EF] text-[#22A06B] border border-[#B8E8D4]">Neu</span>
          )}
          {app.isInvited && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EBE2D5] text-[#8B7355] border border-[#E9E9EB]">
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
                {nurse.age ? (
                  <span className="text-sm text-gray-400 flex-shrink-0">{nurse.age} J.</span>
                ) : null}
              </div>
              {/* Ohne Einsatz KEINE Pille — sonst steht hier ein leerer
                  Rahmen (12.08.: gleicher Fehler wie im Profil, dort schon
                  gefixt; MatchCard/InterestCard hatten den Guard bereits). */}
              {(() => { const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0); return lvl.label ? (
                <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                  {lvl.label}
                </span>
              ) : null; })()}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex gap-0.5">
                {bars.map((f, i) => (
                  <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#8B7355]' : 'bg-gray-200'}`} />
                ))}
              </div>
              <span className="text-sm text-gray-500">Deutsch {nurse.language.level}</span>
              {nurse.referencePdfUrl && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#8B7355] bg-[#F5F5F6] border border-zinc-200 px-1.5 py-0.5 rounded-full"
                  title="Referenzen im Profil"
                >
                  <FileText className="w-2.5 h-2.5" />
                  Referenzen
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate">
              <span>{nurse.experience}</span>
              {nurse.history && <span> · {nurse.history.assignments} Einsätze · Ø {Math.round(nurse.history.avgDurationMonths * 4.3)} Wo.</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-4">
        <div className="bg-[#F5F5F6] rounded-xl px-4 py-3 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{app.offer.anreisedatum} – {app.offer.abreisedatum}</p>
              <p className="text-xs text-gray-500">Reisekosten á {app.offer.anreisekosten} €</p>
              <p className="text-xs text-gray-500">Täglich kündbar</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-500 mb-0.5">Tagessatz</p>
              <p className="text-xl font-bold text-[#8B7355]">{Math.round(app.offer.monatlicheKosten / 30)} €<span className="text-sm font-normal text-gray-500">/Tag</span></p>
            </div>
          </div>
        </div>
        {/*
          „Hinweis der Agentur" = application.message VERBATIM (Entscheidung
          Michał 2026-07-22, Registry #22): Rekruter schreiben dort kunden-
          relevante Hinweise („Die Pflegekraft reist mit einem Hund"). KEINE
          LLM-Redaktion, KEIN Filter — die frühere Zwischenschicht ist raus,
          für den Inhalt des Felds ist Mamamia verantwortlich. Anzeige 1:1,
          Zeilenumbrüche erhalten. coverMessage = nur noch Preview-Mocks.
        */}
        {(app.message?.trim() || app.coverMessage) && (
          <div className="mb-3 rounded-xl bg-[#F5F5F6] border border-[#E9E9EB] px-4 py-3">
            <p className="text-[11px] font-semibold text-[#8B7355] uppercase tracking-wide mb-1.5">Hinweis der Agentur</p>
            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{app.message?.trim() || app.coverMessage}</p>
          </div>
        )}
        {onChat && (
          <button
            onClick={() => onChat(nurse)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#8B7355]/30 bg-white hover:bg-[#F5F5F6] text-[#6B5444] text-sm font-semibold py-2.5 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l.8-3.2A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Frage an {vorname} stellen
          </button>
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
