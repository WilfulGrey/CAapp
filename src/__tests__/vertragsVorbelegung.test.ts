// Vorbelegung des Buchungsdialogs (Martin 29.09.2026): Kontaktperson = wer angefragt
// hat, Anrede der betreuten Person aus dem Patientenbogen, nie raten.
import { describe, it, expect } from 'vitest';
import { vertragsVorbelegung } from '../lib/vertragsVorbelegung';
import type { Lead } from '../lib/supabase';
import type { MamamiaCustomer } from '../lib/mamamia/types';

// Rechner-Lead: Angehörige fragt an, keine patient_*-Felder.
const lead = {
  vorname: 'petra', nachname: 'MUSTER', anrede_text: null, telefon: '0171 1234567', email: 'petra@example.de',
} as unknown as Lead;

describe('vertragsVorbelegung', () => {
  it('Kontaktperson = wer angefragt hat, Namen sauber geschrieben', () => {
    const v = vertragsVorbelegung(lead, null, null);
    expect(v).toMatchObject({ kpVorname: 'Petra', kpNachname: 'Muster', kpTelefon: '0171 1234567', kpEmail: 'petra@example.de', kpAnrede: '' });
  });

  it('Kontaktperson-Anrede nur aus einer ausdrücklichen Anrede, „Familie" nicht', () => {
    expect(vertragsVorbelegung({ ...lead, anrede_text: 'Herr' } as Lead, null, null).kpAnrede).toBe('Herr');
    expect(vertragsVorbelegung({ ...lead, anrede_text: 'Familie' } as Lead, null, null).kpAnrede).toBe('');
  });

  it('Anrede der betreuten Person aus dem Patientenbogen, sonst leer — kein „Frau" als Vorgabe', () => {
    expect(vertragsVorbelegung(lead, null, { geschlecht: 'Männlich', anzahl: '1' }).anrede).toBe('Herr');
    expect(vertragsVorbelegung(lead, null, { geschlecht: 'Weiblich', anzahl: '1' }).anrede).toBe('Frau');
    expect(vertragsVorbelegung(lead, null, null).anrede).toBe('');
    // Ehepaar: der Kunde wählt selbst (Registry #88)
    expect(vertragsVorbelegung(lead, null, { geschlecht: 'Weiblich', anzahl: '2' }).anrede).toBe('');
    // Anrede der anfragenden Person gehört NICHT zur betreuten Person
    expect(vertragsVorbelegung({ ...lead, anrede_text: 'Frau' } as Lead, null, null).anrede).toBe('');
    // Stufe-B-Feld hat Vorrang
    expect(vertragsVorbelegung({ ...lead, patient_anrede: 'Herr' } as Lead, null, { geschlecht: 'Weiblich' }).anrede).toBe('Herr');
  });

  it('Einsatzort: Lead → mamamia-Vertrag → Patientenbogen', () => {
    expect(vertragsVorbelegung(lead, null, { plz: '96120', ort: 'Bischberg' }).einsatzort).toBe('96120, Bischberg');
    const mm = { customer_contract: { zip_code: '80331', city: 'München' } } as unknown as MamamiaCustomer;
    expect(vertragsVorbelegung(lead, mm, { plz: '96120', ort: 'Bischberg' }).einsatzort).toBe('80331, München');
    expect(vertragsVorbelegung({ ...lead, patient_zip: '10115', patient_city: 'Berlin' } as Lead, mm, null).einsatzort).toBe('10115, Berlin');
  });
});
