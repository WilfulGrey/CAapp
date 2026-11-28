// @vitest-environment node
/**
 * Registry #172: Kontaktdaten aus dem Facebook-/Instagram-Formular im Kostenrechner vorausfüllen.
 * Geprüft an `project 3/lib/fb-kontakt.ts` (Schlüssel aus dem Fragment, Antwort der Route, Satz)
 * und an der Quelle von MultiStepForm (liest den Schlüssel, nimmt ihn aus der Adresse, schickt ihn mit).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// lib/meta-leads lädt lib/email (Supabase-Client beim Import) — hier nur der Schlüssel-Generator gebraucht.
vi.mock('../../project 3/lib/email', () => ({ sendEmail: vi.fn() }));
import {
  FB_TOKEN_MUSTER,
  KONTAKT_MAX_TAGE,
  kanalName,
  kontaktAusZeile,
  kontaktFertigVorausgefuellt,
  tokenAusHash,
} from '../../project 3/lib/fb-kontakt';
import { neuerRechnerToken } from '../../project 3/lib/meta-leads';

const T = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';

describe('Schlüssel', () => {
  it('neuerRechnerToken: 32 Zeichen base64url, jedes Mal anders', () => {
    const a = neuerRechnerToken();
    const b = neuerRechnerToken();
    expect(a).toMatch(FB_TOKEN_MUSTER);
    expect(b).toMatch(FB_TOKEN_MUSTER);
    expect(a).not.toBe(b);
  });

  it('tokenAusHash: nur gültige Schlüssel aus #fb=…', () => {
    expect(tokenAusHash(`#fb=${T}`)).toBe(T);
    expect(tokenAusHash(`#x=1&fb=${T}`)).toBe(T);
    expect(tokenAusHash(`fb=${T}`)).toBe(T);
    expect(tokenAusHash('#fb=kurz')).toBeNull();
    expect(tokenAusHash(`#fb=${T}<script>`)).toBeNull();
    expect(tokenAusHash('#kundenstimmen')).toBeNull();
    expect(tokenAusHash('')).toBeNull();
    expect(tokenAusHash(null)).toBeNull();
  });
});

describe('Antwort der Route', () => {
  const JETZT = new Date('2026-11-28T10:00:00Z');
  const zeile = { name: ' Sabine Beispiel ', email: 'sabine@example.com', phone: '+49 151 23456789', platform: 'fb', created_time: '2026-11-27T19:42:00Z' };

  it('Name, E-Mail, Telefon und Kanal, getrimmt', () => {
    expect(kontaktAusZeile(zeile, JETZT)).toEqual({ name: 'Sabine Beispiel', email: 'sabine@example.com', telefon: '+49 151 23456789', kanal: 'Facebook' });
  });

  it(`älter als ${KONTAKT_MAX_TAGE} Tage, ohne Zeile oder ohne jeden Kontaktwert ⇒ nichts`, () => {
    expect(kontaktAusZeile({ ...zeile, created_time: '2026-10-01T10:00:00Z' }, JETZT)).toBeNull();
    expect(kontaktAusZeile(null, JETZT)).toBeNull();
    expect(kontaktAusZeile({ ...zeile, name: null, email: '', phone: ' ' }, JETZT)).toBeNull();
  });

  it('Kanal: fb ⇒ Facebook, ig ⇒ Instagram, sonst null', () => {
    expect(kanalName('fb')).toBe('Facebook');
    expect(kanalName('IG')).toBe('Instagram');
    expect(kanalName(null)).toBeNull();
    expect(kanalName('messenger')).toBeNull();
  });
});

describe('Satz über den Feldern (Martin 28.11.: „Ja, so bauen“)', () => {
  it('Wortlaut wie im freigegebenen Bild, Kanal je Lead', () => {
    expect(kontaktFertigVorausgefuellt('Facebook')).toBe(
      'Ihre Kontaktdaten haben wir aus Ihrer Facebook-Anfrage übernommen. Bitte kurz prüfen, danach sehen Sie sofort Ihr Angebot und Ihre passende Pflegekräfte-Auswahl.',
    );
    expect(kontaktFertigVorausgefuellt('Instagram')).toContain('aus Ihrer Instagram-Anfrage übernommen');
    expect(kontaktFertigVorausgefuellt(null)).toContain('aus Ihrer Anfrage übernommen');
  });
});

describe('Kostenrechner (Quelle)', () => {
  const quelle = readFileSync(resolve(__dirname, '../../project 3/components/calculator/MultiStepForm.tsx'), 'utf8');
  it('liest den Schlüssel aus dem Fragment, nimmt ihn aus der Adresse und füllt nur leere Felder', () => {
    expect(quelle).toContain('tokenAusHash(window.location.hash)');
    expect(quelle).toContain('window.history.replaceState(');
    expect(quelle).toContain("fetch('/api/fb-kontakt'");
    expect(quelle).toContain('name: alt.name || k.name');
  });
  it('schickt den Schlüssel beim Absenden mit und zeigt den Satz nur mit Facebook-Daten', () => {
    expect(quelle).toContain('fbToken: fbTokenRef.current');
    expect(quelle).toContain('fbKanal !== undefined ? kontaktFertigVorausgefuellt(fbKanal) : KONTAKT_FERTIG.text');
  });
});
