import { useEffect, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { AlertCircle, Check, ChevronRight, Info, X } from 'lucide-react';

// Liste aller Feiertage mit doppeltem Tagessatz — wird im Konditionen-
// Modal als Popover hinter dem Info-Icon angezeigt + von der Berechnungs-
// Logik (holidaysForYear) als Quelle der Wahrheit verwendet.
const FEIERTAGE_LIST = 'Karfreitag, Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1. + 2. Weihnachtstag, Silvester, Neujahr';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { isEmail } from './shared';
import { PflegekraftProfil } from './PflegekraftProfil';

// Einzige Anreden, die Mamamia für den Leistungsempfänger annimmt (Registry #88).
// Auftraggeber und Kontaktperson behalten „Divers": dort ist die Anrede optional
// bzw. geht gar nicht nach Mamamia.
const LE_ANREDEN = ['Frau', 'Herr'];
import { VertragSignieren, type VertragsDaten } from './VertragSignieren';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
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
    ag: {
      name: agName || 'Auftraggeber', strasse: agStrasse, plz: '', ort: agOrt, email: agEmail, telefon: agTelefon,
      anrede: form.agGleich ? form.anrede : form.agAnrede,
      vorname: form.agGleich ? form.vorname : form.agVorname,
      nachname: form.agGleich ? form.nachname : form.agNachname,
    },
    // le=null wenn AG identisch mit LE → Vertrag zeigt „identisch mit Auftraggeber".
    le: form.agGleich
      ? null
      : { name: leName || 'Leistungsempfänger', strasse: form.strasse, plz: '', ort: form.einsatzort },
    vertragsbeginn: offer.anreisedatum,
    voraussAbreise: offer.abreisedatum,
    tagessatz: `EUR ${tagessatz},00`,
    dl: { name: 'Karolina Jakubowska', rolle: 'Geschäftsführerin' },
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

// ─── Was fehlt noch? (Martin 29.09.2026) ────────────────────────────────────
// Kunden riefen an, weil der Knopf „Kostenpflichtig unterschreiben" grau blieb
// und nirgends stand, welches Feld fehlt. Deshalb EINE Liste der offenen
// Pflichtangaben: sie steuert die Zusammenfassung oben, die Kästen je Block,
// die Markierung am Feld und den Sprung zum ersten offenen Feld. Die Regeln
// sind dieselben wie vorher im Tor `canProceed` (Registry #52: E-Mails leer
// oder gültig, Kontaktperson-Mail Pflicht; #88: Anrede nur Frau/Herr).
export type Block = 'le' | 'ag' | 'kp';
export interface FehlendeAngabe {
  feld: keyof ContractFormData;
  block: Block;
  label: string;
  grund: 'leer' | 'ungueltig';
}

export const BLOCK_NAME: Record<Block, string> = {
  le: 'Betreute Person',
  ag: 'Vertragspartner',
  kp: 'Kontaktperson',
};

export function fehlendeAngaben(f: ContractFormData): FehlendeAngabe[] {
  const out: FehlendeAngabe[] = [];
  const leer = (v: string) => v.trim() === '';
  const add = (feld: keyof ContractFormData, block: Block, label: string, grund: FehlendeAngabe['grund'] = 'leer') =>
    out.push({ feld, block, label, grund });
  if (!LE_ANREDEN.includes(f.anrede)) add('anrede', 'le', 'Anrede');
  if (leer(f.vorname)) add('vorname', 'le', 'Vorname');
  if (leer(f.nachname)) add('nachname', 'le', 'Nachname');
  if (leer(f.strasse)) add('strasse', 'le', 'Straße und Hausnummer');
  if (leer(f.einsatzort)) add('einsatzort', 'le', 'PLZ und Ort');
  if (!leer(f.email) && !isEmail(f.email)) add('email', 'le', 'E-Mail', 'ungueltig');
  if (!f.agGleich) {
    if (leer(f.agVorname)) add('agVorname', 'ag', 'Vorname');
    if (leer(f.agNachname)) add('agNachname', 'ag', 'Nachname');
    if (!leer(f.agEmail) && !isEmail(f.agEmail)) add('agEmail', 'ag', 'E-Mail', 'ungueltig');
  }
  if (leer(f.kpVorname)) add('kpVorname', 'kp', 'Vorname');
  if (leer(f.kpNachname)) add('kpNachname', 'kp', 'Nachname');
  if (leer(f.kpTelefon)) add('kpTelefon', 'kp', 'Telefon');
  if (leer(f.kpEmail)) add('kpEmail', 'kp', 'E-Mail');
  else if (!isEmail(f.kpEmail)) add('kpEmail', 'kp', 'E-Mail', 'ungueltig');
  return out;
}

/** Zeile der Zusammenfassung: „Straße und Hausnummer · E-Mail ungültig". */
function zeilenText(liste: FehlendeAngabe[]): string {
  return liste.map((a) => (a.grund === 'ungueltig' ? `${a.label} ungültig` : a.label)).join(' · ');
}

// Mehrdeutige Feldnamen (gibt es in mehreren Blöcken) bekommen den Block dazu.
const MEHRDEUTIG = new Set(['Anrede', 'Vorname', 'Nachname', 'Telefon', 'E-Mail']);
const kurzName = (a: FehlendeAngabe) => (MEHRDEUTIG.has(a.label) ? `${a.label} (${BLOCK_NAME[a.block]})` : a.label);

/** Kurzfassung über dem Knopf, eine Zeile (wie im Patientenbogen „Geschlecht fehlt").
 *  Bei mehreren nur die Zahl — die Namen stehen oben und am Feld; eine zweite
 *  Zeile im Fuß kostete auf dem iPhone SE zu viel Platz (gemessen). */
export function fussHinweis(liste: FehlendeAngabe[]): string | null {
  if (liste.length === 0) return null;
  if (liste.length === 1) return `${kurzName(liste[0])} ${liste[0].grund === 'ungueltig' ? 'prüfen' : 'fehlt'}`;
  return `Noch ${liste.length} Angaben offen`;
}

function anzahlText(n: number): string {
  return n === 1 ? '1 Angabe fehlt' : `${n} Angaben fehlen`;
}

// Eingabefelder mit 16 px Schrift: darunter zoomt Safari auf dem iPhone beim Tippen hinein.
const LABEL = 'block text-[14px] font-semibold text-pm-ink mb-1.5';
const EINGABE = 'w-full rounded-xl border px-3.5 py-3 text-[16px] leading-6 text-pm-ink bg-white transition-colors focus:outline-none focus:ring-2 appearance-none';
const EINGABE_OK = 'border-pm-line focus:border-pm-taupe focus:ring-pm-taupe/15';
const EINGABE_OFFEN = 'border-pm-amber bg-pm-amber-tint/50 focus:border-pm-amber focus:ring-pm-amber/20';
const EINGABE_FEHLER = 'border-pm-error bg-pm-coral-tint/60 focus:border-pm-error focus:ring-pm-error/15';

type FeldStatus = 'ok' | 'leer' | 'ungueltig';

/** Hinweis am Feld: vor dem ersten „Weiter" gelb („Bitte ausfüllen"), danach rot. */
function feldZustand(status: FeldStatus, versucht: boolean, beruehrt: boolean) {
  if (status === 'leer') return { ton: versucht ? 'fehler' : 'offen', text: null as string | null };
  if (status === 'ungueltig' && (versucht || beruehrt)) return { ton: 'fehler', text: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
  return { ton: 'ok', text: null };
}

const Hinweis: FC<{ id: string; ton: string; children: ReactNode }> = ({ id, ton, children }) => (
  <p id={id} className={`mt-1.5 flex items-center gap-1.5 text-[13.5px] leading-snug ${ton === 'fehler' ? 'text-pm-error-ink' : 'text-pm-amber-ink'}`}>
    {ton === 'fehler' && <AlertCircle className="w-4 h-4 flex-none" aria-hidden="true" />}
    {children}
  </p>
);

// Auf Modulebene (nicht im Modal definiert), sonst baut React das Feld bei
// jedem Tastendruck neu und der Cursor springt heraus.
const Eingabe: FC<{
  id: string;
  label: string;
  pflicht?: boolean;
  status?: FeldStatus;
  versucht: boolean;
  beruehrt?: boolean;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'tel' | 'email';
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email';
  autoCapitalize?: string;
  placeholder?: string;
}> = ({ id, label, pflicht, status = 'ok', versucht, beruehrt = false, value, onChange, onBlur, type = 'text', autoComplete, inputMode, autoCapitalize, placeholder }) => {
  const z = feldZustand(status, versucht, beruehrt);
  const hinweis = status === 'leer' ? 'Bitte ausfüllen' : z.text;
  const hinweisId = `${id}-hinweis`;
  return (
    <div data-feld={id}>
      <label htmlFor={id} className={LABEL}>
        {label}{pflicht && <span aria-hidden="true" className="ml-0.5 text-pm-error">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete ?? 'off'}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-required={pflicht || undefined}
        aria-invalid={z.ton === 'fehler' || undefined}
        aria-describedby={hinweis ? hinweisId : undefined}
        className={`${EINGABE} ${z.ton === 'fehler' ? EINGABE_FEHLER : z.ton === 'offen' ? EINGABE_OFFEN : EINGABE_OK}`}
      />
      {hinweis && <Hinweis id={hinweisId} ton={z.ton}>{hinweis}</Hinweis>}
    </div>
  );
};

const Auswahl: FC<{
  id: string;
  label: string;
  pflicht?: boolean;
  status?: FeldStatus;
  versucht: boolean;
  value: string;
  onChange: (v: string) => void;
  optionen: string[];
  /** Leere Option „Bitte wählen" — bei Pflichtfeldern nur, solange nichts gewählt ist. */
  leerWaehlbar?: boolean;
}> = ({ id, label, pflicht, status = 'ok', versucht, value, onChange, optionen, leerWaehlbar }) => {
  const z = feldZustand(status, versucht, false);
  const hinweisId = `${id}-hinweis`;
  return (
    <div data-feld={id}>
      <label htmlFor={id} className={LABEL}>
        {label}{pflicht && <span aria-hidden="true" className="ml-0.5 text-pm-error">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={pflicht || undefined}
        aria-invalid={z.ton === 'fehler' || undefined}
        aria-describedby={status === 'leer' ? hinweisId : undefined}
        className={`${EINGABE} max-w-[12rem] ${z.ton === 'fehler' ? EINGABE_FEHLER : z.ton === 'offen' ? EINGABE_OFFEN : EINGABE_OK}`}
      >
        {(leerWaehlbar || value === '') && <option value="" disabled={!leerWaehlbar}>Bitte wählen</option>}
        {optionen.map((o) => <option key={o}>{o}</option>)}
      </select>
      {status === 'leer' && <Hinweis id={hinweisId} ton={z.ton}>Bitte {optionen.join(' oder ')} wählen</Hinweis>}
    </div>
  );
};

const BlockKopf: FC<{ id: string; titel: string; zusatz: string; offen: number }> = ({ id, titel, zusatz, offen }) => (
  <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-pm-line-soft">
    <h3 id={id} className="text-[16px] font-bold text-pm-ink leading-snug">
      {titel}
      <span className="block text-[13px] font-normal text-pm-muted">{zusatz}</span>
    </h3>
    <StatusBadge ton={offen ? 'warnung' : 'fertig'}>{offen ? anzahlText(offen) : '✓ Vollständig'}</StatusBadge>
  </div>
);

type Schritt = 1 | 2 | 3;
const SCHRITT_TITEL: Record<Schritt, string> = { 1: 'Angebot prüfen', 2: 'Ihre Angaben', 3: 'Vertrag & Unterschrift' };
const SCHRITT_KURZ: Record<Schritt, string> = { 1: 'Angebot', 2: 'Ihre Angaben', 3: 'Unterschrift' };

// Schritt 1 gegliedert wie die Bewerbungskarte (AppCard.tsx), Martin 14.11.2026 (mockup_pruefen.html): graue
// Abschnittstitel „Pflegekraft“, „Angebot“, „Nachricht“; Zeilen links grau, rechts dunkel, dünne Linien dazwischen.
const ABSCHNITT = 'mb-3 text-[15px] font-normal leading-5 text-pm-muted';
const euro = (n: number) => `${n.toLocaleString('de-DE')} €`;

// Feld → Element-ID (Sprung aus der Zusammenfassung, aria-describedby).
const feldId = (feld: keyof ContractFormData) => `apm-${feld}`;

export const AngebotPruefenModal: FC<{
  app: Application;
  /** Parent-supplied defaults derived from lead + mmCustomer. Empty values
   *  render empty fields (NOT hardcoded fixture data). Step 2 lets the
   *  customer correct/fill before accepting. */
  prefill?: Partial<ContractFormData>;
  /** „Vertrag nachträglich abschließen" (Martin, 2026-07-15): öffnet das Modal
   *  DIREKT auf den Angaben (Schritt 2) und blendet den Angebots-Schritt
   *  komplett aus (kein „Zurück zum Angebot"). Genutzt vom BookedScreen, wenn
   *  die Annahme agentur-seitig erfolgte (synthetische fc-App) und der Kunde
   *  nur noch den Vertrag nachholt — das Angebot ist längst angenommen, es
   *  gibt nichts mehr zu prüfen. */
  contractOnly?: boolean;
  onClose: () => void;
  onAccept: (id: string, data: ContractFormData) => void | Promise<void>;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, prefill: prefillVonAussen, contractOnly, onClose, onAccept, onNurseClick }) => {
  // Eingaben überleben ein versehentliches Schließen (X, Neuladen) und eine
  // gescheiterte Übertragung nach der Unterschrift, bis der Tab zu ist — Kunden
  // sagten am Telefon „alles weg". Nur sessionStorage dieses Tabs. Nicht nach der
  // Unterschrift löschen: acceptApp meldet Erfolg/Fehler nicht zurück, und ein
  // Fehlschlag soll die Angaben nicht kosten. Name und Häkchen der Unterschrift
  // stehen nicht im Entwurf, die setzt der Kunde jedes Mal neu.
  const entwurfKey = `apm-entwurf-${app.id}`;
  const [prefill] = useState<Partial<ContractFormData> | undefined>(() => {
    try {
      const roh = window.sessionStorage.getItem(entwurfKey);
      const entwurf = roh ? (JSON.parse(roh) as Partial<ContractFormData>) : null;
      return entwurf ? { ...prefillVonAussen, ...entwurf } : prefillVonAussen;
    } catch {
      return prefillVonAussen;
    }
  });
  const [step, setStep] = useState<Schritt>(contractOnly ? 2 : 1);
  const [feiertagInfoOpen, setFeiertagInfoOpen] = useState(false);
  const { nurse, offer } = app;

  // Anrede des Leistungsempfängers geht als contract_patient.salutation an
  // StoreConfirmation — dort PFLICHT und nur 'Mr.'/'Mrs.' (Registry #88,
  // „Divers" für ein Ehepaar ⇒ Mamamia lehnte den Akzept ab).
  // Ein Prefill außerhalb von Frau/Herr (es gibt z. B. patient_anrede
  // „Familie") bleibt LEER statt still als „Frau" angezeigt und als „Familie"
  // gesendet zu werden — der Kunde wählt dann selbst.
  const [anrede, setAnrede] = useState(LE_ANREDEN.includes(prefill?.anrede ?? 'Frau') ? (prefill?.anrede ?? 'Frau') : '');
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
  // Live-Vertragsvorschau (Schritt 3) und beim Abschluss (onAccept).
  const formData: ContractFormData = {
    anrede, vorname, nachname, strasse, einsatzort, telefon, email,
    agGleich, agAnrede, agVorname, agNachname, agStrasse, agOrt, agTelefon, agEmail,
    kpAnrede, kpVorname, kpNachname, kpTelefon, kpEmail,
  };

  const entwurfJson = JSON.stringify(formData);
  useEffect(() => {
    try { window.sessionStorage.setItem(entwurfKey, entwurfJson); } catch { /* privater Modus: ohne Entwurf */ }
  }, [entwurfKey, entwurfJson]);

  const fehlend = fehlendeAngaben(formData);
  const canProceed = fehlend.length === 0;
  const statusVon = (feld: keyof ContractFormData): FeldStatus => fehlend.find((a) => a.feld === feld)?.grund ?? 'ok';
  const offenIn = (block: Block) => fehlend.filter((a) => a.block === block).length;
  // Nach dem ersten „Weiter zur Unterschrift" mit offenen Feldern: rot statt gelb.
  const [versucht, setVersucht] = useState(false);
  // E-Mail-Hinweis erst nach Verlassen des Feldes — nicht schon bei „max@" mitten im Tippen.
  const [beruehrt, setBeruehrt] = useState<Record<string, boolean>>({});
  const beruehre = (k: string) => () => setBeruehrt((t) => ({ ...t, [k]: true }));

  const scrollRef = useRef<HTMLDivElement>(null);
  const titelRef = useRef<HTMLHeadingElement>(null);
  const ersterSchritt = useRef(true);
  // Schrittwechsel: oben beginnen, Fokus auf den Titel (Screenreader hören den neuen Schritt).
  useEffect(() => {
    if (ersterSchritt.current) { ersterSchritt.current = false; return; }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    titelRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Sprung zu einem Feld: nur den Scrollbereich des Dialogs bewegen (kein
  // scrollIntoView — das scrollt in Safari das Fenster mit, Memory 24.09.)
  // und ohne weiches Scrollen (WebKit bricht es ab, Registry #102).
  const springeZu = (id: string) => {
    const box = scrollRef.current;
    const el = document.getElementById(id);
    if (!box || !el) return;
    const ziel = (el.closest('[data-feld]') as HTMLElement | null) ?? el;
    box.scrollTop = Math.max(0, ziel.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16);
    el.focus({ preventScroll: true });
  };

  const zurUnterschrift = () => {
    if (canProceed) { setStep(3); return; }
    setVersucht(true);
    springeZu(feldId(fehlend[0].feld));
  };

  const tagessatz = Math.round(offer.monatlicheKosten / 30);

  // Vertrag-Dokument für Schritt 3 — aus den eingegebenen Daten gemappt (geteilte
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

  // Zeilen „Angebot“ in Schritt 1: dieselben Werte und Bedingungen wie bisher, nur benannt wie im Entwurf
  // (Martin 14.11.2026). Reisekosten in einer Zeile: gleich hoch → „125 € je Fahrt / für Anreise und Abreise“.
  const angebotZeilen: { label: string; wert: string; zusatz?: string; feiertage?: boolean }[] = [
    // Klammer ohne Umbruch: unter 375 px bricht die Zeile vor „(“, nicht mitten in „im Monat“ (gemessen bei 320 px).
    { label: 'Tagessatz', wert: `${euro(tagessatz)} (${euro(offer.monatlicheKosten)} im Monat)` },
    { label: 'Anreise', wert: offer.anreisedatum },
    { label: 'Abreise', wert: `vorauss. ${offer.abreisedatum}` },
    offer.anreisekosten === offer.abreisekosten
      ? { label: 'Reisekosten', wert: `${euro(offer.anreisekosten)} je Fahrt`, zusatz: 'für Anreise und Abreise' }
      : { label: 'Reisekosten', wert: `${euro(offer.anreisekosten)} Anreise, ${euro(offer.abreisekosten)} Abreise` },
    { label: 'Reisetage', wert: 'voller Tagessatz' },
    // Feiertage stehen immer da (hingen bis 09.09.2026 am Sommerzuschlag und verschwanden mit ihm); ⓘ klappt die Liste auf.
    { label: 'Feiertage', wert: 'doppelter Tagessatz', feiertage: true },
    /* Sommerzuschlag nur, wenn der Einsatzzeitraum wirklich in Juli/August reicht (Martin, 09.09.2026). Berechnet wird er
       unveraendert, im Vertrag steht er weiterhin. */
    ...(zuschlagRelevance.hasSummer ? [{ label: 'Sommerzuschlag', wert: '6,67 € pro Tag', zusatz: 'im Juli und August' }] : []),
    // OpenAI-Prüfung 14.11.2026: „Kündigung: täglich kündbar“ doppelt gemoppelt → „täglich möglich“.
    { label: 'Kündigung', wert: 'täglich möglich' },
  ];

  const schritte: Schritt[] = contractOnly ? [2, 3] : [1, 2, 3];
  // Verbindungslinie von der Mitte des ersten bis zur Mitte des letzten Kreises (12 px Rand je Seite).
  const linieRand = `calc(12px + (100% - 24px) / ${2 * schritte.length})`;
  const block = 'rounded-2xl border border-pm-line bg-white p-4 min-[400px]:p-5';

  // Gruppierte Zusammenfassung: eine Zeile je Block, Sprung zum ersten offenen Feld.
  const gruppen = (['le', 'ag', 'kp'] as Block[])
    .map((b) => ({ block: b, liste: fehlend.filter((a) => a.block === b) }))
    .filter((g) => g.liste.length > 0);

  return (
    <>
      {/* Tippen daneben schließt nur auf dem Angebot. Ab den Angaben würde ein
          versehentlicher Tipp alles Eingetippte verwerfen — dort nur über das X. */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={step === 1 ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="apm-titel"
          className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[92dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col font-pm"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center pt-2 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-pm-chip" />
          </div>

          <div className="flex-shrink-0">
            <div className="flex items-center justify-between gap-3 px-5 pt-3.5 sm:pt-5">
              <h2 id="apm-titel" ref={titelRef} tabIndex={-1} className="text-[22px] leading-7 font-bold text-pm-ink outline-none">
                {SCHRITT_TITEL[step]}
              </h2>
              <button onClick={onClose} aria-label="Schließen" className="w-10 h-10 rounded-full bg-pm-grund hover:bg-pm-line flex items-center justify-center transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pm-taupe">
                <X className="w-[18px] h-[18px] text-pm-muted" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            {/* Schritte als Kreise mit Linie (Martin 14.11.2026, mockup_pruefen.html): der aktuelle dunkel gefüllt, die
                anderen grau umrandet, ohne Farbton. Erledigte sind antippbar (zurück, Haken statt Zahl), kommende nicht:
                nach vorn geht es nur über „Weiter", damit nichts übersprungen wird. */}
            <div className="relative px-3 pt-5 pb-[18px] border-b border-pm-line-soft">
              <div aria-hidden="true" className="absolute top-[34px] h-0.5 bg-pm-line" style={{ left: linieRand, right: linieRand }} />
              <ol className={`relative grid ${schritte.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} aria-label="Schritte">
                {schritte.map((s, i) => {
                  const erledigt = s < step;
                  const aktiv = s === step;
                  const inhalt = (
                    <>
                      <span data-schritt-kreis className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-[15px] font-bold tabular-nums ${aktiv ? 'border-pm-ink bg-pm-ink text-white' : 'border-pm-line bg-white text-pm-muted'}`}>
                        {erledigt ? <><Check className="h-4 w-4 text-pm-ink" strokeWidth={3} aria-hidden="true" /><span className="sr-only">{i + 1}</span></> : i + 1}
                      </span>
                      <span className={`whitespace-nowrap text-[15px] leading-5 max-[359px]:text-[14px] ${aktiv ? 'font-semibold text-pm-ink' : 'font-medium text-pm-muted'}`}>
                        {SCHRITT_KURZ[s]}
                      </span>
                    </>
                  );
                  return (
                    <li key={s} aria-current={aktiv ? 'step' : undefined} className="flex justify-center">
                      {erledigt ? (
                        <button type="button" onClick={() => setStep(s)}
                          className="relative flex flex-col items-center gap-2 rounded-lg hover:[&>span:last-child]:text-pm-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-['']">
                          {inhalt}
                        </button>
                      ) : (
                        <span className="flex flex-col items-center gap-2">{inhalt}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {/* Scrollbarer Body — robustes Flex-Muster: flex-1 (füllt den Platz
              zwischen Header und fixem Footer) + min-h-0 (erlaubt Schrumpfen
              unter Content-Höhe → echtes Scrollen) + overflow-y-auto. */}
          <div ref={scrollRef} data-scrollbox className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {step === 1 && (/* Seite 1: Pflegekraft, Angebot, Nachricht (Martin 14.11.2026, mockup_pruefen.html) */
              <div className="px-5">
                {/* Derselbe Kopf wie die Zeile der Liste und die Bewerbungskarte (PflegekraftProfil): rundes Foto 72 px,
                    „Vorname, Alter“, Erfahrung, Deutsch, Pfeil; Tipp öffnet das Profil wie vorher „Profil →“. Ohne Stufe. */}
                <div className="pt-5 pb-4" data-pruefen-pflegekraft>
                  <h3 className={ABSCHNITT}>Pflegekraft</h3>
                  <PflegekraftProfil nurse={nurse} onProfil={() => onNurseClick(nurse)} />
                </div>

                <div className="border-t border-pm-line-soft pt-5 pb-3.5">
                  <h3 className={ABSCHNITT}>Angebot</h3>
                  <dl data-pruefen-angebot>
                    {angebotZeilen.map((z) => (
                      <div key={z.label} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-pm-line-soft py-[11px] first:pt-0 last:border-b-0">
                        <dt className="flex-none text-[16px] leading-[22px] text-pm-muted">{z.label}</dt>
                        <dd className="min-w-0 flex-1 text-right text-[16px] leading-[22px] font-semibold text-pm-ink tabular-nums">
                          {z.feiertage ? (
                            <span className="inline-flex items-center gap-1.5">
                              {z.wert}
                              {/* Feste 20 px wie im Entwurf (.info): mit before:-inset-3 genau 44 px Tippfläche. */}
                              <button
                                type="button"
                                onClick={() => setFeiertagInfoOpen(v => !v)}
                                aria-label="Welche Feiertage?"
                                aria-expanded={feiertagInfoOpen}
                                aria-controls="apm-feiertage"
                                className="relative -mr-0.5 grid h-5 w-5 flex-none place-items-center text-pm-muted hover:text-pm-ink transition-colors before:absolute before:-inset-3 before:content-['']"
                              >
                                <Info className="w-[18px] h-[18px]" aria-hidden="true" />
                              </button>
                            </span>
                          ) : z.wert}
                          {z.zusatz && <span className="mt-px block text-[15px] font-normal text-pm-muted">{z.zusatz}</span>}
                        </dd>
                        {/* Immer im DOM, nur per hidden verborgen: aria-controls braucht ein vorhandenes Ziel. */}
                        {z.feiertage && (
                          <dd id="apm-feiertage" hidden={!feiertagInfoOpen} className="mt-2 w-full rounded-lg bg-pm-paper px-3 py-2 text-[14px] leading-5 text-pm-body">
                            <span className="font-semibold">Feiertage mit doppeltem Tagessatz:</span> {FEIERTAGE_LIST}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                </div>

                {/*
                  „Nachricht" = application.message VERBATIM (Entscheidung
                  Michał 2026-07-22, Registry #22). Der Kunde MUSS den
                  Rekruter-Hinweis („Die Pflegekraft reist mit einem Hund")
                  vor der Annahme sehen, sonst akzeptiert er einen Rozjazd
                  unbewusst. Keine LLM-Redaktion, kein Filter, Zeilenumbrüche
                  erhalten. Seit Martin 14.11.2026 als eigener Abschnitt wie auf
                  der Bewerbungskarte, ohne gelben Kasten. coverMessage = nur
                  noch Preview-Mocks.
                */}
                {(app.message?.trim() || app.coverMessage) && (
                  <div className="border-t border-pm-line-soft pt-5 pb-[26px]">
                    <h3 className={ABSCHNITT}>Nachricht</h3>
                    <p className="text-[16px] leading-[25px] text-pm-ink whitespace-pre-wrap">{app.message?.trim() || app.coverMessage}</p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="p-4 min-[400px]:p-5 space-y-4 bg-pm-paper">
                {/* Zusammenfassung: was fehlt, mit Sprung zum Feld — oder grün, wenn alles da ist. */}
                <div aria-live="polite"
                  className={`rounded-2xl border px-4 py-3.5 ${canProceed ? 'border-pm-green/30 bg-pm-mint' : versucht ? 'border-pm-error/40 bg-pm-coral-tint' : 'border-pm-amber/40 bg-pm-amber-tint'}`}>
                  {canProceed ? (
                    <p className="flex items-center gap-2 text-[15.5px] font-bold text-pm-green-deep">
                      <Check className="w-5 h-5 flex-none" aria-hidden="true" />
                      Alle Pflichtangaben vorhanden.
                    </p>
                  ) : (
                    <>
                      <p className="text-[16px] font-bold text-pm-ink">
                        {fehlend.length === 1 ? 'Es fehlt 1 Angabe' : `Es fehlen ${fehlend.length} Angaben`}
                      </p>
                      <ul className="mt-1 -mx-2">
                        {gruppen.map((g) => (
                          <li key={g.block}>
                            <button type="button" onClick={() => springeZu(feldId(g.liste[0].feld))}
                              className="w-full min-h-[44px] flex items-center justify-between gap-2 px-2 rounded-lg text-left text-[15px] leading-snug text-pm-body hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pm-taupe">
                              <span><b className="font-semibold text-pm-ink">{BLOCK_NAME[g.block]}:</b> {zeilenText(g.liste)}</span>
                              <ChevronRight className="w-4 h-4 flex-none text-pm-muted" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <p className="text-[13px] text-pm-muted -mt-1 px-1"><span className="text-pm-error">*</span> Pflichtangabe</p>

                <section aria-labelledby="apm-le-titel" className={block}>
                  <BlockKopf id="apm-le-titel" titel={BLOCK_NAME.le} zusatz="im Vertrag: Leistungsempfänger" offen={offenIn('le')} />
                  <div className="space-y-4">
                    <Auswahl id={feldId('anrede')} label="Anrede" pflicht status={statusVon('anrede')} versucht={versucht}
                      value={anrede} onChange={setAnrede} optionen={LE_ANREDEN} />
                    <div className="grid grid-cols-2 gap-3">
                      <Eingabe id={feldId('vorname')} label="Vorname" pflicht status={statusVon('vorname')} versucht={versucht}
                        value={vorname} onChange={setVorname} autoCapitalize="words" />
                      <Eingabe id={feldId('nachname')} label="Nachname" pflicht status={statusVon('nachname')} versucht={versucht}
                        value={nachname} onChange={setNachname} autoCapitalize="words" />
                    </div>
                    <Eingabe id={feldId('strasse')} label="Straße und Hausnummer" pflicht status={statusVon('strasse')} versucht={versucht}
                      value={strasse} onChange={setStrasse} autoCapitalize="words" />
                    <Eingabe id={feldId('einsatzort')} label="PLZ und Ort" pflicht status={statusVon('einsatzort')} versucht={versucht}
                      value={einsatzort} onChange={setEinsatzort} placeholder="z. B. 80331 München" autoCapitalize="words" />
                    <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 min-[480px]:gap-3">
                      <Eingabe id={feldId('telefon')} label="Telefon" type="tel" inputMode="tel" versucht={versucht}
                        value={telefon} onChange={setTelefon} />
                      <Eingabe id={feldId('email')} label="E-Mail" type="email" inputMode="email" autoCapitalize="off"
                        status={statusVon('email')} versucht={versucht} beruehrt={!!beruehrt.email}
                        value={email} onChange={setEmail} onBlur={beruehre('email')} />
                    </div>
                  </div>
                </section>

                <section aria-labelledby="apm-ag-titel" className={block}>
                  <BlockKopf id="apm-ag-titel" titel={BLOCK_NAME.ag} zusatz="im Vertrag: Auftraggeber" offen={offenIn('ag')} />
                  <p id="apm-ag-frage" className="text-[15px] font-semibold text-pm-ink">Wer unterschreibt den Vertrag?</p>
                  <p className="text-[13.5px] text-pm-muted mt-0.5 mb-2.5">Diese Person ist Vertragspartner und erhält die Rechnungen.</p>
                  <div role="radiogroup" aria-labelledby="apm-ag-frage" className="space-y-2">
                    {([
                      { wert: true, text: 'Die betreute Person selbst' },
                      { wert: false, text: 'Eine andere Person, z. B. Tochter oder Sohn' },
                    ]).map((o) => (
                      <label key={String(o.wert)}
                        className={`flex items-center gap-3 min-h-[48px] px-3.5 py-2.5 rounded-xl border-[1.5px] cursor-pointer transition-colors ${agGleich === o.wert ? 'border-pm-taupe bg-pm-shell/60' : 'border-pm-line bg-white hover:border-pm-chip'}`}>
                        <input type="radio" name="apm-ag-gleich" checked={agGleich === o.wert} onChange={() => setAgGleich(o.wert)}
                          className="w-5 h-5 flex-none accent-pm-taupe" />
                        <span className="text-[15px] leading-snug text-pm-ink">{o.text}</span>
                      </label>
                    ))}
                  </div>

                  {!agGleich && (
                    <div className="space-y-4 mt-4 pt-4 border-t border-pm-line-soft">
                      <Auswahl id={feldId('agAnrede')} label="Anrede" versucht={versucht} leerWaehlbar
                        value={agAnrede} onChange={setAgAnrede} optionen={['Frau', 'Herr', 'Divers']} />
                      <div className="grid grid-cols-2 gap-3">
                        <Eingabe id={feldId('agVorname')} label="Vorname" pflicht status={statusVon('agVorname')} versucht={versucht}
                          value={agVorname} onChange={setAgVorname} autoComplete="given-name" autoCapitalize="words" />
                        <Eingabe id={feldId('agNachname')} label="Nachname" pflicht status={statusVon('agNachname')} versucht={versucht}
                          value={agNachname} onChange={setAgNachname} autoComplete="family-name" autoCapitalize="words" />
                      </div>
                      <Eingabe id={feldId('agStrasse')} label="Straße und Hausnummer" versucht={versucht}
                        value={agStrasse} onChange={setAgStrasse} autoComplete="street-address" autoCapitalize="words" />
                      <Eingabe id={feldId('agOrt')} label="PLZ und Ort" versucht={versucht}
                        value={agOrt} onChange={setAgOrt} placeholder="z. B. 80331 München" autoCapitalize="words" />
                      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 min-[480px]:gap-3">
                        <Eingabe id={feldId('agTelefon')} label="Telefon" type="tel" inputMode="tel" autoComplete="tel" versucht={versucht}
                          value={agTelefon} onChange={setAgTelefon} />
                        <Eingabe id={feldId('agEmail')} label="E-Mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="off"
                          status={statusVon('agEmail')} versucht={versucht} beruehrt={!!beruehrt.agEmail}
                          value={agEmail} onChange={setAgEmail} onBlur={beruehre('agEmail')} />
                      </div>
                    </div>
                  )}
                </section>

                <section aria-labelledby="apm-kp-titel" className={block}>
                  <BlockKopf id="apm-kp-titel" titel={BLOCK_NAME.kp} zusatz="für Rückfragen" offen={offenIn('kp')} />
                  <div className="space-y-4">
                    <Auswahl id={feldId('kpAnrede')} label="Anrede" versucht={versucht} leerWaehlbar
                      value={kpAnrede} onChange={setKpAnrede} optionen={['Frau', 'Herr', 'Divers']} />
                    <div className="grid grid-cols-2 gap-3">
                      <Eingabe id={feldId('kpVorname')} label="Vorname" pflicht status={statusVon('kpVorname')} versucht={versucht}
                        value={kpVorname} onChange={setKpVorname} autoComplete="given-name" autoCapitalize="words" />
                      <Eingabe id={feldId('kpNachname')} label="Nachname" pflicht status={statusVon('kpNachname')} versucht={versucht}
                        value={kpNachname} onChange={setKpNachname} autoComplete="family-name" autoCapitalize="words" />
                    </div>
                    <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 min-[480px]:gap-3">
                      <Eingabe id={feldId('kpTelefon')} label="Telefon" pflicht type="tel" inputMode="tel" autoComplete="tel"
                        status={statusVon('kpTelefon')} versucht={versucht} value={kpTelefon} onChange={setKpTelefon} />
                      <Eingabe id={feldId('kpEmail')} label="E-Mail" pflicht type="email" inputMode="email" autoComplete="email" autoCapitalize="off"
                        status={statusVon('kpEmail')} versucht={versucht} beruehrt={!!beruehrt.kpEmail}
                        value={kpEmail} onChange={setKpEmail} onBlur={beruehre('kpEmail')} />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {step === 3 && (
              <div className="p-4 min-[400px]:p-5">
                <VertragSignieren
                  embedded
                  daten={vertragsDaten}
                  // Schritt 3 erreicht man nur mit vollständigen Angaben. Fehlt
                  // trotzdem etwas, sagt die Unterschrift das, statt zu senden.
                  signDisabled={!canProceed}
                  onSigned={(sig) => onAccept(app.id, { ...formData, signatur: sig })}
                />
              </div>
            )}
          </div>

          {/* Leichter Schatten nach oben wie im Entwurf (.fuss, Martin 14.11.2026): trennt den Fuß vom Inhalt darüber. */}
          <div data-pruefen-fuss className="px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-pm-line-soft flex-shrink-0 bg-white shadow-[0_-6px_16px_rgba(28,28,28,0.04)]">
            {step === 2 && fehlend.length > 0 && (
              <div className="mb-2 text-center">
                <button type="button" onClick={() => springeZu(feldId(fehlend[0].feld))}
                  className={`inline-flex min-h-[44px] -my-2.5 items-center px-2 text-[13.5px] underline underline-offset-4 ${versucht ? 'text-pm-error-ink decoration-pm-error/40' : 'text-pm-amber-ink decoration-pm-amber/40'}`}>
                  {fussHinweis(fehlend)}
                </button>
              </div>
            )}
            {/* Martin 14.11.2026 (mockup_pruefen.html): nimmt die Sorge, mit „Weiter" schon etwas zu buchen. */}
            {step === 1 && (
              <p className="mb-3 text-center text-[15px] leading-5 text-pm-muted">Sie unterschreiben erst in Schritt 3.</p>
            )}
            <div className="flex gap-2.5">
            {step === 1 && (
              <Button breit onClick={() => setStep(2)} className="!min-h-[54px] !rounded-[12px] !text-[16px]">
                Weiter<ChevronRight className="w-[18px] h-[18px] flex-none" strokeWidth={2.5} aria-hidden="true" />
              </Button>
            )}
            {step === 2 && (
              <>
                {/* 16 px unter 375 px Breite: sonst bricht „Weiter zur Unterschrift" auf dem iPhone SE um (gemessen). */}
                {!contractOnly && (
                  <Button variante="sekundaer" onClick={() => setStep(1)} className="flex-none !px-4 !text-[16px] min-[375px]:!text-[17px]">Zurück</Button>
                )}
                <Button breit onClick={zurUnterschrift} className="flex-1 !px-3 !text-[16px] min-[375px]:!text-[17px] whitespace-nowrap">Weiter zur Unterschrift</Button>
              </>
            )}
            {step === 3 && (
              <Button variante="sekundaer" breit onClick={() => setStep(2)}>Zurück zu Ihren Angaben</Button>
            )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
