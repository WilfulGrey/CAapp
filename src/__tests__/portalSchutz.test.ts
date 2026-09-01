import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, Muster wie portalUrl.test.ts). Die Edge
// Function send-scheduled-emails hat eine KOPIE dieser Logik
// (testphase.ts) mit eigenem Deno-Test — Aenderungen synchron halten.
import { testphaseUmleitung, TESTPHASE_EMPFAENGER, darfAngeschriebenWerden, parseDatum } from '../../project 3/lib/portal-schutz';

describe('testphaseUmleitung (Kundenmails der Portal-Leads ans Team)', () => {
  const portalLead = { source: 'portal:pflegehilfe.org', email: 'kunde@example.org' };

  it('Flag an + Portal-Lead → Team-Adressen, Betreff nennt den Kunden', () => {
    const u = testphaseUmleitung(portalLead, '1');
    expect(u?.empfaenger).toBe(TESTPHASE_EMPFAENGER);
    expect(u?.empfaenger).toContain('info@mamamia.app');
    expect(u?.empfaenger).toContain('martin@mamamia.app');
    expect(u?.betreffPraefix).toBe('[TESTPHASE → kunde@example.org] ');
  });

  it('Flag aus (fehlt oder ≠ "1") → keine Umleitung', () => {
    expect(testphaseUmleitung(portalLead, undefined)).toBeNull();
    expect(testphaseUmleitung(portalLead, '0')).toBeNull();
    expect(testphaseUmleitung(portalLead, 'true')).toBeNull();
  });

  it('Flag an, aber kein Portal-Lead → keine Umleitung (Rechner-Kunden unberührt)', () => {
    expect(testphaseUmleitung({ source: 'rechner', email: 'k@x.de' }, '1')).toBeNull();
    expect(testphaseUmleitung({ source: 'pria-chat', email: 'k@x.de' }, '1')).toBeNull();
    expect(testphaseUmleitung({ source: null, email: 'k@x.de' }, '1')).toBeNull();
    expect(testphaseUmleitung({}, '1')).toBeNull();
  });

  it('fehlende Kundenadresse → Präfix mit "?" statt Absturz', () => {
    expect(testphaseUmleitung({ source: 'portal:pflegebund.eu' }, '1')?.betreffPraefix).toBe(
      '[TESTPHASE → ?] ',
    );
  });
});

describe('parseDatum + Schutzregeln — deutsches Datumsformat (Bug: Zauner uid 14)', () => {
  const jetzt = new Date(2026, 8, 1, 14, 0); // 01.09.2026 14:00

  it('liest "01.09.2026 11:05 Uhr" (echtes Portal-Format) — frische Anfrage passiert', () => {
    const r = darfAngeschriebenWerden({ erstellt_am: '01.09.2026 11:05 Uhr' }, jetzt);
    expect(r.ok).toBe(true);
  });

  it('liest das Format auch ohne Uhrzeit und ohne "Uhr"', () => {
    expect(parseDatum('15.08.2026').getFullYear()).toBe(2026);
    expect(darfAngeschriebenWerden({ erstellt_am: '15.08.2026 09:30' }, jetzt).ok).toBe(true);
  });

  it('alte deutsche Daten fallen weiter auf die 60-Tage-Grenze', () => {
    const r = darfAngeschriebenWerden({ erstellt_am: '01.02.2026 10:00 Uhr' }, jetzt);
    expect(r.ok).toBe(false);
    expect(r.grund).toContain('Tage alt');
  });

  it('ISO bleibt lesbar; Fixture-Format ohne Jahr wird weiter ABGELEHNT', () => {
    expect(darfAngeschriebenWerden({ erstellt_am: '2026-09-01T11:05:00Z' }, jetzt).ok).toBe(true);
    /* "25. April 08:35" (jahrlos, wie im Fixture): V8 parst das lenient in
       ein Uralt-Datum → faellt auf die 60-Tage-Grenze. Entscheidend ist
       NUR, dass es nicht durchrutscht — der genaue Grund ist egal. */
    expect(darfAngeschriebenWerden({ erstellt_am: '25. April 08:35' }, jetzt).ok).toBe(false);
  });
});
