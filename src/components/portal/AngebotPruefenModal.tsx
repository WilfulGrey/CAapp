import { useState } from 'react';
import type { FC } from 'react';
import { Check, Info, X } from 'lucide-react';

// Liste aller Feiertage mit doppeltem Tagessatz — wird im Konditionen-
// Modal als Popover hinter dem Info-Icon angezeigt + von der Berechnungs-
// Logik (holidaysForYear) als Quelle der Wahrheit verwendet.
const FEIERTAGE_LIST = 'Karfreitag, Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1. + 2. Weihnachtstag, Silvester, Neujahr';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { displayName, initials } from './shared';
import { VertragSignieren, type VertragsDaten } from './VertragSignieren';
import {
  parseDeDate,
  holidaysForYear,
  buildMonthlyBreakdown,
  type SummaryRow,
} from '../../lib/pricing/monthlyBreakdown';

// Contract form data captured in step 2. Returned to parent via onAccept
// so it can be POSTed to the kostenrechner bridge (which fires the team
// mail + persists in lead_application_acceptances). MVP: this data does
// NOT go to Mamamia.
export interface ContractFormData {
  // Leistungsempfänger (zu betreuende Person) = LE im Vertrag
  anrede: string;
  vorname: string;
  nachname: string;
  strasse: string;
  einsatzort: string;
  telefon: string;
  email: string;
  // Auftraggeber (Vertragspartner) = AG im Vertrag. agGleich=true → identisch
  // mit dem Leistungsempfänger (Patient unterschreibt für sich selbst).
  agGleich: boolean;
  agAnrede: string;
  agVorname: string;
  agNachname: string;
  agStrasse: string;
  agOrt: string;
  agTelefon: string;
  agEmail: string;
  // Kontaktperson (Ansprechpartner)
  kpAnrede: string;
  kpVorname: string;
  kpNachname: string;
  kpTelefon: string;
  kpEmail: string;
  signatur?: string; // getippter Name = elektronische Unterschrift (= Beauftragung)
}

// Baut das Vertrag-Dokument (VertragsDaten) aus den erfassten Formulardaten.
// Einzige Quelle der Wahrheit — genutzt vom Modal (Live-Vorschau + Signatur)
// und vom gebuchten Portal (read-only Präsentation des unterschriebenen
// Vertrags). Auftraggeber = LE wenn agGleich; sonst separat erfasst.
export function buildVertragsDaten(
  form: ContractFormData,
  offer: { anreisedatum: string; abreisedatum: string; monatlicheKosten: number },
  heute: Date = new Date(),
): VertragsDaten {
  const tagessatz = Math.round(offer.monatlicheKosten / 30);
  const datum = `${String(heute.getDate()).padStart(2, '0')}.${String(heute.getMonth() + 1).padStart(2, '0')}.${heute.getFullYear()}`;
  const leName = `${form.vorname} ${form.nachname}`.trim();
  const agName = form.agGleich ? leName : `${form.agVorname} ${form.agNachname}`.trim();
  const agStrasse = form.agGleich ? form.strasse : form.agStrasse;
  const agOrt = form.agGleich ? form.einsatzort : form.agOrt;
  // E-Mail/Telefon des Auftraggebers — fällt auf die Kontaktperson zurück,
  // damit die Vertragskopie immer ein Ziel hat (Patient hat oft keine Mail).
  const agEmail = (form.agGleich ? form.email : form.agEmail) || form.kpEmail;
  const agTelefon = (form.agGleich ? form.telefon : form.agTelefon) || form.kpTelefon;
  return {
    datum,
    ag: { name: agName || 'Auftraggeber', strasse: agStrasse, plz: '', ort: agOrt, email: agEmail, telefon: agTelefon },
    // le=null wenn AG identisch mit LE → Vertrag zeigt „identisch mit Auftraggeber".
    le: form.agGleich
      ? null
      : { name: leName || 'Leistungsempfänger', strasse: form.strasse, plz: '', ort: form.einsatzort },
    vertragsbeginn: offer.anreisedatum,
    voraussAbreise: offer.abreisedatum,
    tagessatz: `EUR ${tagessatz},00`,
    dl: { name: 'Kamila Bilska-Wabik', rolle: 'Vitanas Group' },
  };
}

// parseDeDate / holidaysForYear / buildMonthlyBreakdown / SummaryRow
// jetzt in src/lib/pricing/monthlyBreakdown.ts — Single Source of Truth
// für Portal-Preis-Beispielrechnung + Bewerbungs-Übersicht.

// Prüft ob ein Einsatz-Zeitraum tatsächlich Sommer-Monate (Juli/August)
// berührt und welche Feiertage aus unserer Policy-Liste reinfallen.
// Wird für die konditionale Footnote unter der Zusammenfassung verwendet —
// damit der Sommer-/Feiertag-Hinweis nur dann erscheint, wenn er für
// diesen konkreten Einsatz relevant ist.
function computeZuschlagRelevance(anreiseStr: string, abreiseStr: string): {
  hasSummer: boolean;
  relevantHolidayNames: string[];
} {
  const start = parseDeDate(anreiseStr);
  const end = parseDeDate(abreiseStr);
  if (!start || !end || end < start) return { hasSummer: false, relevantHolidayNames: [] };

  let hasSummer = false;
  let y = start.getFullYear();
  let m = start.getMonth();
  for (let i = 0; i < 24; i++) {
    // Juli=6, August=7 — inline statt SOMMER_MONTHS-Konstante, weil die
    // Logik außer hier nirgendwo gebraucht wird (innerhalb der Lib
    // gekapselt).
    if (m === 6 || m === 7) hasSummer = true;
    if (y === end.getFullYear() && m === end.getMonth()) break;
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }

  const all: { name: string; date: Date }[] = [];
  for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) {
    all.push(...holidaysForYear(yr));
  }
  // Dedupe Namen (Karfreitag könnte bei Mehrjahres-Range doppelt vorkommen)
  // und in Datums-Reihenfolge sortieren.
  const seen = new Set<string>();
  const relevantHolidayNames: string[] = [];
  for (const h of all.filter(h => h.date >= start && h.date <= end).sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (!seen.has(h.name)) {
      seen.add(h.name);
      relevantHolidayNames.push(h.name);
    }
  }
  return { hasSummer, relevantHolidayNames };
}

export const AngebotPruefenModal: FC<{
  app: Application;
  /** Parent-supplied defaults derived from lead + mmCustomer. Empty values
   *  render empty fields (NOT hardcoded fixture data). Step 2 lets the
   *  customer correct/fill before accepting. */
  prefill?: Partial<ContractFormData>;
  /** „Vertrag nachträglich abschließen" (Martin, 2026-07-15): öffnet das Modal
   *  DIREKT auf Schritt 2 (Vertragsformular) und blendet den Angebots-Schritt
   *  komplett aus (keine Tabs, kein „Zurück zum Angebot"-Footer). Genutzt vom
   *  BookedScreen, wenn die Annahme agentur-seitig erfolgte (synthetische
   *  fc-App) und der Kunde nur noch den Vertrag nachholt — das Angebot ist
   *  längst angenommen, es gibt nichts mehr zu prüfen. */
  contractOnly?: boolean;
  onClose: () => void;
  onAccept: (id: string, data: ContractFormData) => void | Promise<void>;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, prefill, contractOnly, onClose, onAccept, onNurseClick }) => {
  const [step, setStep] = useState<1 | 2>(contractOnly ? 2 : 1);
  const [feiertagInfoOpen, setFeiertagInfoOpen] = useState(false);
  const { nurse, offer } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  // Deutsch-Punktebalken — identisch zur geteilten PK-Karte (AppCard),
  // damit die Sprach-Optik im Modal konsistent zum restlichen Portal ist.
  const germanBars = Array.from({ length: 3 }, (_, i) => i < nurse.language.bars);

  const [anrede, setAnrede] = useState(prefill?.anrede ?? 'Frau');
  const [vorname, setVorname] = useState(prefill?.vorname ?? '');
  const [nachname, setNachname] = useState(prefill?.nachname ?? '');
  const [strasse, setStrasse] = useState(prefill?.strasse ?? '');
  const [einsatzort, setEinsatzort] = useState(prefill?.einsatzort ?? '');
  const [telefon, setTelefon] = useState(prefill?.telefon ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  // Auftraggeber (Vertragspartner) — default identisch mit Leistungsempfänger.
  const [agGleich, setAgGleich] = useState(prefill?.agGleich ?? true);
  const [agAnrede, setAgAnrede] = useState(prefill?.agAnrede ?? '');
  const [agVorname, setAgVorname] = useState(prefill?.agVorname ?? '');
  const [agNachname, setAgNachname] = useState(prefill?.agNachname ?? '');
  const [agStrasse, setAgStrasse] = useState(prefill?.agStrasse ?? '');
  const [agOrt, setAgOrt] = useState(prefill?.agOrt ?? '');
  const [agTelefon, setAgTelefon] = useState(prefill?.agTelefon ?? '');
  const [agEmail, setAgEmail] = useState(prefill?.agEmail ?? '');
  const [kpAnrede, setKpAnrede] = useState(prefill?.kpAnrede ?? '');
  const [kpVorname, setKpVorname] = useState(prefill?.kpVorname ?? '');
  const [kpNachname, setKpNachname] = useState(prefill?.kpNachname ?? '');
  const [kpTelefon, setKpTelefon] = useState(prefill?.kpTelefon ?? '');
  const [kpEmail, setKpEmail] = useState(prefill?.kpEmail ?? '');

  // Aktuelle Formulardaten als ContractFormData zusammenfassen — für die
  // Live-Vertragsvorschau (Seite 2) und beim Abschluss (onAccept).
  const formData: ContractFormData = {
    anrede, vorname, nachname, strasse, einsatzort, telefon, email,
    agGleich, agAnrede, agVorname, agNachname, agStrasse, agOrt, agTelefon, agEmail,
    kpAnrede, kpVorname, kpNachname, kpTelefon, kpEmail,
  };

  // Seite 1 (Daten) ist vollständig → weiter zum Vertrag erlaubt. Auftraggeber-
  // Name nur dann Pflicht, wenn er abweichend vom Leistungsempfänger ist.
  const agComplete = agGleich || (agVorname.trim() !== '' && agNachname.trim() !== '');
  const canProceed = vorname.trim() !== '' && nachname.trim() !== '' && strasse.trim() !== '' && einsatzort.trim() !== ''
    && agComplete
    && kpVorname.trim() !== '' && kpNachname.trim() !== '' && kpTelefon.trim() !== '' && kpEmail.trim() !== '';

  const tagessatz = Math.round(offer.monatlicheKosten / 30);

  // Vertrag-Dokument für Seite 2 — aus den eingegebenen Daten gemappt (geteilte
  // Logik, identisch zur read-only Präsentation im gebuchten Portal).
  const vertragsDaten = buildVertragsDaten(formData, offer);
  // Monatliche Aufstellung dynamisch aus Anreise-/Abreisedatum berechnen.
  // Inklusive Sommerzuschlag (Juli/August) + Feiertagszuschläge (Karfreitag,
  // Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1./2. Weihnachtstag,
  // Silvester, Neujahr). Feiertagszuschlag = tagessatz (doppelter
  // Tagessatz an Feiertagen — Policy, nicht offer.feiertagszuschlag aus
  // Mamamia).
  const summary = buildMonthlyBreakdown(
    offer.anreisedatum,
    offer.abreisedatum,
    tagessatz,
    offer.anreisekosten,
    offer.abreisekosten,
    tagessatz,
  );
  const zuschlagRelevance = computeZuschlagRelevance(offer.anreisedatum, offer.abreisedatum);

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-800 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 transition-all bg-white';
  const labelCls = 'block text-[13px] font-semibold text-gray-700 mb-1.5';
  const sectionCls = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm';
  const sectionTitleCls = 'text-[15px] font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100';

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
                  {step === 1 ? 'Angebot prüfen' : 'Daten & Vertrag'}
                </h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* contractOnly: nur ein Schritt → Tab-Navigation entfällt komplett. */}
            {!contractOnly && (
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
                  2 · Daten & Vertrag
                </button>
              </div>
            )}
          </div>

          {/* Scrollbarer Body — robustes Flex-Muster: flex-1 (füllt den Platz
              zwischen Header und fixem Footer) + min-h-0 (erlaubt Schrumpfen
              unter Content-Höhe → echtes Scrollen) + overflow-y-auto. */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {step === 1 && (/* Seite 1 oben: Pflegekraft + Konditionen (Anreise/Kosten) */
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
                    <p className="text-sm text-gray-500">{nurse.age} J. · {nurse.experience}</p>
                    {/* Deutsch mit Punktebalken — gleiche Optik wie in der
                        Standard-PK-Karte (AppCard), nicht nur Text. */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex gap-0.5">
                        {germanBars.map((f, i) => (
                          <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#8B7355]' : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <span className="text-sm text-gray-500">Deutsch {nurse.language.level}</span>
                    </div>
                  </div>
                  <button onClick={() => onNurseClick(nurse)} className="text-sm font-semibold text-[#8B7355] hover:underline flex-shrink-0">
                    Profil →
                  </button>
                </div>

                {/*
                  „Hinweis der Agentur" = application.message VERBATIM
                  (Entscheidung Michał 2026-07-22, Registry #22). Der Kunde
                  MUSS den Rekruter-Hinweis („Die Pflegekraft reist mit einem
                  Hund") vor der Annahme sehen — sonst akzeptiert er einen
                  Rozjazd unbewusst. Keine LLM-Redaktion, kein Filter; hier
                  bewusst hervorgehoben (amber), weil dies der Entscheidungs-
                  moment ist. coverMessage = nur noch Preview-Mocks.
                */}
                {(app.message?.trim() || app.coverMessage) && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Hinweis der Agentur</p>
                    <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{app.message?.trim() || app.coverMessage}</p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-700">Konditionen</p>
                    <p className="text-xs text-gray-400">{offer.submittedAt}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    {([
                      { label: 'Tagessatz', value: `${tagessatz} €/Tag`, bold: true },
                      { label: 'Anreisedatum', value: offer.anreisedatum },
                      { label: 'Abreisedatum', value: `Vorauss. ${offer.abreisedatum}` },
                      { label: 'Anreisekosten', value: `${offer.anreisekosten} €` },
                      { label: 'Abreisekosten', value: `${offer.abreisekosten} €` },
                      { label: 'Reisetage', value: 'Voller Tagessatz' },
                      { label: 'Sommerzuschlag', value: '6,67 €/Tag (Juli + Aug.)' },
                      // Feiertagszuschlag wird separat unten gerendert (mit
                      // Info-Icon zum Aufklappen der Feiertagsliste).
                      { label: 'Kündigungsfrist', value: 'Täglich' },
                    ] as { label: string; value: string; bold?: boolean }[]).map((row, idx, arr) => (
                      <div key={row.label}>
                        <div className={`flex items-center justify-between px-4 py-2.5 ${row.label === 'Kündigungsfrist' ? 'bg-green-50' : 'bg-white'}`}>
                          <span className={`text-sm flex-shrink-0 ${row.label === 'Kündigungsfrist' ? 'font-semibold text-green-800' : 'text-gray-500'}`}>{row.label}</span>
                          <span className={`text-sm text-right ${row.label === 'Kündigungsfrist' ? 'font-bold text-green-700' : row.bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{row.label === 'Kündigungsfrist' ? '✓ Täglich kündbar' : row.value}</span>
                        </div>
                        {/* Feiertagszuschlag-Block direkt nach Sommerzuschlag
                            einhängen, damit die Vertragskonditionen-Tabelle
                            in der natürlichen Reihenfolge bleibt. */}
                        {row.label === 'Sommerzuschlag' && (
                          <>
                            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-gray-100">
                              <span className="text-sm text-gray-500">Feiertagszuschlag</span>
                              <span className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5">
                                Doppelter Tagessatz
                                <button
                                  type="button"
                                  onClick={() => setFeiertagInfoOpen(v => !v)}
                                  aria-label="Welche Feiertage?"
                                  className="text-gray-400 hover:text-gray-700 transition-colors"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            </div>
                            {feiertagInfoOpen && (
                              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                                <p className="text-[12px] text-gray-600 leading-relaxed">
                                  <span className="font-semibold">Feiertage mit doppeltem Tagessatz:</span> {FEIERTAGE_LIST}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="p-5 space-y-4" style={{background:'#FAFAF9'}}>
                <div className={sectionCls}>
                  <p className={sectionTitleCls}>Leistungsempfänger <span className="font-normal text-gray-400">(zu betreuende Person)</span></p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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
                      <label className={labelCls}>Straße und Hausnummer *</label>
                      <input value={strasse} onChange={e => setStrasse(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Einsatzort *</label>
                      <input value={einsatzort} onChange={e => setEinsatzort(e.target.value)} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
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

                <div className={sectionCls}>
                  <p className={sectionTitleCls}>Auftraggeber <span className="font-normal text-gray-400">(Vertragspartner)</span></p>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={agGleich} onChange={e => setAgGleich(e.target.checked)} className="mt-0.5 accent-[#8B7355] w-4 h-4" />
                    <span className="text-[13px] text-gray-700 leading-relaxed">
                      <span className="font-semibold">Identisch mit Leistungsempfänger</span>
                      <span className="block text-gray-500">Die betreute Person ist selbst Vertragspartner und unterschreibt.</span>
                    </span>
                  </label>

                  {!agGleich && (
                    <div className="space-y-3 mt-3 pt-4 border-t border-gray-100">
                      <div>
                        <label className={labelCls}>Anrede</label>
                        <select value={agAnrede} onChange={e => setAgAnrede(e.target.value)} className={inputCls}>
                          <option value="">Bitte wählen</option>
                          <option>Frau</option><option>Herr</option><option>Divers</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Vorname *</label>
                          <input value={agVorname} onChange={e => setAgVorname(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Nachname *</label>
                          <input value={agNachname} onChange={e => setAgNachname(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Straße und Hausnummer</label>
                        <input value={agStrasse} onChange={e => setAgStrasse(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>PLZ / Ort</label>
                        <input value={agOrt} onChange={e => setAgOrt(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Telefon</label>
                          <input value={agTelefon} onChange={e => setAgTelefon(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>E-Mail</label>
                          <input value={agEmail} onChange={e => setAgEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={sectionCls}>
                  <p className={sectionTitleCls}>Kontaktperson</p>
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Anrede</label>
                      <select value={kpAnrede} onChange={e => setKpAnrede(e.target.value)} className={inputCls}>
                        <option value="">Bitte wählen</option>
                        <option>Frau</option><option>Herr</option><option>Divers</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Vorname *</label>
                        <input value={kpVorname} onChange={e => setKpVorname(e.target.value)} placeholder="Vorname" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Nachname *</label>
                        <input value={kpNachname} onChange={e => setKpNachname(e.target.value)} placeholder="Nachname" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Telefon *</label>
                        <input value={kpTelefon} onChange={e => setKpTelefon(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>E-Mail *</label>
                        <input value={kpEmail} onChange={e => setKpEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {step === 2 && (
              <div className="p-5">
                <VertragSignieren
                  embedded
                  daten={vertragsDaten}
                  signDisabled={!canProceed}
                  onSigned={(sig) => onAccept(app.id, { ...formData, signatur: sig })}
                />
              </div>
            )}
          </div>

          {/* contractOnly: Footer entfällt — er dient nur der Navigation zwischen
              den Schritten; Abschluss passiert im eingebetteten VertragSignieren. */}
          {!contractOnly && (
            <div className="flex gap-2.5 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              {step === 1 ? (
                <button
                  onClick={() => setStep(2)}
                  className="w-full rounded-xl py-3.5 text-sm font-bold bg-[#E76F63] hover:bg-[#D65E52] text-white transition-all"
                >
                  Weiter →
                </button>
              ) : (
                <button
                  onClick={() => setStep(1)}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
                >
                  ← Zurück zum Angebot
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
