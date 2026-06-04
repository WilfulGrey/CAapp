import { useState } from 'react';
import type { FC } from 'react';
import type { Application } from './shared';
import { displayName, initials } from './shared';
import { MonatsAufstellung } from './MonatsAufstellung';
import { VertragSignieren } from './VertragSignieren';

// ─── Prototyp: Annahme-Strecke (AngebotPruefenModal) mit Vertrag als Schritt 3 ─
// Angebot prüfen → Ihre Daten → Vertrag & Unterschrift. Zeigt, wo der Vertrag
// im Annahme-Flow sitzt. Dummy-Daten. Der echte Modal bleibt unangetastet.

type Step = 1 | 2 | 3 | 4;
const TABS = ['Angebot', 'Ihre Daten', 'Vertrag'];

const Field: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <label className="block text-[12px] font-semibold text-gray-700 mb-1">{label}</label>
    <input defaultValue={value} className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10" />
  </div>
);

export const AnnahmeFlow: FC<{ app: Application }> = ({ app }) => {
  const [step, setStep] = useState<Step>(1);
  const { nurse, offer } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  // Schritt 3 = Vertrag (Vollbild-Wiederverwendung der kompakten Vertrag-Ansicht).
  if (step === 3) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Stepper step={3} />
        <VertragSignieren onSigned={() => setStep(4)} />
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Stepper step={4} />
        <div className="max-w-xl mx-auto px-4 py-10 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pflegekraft beauftragt &amp; Vertrag unterschrieben</h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            {name} ist verbindlich gebucht. Eine Kopie des unterschriebenen Vertrags geht an Ihre E-Mail.
            Sie kommen jetzt zurück ins Portal — dort ist der Vertrag als „✓ unterschrieben" hinterlegt.
          </p>
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-left">
            <p className="text-[12px] text-green-700">Nachfass-/Reminder-Mails wurden automatisch gestoppt · Buchungsbestätigung versendet.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Stepper step={step} />
      <div className="max-w-2xl mx-auto px-4 py-5">
        {/* Pflegekraft-Kopf */}
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 px-4 py-3 mb-4 shadow-sm">
          {nurse.image
            ? <img src={nurse.image} alt={nurse.name} className="w-12 h-12 rounded-xl object-cover" />
            : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: nurse.color }}>{inits}</div>}
          <div>
            <p className="text-sm font-bold text-gray-900">{name}</p>
            <p className="text-[12px] text-gray-500">Deutsch {nurse.language.level} · {nurse.experience}</p>
          </div>
        </div>

        {step === 1 && (
          <>
            <MonatsAufstellung offer={offer} />
            <button onClick={() => setStep(2)} className="mt-5 w-full rounded-xl bg-[#8B7355] hover:bg-[#766145] text-white text-sm font-bold py-3.5 transition-colors">
              Weiter zu Ihren Daten →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm mb-3">
              <p className="text-sm font-bold text-gray-700 mb-3">Hauptpatient <span className="font-normal text-gray-400">(zu betreuende Person)</span></p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Vorname" value="Gerda" />
                <Field label="Nachname" value="Krumbholz" />
              </div>
              <Field label="Einsatzort" value="Musterstraße 12, 80331 München" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm mb-4">
              <p className="text-sm font-bold text-gray-700 mb-3">Kontaktperson <span className="font-normal text-gray-400">(in Notfällen)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" value="Steffen Krumbholz" />
                <Field label="Telefon" value="089 1234567" />
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setStep(1)} className="rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 px-5 py-3.5">← Zurück</button>
              <button onClick={() => setStep(3)} className="flex-1 rounded-xl bg-[#8B7355] hover:bg-[#766145] text-white text-sm font-bold py-3.5 transition-colors">
                Weiter zu Vertrag &amp; Unterschrift →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Stepper: FC<{ step: Step }> = ({ step }) => (
  <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
    <div className="max-w-2xl mx-auto flex items-center">
      {TABS.map((label, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={label} className={`flex items-center ${i < TABS.length - 1 ? 'flex-1' : ''}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${done ? 'bg-[#2A9D5C] text-white' : active ? 'bg-[#8B7355] text-white' : 'bg-gray-200 text-gray-500'}`}>
              {done ? '✓' : idx}
            </div>
            <span className={`text-xs font-semibold ml-2 whitespace-nowrap ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
            {i < TABS.length - 1 && <div className={`h-0.5 flex-1 mx-2 ${done ? 'bg-[#2A9D5C]' : 'bg-gray-200'}`} />}
          </div>
        );
      })}
    </div>
  </div>
);
