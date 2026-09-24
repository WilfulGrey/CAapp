import { describe, it, expect } from 'vitest';
import { TELEFON_HREF, WHATSAPP_HREF, whatsappHref, ERREICHBAR } from '../lib/kontakt';

describe('kontakt', () => {
  it('grüßt Marta Kapcio, nicht mehr Frau Wysocki', () => {
    expect(decodeURIComponent(WHATSAPP_HREF)).toContain('Hallo Frau Kapcio');
    expect(WHATSAPP_HREF).not.toMatch(/Wysocki/i);
  });

  it('baut WhatsApp-Links mit und ohne Text', () => {
    expect(whatsappHref()).toBe('https://wa.me/4989200000830');
    expect(whatsappHref('A & B')).toBe('https://wa.me/4989200000830?text=A%20%26%20B');
  });

  it('nutzt die internationale Telefonnummer und die Zeiten der Website', () => {
    expect(TELEFON_HREF).toBe('tel:+4989200000830');
    expect(ERREICHBAR).toBe('täglich 8–20 Uhr');
  });
});
