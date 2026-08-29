/*
 * Kein schwebender WhatsApp-Knopf mehr auf der Startseite.
 *
 * Warum dieser Test existiert (29.08.2026): Der Knopf blendete sich selbst
 * aus, sobald er Pria bemerkte — aber erst in einem `useEffect`, also NACH
 * dem ersten Zeichnen. Auf dem Handy blitzte er dadurch bei jedem Seitenaufruf
 * kurz auf (Martin: „wenn ich die seite lade, sehe ich kurz ein whatsapp icon
 * aufblitzen — entferne komplett"). Ein Element, das nur für 200 ms existiert,
 * ist kein Feature, sondern ein Flackern.
 *
 * WhatsApp bleibt erreichbar: als Link in den Kontaktblöcken, im Abschluss-CTA
 * und im Chat, sobald jemand einen Menschen möchte. Nur der schwebende Knopf
 * ist weg.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');

describe('Startseite — kein schwebender WhatsApp-Knopf', () => {
  it('bindet keine WhatsAppFloat-Komponente mehr ein', () => {
    const seite = readFileSync(join(WURZEL, 'app/page.tsx'), 'utf8');
    expect(seite, 'WhatsAppFloat ist zurück — er flackert beim Laden').not.toMatch(/WhatsAppFloat/);
  });

  it('die Komponente existiert nicht mehr', () => {
    expect(existsSync(join(WURZEL, 'components/calculator/WhatsAppFloat.tsx')),
      'Die Datei ist wieder da — dann wird sie irgendwann auch wieder eingebunden').toBe(false);
  });

  it('WhatsApp bleibt aber als Kontaktweg erhalten', () => {
    // Der Knopf sollte verschwinden, nicht der Kanal.
    const cta = readFileSync(join(WURZEL, 'components/calculator/FinalCTA.tsx'), 'utf8');
    expect(cta, 'WhatsApp-Link im Abschluss-CTA fehlt — zu viel entfernt').toMatch(/wa\.me/);
  });
});
