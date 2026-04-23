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
    ['sofort', 'ab sofort'],
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
      wunschGeschlecht: 'Weiblich',
    });
  });

  it('returns empty object when kalkulation is null', () => {
    expect(prefillPatientFromLead(bareLead)).toEqual({});
  });

  it('maps weitere_personen=ja to anzahl=2', () => {
    const lead = {
      ...baseLead,
      kalkulation: {
        ...baseLead.kalkulation!,
        formularDaten: {
          ...baseLead.kalkulation!.formularDaten!,
          weitere_personen: 'ja',
        },
      },
    };
    expect(prefillPatientFromLead(lead).anzahl).toBe('2');
  });

  it.each([
    ['mobil', 'Selbstständig mobil'],
    ['gehfaehig', 'Gehfähig mit Hilfe'],
    ['rollstuhl', 'Rollstuhlfähig'],
    ['bettlaegerig', 'Bettlägerig'],
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
    ['regelmaessig', 'Regelmäßig'],
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
