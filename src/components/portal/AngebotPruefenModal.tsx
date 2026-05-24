import { useState } from 'react';
import type { FC } from 'react';
import { Check, X } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { displayName, initials } from './shared';

// Contract form data captured in step 2. Returned to parent via onAccept
// so it can be POSTed to the kostenrechner bridge (which fires the team
// mail + persists in lead_application_acceptances). MVP: this data does
// NOT go to Mamamia.
export interface ContractFormData {
  anrede: string;
  vorname: string;
  nachname: string;
  strasse: string;
  einsatzort: string;
  telefon: string;
  email: string;
  kpAnrede: string;
  kpVorname: string;
  kpNachname: string;
  kpTelefon: string;
  kpEmail: string;
}

// Parse DE-Datum "12.06.2026" → Date. Tag/Monat/Jahr-Format, falls Format
// abweicht oder ungültig → null.
function parseDeDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

const MONAT_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Sommerzuschlag: 200 € pro voller Sommer-Monat (Juli / August), anteilig
// 200/30 €/Tag wenn der Monat nur teilweise im Einsatz-Zeitraum liegt.
const SOMMER_MONTHS = new Set([6, 7]); // Juli=6, August=7 (0-indexed)
const SOMMER_PER_MONTH = 200;
const SOMMER_PER_DAY = SOMMER_PER_MONTH / 30;

// Osterdatum nach Anonymous Gregorian Algorithm (Meeus/Jones/Butcher).
// Gibt den Ostersonntag eines Jahres als Date zurück.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Deutsche Feiertage mit Zuschlag (vom User definiert). Bewegliche Feiertage
// (Karfreitag, Ostersonntag, Ostermontag) werden über easterSunday() berechnet.
function holidaysForYear(year: number): { name: string; date: Date }[] {
  const easter = easterSunday(year);
  const karfreitag = new Date(easter); karfreitag.setDate(easter.getDate() - 2);
  const ostermontag = new Date(easter); ostermontag.setDate(easter.getDate() + 1);
  return [
    { name: 'Karfreitag',         date: karfreitag },
    { name: 'Ostersonntag',       date: easter },
    { name: 'Ostermontag',        date: ostermontag },
    { name: '1. Mai',             date: new Date(year, 4, 1) },
    { name: 'Heiligabend',        date: new Date(year, 11, 24) },
    { name: '1. Weihnachtstag',   date: new Date(year, 11, 25) },
    { name: '2. Weihnachtstag',   date: new Date(year, 11, 26) },
    { name: 'Silvester',          date: new Date(year, 11, 31) },
    { name: 'Neujahr',            date: new Date(year, 0, 1) },
  ];
}

interface SummaryRow {
  monat: string;
  betrag: number;
  details: string[];
}

// Berechnet die monatliche Aufstellung von Anreisedatum bis Abreisedatum.
// - Erster Monat: Tage ab Anreise bis Monatsende + Anreisekosten
// - Mittlere Monate: volle Tage
// - Letzter Monat: Tage bis Abreise + Abreisekosten
// - Sommerzuschlag (Juli/August): voller Monat = 200 €, anteilig sonst
// - Feiertagszuschlag: pro deutschem Feiertag im Einsatz × feiertagszuschlag €/Tag
// Wenn ein Datum nicht parsbar → leeres Array (UI rendert dann nichts statt
// hardcoded Mock-Daten zu zeigen).
function buildMonthlyBreakdown(
  anreiseStr: string,
  abreiseStr: string,
  tagessatz: number,
  anreisekosten: number,
  abreisekosten: number,
  feiertagszuschlag: number,
): SummaryRow[] {
  const start = parseDeDate(anreiseStr);
  const end = parseDeDate(abreiseStr);
  if (!start || !end || end < start) return [];

  // Alle Feiertage für die im Einsatz-Range vorkommenden Jahre einsammeln
  // und auf den Range filtern. Crossing year boundaries handled.
  const allHolidays: { name: string; date: Date }[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    allHolidays.push(...holidaysForYear(y));
  }
  const holidaysInRange = allHolidays.filter(h => h.date >= start && h.date <= end);

  const rows: SummaryRow[] = [];
  let cursorYear = start.getFullYear();
  let cursorMonth = start.getMonth();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();

  // Safety-Bound: max 24 Monate (gegen Endlosschleifen bei pathologischen Inputs).
  for (let i = 0; i < 24; i++) {
    const daysInMonth = new Date(cursorYear, cursorMonth + 1, 0).getDate();
    const isFirstMonth = i === 0;
    const isLastMonth = cursorYear === endYear && cursorMonth === endMonth;

    const dayFrom = isFirstMonth ? start.getDate() : 1;
    const dayTo = isLastMonth ? end.getDate() : daysInMonth;
    const tage = dayTo - dayFrom + 1;

    const details: string[] = [`${tagessatz} €/Tag × ${tage} ${tage === 1 ? 'Tag' : 'Tage'}`];
    let betrag = tagessatz * tage;

    if (isFirstMonth && anreisekosten > 0) {
      details.push(`+ ${anreisekosten} € Anreise`);
      betrag += anreisekosten;
    }
    if (isLastMonth && abreisekosten > 0) {
      details.push(`+ ${abreisekosten} € Abreise`);
      betrag += abreisekosten;
    }

    // Sommerzuschlag (Juli / August)
    if (SOMMER_MONTHS.has(cursorMonth)) {
      const isFullSummerMonth = tage === daysInMonth;
      const sommer = isFullSummerMonth
        ? SOMMER_PER_MONTH
        : Math.round(SOMMER_PER_DAY * tage);
      details.push(isFullSummerMonth
        ? `+ ${sommer} € Sommerzuschlag`
        : `+ ${sommer} € Sommerzuschlag (${tage} ${tage === 1 ? 'Tag' : 'Tage'})`);
      betrag += sommer;
    }

    // Feiertagszuschlag — pro Feiertag im aktuellen Monat (nur wenn ein
    // Zuschlag konfiguriert ist, sonst spamen wir die UI mit 0 €-Zeilen).
    if (feiertagszuschlag > 0) {
      const holidaysThisMonth = holidaysInRange.filter(
        h => h.date.getFullYear() === cursorYear && h.date.getMonth() === cursorMonth,
      );
      for (const h of holidaysThisMonth) {
        details.push(`+ ${feiertagszuschlag} € ${h.name}`);
        betrag += feiertagszuschlag;
      }
    }

    rows.push({
      monat: `${MONAT_NAMES_DE[cursorMonth]} ${cursorYear}`,
      betrag: Math.round(betrag),
      details,
    });

    if (isLastMonth) break;
    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }
  return rows;
}

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
    if (SOMMER_MONTHS.has(m)) hasSummer = true;
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
  onClose: () => void;
  onAccept: (id: string, data: ContractFormData) => void | Promise<void>;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, prefill, onClose, onAccept, onNurseClick }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const { nurse, offer } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);

  const [anrede, setAnrede] = useState(prefill?.anrede ?? 'Frau');
  const [vorname, setVorname] = useState(prefill?.vorname ?? '');
  const [nachname, setNachname] = useState(prefill?.nachname ?? '');
  const [strasse, setStrasse] = useState(prefill?.strasse ?? '');
  const [einsatzort, setEinsatzort] = useState(prefill?.einsatzort ?? '');
  const [telefon, setTelefon] = useState(prefill?.telefon ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [kpAnrede, setKpAnrede] = useState(prefill?.kpAnrede ?? '');
  const [kpVorname, setKpVorname] = useState(prefill?.kpVorname ?? '');
  const [kpNachname, setKpNachname] = useState(prefill?.kpNachname ?? '');
  const [kpTelefon, setKpTelefon] = useState(prefill?.kpTelefon ?? '');
  const [kpEmail, setKpEmail] = useState(prefill?.kpEmail ?? '');
  const [agbChecked, setAgbChecked] = useState(false);
  const canAccept = vorname.trim() !== '' && nachname.trim() !== '' && einsatzort.trim() !== ''
    && kpVorname.trim() !== '' && kpNachname.trim() !== '' && kpTelefon.trim() !== '' && agbChecked;

  const tagessatz = Math.round(offer.monatlicheKosten / 30);
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

                {/*
                  'Nachricht der Agentur' (app.message) intentionally NOT
                  rendered. Same redaction as AppCard.tsx — the Mamamia
                  application.message field carries agency-internal back-
                  office notes (caregiver full name, phone, salary
                  breakdown DLV/PK Netto/RK, ID stubs). Verified live
                  2026-05-19 on Customer 8546 (Wendt) application 7997.
                  Defense in depth: LIST_APPLICATIONS GraphQL also drops
                  the field.
                */}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-700">Konditionen</p>
                    <p className="text-xs text-gray-400">{offer.submittedAt}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    {[
                      { label: 'Tagessatz', value: `${tagessatz} €/Tag`, bold: true },
                      { label: 'Anreisedatum', value: offer.anreisedatum },
                      { label: 'Abreisedatum', value: `Vorauss. ${offer.abreisedatum}` },
                      { label: 'Anreisekosten', value: `${offer.anreisekosten} €` },
                      { label: 'Abreisekosten', value: `${offer.abreisekosten} €` },
                      // Reisetage = volle Tagessätze (Anreise- + Abreisetage
                      // werden mit dem normalen Tagessatz berechnet).
                      { label: 'Reisetage', value: 'Voller Tagessatz' },
                      // Sommerzuschlag- + Feiertagszuschlag-Rows IMMER zeigen
                      // (= allgemeine Vertragskonditionen, keine Einsatz-
                      // spezifischen Werte). Ob die Zuschläge für DIESEN
                      // konkreten Einsatz tatsächlich anfallen, steht in der
                      // Footnote unter dem Breakdown weiter unten + ergibt
                      // sich aus der monatlichen Aufstellung.
                      { label: 'Sommerzuschlag', value: '200 €/Monat (Juli + August)' },
                      { label: 'Feiertagszuschlag', value: `${tagessatz} €/Tag · Karfreitag, Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1. + 2. Weihnachtstag, Silvester, Neujahr` },
                      // Kündigungsfrist: täglich (Policy).
                      { label: 'Kündigungsfrist', value: 'Täglich' },
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
              <div className="p-5 space-y-4" style={{background:'#FAFAF9'}}>
                <div className={sectionCls}>
                  <p className={sectionTitleCls}>Hauptpatient <span className="font-normal text-gray-400">(Vertragspartner)</span></p>
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
                      <label className={labelCls}>Straße und Hausnummer</label>
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
                  <p className={sectionTitleCls}>Kontaktperson <span className="font-normal text-gray-400">(in Notfällen)</span></p>
                  <p className="text-[13px] text-gray-500 -mt-2 mb-3">Wen sollen wir im Notfall kontaktieren?</p>
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
                        <label className={labelCls}>E-Mail</label>
                        <input value={kpEmail} onChange={e => setKpEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={sectionCls}>
                  <p className={sectionTitleCls}>Zusammenfassung</p>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden">
                      {nurse.image ? (
                        <img src={nurse.image} alt={nurse.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: nurse.color }}>{inits}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                      <p className="text-[12px] text-gray-500">Tagessatz {tagessatz} €/Tag</p>
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
                  <p className="text-[12px] text-gray-400 mt-2.5 leading-relaxed">
                    An- und Abreisetage werden mit vollem Tagessatz berechnet.
                    {zuschlagRelevance.hasSummer && (
                      <> Im Juli und August fällt ein Sommerzuschlag von 200 €/Monat (bzw. 6,67 €/Tag) an.</>
                    )}
                    {zuschlagRelevance.relevantHolidayNames.length > 0 && (
                      <> An {zuschlagRelevance.relevantHolidayNames.join(', ')} wird der doppelte Tagessatz berechnet.</>
                    )}
                  </p>
                </div>

                <label className="flex items-start gap-3 cursor-pointer p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors" onClick={() => setAgbChecked(v => !v)}>
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
                  onClick={() => canAccept && onAccept(app.id, {
                    anrede, vorname, nachname, strasse, einsatzort, telefon, email,
                    kpAnrede, kpVorname, kpNachname, kpTelefon, kpEmail,
                  })}
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
