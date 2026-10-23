import type { FC } from 'react';
import { Check, Clock, Mail } from 'lucide-react';
import { HERO_PUNKTE } from '../../lib/heroPunkte';
import type { SterneStand } from '../../lib/sterne';
import { BewertungsZeile } from './BewertungsZeile';
import { Button } from '../ui/Button';
import { nochReserviertText } from '../../lib/reservierung';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { PflegekraftProfil } from './PflegekraftProfil';

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
  /** Vorteile der Kostenrechner-Startseite + Sterne UNTER „Angebot prüfen" (Martin 25.09.:
   *  „erst die Bewerbung, dann Angebot prüfen und darunter die Punkte"). Nur an einer Karte. */
  vorteile?: { onBestpreis: () => void; sterne: SterneStand | null };
}> = ({ app, exiting, onReview, onDecline, onNurseClick, onChat, reserviertBis, vorteile }) => {
  const { nurse } = app;
  const vorname = nurse.name.split(' ')[0];
  return (
    <div style={exiting ? { animation: 'exitCard 0.32s ease-in forwards' } : undefined}>
      {/* Grün umrandeter Kasten: eine echte Bewerbung ist das stärkste
          positive Signal → Grün statt Coral (Martin, 18.08.). */}
      <div className="bg-white rounded-card border-2 border-pm-green overflow-hidden shadow-lift">
        {/* Kopfleiste der Bewerbung (Martin 27.09.2026, „V"): „Neue Bewerbung" gehört zur
            Bewerbung, nicht ins Profil. Darunter das geschlossene Profil, dann das Angebot —
            alles im grünen Rahmen, identisch mit der Mail. */}
        <div className="flex items-center gap-2 bg-pm-mint px-5 py-3 text-[15.5px] font-extrabold text-pm-green-deep">
          <Mail className="w-4 h-4 flex-none" aria-hidden="true" />
          {/* Immer nur „Neue Bewerbung" (Martin 25.09.: nicht „Ihrer eingeladenen Pflegekraft"). */}
          Neue Bewerbung
        </div>
        <div className="px-4 pt-4">
          {/* 72-h-Frist offen als Reservierung (Martin 25.09.). Nur mit echtem
              Anker aus den lead_events, sonst gar nicht (nicht raten). */}
          {reserviertBis && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold bg-pm-amber-tint text-pm-amber-ink">
              <Clock className="w-3.5 h-3.5 flex-none" aria-hidden="true" />
              {/* Nur bei mehreren Bewerbungen (jede hat ihre Zeit); bei einer steht der Countdown im Kopf. */}
              {nochReserviertText(reserviertBis)}
            </p>
          )}
          <PflegekraftProfil nurse={nurse} onProfil={() => onNurseClick(nurse)} />
        </div>

      <div className="px-5 pt-4 pb-4">
        <p className="text-[13.5px] text-pm-muted">Tagessatz</p>
        <p className="text-[26px] font-extrabold leading-tight text-pm-ink">{Math.round(app.offer.monatlicheKosten / 30)}&nbsp;€<span className="text-[14.5px] font-medium text-pm-muted">&nbsp;/&nbsp;Tag</span></p>
        <p className="mt-1.5 mb-4 text-[14.5px] leading-normal text-pm-body">
          <span className="whitespace-nowrap">{app.offer.anreisedatum} – {app.offer.abreisedatum}</span>
          {' · '}
          <span className="whitespace-nowrap">Reisekosten à {app.offer.anreisekosten}&nbsp;€</span>
        </p>
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
        {/* Hauptknopf über die volle Breite, darunter die Vorteile wie auf der
            Kostenrechner-Startseite (Martin 25.09.). */}
        <Button breit onClick={onReview} className={`px-3 whitespace-nowrap ${onChat ? 'mt-3' : ''}`}>
          Angebot prüfen
        </Button>
        {vorteile && (
          <>
            <ul className="mt-4 flex flex-col gap-2.5">
              {HERO_PUNKTE.map((punkt) => (
                <li key={punkt} className="flex items-center gap-1.5 text-[14px] min-[375px]:text-[14.5px] min-[390px]:gap-2 min-[390px]:text-[15px] leading-snug text-pm-ink">
                  <Check className="h-[17px] w-[17px] flex-shrink-0 text-pm-coral" strokeWidth={2.5} aria-hidden="true" />
                  {punkt}
                </li>
              ))}
              <li className="flex items-center gap-1.5 text-[14px] min-[375px]:text-[14.5px] min-[390px]:gap-2 min-[390px]:text-[15px] leading-snug text-pm-ink">
                <Check className="h-[17px] w-[17px] flex-shrink-0 text-pm-coral" strokeWidth={2.5} aria-hidden="true" />
                <span>
                  Bestpreisgarantie{' '}
                  <button type="button" onClick={vorteile.onBestpreis} className="inline-flex min-h-[44px] -my-3 items-center font-semibold text-pm-green-deep underline underline-offset-[3px]">
                    Mehr Infos
                  </button>
                </span>
              </li>
            </ul>
            <BewertungsZeile stand={vorteile.sterne} className="mt-2" />
          </>
        )}
      </div>

      <div className="px-5 pb-4 text-center">
        <button
          onClick={() => onDecline(app.id)}
          className="min-h-[44px] px-3 text-[15px] text-pm-muted hover:text-pm-ink font-semibold underline underline-offset-4 decoration-pm-line transition-colors"
        >
          Ablehnen
        </button>
      </div>

      </div>
    </div>
  );
};
