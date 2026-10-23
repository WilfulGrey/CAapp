/**
 * Nachtruhe für Kundenmails — reine Zeitlogik (Martin, 19.08.).
 * Import quer aus `project 3/lib/` wie bei portalUrl.test.ts: pures Modul,
 * einziger erlaubter Cross-App-Import.
 */
import { describe, it, expect } from 'vitest';
import { ausDerNachtruhe } from '../../project 3/lib/quiet-hours';

const berlin = (d: Date) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);

describe('ausDerNachtruhe', () => {
  it('lässt Zeiten am Tag unverändert', () => {
    const mittags = new Date('2026-08-19T12:30:00Z'); // 14:30 Berlin
    expect(ausDerNachtruhe(mittags).toISOString()).toBe(mittags.toISOString());
  });

  it('schiebt 01:00 nachts auf 08:00 desselben Tages', () => {
    // 2026-08-20 01:00 Berlin (Sommerzeit = UTC+2)
    expect(berlin(ausDerNachtruhe(new Date('2026-08-19T23:00:00Z')))).toBe('20.08., 08:00');
  });

  it('schiebt 22:30 auf den nächsten Morgen', () => {
    // 2026-08-19 22:30 Berlin
    expect(berlin(ausDerNachtruhe(new Date('2026-08-19T20:30:00Z')))).toBe('20.08., 08:00');
  });

  it('funktioniert über den Monatswechsel', () => {
    // 2026-08-31 23:10 Berlin ⇒ 01.09. 08:00
    expect(berlin(ausDerNachtruhe(new Date('2026-08-31T21:10:00Z')))).toBe('01.09., 08:00');
  });

  it('trifft 08:00 auch in der Winterzeit (UTC+1)', () => {
    // 2026-12-05 03:00 Berlin
    const raus = ausDerNachtruhe(new Date('2026-12-05T02:00:00Z'));
    expect(berlin(raus)).toBe('05.12., 08:00');
    expect(raus.toISOString()).toBe('2026-12-05T07:00:00.000Z'); // CET = UTC+1
  });

  it('Grenzfälle: 08:00 bleibt, 20:59 bleibt, 21:00 rutscht', () => {
    expect(berlin(ausDerNachtruhe(new Date('2026-08-19T06:00:00Z')))).toBe('19.08., 08:00'); // exakt 08:00
    expect(berlin(ausDerNachtruhe(new Date('2026-08-19T18:59:00Z')))).toBe('19.08., 20:59');
    expect(berlin(ausDerNachtruhe(new Date('2026-08-19T19:00:00Z')))).toBe('20.08., 08:00');
  });
});

// Rückwärts-Regel für Mails vor einer Frist (letzte Erinnerung vor Ablauf der
// Reservierung, 26.09.2026) und Gleichlauf der Edge-Function-Kopie.
import { inNachtruhe, vorDerNachtruhe } from '../../project 3/lib/quiet-hours';
import * as edgeRuhe from '../../project 3/supabase/functions/send-scheduled-emails/quietHours';

describe('inNachtruhe / vorDerNachtruhe', () => {
  it('erkennt die Ruhezeit 21:00–07:59 Berliner Zeit', () => {
    expect(inNachtruhe(new Date('2026-08-19T18:59:00Z'))).toBe(false); // 20:59
    expect(inNachtruhe(new Date('2026-08-19T19:00:00Z'))).toBe(true); // 21:00
    expect(inNachtruhe(new Date('2026-08-20T05:59:00Z'))).toBe(true); // 07:59
    expect(inNachtruhe(new Date('2026-08-20T06:00:00Z'))).toBe(false); // 08:00
  });

  it('lässt Zeiten am Tag unverändert', () => {
    const t = new Date('2026-08-19T12:30:00Z');
    expect(vorDerNachtruhe(t).toISOString()).toBe(t.toISOString());
  });

  it('zieht 22:30 auf 20:00 desselben Abends vor', () => {
    expect(berlin(vorDerNachtruhe(new Date('2026-08-19T20:30:00Z')))).toBe('19.08., 20:00');
  });

  it('zieht 03:00 auf 20:00 des Vorabends vor, auch über den Monatswechsel', () => {
    expect(berlin(vorDerNachtruhe(new Date('2026-09-01T01:00:00Z')))).toBe('31.08., 20:00');
  });

  it('trifft 20:00 über den Wechsel auf die Winterzeit (25.10.2026) und die Sommerzeit (28.03.2027)', () => {
    // 26.10. 02:00 Berlin (CET) ⇒ 25.10. 20:00 CET = 19:00 UTC
    expect(vorDerNachtruhe(new Date('2026-10-26T01:00:00Z')).toISOString()).toBe('2026-10-25T19:00:00.000Z');
    // 28.03.2027 04:00 Berlin (CEST) ⇒ 27.03. 20:00 CET = 19:00 UTC
    expect(vorDerNachtruhe(new Date('2027-03-28T02:00:00Z')).toISOString()).toBe('2027-03-27T19:00:00.000Z');
  });

  it('über den Jahreswechsel', () => {
    expect(berlin(vorDerNachtruhe(new Date('2027-01-01T03:00:00Z')))).toBe('31.12., 20:00');
  });

  it('die Kopie in der Edge Function rechnet genauso', () => {
    const proben = ['2026-08-19T12:30:00Z', '2026-08-19T20:30:00Z', '2026-09-01T01:00:00Z', '2026-10-26T01:00:00Z',
      '2027-03-28T02:00:00Z', '2027-01-01T03:00:00Z', '2026-12-05T02:00:00Z'].map((s) => new Date(s));
    for (const t of proben) {
      expect(edgeRuhe.vorDerNachtruhe(t).toISOString()).toBe(vorDerNachtruhe(t).toISOString());
      expect(edgeRuhe.ausDerNachtruhe(t).toISOString()).toBe(ausDerNachtruhe(t).toISOString());
      expect(edgeRuhe.inNachtruhe(t)).toBe(inNachtruhe(t));
    }
  });
});
