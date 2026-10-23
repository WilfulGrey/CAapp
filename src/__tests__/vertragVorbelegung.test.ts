/*
 * Vorbelegung des Vertragsformulars ab dem zweiten Einsatz (Registry #130).
 * Martin 20.10.2026: „beim 2. Job … muss man beim Annehmen immer alle Kunden- und
 * Kontaktdaten eingeben … es soll vorausgefüllt sein, sodass man nur prüfen muss."
 * Quelle sind die drei Personen, die die erste Annahme nach Mamamia schreibt.
 */
import { describe, expect, it } from 'vitest';
import { anredeAusMamamia, bisherigeVorbelegung, fruehereBuchung, vertragVorbelegung } from '../lib/vertragVorbelegung';
import type { MamamiaCustomer, MamamiaKontakte } from '../lib/mamamia/types';

const LEAD = { vorname: 'Anna', nachname: 'Muster', anrede_text: 'Frau', telefon: '0151 000000', email: 'anna@example.com' };
const JOB_1 = { id: 501, final_confirmation: { id: 77 } };
const JOB_2 = { id: 502, final_confirmation: null };
const mm = (jobs: unknown[]) => ({ id: 1, phone: null, email: null, customer_contract: null, job_offers: jobs }) as unknown as MamamiaCustomer;

const KONTAKTE: MamamiaKontakte = {
  customer_contracts: [
    { id: 1, contact_type: 'patient_contact', salutation: 'Mrs.', first_name: 'Erika', last_name: 'Muster', street_number: 'Lindenweg 3', zip_code: '94428', city: 'Eichendorf', phone: null, email: null },
    { id: 2, contact_type: 'contract_contact', salutation: 'Mr.', first_name: 'Paul', last_name: 'Muster', street_number: 'Bahnhofstr. 9', zip_code: '80331', city: 'München', phone: '089 111', email: 'paul@example.com' },
  ],
  customer_contacts: [
    { id: 3, salutation: 'Mrs.', first_name: 'Anna', last_name: 'Muster', phone: '0151 222', email: 'anna@example.com' },
  ],
};

describe('vertragVorbelegung', () => {
  it('erster Einsatz (keine frühere Buchung): wie bisher, Mamamia wird nicht genutzt', () => {
    const r = vertragVorbelegung({ lead: LEAD, mmCustomer: mm([JOB_2]), kontakte: KONTAKTE, aktuellerJob: 502 });
    expect(r).toEqual(bisherigeVorbelegung(LEAD, mm([JOB_2])));
  });

  it('zweiter Einsatz: alle drei Personen aus der letzten Annahme vorausgefüllt', () => {
    const r = vertragVorbelegung({ lead: LEAD, mmCustomer: mm([JOB_1, JOB_2]), kontakte: KONTAKTE, aktuellerJob: 502 });
    expect(r).toMatchObject({
      anrede: 'Frau', vorname: 'Erika', nachname: 'Muster', strasse: 'Lindenweg 3', einsatzort: '94428, Eichendorf',
      agGleich: false, agAnrede: 'Herr', agVorname: 'Paul', agNachname: 'Muster', agStrasse: 'Bahnhofstr. 9', agOrt: '80331, München',
      agTelefon: '089 111', agEmail: 'paul@example.com',
      kpAnrede: 'Frau', kpVorname: 'Anna', kpNachname: 'Muster', kpTelefon: '0151 222', kpEmail: 'anna@example.com',
    });
    // Leere Werte in Mamamia überschreiben nichts: Telefon/E-Mail des LE bleiben leer wie bisher.
    expect(r.telefon).toBe('');
    expect(r.email).toBe('');
  });

  it('Auftraggeber = Leistungsempfänger (so schreibt die Annahme es bei gesetztem Häkchen) ⇒ Häkchen bleibt', () => {
    const gleich: MamamiaKontakte = {
      ...KONTAKTE,
      customer_contracts: [KONTAKTE.customer_contracts![0], { ...KONTAKTE.customer_contracts![0], id: 9, contact_type: 'contract_contact' }],
    };
    const r = vertragVorbelegung({ lead: LEAD, mmCustomer: mm([JOB_1, JOB_2]), kontakte: gleich, aktuellerJob: 502 });
    expect(r.agGleich).toBe(true);
    expect(r.agVorname).toBeUndefined();
  });

  it('ohne Antwort aus Mamamia oder ohne Namen: wie bisher', () => {
    const basis = bisherigeVorbelegung(LEAD, mm([JOB_1, JOB_2]));
    expect(vertragVorbelegung({ lead: LEAD, mmCustomer: mm([JOB_1, JOB_2]), kontakte: null, aktuellerJob: 502 })).toEqual(basis);
    const leer: MamamiaKontakte = { customer_contracts: [{ contact_type: 'patient_contact', zip_code: '94428' }], customer_contacts: [{ phone: '1' }] };
    expect(vertragVorbelegung({ lead: LEAD, mmCustomer: mm([JOB_1, JOB_2]), kontakte: leer, aktuellerJob: 502 })).toEqual(basis);
  });
});

describe('Registry #131: Fallback ohne Daten der letzten Annahme', () => {
  const agZeile = { contact_type: 'contract_contact', street_number: 'Bahnhofstr. 9', zip_code: '80331', city: 'München', phone: '089 111' };
  const ohneTel = { ...LEAD, telefon: '' };
  it('nimmt nie die Zeile des Auftraggebers als Adresse der betreuten Person', () => {
    const r = bisherigeVorbelegung(ohneTel, { ...mm([JOB_1]), customer_contract: agZeile } as unknown as MamamiaCustomer);
    expect(r.strasse).toBe('');
    expect(r.einsatzort).toBe('');
    expect(r.kpTelefon).toBe('');
  });
  it('Zeile der betreuten Person (oder ohne contact_type, alter Proxy) zählt wie bisher', () => {
    for (const contact_type of ['patient_contact', undefined]) {
      const r = bisherigeVorbelegung(ohneTel, { ...mm([JOB_1]), customer_contract: { ...agZeile, contact_type } } as unknown as MamamiaCustomer);
      expect(r.einsatzort).toBe('80331, München');
      expect(r.strasse).toBe('Bahnhofstr. 9');
    }
  });
});

describe('fruehereBuchung', () => {
  it('zählt nur einen ANDEREN bestätigten Job, IDs auch als Text', () => {
    expect(fruehereBuchung([JOB_1, JOB_2] as never, 502)).toBe(true);
    expect(fruehereBuchung([JOB_1] as never, 501)).toBe(false);
    expect(fruehereBuchung([{ id: '501', final_confirmation: { id: '77' } }] as never, '502' as never)).toBe(true);
    expect(fruehereBuchung([JOB_2] as never, 502)).toBe(false);
    expect(fruehereBuchung(null, 502)).toBe(false);
  });
});

describe('anredeAusMamamia', () => {
  it('Mr./Mrs. wie die Annahme sie schreibt, sonst leer', () => {
    expect(anredeAusMamamia('Mrs.')).toBe('Frau');
    expect(anredeAusMamamia('Mr.')).toBe('Herr');
    expect(anredeAusMamamia('Frau')).toBe('Frau');
    expect(anredeAusMamamia(null)).toBe('');
    expect(anredeAusMamamia('Dr.')).toBe('');
  });
});
