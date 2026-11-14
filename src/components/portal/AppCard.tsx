import type { FC } from 'react';
import { Clock, Mail } from 'lucide-react';
import type { SterneStand } from '../../lib/sterne';
import { Button } from '../ui/Button';
import { nochReserviertText } from '../../lib/reservierung';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { PflegekraftProfil } from './PflegekraftProfil';
import { PunkteUndKennzahlen } from './EinstiegMinimal';

// Graue Abschnittsüberschrift wie „Warum Primundus?“ in der Preiskarte (ENTWURF 14.11.2026).
const ABSCHNITT = 'text-[15px] font-normal leading-5 text-pm-muted';

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
  const monat = app.offer.monatlicheKosten;
  const tag = Math.round(monat / 30);
  const euro = (n: number) => `${n.toLocaleString('de-DE')}\u00a0€`;
  const reise = app.offer.anreisekosten === app.offer.abreisekosten
    ? `${euro(app.offer.anreisekosten)} je Fahrt`
    : `${euro(app.offer.anreisekosten)} Anreise, ${euro(app.offer.abreisekosten)} Abreise`;
  const konditionen: [string, string][] = [
    ['Tagessatz', `${euro(tag)} (${euro(monat)} im Monat)`],
    ['Anreise', app.offer.anreisedatum],
    ['Abreise', `vorauss. ${app.offer.abreisedatum}`],
    ['Reisekosten', reise],
  ];
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
        {/* ENTWURF 14.11.2026 (Martin: „darunter halt eben so in gräulich die Pflegekraft, das Angebot und da kommt 95 € Tagessatz,
            in Klammern vielleicht nochmal den Monatssatz, Anreise, Abreise, Reisekosten und Nachricht, dass das alles so ein
            bisschen strukturierter zusammenpasst“): drei Abschnitte mit grauer Überschrift wie „Warum Primundus?“. */}
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
          <h3 className={ABSCHNITT}>Pflegekraft</h3>
          <div className="mt-2"><PflegekraftProfil nurse={nurse} onProfil={() => onNurseClick(nurse)} /></div>
        </div>

      <div className="px-4 pt-4 pb-4">
        <div className="border-t border-pm-line-soft pt-4">
          <h3 className={ABSCHNITT}>Angebot</h3>
          <dl className="mt-2 grid gap-2 text-[16px] leading-[22px]" data-bewerbung-angebot>
            {konditionen.map(([wort, wert]) => (
              <div key={wort} className="flex items-baseline justify-between gap-4">
                <dt className="text-pm-muted">{wort}</dt>
                <dd className="text-right font-semibold tabular-nums text-pm-ink">{wert}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/*
          Nachricht = application.message VERBATIM (Entscheidung
          Michał 2026-07-22, Registry #22): Rekruter schreiben dort kunden-
          relevante Hinweise („Die Pflegekraft reist mit einem Hund"). KEINE
          LLM-Redaktion, KEIN Filter — für den Inhalt des Felds ist Mamamia
          verantwortlich. Anzeige 1:1, Zeilenumbrüche erhalten. coverMessage = nur noch Preview-Mocks.
        */}
        {(app.message?.trim() || app.coverMessage) && (
          <div className="mt-4 border-t border-pm-line-soft pt-4">
            <h3 className={ABSCHNITT}>Nachricht</h3>
            <p className="mt-2 text-[16px] leading-[1.5] text-pm-ink whitespace-pre-wrap">{app.message?.trim() || app.coverMessage}</p>
          </div>
        )}
        <div className="mt-5" />
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
        {/* ENTWURF 14.11.2026 (Martin: „unter dem Button die Punkte, dann sieht das genauso aus wie im Angebot“): dieselben Punkte
            und Kennzahlen wie die Preiskarte vor dem Speichern. */}
        {vorteile && <PunkteUndKennzahlen sterne={vorteile.sterne} onBestpreis={vorteile.onBestpreis} />}
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
