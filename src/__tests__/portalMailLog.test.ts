import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, Muster wie portalLead.test.ts): die
// Auswahl-Logik des Portal-Abholers lebt im Kostenrechner (project 3/
// lib/portal-mail-log.ts — keine Imports). Getestet hier im root-vitest,
// weil project 3 keinen Testrunner hat (Registry #38).
import { zuVerarbeiten, SEED_SENTINEL_UID } from '../../project 3/lib/portal-mail-log';

describe('zuVerarbeiten — welche UIDs fasst ein Lauf an', () => {
  it('leeres Protokoll: alle UIDs sind neu', () => {
    expect(zuVerarbeiten([3, 7, 12], [])).toEqual([3, 7, 12]);
  });

  it('erledigt/abgelehnt/uebersprungen/altbestand werden nie wieder angefasst', () => {
    const zeilen = [
      { uid: 1, status: 'erledigt' },
      { uid: 2, status: 'abgelehnt' },
      { uid: 3, status: 'uebersprungen' },
      { uid: 4, status: 'altbestand' },
    ];
    expect(zuVerarbeiten([1, 2, 3, 4, 5], zeilen)).toEqual([5]);
  });

  it('offen wird erneut versucht (transienter Fehler)', () => {
    const zeilen = [
      { uid: 1, status: 'erledigt' },
      { uid: 2, status: 'offen' },
    ];
    expect(zuVerarbeiten([1, 2, 3], zeilen)).toEqual([2, 3]);
  });

  it('unbekannter künftiger Status zählt als erledigt — nie doppelt senden', () => {
    expect(zuVerarbeiten([1], [{ uid: 1, status: 'quarantaene' }])).toEqual([]);
  });

  it('der Seed-Sentinel (uid=0) kollidiert mit keiner echten UID', () => {
    const zeilen = [{ uid: SEED_SENTINEL_UID, status: 'altbestand' }];
    // Postfach war leer initialisiert; die erste echte Mail (uid 1) muss durch.
    expect(zuVerarbeiten([1], zeilen)).toEqual([1]);
  });

  it('leeres Postfach: nichts zu tun', () => {
    expect(zuVerarbeiten([], [{ uid: 1, status: 'erledigt' }])).toEqual([]);
  });

  it('Reihenfolge der Eingabe bleibt erhalten', () => {
    const zeilen = [{ uid: 5, status: 'erledigt' }];
    expect(zuVerarbeiten([2, 5, 9, 11], zeilen)).toEqual([2, 9, 11]);
  });
});
