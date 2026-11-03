// Vorgemerkte Pflegekräfte vor dem ersten Speichern (Registry #145): nur caregiver_ids je Token, robust gegen Unlesbares,
// und der Wortlaut der Namensliste („A und B“, „A, B und C“) für Zeile und Hinweis.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eingeladenHinweis, ladeVormerkungen, namenListe, speichereVormerkungen, vormerkSchluessel } from '../lib/vormerkungen';

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
  it('ein, zwei, drei Namen', () => {
    expect(namenListe(['Emilia W.'])).toBe('Emilia W.');
    expect(namenListe(['Emilia W.', 'Anna N.'])).toBe('Emilia W. und Anna N.');
    expect(namenListe(['Emilia W.', 'Anna N.', 'Ewa L.'])).toBe('Emilia W., Anna N. und Ewa L.');
    expect(eingeladenHinweis(['Emilia W.'])).toBe('Emilia W. ist eingeladen.');
    expect(eingeladenHinweis(['Emilia W.', 'Anna N.'])).toBe('Emilia W. und Anna N. sind eingeladen.');
  });
});
