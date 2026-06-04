import { useState } from 'react';
import type { FC } from 'react';
import type { Application } from './shared';
import { displayName } from './shared';
import { BookedScreen } from './BookedScreen';
import { VertragSignieren } from './VertragSignieren';

// ─── Prototyp: kompletter Buchungs-Flow zum Durchklicken ─────────────────────
// Bestätigungsmail → Portal (gebucht) → Vertrag unterschreiben → fertig.
// Reine Demo mit Dummy-Daten, um den End-to-End-Ablauf zu zeigen.

type Step = 'mail' | 'portal' | 'vertrag' | 'fertig';
const STEPS: { key: Step; label: string }[] = [
  { key: 'mail', label: 'Bestätigung' },
  { key: 'portal', label: 'Portal' },
  { key: 'vertrag', label: 'Vertrag' },
  { key: 'fertig', label: 'Fertig' },
];

const MailCard: FC<{ nurseName: string; onCta: () => void }> = ({ nurseName, onCta }) => (
  <div className="py-6 px-3">
    <div className="max-w-xl mx-auto">
      <p className="text-xs text-gray-500 mb-2 text-center">① E-Mail direkt nach der Buchung</p>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3 bg-gray-50">
          <p className="text-[11px] text-gray-400">Betreff</p>
          <p className="text-sm font-bold text-gray-900">Buchung bestätigt — {nurseName} reist an</p>
        </div>
        <div className="px-5 py-5">
          <p className="text-sm text-gray-700 mb-3">Guten Tag Herr Krumbholz,</p>
          <p className="text-sm text-gray-700 mb-4 leading-relaxed">
            herzlichen Dank für Ihr Vertrauen. Ihre Buchung ist bestätigt — <strong>{nurseName}</strong> reist
            wie geplant an. Ihr Betreuungsvertrag liegt jetzt im Portal zur Unterschrift bereit.
          </p>
          <button onClick={onCta} className="rounded-xl bg-[#2A9D5C] hover:bg-[#248a50] text-white text-sm font-bold px-5 py-3 transition-colors">
            Vertrag ansehen &amp; unterschreiben →
          </button>
          <p className="text-[12px] text-gray-400 mt-4 leading-relaxed">
            Hinweis (System): Mit der Buchung werden alle Nachfass-/Reminder-Mails automatisch gestoppt.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export const BuchungsFlow: FC<{ app: Application }> = ({ app }) => {
  const [step, setStep] = useState<Step>('mail');
  const nurseName = displayName(app.nurse.name);
  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Schritt-Indikator */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${i < stepIdx ? 'bg-[#2A9D5C] text-white' : i === stepIdx ? 'bg-[#8B7355] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i < stepIdx ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-semibold ml-2 whitespace-nowrap ${i === stepIdx ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-2 ${i < stepIdx ? 'bg-[#2A9D5C]' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Bühne */}
      {step === 'mail' && <MailCard nurseName={nurseName} onCta={() => setStep('portal')} />}

      {step === 'portal' && (
        <div className="py-4">
          <BookedScreen app={app} onNurseClick={() => {}} onSignContract={() => setStep('vertrag')} />
        </div>
      )}

      {step === 'vertrag' && <VertragSignieren onSigned={() => setStep('fertig')} />}

      {step === 'fertig' && (
        <div className="py-4">
          <div className="max-w-2xl mx-auto px-4 mb-4">
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm font-bold text-green-800">✓ Vertrag unterschrieben · Bestätigung &amp; Kopie versendet</p>
              <p className="text-[12px] text-green-700 mt-0.5">Die Nachfass- und Reminder-Mails wurden automatisch gestoppt.</p>
            </div>
          </div>
          <BookedScreen app={app} onNurseClick={() => {}} vertragSigned />
        </div>
      )}
    </div>
  );
};
