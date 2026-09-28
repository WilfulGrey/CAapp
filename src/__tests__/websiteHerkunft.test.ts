import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { einstieg, einstiegMerken, websiteHerkunft, websiteHerkunftMerken } from '../../project 3/lib/website-herkunft';

// Einstieg und Website-Herkunft (Registry #103): gemerkt wird der ERSTE Aufruf im Tab,
// gespeichert nur „direkt"/„verweis" bzw. die src-Kennung — nie eine Adresse.
function verweis(url: string) {
  Object.defineProperty(document, 'referrer', { value: url, configurable: true });
}

describe('Einstieg und Website-Herkunft', () => {
  beforeEach(() => { sessionStorage.clear(); verweis(''); window.history.replaceState(null, '', '/'); });
  afterEach(() => { verweis(''); window.history.replaceState(null, '', '/'); });

  it('merkt einen Aufruf ohne Verweis als direkt und behält ihn beim Klick innerhalb des Rechners', () => {
    einstiegMerken();
    expect(einstieg()).toBe('direkt');
    verweis('https://kostenrechner.primundus.de/bestpreisgarantie');
    einstiegMerken();
    expect(einstieg()).toBe('direkt');
    expect(sessionStorage.getItem('_prim_einstieg')).toBe('direkt');
  });

  it('merkt einen fremden Verweis als verweis, speichert aber keine Adresse', () => {
    verweis('https://www.google.com/search?q=24+stunden+pflege');
    einstiegMerken();
    expect(einstieg()).toBe('verweis');
    expect(JSON.stringify(sessionStorage)).not.toContain('google');
  });

  it('merkt den Rechner selbst nicht als Einstieg', () => {
    verweis('https://kostenrechner.primundus.de/');
    einstiegMerken();
    expect(sessionStorage.getItem('_prim_einstieg')).toBeNull();
  });

  it('erkennt primundus.de über die src-Kennung oder den Verweis', () => {
    window.history.replaceState(null, '', '/?start=1&src=apex-startseite');
    expect(websiteHerkunft()).toEqual({ src: 'apex-startseite', pfad: undefined });
    window.history.replaceState(null, '', '/');
    verweis('https://primundus.de/24h-pflege-muenchen');
    expect(websiteHerkunft()).toEqual({ src: 'apex-referrer', pfad: '/24h-pflege-muenchen' });
    websiteHerkunftMerken();
    verweis('');
    expect(websiteHerkunft()).toEqual({ src: 'apex-referrer', pfad: '/24h-pflege-muenchen' });
  });
});
