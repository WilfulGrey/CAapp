import { useState } from 'react';
import type { FC } from 'react';
import { Check, X } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { displayName, initials } from './shared';

export const AngebotPruefenModal: FC<{
  app: Application;
  onClose: () => void;
  onAccept: (id: string) => void;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, onClose, onAccept, onNurseClick }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const { nurse, offer } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);

  const [anrede, setAnrede] = useState('Frau');
  const [vorname, setVorname] = useState('Hildegard');
  const [nachname, setNachname] = useState('Müller');
  const [strasse, setStrasse] = useState('Rosenstraße 12');
  const [einsatzort, setEinsatzort] = useState('80331, München');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [kpAnrede, setKpAnrede] = useState('');
  const [kpVorname, setKpVorname] = useState('');
  const [kpNachname, setKpNachname] = useState('');
  const [kpTelefon, setKpTelefon] = useState('');
  const [kpEmail, setKpEmail] = useState('');
  const [agbChecked, setAgbChecked] = useState(false);
  const canAccept = vorname.trim() !== '' && nachname.trim() !== '' && einsatzort.trim() !== ''
    && kpVorname.trim() !== '' && kpNachname.trim() !== '' && kpTelefon.trim() !== '' && agbChecked;

  const tagessatz = Math.round(offer.monatlicheKosten / 30);
  const summary = [
    { monat: 'Mai 2026', betrag: offer.monatlicheKosten, details: [`${tagessatz} €/Tag × 31 Tage`, `+ ${offer.anreisekosten} € Anreise`] },
    { monat: 'Juni 2026', betrag: offer.monatlicheKosten, details: [`${tagessatz} €/Tag × 30 Tage`] },
    { monat: 'Juli 2026', betrag: Math.round(tagessatz * 12 + offer.abreisekosten), details: [`${tagessatz} €/Tag × 12 Tage`, `+ ${offer.abreisekosten} € Abreise`] },
  ];

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-800 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 transition-all bg-white';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[92dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pt-5 pb-0 flex-shrink-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {step === 1 ? 'Angebot prüfen' : 'Betreuungskraft auswählen'}
                </h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex border-b border-gray-100 mt-1">
              <button
                onClick={() => setStep(1)}
                className={`flex items-center gap-1.5 px-1 pb-2.5 text-xs font-semibold mr-5 border-b-2 transition-colors ${step === 1 ? 'border-[#8B7355] text-[#8B7355]' : 'border-transparent text-gray-400'}`}
              >
                {step === 2 && <Check className="w-3 h-3 text-[#22A06B]" />}
                1 · Angebot
              </button>
              <button
                className={`flex items-center gap-1.5 px-1 pb-2.5 text-xs font-semibold border-b-2 transition-colors ${step === 2 ? 'border-[#8B7355] text-[#8B7355]' : 'border-transparent text-gray-400'}`}
              >
                2 · Vertrag &amp; Bestätigung
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {step === 1 && (
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden">
                    {nurse.image ? (
                      <img src={nurse.image} alt={nurse.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: nurse.color }}>
                        {inits}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900">{name}</p>
                    <p className="text-sm text-gray-500">{nurse.age} J. · {nurse.experience} · Deutsch {nurse.language.level}</p>
                  </div>
                  <button onClick={() => onNurseClick(nurse)} className="text-sm font-semibold text-[#8B7355] hover:underline flex-shrink-0">
                    Profil →
                  </button>
                </div>

                {app.message && (
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-2">Nachricht der Agentur</p>
                    <div className="border-l-4 border-[#8B7355] pl-4 py-1">
                      <p className="text-sm text-gray-600 leading-relaxed">„{app.message}"</p>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-700">Konditionen</p>
                    <p className="text-xs text-gray-400">{offer.submittedAt}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    {[
                      { label: 'Mtl. Betreuungskosten', value: `${offer.monatlicheKosten.toLocaleString('de-DE')} €`, bold: true },
                      { label: 'Anreisedatum', value: offer.anreisedatum },
                      { label: 'Abreisedatum', value: `Vorauss. ${offer.abreisedatum}` },
                      { label: 'Anreisekosten', value: `${offer.anreisekosten} €` },
                      { label: 'Abreisekosten', value: `${offer.abreisekosten} €` },
                      { label: 'Reisetage', value: offer.reisetage },
                      { label: 'Feiertagszuschlag', value: offer.feiertagszuschlag === 0 ? '0 €' : `${offer.feiertagszuschlag} €/Tag` },
                      { label: 'Kündigungsfrist', value: offer.kuendigungsfrist },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between px-4 py-2.5 bg-white">
                        <span className="text-sm text-gray-500">{row.label}</span>
                        <span className={`text-sm ${(row as { bold?: boolean }).bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="p-5 space-y-5">
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-3">Hauptpatient (Vertragspartner)</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Anrede</label>
                        <select value={anrede} onChange={e => setAnrede(e.target.value)} className={inputCls}>
                          <option>Frau</option><option>Herr</option><option>Divers</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Titel</label>
                        <select className={inputCls}>
                          <option>Kein Titel</option><option>Dr.</option><option>Prof.</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Vorname *</label>
                        <input value={vorname} onChange={e => setVorname(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Nachname *</label>
                        <input value={nachname} onChange={e => setNachname(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Straße und Hausnummer</label>
                      <input value={strasse} onChange={e => setStrasse(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Einsatzort *</label>
                      <input value={einsatzort} onChange={e => setEinsatzort(e.target.value)} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Telefon</label>
                        <input value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>E-Mail</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <div>
                  <p className="text-sm font-bold text-gray-700 mb-0.5">Kontaktperson <span className="text-gray-400 font-normal">(in Notfällen)</span></p>
                  <p className="text-sm text-gray-400 mb-3">Wen sollen wir bei Notfällen kontaktieren?</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Anrede</label>
                        <select value={kpAnrede} onChange={e => setKpAnrede(e.target.value)} className={inputCls}>
                          <option value="">Bitte wählen</option>
                          <option>Frau</option><option>Herr</option><option>Divers</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Vorname *</label>
                        <input value={kpVorname} onChange={e => setKpVorname(e.target.value)} placeholder="Vorname" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Nachname *</label>
                        <input value={kpNachname} onChange={e => setKpNachname(e.target.value)} placeholder="Nachname" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Telefon *</label>
                        <input value={kpTelefon} onChange={e => setKpTelefon(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>E-Mail</label>
                        <input value={kpEmail} onChange={e => setKpEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden">
                      {nurse.image ? (
                        <img src={nurse.image} alt={nurse.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: nurse.color }}>{inits}</div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Zusammenfassung</p>
                      <p className="text-sm text-gray-500">{name}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <span className="text-sm text-gray-500">Anreise</span>
                      <span className="text-sm font-semibold text-gray-700">{offer.anreisedatum}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <span className="text-sm text-gray-500">Abreise</span>
                      <span className="text-sm font-semibold text-gray-700">{offer.abreisedatum}</span>
                    </div>
                    {summary.map(m => (
                      <div key={m.monat} className="px-4 py-2.5 bg-white">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700">{m.monat}</span>
                          <span className="text-sm font-bold text-gray-900">{m.betrag.toLocaleString('de-DE')} €</span>
                        </div>
                        {m.details.map(d => (
                          <p key={d} className="text-xs text-gray-400 text-right mt-0.5">{d}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 px-1">Reisekosten werden nach <em>halben Tag</em> berechnet. Provision ist im Monatspreis enthalten.</p>
                </div>

                <label className="flex items-start gap-3 cursor-pointer p-4 bg-gray-50 border border-gray-200 rounded-xl" onClick={() => setAgbChecked(v => !v)}>
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-all ${agbChecked ? 'bg-[#8B7355] border-[#8B7355]' : 'border-gray-300 bg-white'}`}>
                    {agbChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <span className="text-sm text-gray-600 leading-relaxed">
                    Ich akzeptiere das Angebot verbindlich und bestätige, dass alle Angaben korrekt sind. Der Vertrag wird direkt mit der Agentur geschlossen.
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className={`flex gap-2.5 px-5 py-4 border-t border-gray-100 flex-shrink-0 ${step === 2 ? 'flex-row' : 'flex-col'}`}>
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                className="w-full bg-[#E76F63] hover:bg-[#D65E52] text-white rounded-xl py-3.5 text-sm font-bold transition-all"
              >
                Weiter →
              </button>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all flex-shrink-0"
                >
                  ← Zurück
                </button>
                <button
                  onClick={() => canAccept && onAccept(app.id)}
                  disabled={!canAccept}
                  className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${canAccept ? 'bg-[#E76F63] hover:bg-[#D65E52] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  Betreuungskraft akzeptieren
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
