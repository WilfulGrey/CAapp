import { describe, expect, it } from 'vitest';
import { WECHSEL } from '../../project 3/lib/wechsel';
import { GARANTIE } from '../../project 3/lib/kraefte-vorschau';
import { pruefeZaehler } from '../../project 3/lib/zaehler';

// Registry #81 (Martin 18.09.2026): Landingpage /wechsel für Familien, die schon eine
// 24-Stunden-Kraft haben — „unzufrieden mit ihrer Pflegekraft oder Agentur oder zu teuer".

describe('Landingpage /wechsel', () => {
  // nur die Texte, nicht die Schlüssel (h1, anker1 …)
  const werte = (o: unknown): string[] => (typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(werte) : o && typeof o === 'object' ? Object.values(o).flatMap(werte) : []);
  const alles = werte(WECHSEL).join('\n');
  it('verspricht nur Belegtes: Garantie im Wortlaut der Konstante, keine Vergleichsbehauptung, kein Wettbewerbername', () => {
    expect(WECHSEL.aenderung.punkte[0].text).toContain(GARANTIE.zusage);
    expect(WECHSEL.aenderung.punkte[0].text).toContain(GARANTIE.ablauf);
    expect(WECHSEL.fragen.liste[4].antwort).toContain(GARANTIE.zusage);
    expect(alles).not.toMatch(/günstiger als|billiger|verdient mehr|unterbieten|definitiv/i);
    expect(alles).not.toMatch(/pflegehelden|hausengel|promedica|marta\.de|home instead/i);
    expect(alles).not.toMatch(/wir vermitteln|Portal|Fast geschafft|Nur noch/);
    // keine Zahl ohne Beleg: nur 2 Minuten, 8 Fragen, 3 Tage, 7 Tage, 60.000
    const zahlen = alles.match(/\d[\d.]*/g) ?? [];
    for (const z of zahlen) expect(['2', '8', '3', '7', '60.000', '24']).toContain(z);
  });
  it('Kopf und Knopf: Kicker nennt die Zielgruppe, H1 die zwei Gründe, Knopf den Vergleich in einer Zeile', () => {
    expect(WECHSEL.kicker).toBe('Schon eine 24-Stunden-Kraft im Haus?');
    expect(WECHSEL.h1).toBe('Zu teuer? Unzufrieden? Vergleichen Sie in 2 Minuten.');
    expect(WECHSEL.knopf).toMatch(/^Preis in 2 Minuten vergleichen/);
    expect(WECHSEL.knopf.length).toBeLessThanOrEqual(34);
    expect(WECHSEL.unterzeile.ende).toBe('Anreise in 3 Tagen möglich.');
  });
  it('vier Änderungen, vier Schritte, fünf Fragen — jede mit Text', () => {
    expect(WECHSEL.aenderung.punkte).toHaveLength(4);
    expect(WECHSEL.ablauf.schritte).toHaveLength(4);
    expect(WECHSEL.fragen.liste).toHaveLength(5);
    for (const p of WECHSEL.aenderung.punkte) expect(p.text.length).toBeGreaterThan(40);
    for (const s of WECHSEL.ablauf.schritte) expect(s.text.length).toBeGreaterThan(30);
    for (const f of WECHSEL.fragen.liste) expect(f.antwort.length).toBeGreaterThan(30);
    expect(WECHSEL.meta.title).toMatch(/PRIMUNDUS$/);
  });
  it('zählt unter der eigenen Variante wechsel', () => {
    expect(pruefeZaehler({ ereignis: 'preis_gesehen', variante: 'wechsel', quelle: 'google' })).toEqual({ ereignis: 'preis_gesehen', variante: 'wechsel', quelle: 'google' });
  });
});
