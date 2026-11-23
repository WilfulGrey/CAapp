import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Cross-App-Import (Ausnahme wie oaiq.test.ts): das Pixel lebt im
// Kostenrechner (project 3/lib/meta-pixel.ts — pures Modul ohne Next-Imports),
// der Test steht in der Suite, die als Pflicht-Check vor jedem Merge laeuft.
import { meldeMetaAnfrage, META_PIXEL_ID } from '../../project 3/lib/meta-pixel';
import { WERT_ANFRAGE_EUR } from '../../project 3/lib/oaiq';

describe('meldeMetaAnfrage (Meta-Pixel)', () => {
  it('meldet Lead mit festem Wert in ganzen Euro und der leadId als eventID', () => {
    const fbq = vi.fn();

    expect(meldeMetaAnfrage(fbq, 'lead-123')).toBe(true);
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Lead',
      { value: WERT_ANFRAGE_EUR, currency: 'EUR' },
      { eventID: 'lead-123' },
    );
  });

  it('schweigt ohne Marketing-Einwilligung, statt zu werfen', () => {
    // Ohne Einwilligung laedt der Lader in app/layout.tsx fbevents.js nicht,
    // window.fbq ist dann undefined — der Normalfall vor dem Cookie-Klick.
    expect(meldeMetaAnfrage(undefined, 'lead-123')).toBe(false);
    expect(meldeMetaAnfrage(null)).toBe(false);
    expect(meldeMetaAnfrage({}, 'lead-123')).toBe(false);
  });

  it('laesst die Optionen weg, wenn keine leadId vorliegt', () => {
    const fbq = vi.fn();

    meldeMetaAnfrage(fbq);

    expect(fbq).toHaveBeenCalledWith('track', 'Lead', { value: 20, currency: 'EUR' });
    expect(fbq.mock.calls[0]).toHaveLength(3);
  });

  it('schickt nur Wert und Waehrung — keine Rechner-Antworten, keine Kontaktdaten', () => {
    // Pflegegrad, Mobilitaet, Nacht sind Gesundheitsangaben; Name, E-Mail,
    // Telefon gehen ebenfalls nicht an Meta. Neue Felder hier = bewusste
    // Entscheidung mit Datenschutz-Text, nicht nebenbei.
    const fbq = vi.fn();
    meldeMetaAnfrage(fbq, 'x');

    const [, name, details] = fbq.mock.calls[0];
    expect(name).toBe('Lead');
    expect(Object.keys(details as object).sort()).toEqual(['currency', 'value']);
    expect(META_PIXEL_ID).toBe('2358395084910089');
  });

  it('Lader in app/layout.tsx: autoConfig aus vor init, kein noscript-Bild', () => {
    const layout = readFileSync(
      resolve(__dirname, '../../project 3/app/layout.tsx'),
      'utf8',
    );
    const autoConfig = layout.indexOf("window.fbq('set', 'autoConfig', false");
    const init = layout.indexOf("window.fbq('init'");
    expect(autoConfig).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(autoConfig);
    // Das Bild aus Metas Standard-Schnipsel wuerde ohne jede Wahl senden.
    expect(layout).not.toContain('facebook.com/tr?');
    // Geladen wird nur hinter dem Marketing-Schalter.
    expect(layout).toContain('if (auswahl && auswahl.marketing) ladeMetaPixel();');
  });
});
