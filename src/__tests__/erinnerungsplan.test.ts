/**
 * Erinnerungen an eine offene Bewerbung (Vorschau v2, 26.09.2026) — project 3/lib/erinnerungsplan.ts.
 * Regeln: nie in der Nachtruhe (21–8 Uhr Berlin), die letzte sicher vor dem Ende, ≥ 6 h Abstand.
 */
import { describe, it, expect } from 'vitest';
import { erinnerungsplan, reservierungsEnde } from '../../project 3/lib/erinnerungsplan';
import { inNachtruhe } from '../../project 3/lib/quiet-hours';

const H = 60 * 60 * 1000;
const berlin = (d: Date) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
const plan = (eingangIso: string) => {
  const eingang = new Date(eingangIso);
  const ende = reservierungsEnde([eingang.getTime()])!;
  return { ende, p: erinnerungsplan(ende, eingang) };
};
/** Regeln, die für JEDEN Plan gelten. */
function pruefeRegeln(ende: Date, jetzt: Date, p: ReturnType<typeof erinnerungsplan>) {
  for (const x of p) {
    expect(inNachtruhe(x.scheduledFor), `${x.emailType} ${berlin(x.scheduledFor)} nachts`).toBe(false);
    expect(ende.getTime() - x.scheduledFor.getTime(), `${x.emailType} zu knapp vor dem Ende`).toBeGreaterThanOrEqual(H);
    expect(x.scheduledFor.getTime(), `${x.emailType} vor jetzt`).toBeGreaterThan(jetzt.getTime());
  }
  for (let i = 1; i < p.length; i++) {
    expect(p[i].scheduledFor.getTime() - p[i - 1].scheduledFor.getTime(), 'Abstand').toBeGreaterThanOrEqual(6 * H);
  }
}

describe('reservierungsEnde', () => {
  it('frühester Eingang + 72 h, auf die volle Stunde abgerundet', () => {
    const t = Date.parse('2026-09-26T13:47:12Z');
    expect(reservierungsEnde([t + 3 * H, t])!.toISOString()).toBe('2026-09-29T13:00:00.000Z');
    expect(reservierungsEnde([])).toBeNull();
  });
});

describe('erinnerungsplan', () => {
  it('Bewerbung am Nachmittag: −52 h, −24 h, −8 h, alle tagsüber', () => {
    // Eingang Sa 26.09. 14:30 Berlin → Ende Di 29.09. 14:00
    const { ende, p } = plan('2026-09-26T12:30:00Z');
    expect(p.map((x) => [x.emailType, berlin(x.scheduledFor)])).toEqual([
      ['application_erinnerung_1', 'So., 27.09., 10:00'],
      ['application_erinnerung_2', 'Mo., 28.09., 14:00'],
      ['application_erinnerung_letzte', 'Di., 29.09., 08:00'],
    ]);
    expect((ende.getTime() - p[2].scheduledFor.getTime()) / H).toBe(6);
  });

  it('Bewerbung am späten Abend: letzte am Vorabend statt nach der Absage', () => {
    // Eingang Sa 26.09. 23:10 Berlin → Ende Di 29.09. 23:00; −8 h = 15:00
    const { ende, p } = plan('2026-09-26T21:10:00Z');
    pruefeRegeln(ende, new Date('2026-09-26T21:10:00Z'), p);
    expect(p.find((x) => x.emailType === 'application_erinnerung_letzte')!.scheduledFor.toISOString()).toBe('2026-09-29T13:00:00.000Z');
    // −24 h = Mo 23:00 → Mo 20:00
    expect(berlin(p.find((x) => x.emailType === 'application_erinnerung_2')!.scheduledFor)).toBe('Mo., 28.09., 20:00');
  });

  it('Bewerbung nachts: Ende 03:00, letzte 20:00 am Vorabend', () => {
    // Eingang So 27.09. 03:20 Berlin → Ende Mi 30.09. 03:00; −8 h = Di 19:00 (Tag)
    const { ende, p } = plan('2026-09-27T01:20:00Z');
    pruefeRegeln(ende, new Date('2026-09-27T01:20:00Z'), p);
    expect(berlin(p.find((x) => x.emailType === 'application_erinnerung_letzte')!.scheduledFor)).toBe('Di., 29.09., 19:00');
  });

  it('Ende um 08:00, 14:00 und 21:00 — die Regeln halten', () => {
    for (const eingang of ['2026-10-05T06:00:00Z', '2026-10-05T12:00:00Z', '2026-10-05T19:00:00Z', '2026-10-05T07:30:00Z', '2026-10-05T23:59:00Z']) {
      const jetzt = new Date(eingang);
      const ende = reservierungsEnde([jetzt.getTime()])!;
      const p = erinnerungsplan(ende, jetzt);
      pruefeRegeln(ende, jetzt, p);
      expect(p.some((x) => x.emailType === 'application_erinnerung_letzte'), eingang).toBe(true);
    }
  });

  it('jede Stunde eines Tages: nie nachts, letzte immer dabei, Abstände ≥ 6 h', () => {
    for (let h = 0; h < 24 * 7; h++) {
      const jetzt = new Date(Date.parse('2026-10-20T00:17:00Z') + h * H);
      const ende = reservierungsEnde([jetzt.getTime()])!;
      const p = erinnerungsplan(ende, jetzt);
      pruefeRegeln(ende, jetzt, p);
      expect(p.some((x) => x.emailType === 'application_erinnerung_letzte')).toBe(true);
      expect(p.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('über den Wechsel auf die Winterzeit (25.10.2026) und die Sommerzeit (28.03.2027)', () => {
    for (const start of ['2026-10-23T18:00:00Z', '2026-10-24T02:00:00Z', '2027-03-26T20:30:00Z', '2027-03-27T05:00:00Z']) {
      const jetzt = new Date(start);
      const ende = reservierungsEnde([jetzt.getTime()])!;
      const p = erinnerungsplan(ende, jetzt);
      pruefeRegeln(ende, jetzt, p);
      expect(p.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('über den Jahreswechsel', () => {
    const jetzt = new Date('2026-12-30T22:40:00Z');
    const ende = reservierungsEnde([jetzt.getTime()])!;
    const p = erinnerungsplan(ende, jetzt);
    pruefeRegeln(ende, jetzt, p);
    expect(p.map((x) => x.emailType)).toContain('application_erinnerung_letzte');
  });

  it('Bewerbung kurz vor Ablauf (erneut eingegangen): nur was noch sinnvoll ist', () => {
    const ende = new Date('2026-10-10T12:00:00Z'); // 14:00 Berlin
    expect(erinnerungsplan(ende, new Date('2026-10-10T07:00:00Z'))).toEqual([]); // 5 h Rest
    const p = erinnerungsplan(ende, new Date('2026-10-10T02:00:00Z')); // 10 h Rest, 04:00 Berlin
    expect(p.map((x) => x.emailType)).toEqual(['application_erinnerung_letzte']);
    expect(berlin(p[0].scheduledFor)).toBe('Sa., 10.10., 08:00');
  });
});
