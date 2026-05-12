import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

import {
  formatDate,
  addDays,
  cap,
  formatEuro,
  leadDisplayName,
  leadGreeting,
  careStartLabel,
  prefillPatientFromLead,
} from '../lib/supabase';
import { baseLead, herrLead, familieLead, bareLead } from '../../test/fixtures/leads';

describe('formatDate', () => {
  it('formats ISO date as dd.MM.yyyy (de-DE)', () => {
    expect(formatDate('2026-04-23T00:00:00.000Z')).toBe('23.04.2026');
  });

  it('handles year boundaries', () => {
    expect(formatDate('2025-12-31T23:59:59.000Z')).toBe('01.01.2026');
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-04-23T00:00:00.000Z', 30)).toBe('23.05.2026');
  });

  it('adds across month boundaries', () => {
    expect(addDays('2026-01-15T00:00:00.000Z', 20)).toBe('04.02.2026');
  });

  it('adds zero days unchanged', () => {
    expect(addDays('2026-04-23T00:00:00.000Z', 0)).toBe('23.04.2026');
  });
});

describe('cap', () => {
  it('capitalizes first letter of each word', () => {
    expect(cap('hildegard von norman')).toBe('Hildegard Von Norman');
  });

  it('handles already capitalized input', () => {
    expect(cap('Hildegard Von Norman')).toBe('Hildegard Von Norman');
  });

  it('returns empty string for null', () => {
    expect(cap(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(cap(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(cap('')).toBe('');
  });

  it('handles ASCII single word', () => {
    expect(cap('schmidt')).toBe('Schmidt');
  });

  // Characterization test: current regex /\b\w/g treats `ü` as non-word boundary,
  // so the letter following `ü` gets capitalized. Producing 'MüLler' from 'müller'.
  // TODO: fix with Unicode-aware regex (e.g. /(^|[\s'-])(\p{L})/gu) if this surfaces in UI.
  it('has known bug: treats umlauts as word boundary (MüLler instead of Müller)', () => {
    expect(cap('müller')).toBe('MüLler');
  });
});

describe('formatEuro', () => {
  it('formats integers with de-DE locale thousand separator', () => {
    expect(formatEuro(3200)).toBe('3.200 €');
  });

  it('rounds decimals to integer', () => {
    expect(formatEuro(1700.5)).toBe('1.701 €');
  });

  it('handles zero', () => {
    expect(formatEuro(0)).toBe('0 €');
  });
});

describe('leadDisplayName', () => {
  it('combines vorname + nachname (capitalized)', () => {
    expect(leadDisplayName(baseLead)).toBe('Hildegard Von Norman');
  });

  it('uses only nachname when vorname is null (exposes cap umlaut bug)', () => {
    // Known: cap() mishandles umlaut boundaries. Document current behavior.
    expect(leadDisplayName(familieLead)).toBe('MüLler');
  });

  it('falls back to email when both names are null', () => {
    expect(leadDisplayName(bareLead)).toBe('noname@example.de');
  });
});

describe('leadGreeting', () => {
  it('produces "Sehr geehrte Frau {nachname}"', () => {
    expect(leadGreeting(baseLead)).toBe('Sehr geehrte Frau von norman');
  });

  it('produces "Sehr geehrter Herr {nachname}"', () => {
    expect(leadGreeting(herrLead)).toBe('Sehr geehrter Herr schmidt');
  });

  it('produces "Sehr geehrte Familie {nachname}"', () => {
    expect(leadGreeting(familieLead)).toBe('Sehr geehrte Familie müller');
  });

  it('falls back to "Guten Tag" when no salutation/name', () => {
    expect(leadGreeting(bareLead)).toBe('Guten Tag');
  });

  it('handles vorname-only lead without anrede', () => {
    const lead = { ...bareLead, vorname: 'anna', nachname: null, anrede_text: null };
    expect(leadGreeting(lead)).toBe('Guten Tag anna');
  });
});

describe('careStartLabel', () => {
  it.each([
    // NEW calculator (Marcin) emits these — they bled through as raw
    // 'unklar' / '1-2-monate' before 2026-05-01.
    ['sofort', 'ab sofort'],
    ['2-4-wochen', 'in 2–4 Wochen'],
    ['1-2-monate', 'in 1–2 Monaten'],
    ['unklar', 'noch unklar'],
    // Legacy values from old calculator versions, kept for back-compat.
    ['1-2-wochen', 'in 1–2 Wochen'],
    ['1-monat', 'in ca. 1 Monat'],
    ['spaeter', 'zu einem späteren Zeitpunkt'],
  ])('maps %s → %s', (input, expected) => {
    expect(careStartLabel(input)).toBe(expected);
  });

  it('defaults to "ab sofort" when timing is null', () => {
    expect(careStartLabel(null)).toBe('ab sofort');
  });

  it('passes through unknown timing values unchanged', () => {
    expect(careStartLabel('unknown-value')).toBe('unknown-value');
  });
});

describe('prefillPatientFromLead', () => {
  it('maps baseLead formularDaten to PatientPrefill', () => {
    expect(prefillPatientFromLead(baseLead)).toEqual({
      anzahl: '1',
      pflegegrad: '4',
      mobilitaet: 'Rollstuhlfähig',
      nacht: 'Gelegentlich',
      haushalt: 'Nein',         // baseLead.formularDaten.weitere_personen='nein'
      wunschGeschlecht: 'Weiblich',
    });
  });

  it('returns empty object when kalkulation is null', () => {
    expect(prefillPatientFromLead(bareLead)).toEqual({});
  });

  it("maps betreuung_fuer='ehepaar' to anzahl=2 (couple under care)", () => {
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: {
          ...baseLead.kalkulation!.formularDaten!,
          betreuung_fuer: 'ehepaar',
        },
      },
    };
    expect(prefillPatientFromLead(lead).anzahl).toBe('2');
  });

  it("ehepaar — Person 2 inherits Person 1's pflegegrad / mobilitaet / nacht", () => {
    // Calculator collects ONE set of answers for the couple as a unit.
    // Pre-2026-05-01 we only filled p1; p2 fields stayed undefined and
    // AngebotCard fell back to defaults (Pflegegrad 2, Selbstständig
    // mobil, Nein) — silent overwrite of the user's actual answers.
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: {
          ...baseLead.kalkulation!.formularDaten!,
          betreuung_fuer: 'ehepaar',
          pflegegrad: 4,
          mobilitaet: 'rollstuhl',
          nachteinsaetze: 'mehrmals',
        },
      },
    };
    const r = prefillPatientFromLead(lead);
    expect(r.anzahl).toBe('2');
    expect(r.pflegegrad).toBe('4');
    expect(r.mobilitaet).toBe('Rollstuhlfähig');
    expect(r.nacht).toBe('Mehr als 2');
    expect(r.p2_pflegegrad).toBe('4');
    expect(r.p2_mobilitaet).toBe('Rollstuhlfähig');
    expect(r.p2_nacht).toBe('Mehr als 2');
  });

  it('single patient — does NOT emit p2_* fields', () => {
    // Don't pollute the form prefill with p2_* keys when anzahl=1; keeps
    // localStorage drafts clean.
    const r = prefillPatientFromLead(baseLead);
    expect(r.anzahl).toBe('1');
    expect(r.p2_pflegegrad).toBeUndefined();
    expect(r.p2_mobilitaet).toBeUndefined();
    expect(r.p2_nacht).toBeUndefined();
  });

  it("ignores weitere_personen='ja' for anzahl but maps it to haushalt", () => {
    // weitere_personen = "are there OTHER people in the household" — price-relevant.
    // Only betreuung_fuer drives patient count (anzahl).
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: {
          ...baseLead.kalkulation!.formularDaten!,
          betreuung_fuer: '1-person',
          weitere_personen: 'ja',
        },
      },
    };
    const r = prefillPatientFromLead(lead);
    expect(r.anzahl).toBe('1');           // anzahl unaffected
    expect(r.haushalt).toBe('Ja');        // weitere_personen maps to haushalt
  });

  it.each([
    ['mobil', 'Selbstständig mobil'],
    ['rollator', 'Rollatorfähig'],         // NEW calculator
    ['rollstuhl', 'Rollstuhlfähig'],
    ['bettlaegerig', 'Bettlägerig'],
    ['gehstock', 'Am Gehstock'],           // legacy alias
    ['gehfaehig', 'Gehfähig mit Hilfe'],   // legacy alias
  ])('maps mobilitaet=%s → %s', (input, expected) => {
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: { ...baseLead.kalkulation!.formularDaten!, mobilitaet: input },
      },
    };
    expect(prefillPatientFromLead(lead).mobilitaet).toBe(expected);
  });

  it.each([
    ['nein', 'Nein'],
    ['gelegentlich', 'Gelegentlich'],
    // NEW calculator (Marcin) emits taeglich + mehrmals — pre-2026-05-01
    // both fell through to default 'Nein'. Now map to the patient-form
    // labels the AngebotCard <CustomSelect> options expect.
    ['taeglich', 'Bis zu 1 Mal'],
    ['mehrmals', 'Mehr als 2'],
    // legacy alias from old calculator
    ['regelmaessig', 'Bis zu 1 Mal'],
  ])('maps nachteinsaetze=%s → %s', (input, expected) => {
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: { ...baseLead.kalkulation!.formularDaten!, nachteinsaetze: input },
      },
    };
    expect(prefillPatientFromLead(lead).nacht).toBe(expected);
  });

  it.each([
    ['weiblich', 'Weiblich'],
    ['maennlich', 'Männlich'],
    ['egal', 'Egal'],
  ])('maps geschlecht=%s → %s', (input, expected) => {
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: { ...baseLead.kalkulation!.formularDaten!, geschlecht: input },
      },
    };
    expect(prefillPatientFromLead(lead).wunschGeschlecht).toBe(expected);
  });

  it('returns empty string for unknown mobilitaet value (gated by dictionary)', () => {
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: { ...baseLead.kalkulation!.formularDaten!, mobilitaet: 'unbekannt' },
      },
    };
    expect(prefillPatientFromLead(lead).mobilitaet).toBe('');
  });
});
