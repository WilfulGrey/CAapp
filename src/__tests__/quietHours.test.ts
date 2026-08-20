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
