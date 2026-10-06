import type { FC } from 'react';
import { Check, FileText } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import type { SterneStand } from '../../lib/sterne';
import { PflegekraftProfil } from './PflegekraftProfil';
import { MonatsAufstellung } from './MonatsAufstellung';
import { MartaBox } from './MartaBox';
import { AngebotPerson } from './KompaktEinstieg';
import { Button } from '../ui/Button';
import { KOSTENRECHNER_URL } from '../../lib/leadEvents';

// Fassung 34 (Martin 06.10.: „nur Kleinigkeiten, damit das einfach nur optisch zu dem anderen passt. Sonst ist das ja schon
// gut."): derselbe Aufbau wie vor und nach dem Absenden — Kopf mit Initialen und großem Titel links statt Emoji, Abschnitte mit
// Überschrift, „Als Nächstes“ als Schritte in einer Karte (Kreise statt Emojis), Marta am Ende. Die Texte bleiben.

export const BookedScreen: FC<{
  app: Application;
  onNurseClick: (n: Nurse) => void;
  // Optional: macht den "Vertrag"-Schritt aktiv — „Vertrag nachträglich
  // abschließen" (Martin, 2026-07-15). Gesetzt, wenn die Annahme NICHT im
  // Portal erfolgte (synthetische fc-App aus mamamia-final_confirmation, kein
  // signedForm/contract_snapshot): Klick öffnet das Vertragsformular
  // (AngebotPruefenModal contractOnly). Nie zusammen mit vertragSigned.
  onSignContract?: () => void;
  vertragSigned?: boolean;
  // Wenn gesetzt + vertragSigned, embedden wir das gerenderte PDF
  // (lib/vertrag.ts → /api/contract-pdf/[leadId]) direkt im Vertrag-
  // Milestone als <iframe>. Genau die gleiche PDF, die der Kunde + das
  // Team auch per Mail bekommen — Mustervertrag-Look, 8 Seiten.
  leadId?: string;
  leadToken?: string;
  // Optional: öffnet den bereits unterschriebenen Vertrag zur Ansicht (read-only).
  // Fallback wenn leadId/leadToken nicht gesetzt sind — dann React-Vertrag im Modal.
  onShowContract?: () => void;
  // Im Multi-Job-Modus: wenn dieser Einsatz bereits beendet ist, ersetzen
  // wir den "🎊 Vielen Dank — Pflegekraft gebucht!"-Header durch
  // "📋 Einsatz beendet" + Datums-Zeile. Folge-Einsatz-Milestone fliegt
  // ebenfalls raus (gibt's für abgeschlossene Einsätze nicht mehr).
  einsatzBeendet?: boolean;
  /** Fassung 34: Kopf wie auf den anderen Bildschirmen (Anrede und Initialen). */
  kopf?: { name: string | null; kuerzel: string | null };
  /** Fassung 34: Marta am Ende, mit Siegel und Sternen (wie nach dem Absenden). `undefined` = kein Kasten. */
  sterne?: SterneStand | null;
}> = ({ app, onNurseClick, onSignContract, vertragSigned, leadId, leadToken, onShowContract, einsatzBeendet, kopf, sterne }) => {
  const { nurse, offer } = app;

  const milestones = einsatzBeendet
    ? [
        // Abgeschlossener Einsatz: nur noch der Vertrag als "Beleg".
        // Anreise/Folge-Einsatz sind in der Vergangenheit irrelevant.
        {
          icon: '📄',
          title: 'Vertrag',
          desc: 'Ihr Betreuungsvertrag bleibt jederzeit zugänglich.',
          ready: false,
        },
      ]
    : [
        {
          icon: '📄',
          title: 'Vertrag',
          desc: 'Ihr Betreuungsvertrag wird vorbereitet und steht bald zum Download bereit.',
          ready: false,
        },
        {
          icon: '✈️',
          title: 'Anreisedaten',
          desc: `Anreise am ${offer.anreisedatum} · Abreise am ${offer.abreisedatum}. Details folgen in Kürze.`,
          ready: false,
        },
        {
          icon: '🔄',
          title: 'Folge-Einsatz',
          desc: 'Zur Hälfte des Einsatzes öffnet sich automatisch ein neuer Suchlauf — Sie können dann wieder Pflegekräfte einladen und neue Bewerbungen erhalten.',
          ready: false,
        },
      ];

  return (
    <div className="max-w-3xl mx-auto px-5 pt-6 pb-10" style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div>
        {kopf && <AngebotPerson name={kopf.name} kuerzel={kopf.kuerzel} />}
        <h1 className={`${kopf ? 'mt-6' : ''} text-[28px] min-[376px]:text-[31px] font-extrabold leading-[1.1] tracking-[-0.035em] text-pm-ink`}>
          {einsatzBeendet ? 'Einsatz beendet' : 'Vielen Dank — Pflegekraft gebucht!'}
        </h1>
        <p className="mt-4 text-pretty text-[17px] leading-[1.55] text-pm-body">
          {einsatzBeendet
            ? `Der Einsatz vom ${offer.anreisedatum} bis ${offer.abreisedatum} ist abgeschlossen. Ihre Unterlagen bleiben jederzeit zugänglich.`
            : vertragSigned
              ? 'Ihr Vertrag ist unterschrieben. Marta\u00a0Kapcio oder jemand aus dem Primundus\u2011Team meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu organisieren.'
              : onSignContract
                ? 'Ihre Pflegekraft ist gebucht. Bitte schließen Sie noch Ihren Betreuungsvertrag ab — alles Weitere übernimmt das Primundus-Team.'
                : 'Wir bereiten Ihre Vertragsdokumente vor. Marta\u00a0Kapcio oder jemand aus dem Primundus\u2011Team meldet sich in Kürze persönlich bei Ihnen.'}
        </p>
      </div>

      {/* Ihre Pflegekraft: dasselbe geschlossene Profil wie überall (Martin 27.09.2026, „V"). */}
      <div className="mt-8">
        <PflegekraftProfil nurse={nurse} onProfil={() => onNurseClick(nurse)} />
      </div>

      {app.coverMessage && (
        <div className="mt-4 rounded-card border border-pm-line bg-white px-5 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-pm-taupe-ink">Hinweis der Agentur</p>
          <p className="mt-1.5 text-pretty text-[15px] leading-[1.55] text-pm-body italic">„{app.coverMessage}"</p>
        </div>
      )}

      <section className="mt-10">
        <MonatsAufstellung offer={offer} abschnitt />
      </section>

      <section aria-labelledby="als-naechstes" className="mt-10">
        <h2 id="als-naechstes" className="text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink">
          {/* Beendeter Einsatz: nichts folgt mehr, der Abschnitt zeigt nur noch den Vertrag (Fassung 34, Vorschlag). */}
          {einsatzBeendet ? 'Ihre Unterlagen' : 'Als Nächstes'}
        </h2>
        <ol className="mt-4 grid gap-5 rounded-card border border-pm-line bg-white px-5 py-5">
        {milestones.map((m, i) => {
          const isVertrag = m.title === 'Vertrag';
          // !einsatzBeendet als Gürtel+Hosenträger: für abgeschlossene
          // Einsätze gibt es keinen nachholbaren Vertragsschritt mehr.
          const vertragActionable = isVertrag && !!onSignContract && !vertragSigned && !einsatzBeendet;
          const vertragDone = isVertrag && vertragSigned;

          // Vertrags-PDF-URL für den eingebetteten Viewer (nur wenn leadId
          // + Token vorhanden). Server-Route rendert via puppeteer den
          // schönen Mustervertrag (lib/vertrag.ts → buildVertragAttachmentPdf).
          // Browser-PDF-Viewer-Hash #toolbar=0&navpanes=0&view=FitH versteckt
          // die Chrome-Toolbar im iframe, damit's wie ein "Kasten" wirkt.
          const pdfUrl =
            vertragDone && leadId && leadToken
              ? `${KOSTENRECHNER_URL}/api/contract-pdf/${leadId}?token=${encodeURIComponent(leadToken)}`
              : null;

          // Vertrag-Milestone: minimalistisch, ein einzeiliger Text-Link
          // mit 📄-Icon. Tap/Klick → öffnet PDF im neuen Tab, dann macht der
          // Kunde was er will (Viewer, Download, Teilen) — Browser-native.
          // Frühere Varianten (iframe-Viewer, dann Attachment-Card mit
          // separater Download-Zeile) waren beide zu umständlich.
          if (vertragDone && pdfUrl) {
            return (
              <li key={m.title} className="flex gap-4">
                <span className={`${KREIS} bg-pm-mint text-pm-green-deep`}>
                  <Check className="h-4 w-4" strokeWidth={3} aria-label="erledigt" />
                </span>
                <div className="min-w-0 pt-[3px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={TITEL}>{m.title}</p>
                    <span className={`${CHIP} bg-pm-mint text-pm-green-deep`}>✓ Unterschrieben</span>
                  </div>
                  <p className={TEXT}>
                    Ihr unterschriebener Dienstleistungsvertrag. Eine Kopie haben Sie auch per E-Mail erhalten.
                  </p>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-mb-3 -mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-pm-taupe-ink hover:text-pm-ink"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Vertrag
                  </a>
                </div>
              </li>
            );
          }

          return (
            <li key={m.title} className="flex gap-4" aria-current={vertragActionable ? 'step' : undefined}>
              <span
                aria-hidden={!vertragDone}
                className={`${KREIS} ${vertragDone ? 'bg-pm-mint text-pm-green-deep' : vertragActionable ? 'bg-pm-coral text-white' : 'bg-pm-shell text-pm-taupe-ink'}`}
              >
                {vertragDone ? <Check className="h-4 w-4" strokeWidth={3} aria-label="erledigt" /> : i + 1}
              </span>
              <div className="min-w-0 pt-[3px]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={TITEL}>{m.title}</p>
                  {vertragDone ? (
                    <span className={`${CHIP} bg-pm-mint text-pm-green-deep`}>✓ Unterschrieben</span>
                  ) : vertragActionable ? (
                    <span className={`${CHIP} bg-pm-coral-tint text-pm-coral-ink`}>Offen</span>
                  ) : (
                    <span className={`${CHIP} bg-pm-shell text-pm-taupe-ink`}>Folgt</span>
                  )}
                </div>
                <p className={TEXT}>
                  {vertragDone ? 'Ihr Vertrag ist online unterschrieben. Eine Kopie wurde Ihnen per E-Mail gesendet — Sie können ihn jederzeit hier ansehen.'
                    : vertragActionable ? 'Bitte schließen Sie noch Ihren Betreuungsvertrag ab.'
                    : m.desc}
                </p>
                {vertragActionable && (
                  <Button onClick={onSignContract} groesse="sm" className="mt-3">
                    Vertrag jetzt abschließen →
                  </Button>
                )}
                {/* Fallback: wenn keine leadId/Token verfügbar (sollte nicht
                    passieren, aber Defensive UI) → alter Modal-Weg. */}
                {vertragDone && onShowContract && (
                  <button onClick={onShowContract}
                    className="-mb-3 -mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-pm-taupe-ink hover:text-pm-ink">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Unterschriebenen Vertrag ansehen →
                  </button>
                )}
              </div>
            </li>
          );
        })}
        </ol>
      </section>

      {sterne !== undefined && (
        <div className="mt-10">
          <MartaBox sterne={sterne} />
        </div>
      )}
    </div>
  );
};

const KREIS = 'flex h-8 w-8 flex-none items-center justify-center rounded-full text-[15px] font-semibold tabular-nums';
const TITEL = 'text-[17px] font-semibold leading-[1.3] text-pm-ink';
const TEXT = 'mt-1 text-pretty text-[15px] leading-[1.5] text-pm-muted';
const CHIP = 'rounded-full px-2.5 py-0.5 text-[13px] font-semibold';
