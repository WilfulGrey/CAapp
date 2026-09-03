import type { FC } from 'react';
import { ChevronDown, Mail } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, nurseFacts, displayName, initials } from './shared';
import { DeutschZeile } from './SprachBalken';

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
  return (
    <div style={exiting ? { animation: 'exitCard 0.32s ease-in forwards' } : undefined}>
      {/* Grün umrandeter Kasten: eine echte Bewerbung ist das stärkste
          positive Signal → Grün statt Coral (Martin, 18.08.). */}
      <div className="bg-white rounded-2xl border-2 border-[#22A06B] overflow-hidden shadow-[0_4px_16px_rgba(34,160,107,0.13)]">
        {/* Status-Kopf IN der Box oben, mit Icon — gleiches Muster wie der
            Interesse-/Empfehlung-Kopf (Icon im Kreis + farbige Fettzeile),
            hier grün (Martin, 18.08.). */}
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#E3F7EF' }}>
            <Mail className="w-3.5 h-3.5" style={{ color: '#22A06B' }} />
          </div>
          <p className="text-[15px] font-bold leading-snug" style={{ color: '#22A06B' }}>
            Neue Bewerbung{app.isInvited ? ' Ihrer eingeladenen Pflegekraft' : ''}
          </p>
        </div>
        <div className="px-5 pt-3 pb-5 cursor-pointer active:bg-gray-50" onClick={() => onNurseClick(nurse)}>
          <div className="flex items-center gap-3.5">
            <div className="flex-shrink-0">
              {nurse.image ? (
                <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: nurse.color }}>
                  {inits}
                </div>
              )}
            </div>

            {/* CG-Box wortgleich zur normalen Portal-Karte (MatchCard):
                „Name, Alter" · „Deutsch X" · „Stufe: Fakten" — kein Pillen-
                Badge, keine Sprachbalken, kein „J." (Martin, 18.08.). */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[17px] font-semibold leading-snug" style={{ color: '#18181B' }}>
                  {name}
                  {nurse.age ? <span className="font-normal" style={{ color: '#71717A' }}>, {nurse.age}</span> : null}
                </p>
                <ChevronDown className="w-4 h-4 -rotate-90 flex-shrink-0 text-zinc-400" />
              </div>
              <p className="mt-1"><DeutschZeile nurse={nurse} /></p>
            </div>
          </div>
          {/* Fakten über die VOLLE Kartenbreite (wie MatchCard) — in der
              schmalen Spalte neben dem Foto brach die Zeile sonst mitten in
              der Zahl um („Ø 12 / Wochen pro Einsatz"). */}
          <p className="text-[16px] mt-3" style={{ color: '#71717A' }}>
            {(() => { const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0); return lvl.label ? (
              <span className="font-semibold" style={{ color: '#18181B' }}>{lvl.label}: </span>
            ) : null; })()}
            {nurseFacts(nurse)}
          </p>
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
    </div>
  );
};
