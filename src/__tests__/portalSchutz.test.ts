import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, Muster wie portalUrl.test.ts). Die Edge
// Function send-scheduled-emails hat eine KOPIE dieser Logik
// (testphase.ts) mit eigenem Deno-Test — Aenderungen synchron halten.
import { testphaseUmleitung, TESTPHASE_EMPFAENGER } from '../../project 3/lib/portal-schutz';

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
