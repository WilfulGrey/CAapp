import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as next from '../../../project 3/lib/mail-bausteine';
import * as edge from '../../../project 3/supabase/functions/send-scheduled-emails/mailBausteine';
import { HERO_PUNKTE } from '../../../project 3/lib/hero-punkte';

// Gemeinsame Bausteine der Kundenmails (Vorschau v2, Martin 26.09.2026). Zwei Kopien:
// lib/mail-bausteine.ts (Next, Sofort-Mails) und send-scheduled-emails/mailBausteine.ts
// (Deno, Warteschlange). Beide müssen Zeichen für Zeichen gleich sein, und die Punkte sind die
// der Startseite („die müssen doch überall gleich sein").

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const PK = { name: 'Maria K.', alter: 62, deutsch: 'Gut', jahre: 6, einsaetze: 14, foto: 'cid:x@primundus.de' };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();

describe('mail-bausteine', () => {
  it('beide Kopien sind identisch', () => {
    const a = readFileSync(join(WURZEL, 'lib/mail-bausteine.ts'), 'utf8');
    const b = readFileSync(join(WURZEL, 'supabase/functions/send-scheduled-emails/mailBausteine.ts'), 'utf8');
    expect(b).toBe(a);
    // Keine Imports: beide Laufzeiten laden die Datei ohne Pfad-Aliase.
    expect(a).not.toMatch(/^import /m);
  });

  it('die Punkte sind die der Startseite', () => {
    expect([...next.MAIL_HERO_PUNKTE]).toEqual([...HERO_PUNKTE]);
    const punkte = text(next.mPunkte({ schnitt: '4,9', anzahl: 126 }));
    for (const p of HERO_PUNKTE) expect(punkte).toContain(p);
    expect(punkte).toContain('Bestpreisgarantie Mehr Infos');
    expect(punkte).toContain('4,9 von 5');
    expect(text(next.mPunkte(null))).not.toContain('von 5');
  });

  it('gleiche Ausgabe in beiden Kopien', () => {
    const angebot = { tagessatz: 102, zeitraum: '15.10.2026 – 10.12.2026', reisekosten: 125 };
    const faelle: [string, (m: typeof next) => string][] = [
      ['Karte', (m) => m.mKarte('x', { rand: '#3D7A5C' })],
      ['Knopf', (m) => m.mKnopf('https://a', 'Bewerbungen erhalten')],
      ['Knopf hell', (m) => m.mKnopfHell('https://a', 'Nicht mehr relevant')],
      ['Pflegekraft', (m) => m.mPflegekraft(PK, 'https://p')],
      ['Bewerbung', (m) => m.mBewerbungsKarte(PK, angebot, 'https://p', { bewertung: null })],
      ['Schritte', (m) => m.mSchritte([{ titel: 'A', zustand: 'fertig' }, { titel: 'B', text: 'b', zustand: 'jetzt' }], true)],
      ['Anrede', (m) => m.anredeZeile('Frau', 'Müller') + m.anredeZeile(null, 'Müller')],
    ];
    for (const [name, f] of faelle) expect(f(edge as unknown as typeof next), name).toBe(f(next));
  });

  it('Anrede formal mit Nachnamen, sonst „Guten Tag", nie der Vorname', () => {
    expect(next.anredeZeile('Frau', 'Müller')).toBe('Guten Tag Frau Müller');
    expect(next.anredeZeile('Familie', 'Ruppert')).toBe('Guten Tag Familie Ruppert');
    expect(next.anredeZeile('Frau', '')).toBe('Guten Tag');
    expect(next.anredeZeile(null, 'Müller')).toBe('Guten Tag');
  });

  it('Pflegekraft-Box: Stufe wortgleich zum Portal, ehrlicher Ersatz ohne Zahlen', () => {
    expect(text(next.mPflegekraft(PK, 'https://p'))).toContain('Elite 6 Jahre Erfahrung · 14 Einsätze');
    const neu = text(next.mPflegekraft({ name: 'Ewa N.' }, 'https://p'));
    expect(neu).toContain('Neu bei Primundus bereit für den ersten Einsatz');
    expect(neu).toContain('Ewas Profil ansehen');
    // Ohne Foto: Initialen statt kaputtem Bild
    expect(next.mPflegekraft({ name: 'Ewa Nowak' }, 'https://p')).toContain('>EN</div>');
  });

  it('Bewerbungskarte lässt fehlende Konditionen weg statt „undefined"', () => {
    const h = next.mBewerbungsKarte(PK, { tagessatz: null, zeitraum: null, reisekosten: null }, 'https://p', null);
    expect(h).not.toMatch(/undefined|NaN|null/);
    expect(text(h)).toContain('Angebot prüfen');
    expect(text(h)).not.toContain('Tagessatz');
  });
});
