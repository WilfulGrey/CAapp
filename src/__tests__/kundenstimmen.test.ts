/*
 * Echte Kundenstimmen im Rechner (Registry #153, Martin 09.11.2026: „passe die Bewertungen an. Benutze die von der
 * Bewertungsseite“). Die Texte sind wörtliche Kopien aus primundus-main `lib/bewertungen-direkt.ts`; dieser Test prüft,
 * was ohne das andere Repo prüfbar ist: Form, Regeln und dass die Platzhalter nicht zurückkommen.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERKUNFT_STIMMEN, STIMMEN_LETZTER_SCHRITT, STIMMEN_STARTSEITE } from '../../project 3/lib/kundenstimmen';

const rechner = join(__dirname, '..', '..', 'project 3', 'components/calculator');
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

describe('Kundenstimmen (Registry #153)', () => {
  const alle = [...STIMMEN_STARTSEITE, ...STIMMEN_LETZTER_SCHRITT];

  it('sechs Stimmen auf der Startseite, drei im letzten Schritt, keine doppelt', () => {
    expect(STIMMEN_STARTSEITE).toHaveLength(6);
    expect(STIMMEN_LETZTER_SCHRITT).toHaveLength(3);
    expect(new Set(alle.map((s) => s.id)).size).toBe(alle.length);
  });

  it('jede Stimme trägt die id der Quelle, und das Datum passt zur id', () => {
    for (const s of alle) {
      const m = /^k-(\d{4})(\d{2})(\d{2})-[a-z]+$/.exec(s.id);
      expect(m, s.id).not.toBeNull();
      const [, jahr, monat, tag] = m!;
      expect(s.datum).toBe(`${Number(tag)}. ${MONATE[Number(monat) - 1]} ${jahr}`);
      expect(s.sterne).toBeGreaterThanOrEqual(1);
      expect(s.sterne).toBeLessThanOrEqual(5);
      expect(s.name).toMatch(/^[A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ]\.$/);
      expect(s.ort.length).toBeGreaterThan(1);
      expect(s.text.length).toBeGreaterThan(10);
    }
  });

  it('keine Stimme spricht von Vermittlung (Primundus hat eigenes Personal)', () => {
    for (const s of alle) expect(s.text, s.id).not.toMatch(/[Vv]ermittl/);
  });

  it('die Startseite zeigt die echten Stimmen mit Datum, die Platzhalter sind weg', () => {
    const karte = readFileSync(join(rechner, 'TestimonialCard.tsx'), 'utf8');
    expect(karte).toContain('STIMMEN_STARTSEITE.map(');
    expect(karte).toContain('{stimme.datum}');
    // Kein Link weg von der Seite (Martin 09.11.: „keinen Link … damit er da nicht wegspringt“).
    expect(karte).not.toMatch(/<a\s/);
    for (const platzhalter of ['Helga M.', 'Stefan K.', 'Maria P.', 'Thomas W.', 'Julia B.', 'Robert L.', 'Vermittlung']) {
      expect(karte).not.toContain(platzhalter);
    }
    expect(existsSync(join(rechner, 'ReviewsSection.tsx'))).toBe(false);
  });

  it('unter jeder Stimmen-Liste steht, woher die Stimmen kommen, immer und vor der Auswahl-Zeile (Registry #159)', () => {
    // § 5b Abs. 3 UWG; Wortlaut von primundus.de/erfahrungen, Martin 09.11.: „bei Bewertungen schreiben wir den vorgeschlagenen“.
    expect(HERKUNFT_STIMMEN).toBe('Diese Bewertungen haben uns Familien direkt geschickt.');
    for (const datei of ['TestimonialCard.tsx', 'FormularPortal.tsx']) {
      const quelle = readFileSync(join(rechner, datei), 'utf8');
      expect(quelle, datei).toContain('{HERKUNFT_STIMMEN}{bewertung && <> Auswahl aus {anzahlText(bewertung.anzahl)} auf primundus.de.</>}');
      // Nicht hinter `bewertung &&`: ohne Bewertungsstand fehlt nur die Zahl, nie die Herkunft.
      expect(quelle, datei).not.toMatch(/bewertung && \(?\s*<p[^>]*>\s*\{?HERKUNFT_STIMMEN/);
    }
  });
});
