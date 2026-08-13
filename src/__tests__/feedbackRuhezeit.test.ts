import { describe, it, expect } from 'vitest';
import { feedbackInRuhezeit, FEEDBACK_RUHEZEIT_TAGE } from '../lib/leadEvents';

// Ruhezeit der Angebots-Rückmeldung. Vorher galt „beantwortet" nur für die
// Sitzung — wer antwortete und die Seite neu lud, wurde sofort wieder gefragt
// (Martin, 12.08.2026). Die Regel muss in beide Richtungen halten: lange genug
// still, aber nicht für immer.

const TAG = 24 * 60 * 60 * 1000;
const JETZT = Date.parse('2026-08-12T12:00:00.000Z');

describe('feedbackInRuhezeit', () => {
  it('frisch beantwortet → still', () => {
    expect(feedbackInRuhezeit(String(JETZT - 60_000), JETZT)).toBe(true);
    expect(feedbackInRuhezeit(String(JETZT - 6 * TAG), JETZT)).toBe(true);
  });

  it('nach Ablauf der Ruhezeit → wieder fragen', () => {
    // Nach einer Woche ist „Vielleicht später" eine neue Frage, keine Wiederholung.
    expect(feedbackInRuhezeit(String(JETZT - 8 * TAG), JETZT)).toBe(false);
    expect(feedbackInRuhezeit(String(JETZT - FEEDBACK_RUHEZEIT_TAGE * TAG), JETZT)).toBe(false);
  });

  it('kein Stempel → fragen', () => {
    expect(feedbackInRuhezeit(null, JETZT)).toBe(false);
    expect(feedbackInRuhezeit(undefined, JETZT)).toBe(false);
    expect(feedbackInRuhezeit('', JETZT)).toBe(false);
  });

  it('kaputter Stempel → fragen, nicht für immer verstummen', () => {
    // Ein unlesbarer Wert darf die Frage NICHT dauerhaft abschalten — sonst
    // schweigt das Portal still und niemand merkt es.
    expect(feedbackInRuhezeit('abc', JETZT)).toBe(false);
    expect(feedbackInRuhezeit('0', JETZT)).toBe(false);
    expect(feedbackInRuhezeit('-5', JETZT)).toBe(false);
  });

  it('Stempel aus der Zukunft (verstellte Uhr) → fragen', () => {
    expect(feedbackInRuhezeit(String(JETZT + 30 * TAG), JETZT)).toBe(false);
  });
});
