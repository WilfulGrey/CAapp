import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { einstieg, websiteHerkunft, websiteHerkunftMerken } from '../../project 3/lib/website-herkunft';

// Einstieg und Website-Herkunft (Registry #103): Der Einstieg wird nur aus dem Verweis gelesen,
// nichts wird dafür auf dem Gerät gespeichert.
function verweis(url: string) {
  Object.defineProperty(document, 'referrer', { value: url, configurable: true });
}

describe('Einstieg und Website-Herkunft', () => {
  beforeEach(() => { sessionStorage.clear(); verweis(''); window.history.replaceState(null, '', '/'); });
  afterEach(() => { verweis(''); window.history.replaceState(null, '', '/'); });

  it('liest einen Aufruf ohne Verweis als direkt — und speichert dafür nichts', () => {
    expect(einstieg()).toBe('direkt');
    expect(sessionStorage.length).toBe(0);
  });

  it('liest einen fremden Verweis als verweis', () => {
    verweis('https://www.google.com/search?q=24+stunden+pflege');
    expect(einstieg()).toBe('verweis');
  });

  it('zählt einen Klick innerhalb des Rechners nicht als Einstieg', () => {
    verweis('https://kostenrechner.primundus.de/bestpreisgarantie');
    expect(einstieg()).toBeNull();
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
