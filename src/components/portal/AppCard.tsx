import type { FC } from 'react';
import { Check, ChevronDown, Clock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { reserviertBisText, RESERVIERUNG_STUNDEN } from '../../lib/reservierung';
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
  /** Ende der 72-h-Reservierung (src/lib/reservierung.ts). null = unbekannt → kein Hinweis. */
  reserviertBis?: Date | null;
  /** Öffnet das Bestpreisgarantie-Pop-up (Hemmnisnehmer an der Entscheidung, Martin 25.09.). */
  onBestpreis?: () => void;
}> = ({ app, exiting, onReview, onDecline, onNurseClick, onChat, reserviertBis, onBestpreis }) => {
  const { nurse } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const vorname = nurse.name.split(' ')[0];
  return (
    <div style={exiting ? { animation: 'exitCard 0.32s ease-in forwards' } : undefined}>
      {/* Grün umrandeter Kasten: eine echte Bewerbung ist das stärkste
          positive Signal → Grün statt Coral (Martin, 18.08.). */}
      <div className="bg-white rounded-card border-2 border-pm-green overflow-hidden shadow-lift">
        {/* Status-Kopf IN der Box oben, mit Icon — gleiches Muster wie der
            Interesse-/Empfehlung-Kopf (Icon im Kreis + farbige Fettzeile),
            hier grün (Martin, 18.08.). */}
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-pm-mint">
            <Mail className="w-3.5 h-3.5 text-pm-green" />
          </div>
          <p className="text-[15px] font-bold leading-snug text-pm-green-deep">
            Neue Bewerbung{app.isInvited ? ' Ihrer eingeladenen Pflegekraft' : ''}
          </p>
        </div>
        {/* 72-h-Frist offen als Reservierung (Martin 25.09.). Nur mit echtem
            Anker aus den lead_events, sonst gar nicht (nicht raten). */}
        {reserviertBis && (
          <p className="mx-5 mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold bg-pm-amber-tint text-pm-amber-ink">
            <Clock className="w-3.5 h-3.5 flex-none" aria-hidden="true" />
            {/* Countdown steht groß im Kopf; hier nur das Datum, damit die Zeile bei 360 px einzeilig bleibt. */}
            Reserviert bis {reserviertBisText(reserviertBis)}
          </p>
        )}
        <div className="px-5 pt-3 pb-5 cursor-pointer active:bg-pm-paper" onClick={() => onNurseClick(nurse)}>
          <div className="flex items-center gap-3.5">
            <div className="flex-shrink-0">
              {nurse.image ? (
                <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-[16px] object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-[16px] flex items-center justify-center text-xl font-bold text-white"
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
                <p className="text-[17px] font-bold leading-snug text-pm-ink">
                  {name}
                  {nurse.age ? <span className="font-normal text-pm-mute">, {nurse.age}</span> : null}
                </p>
                <ChevronDown className="w-4 h-4 -rotate-90 flex-shrink-0 text-pm-mute" />
              </div>
              <p className="mt-1"><DeutschZeile nurse={nurse} /></p>
            </div>
          </div>
          {/* Fakten über die VOLLE Kartenbreite (wie MatchCard) — in der
              schmalen Spalte neben dem Foto brach die Zeile sonst mitten in
              der Zahl um („Ø 12 / Wochen pro Einsatz"). */}
          <p className="text-[15px] leading-[1.5] mt-3 text-pm-muted">
            {(() => { const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0); return lvl.label ? (
              <span className="font-bold text-pm-ink">{lvl.label}: </span>
            ) : null; })()}
            {nurseFacts(nurse)}
          </p>
        </div>

      <div className="border-t border-pm-line-soft px-5 py-4">
        <div className="bg-pm-paper rounded-[14px] px-4 py-3 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-[13.5px] leading-[1.5] text-pm-muted">
              <p>{app.offer.anreisedatum} – {app.offer.abreisedatum}</p>
              <p>Reisekosten à {app.offer.anreisekosten} €</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[12.5px] text-pm-muted mb-0.5">Tagessatz</p>
              <p className="text-xl font-extrabold text-pm-ink">{Math.round(app.offer.monatlicheKosten / 30)} €<span className="text-sm font-normal text-pm-muted">/Tag</span></p>
            </div>
          </div>
        </div>
        {/* Hemmnisnehmer direkt an der Entscheidung (Martin 25.09.: Bestpreisgarantie,
            täglich kündbar). Gleiche Zusagen wie die Kostenkarte. */}
        <ul className="mb-3 space-y-1">
          <li>
            {onBestpreis ? (
              <button type="button" onClick={onBestpreis} className="min-h-[44px] -my-1.5 inline-flex items-center gap-2 text-[14.5px] font-bold text-pm-green-deep underline decoration-pm-green/40 underline-offset-4">
                <ShieldCheck className="w-4 h-4 flex-none text-pm-green" aria-hidden="true" />Bestpreisgarantie
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 text-[14.5px] font-bold text-pm-green-deep">
                <ShieldCheck className="w-4 h-4 flex-none text-pm-green" aria-hidden="true" />Bestpreisgarantie
              </span>
            )}
          </li>
          {['Täglich kündbar', 'Kosten erst ab Anreise'].map((t) => (
            <li key={t} className="flex items-center gap-2 text-[14.5px] text-pm-ink">
              <Check className="w-4 h-4 flex-none text-pm-taupe" strokeWidth={3} aria-hidden="true" />{t}
            </li>
          ))}
        </ul>
        {/*
          „Hinweis der Agentur" = application.message VERBATIM (Entscheidung
          Michał 2026-07-22, Registry #22): Rekruter schreiben dort kunden-
          relevante Hinweise („Die Pflegekraft reist mit einem Hund"). KEINE
          LLM-Redaktion, KEIN Filter — die frühere Zwischenschicht ist raus,
          für den Inhalt des Felds ist Mamamia verantwortlich. Anzeige 1:1,
          Zeilenumbrüche erhalten. coverMessage = nur noch Preview-Mocks.
        */}
        {(app.message?.trim() || app.coverMessage) && (
          <div className="mb-3 rounded-[14px] bg-pm-paper px-4 py-3">
            <p className="text-[11.5px] font-bold text-pm-taupe uppercase tracking-[.12em] mb-1.5">Hinweis der Agentur</p>
            <p className="text-[14.5px] leading-relaxed text-pm-body whitespace-pre-wrap">{app.message?.trim() || app.coverMessage}</p>
          </div>
        )}
        {onChat && (
          <button
            onClick={() => onChat(nurse)}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-full border-[1.5px] border-pm-chip bg-white hover:border-pm-taupe text-pm-taupe-ink text-[15px] font-bold transition-colors"
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
          className="min-h-[44px] -ml-2 px-2 text-[15px] text-pm-muted hover:text-pm-ink font-semibold transition-colors"
        >
          Ablehnen
        </button>
        <Button groesse="sm" onClick={onReview} className="px-6">
          Angebot prüfen →
        </Button>
      </div>
      {/* Warum es eine Frist gibt — positiv gesagt (Martin 25.09.: „Tick zu negativ"). */}
      {reserviertBis && (
        <p className="border-t border-pm-line-soft px-5 py-3.5 text-[13.5px] leading-[1.5] text-pm-muted">
          {vorname} hält den Termin {RESERVIERUNG_STUNDEN} Stunden für Sie frei. Danach ist {vorname} wieder für andere Familien da.
        </p>
      )}
      </div>
    </div>
  );
};
