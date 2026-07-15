import type { FC } from 'react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, displayName, initials } from './shared';
import { MonatsAufstellung } from './MonatsAufstellung';
import { KOSTENRECHNER_URL } from '../../lib/leadEvents';

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
}> = ({ app, onNurseClick, onSignContract, vertragSigned, leadId, leadToken, onShowContract, einsatzBeendet }) => {
  const { nurse, offer } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);
  const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0);
  const bars = Array.from({ length: 3 }, (_, i) => i < nurse.language.bars);

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
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5" style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div className="text-center py-4">
        <div className="text-5xl mb-3">{einsatzBeendet ? '📋' : '🎊'}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1.5">
          {einsatzBeendet ? 'Einsatz beendet' : 'Vielen Dank — Pflegekraft gebucht!'}
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          {einsatzBeendet
            ? `Der Einsatz vom ${offer.anreisedatum} bis ${offer.abreisedatum} ist abgeschlossen. Ihre Unterlagen bleiben jederzeit zugänglich.`
            : vertragSigned
              ? 'Ihr Vertrag ist unterschrieben. Jemand aus dem Primundus-Team meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu organisieren.'
              : onSignContract
                ? 'Ihre Pflegekraft ist gebucht. Bitte schließen Sie noch Ihren Betreuungsvertrag ab — alles Weitere übernimmt das Primundus-Team.'
                : 'Wir bereiten Ihre Vertragsdokumente vor. Jemand aus dem Primundus-Team meldet sich in Kürze persönlich bei Ihnen.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div
          className="flex items-center gap-3.5 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onNurseClick(nurse)}
        >
          <div className="relative flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-14 h-14 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: nurse.color }}>{inits}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-gray-900">{name}</span>
              <span className={`flex items-center gap-0.5 text-xs font-bold pl-1 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                <span className="text-xs leading-none">{lvl.emoji}</span>{lvl.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {bars.map((f, i) => <div key={i} className={`w-2.5 h-[5px] rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />)}
              </div>
              <span className="text-xs text-gray-500">{nurse.language.level}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs font-bold text-[#9B1FA1]">{nurse.experience}</span>
            </div>
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">Profil →</span>
        </div>

      </div>

      <MonatsAufstellung offer={offer} />

      <div className="space-y-2.5">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Als nächstes</p>
        {milestones.map((m) => {
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
              <div key={m.title} className="bg-white border border-[#2A9D5C]/40 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 text-lg">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-bold text-gray-800">{m.title}</p>
                    <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Unterschrieben</span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed mb-1.5">
                    Ihr unterschriebener Dienstleistungsvertrag. Eine Kopie haben Sie auch per E-Mail erhalten.
                  </p>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1f7a45] hover:underline"
                  >
                    📄 Vertrag
                  </a>
                </div>
              </div>
            );
          }

          return (
            <div key={m.title} className={`bg-white border rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm ${vertragActionable ? 'border-[#2A9D5C]/40' : 'border-gray-200'}`}>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
                {vertragDone ? '✅' : m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-gray-800">{m.title}</p>
                  {vertragDone ? (
                    <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Unterschrieben</span>
                  ) : vertragActionable ? (
                    <span className="text-xs font-bold text-[#2A9D5C] bg-[#2A9D5C]/10 border border-[#2A9D5C]/30 px-2 py-0.5 rounded-full">Offen</span>
                  ) : (
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Folgt</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {vertragDone ? 'Ihr Vertrag ist online unterschrieben. Eine Kopie wurde Ihnen per E-Mail gesendet — Sie können ihn jederzeit hier ansehen.'
                    : vertragActionable ? 'Bitte schließen Sie noch Ihren Betreuungsvertrag ab.'
                    : m.desc}
                </p>
                {vertragActionable && (
                  <button onClick={onSignContract}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-[#2A9D5C] hover:bg-[#248a50] text-white text-sm font-bold px-4 py-2.5 transition-colors">
                    Vertrag jetzt abschließen →
                  </button>
                )}
                {/* Fallback: wenn keine leadId/Token verfügbar (sollte nicht
                    passieren, aber Defensive UI) → alter Modal-Weg. */}
                {vertragDone && onShowContract && (
                  <button onClick={onShowContract}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-[#2A9D5C]/40 bg-white hover:bg-green-50 text-[#1f7a45] text-sm font-bold px-4 py-2.5 transition-colors">
                    📄 Unterschriebenen Vertrag ansehen →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
