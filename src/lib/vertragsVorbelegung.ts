// Vorbelegung des Buchungsdialogs („Ihre Angaben", AngebotPruefenModal) aus dem,
// was wir schon wissen. Früher inline in CustomerPortalPage; hier, damit die
// Regeln testbar sind (Martin 29.09.2026: Kunden fanden die leeren Pflichtfelder
// nicht und riefen an).
//
// Reihenfolge je Feld: Stufe-B-Felder des Leads (patient_*) → mamamia-Vertrag →
// Patientenbogen (leads.patient_form bzw. in dieser Sitzung abgesendet) → leer.
// Nie raten: keine Anrede aus dem Vornamen, kein „Frau" als Vorgabe.
import type { ContractFormData } from '../components/portal/AngebotPruefenModal';
import type { Lead } from './supabase';
import type { MamamiaCustomer } from './mamamia/types';
import { capitalizeName } from './names';

type Bogen = { geschlecht?: unknown; anzahl?: unknown; plz?: unknown; ort?: unknown } | null | undefined;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function vertragsVorbelegung(
  lead: Lead | null | undefined,
  mmCustomer: MamamiaCustomer | null | undefined,
  bogen: Bogen,
): Partial<ContractFormData> {
  const zip = lead?.patient_zip ?? mmCustomer?.customer_contract?.zip_code ?? text(bogen?.plz);
  const city = lead?.patient_city ?? mmCustomer?.customer_contract?.city ?? text(bogen?.ort);
  // Anrede der betreuten Person aus dem Geschlecht im Patientenbogen — nicht die
  // Anrede dessen, der angefragt hat (meist Tochter oder Sohn). Ehepaar oder
  // unbekannt: leer, der Kunde wählt (Registry #88: nur Frau/Herr).
  const anredeAusBogen = bogen?.anzahl === '2' ? ''
    : bogen?.geschlecht === 'Weiblich' ? 'Frau'
      : bogen?.geschlecht === 'Männlich' ? 'Herr' : '';
  return {
    anrede: lead?.patient_anrede || anredeAusBogen,
    vorname: lead?.patient_vorname || lead?.vorname || '',
    nachname: lead?.patient_nachname || lead?.nachname || '',
    strasse: lead?.patient_street || mmCustomer?.customer_contract?.street_number || '',
    einsatzort: [zip, city].filter(Boolean).join(', '),
    // Die betreute Person hat meist KEINE eigene Telefon/E-Mail — die vorhandenen
    // Kontaktdaten gehören i. d. R. der Kontaktperson, daher dort vorbelegen.
    telefon: '',
    email: '',
    // Kontaktperson = wer angefragt hat: Telefon und E-Mail standen schon hier,
    // der Name fehlte. Anrede nur, wenn der Lead sie ausdrücklich trägt.
    kpAnrede: lead?.anrede_text === 'Frau' || lead?.anrede_text === 'Herr' ? lead.anrede_text : '',
    kpVorname: capitalizeName(lead?.vorname),
    kpNachname: capitalizeName(lead?.nachname),
    kpTelefon: lead?.telefon || mmCustomer?.phone || mmCustomer?.customer_contract?.phone || '',
    kpEmail: lead?.email || mmCustomer?.email || '',
  };
}
