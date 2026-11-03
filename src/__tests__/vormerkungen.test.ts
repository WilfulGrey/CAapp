// Vorgemerkte Pflegekräfte vor dem ersten Speichern (Registry #145): nur caregiver_ids je Token, robust gegen Unlesbares,
// und der Wortlaut der Namensliste („A und B“, „A, B und C“) für Zeile und Hinweis.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { einladbareVormerkungen, eingeladenHinweis, ladeVormerkungen, MAX_VORMERKUNGEN, nameGeschuetzt, namenListe, speichereVormerkungen, vormerkSchluessel } from '../lib/vormerkungen';

const NBSP = '\u00A0';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('Vormerkungen im localStorage (je Token)', () => {
  it('eigener Schlüssel je Token, Reihenfolge bleibt, doppelte fallen weg; leer entfernt den Schlüssel', () => {
    expect(vormerkSchluessel('abc')).toBe('pm_vorgemerkt_abc');
    speichereVormerkungen('abc', [50003, 50002, 50003]);
    expect(localStorage.getItem('pm_vorgemerkt_abc')).toBe('[50003,50002]');
    expect(ladeVormerkungen('abc')).toEqual([50003, 50002]);
    expect(ladeVormerkungen('xyz')).toEqual([]);
    speichereVormerkungen('abc', []);
    expect(localStorage.getItem('pm_vorgemerkt_abc')).toBeNull();
  });

  it('Unlesbares und Fremdes ergibt eine leere Liste; ohne Token passiert nichts', () => {
    localStorage.setItem('pm_vorgemerkt_a', '{kaputt');
    localStorage.setItem('pm_vorgemerkt_b', '{"x":1}');
    localStorage.setItem('pm_vorgemerkt_c', '["7", 0, -3, 1.5, 42]');
    expect(ladeVormerkungen('a')).toEqual([]);
    expect(ladeVormerkungen('b')).toEqual([]);
    expect(ladeVormerkungen('c')).toEqual([42]);
    expect(ladeVormerkungen(null)).toEqual([]);
    speichereVormerkungen(undefined, [1]);
    expect(localStorage.length).toBe(3);
  });

  it('localStorage wirft (privater Modus): kein Fehler, leere Liste', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(ladeVormerkungen('abc')).toEqual([]);
    expect(() => speichereVormerkungen('abc', [1])).not.toThrow();
  });
});

describe('Namensliste und Hinweis nach dem Einladen', () => {
  // Nachbesserung 2: das Leerzeichen IM Namen ist geschützt (U+00A0), damit „Anna N.“ nie mitten umbricht; zwischen den
  // Namen („, “ und „ und “) bleiben normale Leerzeichen, dort darf die Zeile umbrechen.
  it('ein, zwei, drei Namen — jeder Name mit geschütztem Leerzeichen', () => {
    expect(nameGeschuetzt('Anna N.')).toBe(`Anna${NBSP}N.`);
    expect(nameGeschuetzt('Anna Maria N.')).toBe(`Anna${NBSP}Maria${NBSP}N.`);
    expect(namenListe([])).toBe('');
    expect(namenListe(['Emilia W.'])).toBe(`Emilia${NBSP}W.`);
    expect(namenListe(['Emilia W.', 'Anna N.'])).toBe(`Emilia${NBSP}W. und Anna${NBSP}N.`);
    expect(namenListe(['Emilia W.', 'Anna N.', 'Ewa L.'])).toBe(`Emilia${NBSP}W., Anna${NBSP}N. und Ewa${NBSP}L.`);
    expect(eingeladenHinweis(['Emilia W.'])).toBe(`Emilia${NBSP}W. ist eingeladen.`);
    expect(eingeladenHinweis(['Emilia W.', 'Anna N.'])).toBe(`Emilia${NBSP}W. und Anna${NBSP}N. sind eingeladen.`);
  });
});

describe('Höchstens 5 Vormerkungen, nur Einladbare (Nachbesserung 2)', () => {
  it('Laden und Speichern kappen bei 5', () => {
    expect(MAX_VORMERKUNGEN).toBe(5);
    speichereVormerkungen('abc', [1, 2, 3, 4, 5, 6, 7]);
    expect(localStorage.getItem('pm_vorgemerkt_abc')).toBe('[1,2,3,4,5]');
    localStorage.setItem('pm_vorgemerkt_xyz', '[9,8,7,6,5,4]');
    expect(ladeVormerkungen('xyz')).toEqual([9, 8, 7, 6, 5]);
  });

  it('nur offene, sichtbare Karten, in der Reihenfolge des Vormerkens, nie mehr als frei und als 5', () => {
    // 3 ausgeblendet/abgelehnt (nicht unter den offenen Karten) fällt weg, die Reihenfolge bleibt.
    expect(einladbareVormerkungen([4, 3, 1], [1, 2, 4], 5)).toEqual([4, 1]);
    // Grenze 5 je Stunde: noch 1 frei → nur die zuerst Vorgemerkte; 0 frei → niemand.
    expect(einladbareVormerkungen([4, 1], [1, 2, 4], 1)).toEqual([4]);
    expect(einladbareVormerkungen([4, 1], [1, 2, 4], 0)).toEqual([]);
    expect(einladbareVormerkungen([4, 1], [1, 2, 4], -2)).toEqual([]);
    // Nie mehr als 5, auch wenn mehr frei wäre.
    expect(einladbareVormerkungen([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6], 9)).toEqual([1, 2, 3, 4, 5]);
  });
});
