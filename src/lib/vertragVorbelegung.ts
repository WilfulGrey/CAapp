// Vorbelegung des Vertragsformulars beim Annehmen einer Bewerbung
// (AngebotPruefenModal, Schritt „Ihre Angaben").
//
// Registry #130 (Martin 20.10.2026): „beim 2. Job oder weiteren Jobs muss man beim
// Annehmen immer alle Kunden- und Kontaktdaten eingeben … es soll vorausgefüllt
// sein, sodass man nur prüfen muss und ggf. ändern." Die erste Annahme schreibt
// die drei Personen nach Mamamia (supabase/functions/_shared/acceptanceSync.ts):
//   Leistungsempfänger → customer_contracts[contact_type "patient_contact"]
//   Auftraggeber       → customer_contracts[contact_type "contract_contact"]
//   Kontaktperson      → customer_contacts[]
// Ab dem zweiten Einsatz lesen wir sie dort zurück (Proxy getCustomerKontakte) —
// zentral aus Mamamia, keine Ablage daneben. Ohne frühere Buchung oder ohne
// Antwort bleibt alles wie bisher. Jeder Wert nur, wenn Mamamia ihn hat; der
// Kunde prüft und ändert im Formular wie gewohnt.
import type { ContractFormData } from '../components/portal/AngebotPruefenModal';
import type { MamamiaCustomer, MamamiaCustomerContract, MamamiaCustomerJobOffer, MamamiaKontakte } from './mamamia/types';

/** Die Lead-Felder, die die bisherige Vorbelegung nutzt. */
export interface VorbelegungLead {
  patient_anrede?: string | null;
  patient_vorname?: string | null;
  patient_nachname?: string | null;
  patient_street?: string | null;
  patient_zip?: string | null;
  patient_city?: string | null;
  anrede_text?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  telefon?: string | null;
  email?: string | null;
}

const wert = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const zahl = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Mamamia-Anrede (acceptanceSync schreibt "Mr." / "Mrs.") → Formular. */
export function anredeAusMamamia(s: unknown): 'Frau' | 'Herr' | '' {
  const t = wert(s).toLowerCase().replace(/\.$/, '');
  if (t === 'mrs' || t === 'frau' || t === 'ms') return 'Frau';
  if (t === 'mr' || t === 'herr') return 'Herr';
  return '';
}

/** Hat der Kunde schon einen anderen Einsatz gebucht (Bestätigung in Mamamia)? */
export function fruehereBuchung(
  jobs: MamamiaCustomerJobOffer[] | null | undefined,
  aktuellerJob: number | null | undefined,
): boolean {
  if (!Array.isArray(jobs)) return false;
  const aktuell = zahl(aktuellerJob);
  return jobs.some((j) => zahl(j?.final_confirmation?.id) !== null && zahl(j?.id) !== aktuell);
}

/** Bisherige Vorbelegung (unverändert): Lead (Patientenbogen vor Rechner) → mmCustomer. */
export function bisherigeVorbelegung(lead: VorbelegungLead | null | undefined, mm: MamamiaCustomer | null | undefined): Partial<ContractFormData> {
  const stageBStreet = lead?.patient_street ?? '';
  const stageBZip = lead?.patient_zip ?? mm?.customer_contract?.zip_code ?? '';
  const stageBCity = lead?.patient_city ?? mm?.customer_contract?.city ?? '';
  const ortLine = [stageBZip, stageBCity].filter(Boolean).join(', ');
  return {
    anrede: lead?.patient_anrede || lead?.anrede_text || 'Frau',
    vorname: lead?.patient_vorname || lead?.vorname || '',
    nachname: lead?.patient_nachname || lead?.nachname || '',
    strasse: stageBStreet || mm?.customer_contract?.street_number || '',
    einsatzort: ortLine,
    // Patient hat meist KEINE eigene Telefon/E-Mail — die vorhandenen
    // Kontaktdaten gehören i.d.R. der Kontaktperson, daher dort vorausfüllen.
    telefon: '',
    email: '',
    kpAnrede: '',
    kpVorname: '',
    kpNachname: '',
    kpTelefon: lead?.telefon || mm?.phone || mm?.customer_contract?.phone || '',
    kpEmail: lead?.email || mm?.email || '',
  };
}

const ort = (c: MamamiaCustomerContract) => [wert(c.zip_code), wert(c.city)].filter(Boolean).join(', ');
const hatName = (c: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  !!c && (wert(c.first_name) !== '' || wert(c.last_name) !== '');
const gleichePerson = (a: MamamiaCustomerContract, b: MamamiaCustomerContract | null) =>
  !!b
  && wert(a.first_name).toLowerCase() === wert(b.first_name).toLowerCase()
  && wert(a.last_name).toLowerCase() === wert(b.last_name).toLowerCase()
  && wert(a.street_number).toLowerCase() === wert(b.street_number).toLowerCase();

export function vertragVorbelegung(args: {
  lead: VorbelegungLead | null | undefined;
  mmCustomer: MamamiaCustomer | null | undefined;
  kontakte: MamamiaKontakte | null | undefined;
  aktuellerJob: number | null | undefined;
}): Partial<ContractFormData> {
  const { lead, mmCustomer, kontakte, aktuellerJob } = args;
  const out: Partial<ContractFormData> = bisherigeVorbelegung(lead, mmCustomer);
  if (!kontakte || !fruehereBuchung(mmCustomer?.job_offers, aktuellerJob)) return out;

  const setze = (feld: keyof ContractFormData, v: unknown) => {
    const w = wert(v);
    if (w) (out as Record<string, unknown>)[feld] = w;
  };
  const vertraege = Array.isArray(kontakte.customer_contracts) ? kontakte.customer_contracts : [];
  const le = vertraege.find((c) => c?.contact_type === 'patient_contact' && hatName(c)) ?? null;
  const ag = vertraege.find((c) => c?.contact_type === 'contract_contact' && hatName(c)) ?? null;
  const kp = (Array.isArray(kontakte.customer_contacts) ? kontakte.customer_contacts : []).find(hatName) ?? null;

  if (le) {
    const a = anredeAusMamamia(le.salutation);
    if (a) out.anrede = a;
    setze('vorname', le.first_name);
    setze('nachname', le.last_name);
    setze('strasse', le.street_number);
    setze('einsatzort', ort(le));
    setze('telefon', le.phone);
    setze('email', le.email);
  }
  if (ag) {
    // Bei „Auftraggeber = Leistungsempfänger" schreibt die Annahme die LE-Daten
    // auch als Auftraggeber — dann bleibt das Häkchen gesetzt.
    if (gleichePerson(ag, le)) {
      out.agGleich = true;
    } else {
      out.agGleich = false;
      out.agAnrede = anredeAusMamamia(ag.salutation);
      setze('agVorname', ag.first_name);
      setze('agNachname', ag.last_name);
      setze('agStrasse', ag.street_number);
      setze('agOrt', ort(ag));
      setze('agTelefon', ag.phone);
      setze('agEmail', ag.email);
    }
  }
  if (kp) {
    const a = anredeAusMamamia(kp.salutation);
    if (a) out.kpAnrede = a;
    setze('kpVorname', kp.first_name);
    setze('kpNachname', kp.last_name);
    setze('kpTelefon', kp.phone);
    setze('kpEmail', kp.email);
  }
  return out;
}
