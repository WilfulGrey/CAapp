import type { Lead } from '../../src/lib/supabase';

export const baseLead: Lead = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'graefinnorman@gmx.de',
  vorname: 'hildegard',
  nachname: 'von norman',
  anrede: 'Frau',
  anrede_text: 'Frau',
  telefon: '+49 89 1234567',
  status: 'angebot_requested',
  token: 'deadbeefdeadbeefdeadbeefdeadbeef',
  token_expires_at: '2026-05-07T12:00:00.000Z',
  token_used: false,
  care_start_timing: 'sofort',
  kalkulation: {
    bruttopreis: 3200,
    eigenanteil: 1700,
    'zuschüsse': {
      gesamt: 1500,
      items: [
        {
          name: 'pflegegeld',
          label: 'Pflegegeld',
          beschreibung: 'Monatliche Zahlung der Pflegekasse',
          betrag_monatlich: 728,
          betrag_jaehrlich: 8736,
          typ: 'monatlich',
          hinweis: null,
          in_kalkulation: true,
        },
        {
          name: 'entlastungsbudget_neu',
          label: 'Entlastungsbudget',
          beschreibung: '',
          betrag_monatlich: 41.67,
          betrag_jaehrlich: 500,
          typ: 'monatlich',
          hinweis: null,
          in_kalkulation: true,
        },
        {
          name: 'steuervorteil',
          label: 'Steuerliche Absetzbarkeit',
          beschreibung: '',
          betrag_monatlich: 266.67,
          betrag_jaehrlich: 3200,
          typ: 'jaehrlich',
          hinweis: null,
          in_kalkulation: false,
        },
      ],
    },
    aufschluesselung: [
      { kategorie: 'pflegegrad', antwort: '4', label: 'Pflegegrad 4', aufschlag: 200 },
      { kategorie: 'mobilitaet', antwort: 'rollstuhl', label: 'Rollstuhlfähig', aufschlag: 150 },
    ],
    formularDaten: {
      pflegegrad: 4,
      weitere_personen: 'nein',
      mobilitaet: 'rollstuhl',
      nachteinsaetze: 'gelegentlich',
      geschlecht: 'weiblich',
    },
  },
  created_at: '2026-04-23T09:00:00.000Z',
  updated_at: '2026-04-23T09:00:00.000Z',
};

export const herrLead: Lead = {
  ...baseLead,
  id: '22222222-2222-2222-2222-222222222222',
  email: 'herr.schmidt@example.de',
  vorname: 'johann',
  nachname: 'schmidt',
  anrede: 'Herr',
  anrede_text: 'Herr',
  care_start_timing: '1-monat',
};

export const familieLead: Lead = {
  ...baseLead,
  id: '33333333-3333-3333-3333-333333333333',
  email: 'mueller@example.de',
  vorname: null,
  nachname: 'müller',
  anrede: 'Familie',
  anrede_text: 'Familie',
  care_start_timing: 'spaeter',
};

export const bareLead: Lead = {
  ...baseLead,
  id: '44444444-4444-4444-4444-444444444444',
  email: 'noname@example.de',
  vorname: null,
  nachname: null,
  anrede: null,
  anrede_text: null,
  telefon: null,
  care_start_timing: null,
  kalkulation: null,
};
