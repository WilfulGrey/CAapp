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
      ['Profil', (m) => m.mProfil(PK, 'https://p') + m.mProfil({ name: 'Ewa N.' }, 'https://p', 22)],
      ['Kopfkarte', (m) => m.mKopfKarte('Unsere Empfehlung', 'neutral', 'x', 12) + m.mKopfKarte('Neue Bewerbung', 'gruen', 'y')],
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

  it('Profil „V": Stufe hängt an den Einsätzen bei uns, wortgleich zum Portal (PflegekraftProfil)', () => {
    const t = text(next.mProfil(PK, 'https://p'));
    expect(t).toContain('Maria K. , 62');
    expect(t).toContain('Deutsch gut');
    expect(t).toMatch(/&#9733;\s*Elite 14 Einsätze bei uns/);
    expect(t).toContain('6 Jahre Berufserfahrung');
    expect(t).toContain('Profil ansehen');
    // Deutsch als drei Punkte (wie im Portal), ohne Angabe keine
    expect(next.mProfil(PK, 'https://p').match(/width:9px;height:9px/g)).toHaveLength(3);
    expect(next.mProfil({ name: 'Ewa N.' }, 'https://p')).not.toContain('width:9px;height:9px');
  });

  it('Profil ohne Einsätze und Jahre: „Neu bei uns", keine erfundenen Zahlen, Initialen statt Foto', () => {
    const h = next.mProfil({ name: 'Ewa Nowak' }, 'https://p');
    const t = text(h);
    expect(t).toContain('Neu bei uns erster Einsatz bei uns');
    expect(t).not.toMatch(/Berufserfahrung|Einsätze|undefined|NaN|null/);
    expect(h).toContain('>EN<');
  });

  it('Bewerbungskarte: Kopfleiste „Neue Bewerbung" außerhalb des Profils, Angebot darunter', () => {
    const t = text(next.mBewerbungsKarte(PK, { tagessatz: 102, zeitraum: '15.10.2026 – 10.12.2026', reisekosten: 125 }, 'https://p', null));
    expect(t.indexOf('Neue Bewerbung')).toBeLessThan(t.indexOf('Maria K.'));
    expect(t.indexOf('Profil ansehen')).toBeLessThan(t.indexOf('Tagessatz'));
    expect(t).toContain('102 € / Tag');
    expect(t.indexOf('Tagessatz')).toBeLessThan(t.indexOf('Angebot prüfen'));
  });

  it('Bewerbungskarte lässt fehlende Konditionen weg statt „undefined"', () => {
    const h = next.mBewerbungsKarte(PK, { tagessatz: null, zeitraum: null, reisekosten: null }, 'https://p', null);
    expect(h).not.toMatch(/undefined|NaN|null/);
    expect(text(h)).toContain('Angebot prüfen');
    expect(text(h)).not.toContain('Tagessatz');
  });
});
