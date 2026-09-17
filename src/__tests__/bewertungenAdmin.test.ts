import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_AKTIONEN,
  ADMIN_SPALTEN,
  adminAktionAus,
  adminPlan,
  anzeigeDatum,
  antwortUpdate,
  HERKUNFT_LABEL,
  moeglicheAktionen,
  pruefeManuell,
  STATUS_LABEL,
} from '../../project 3/lib/bewertungen-admin';
import { STATUS, type BewertungStatus } from '../../project 3/lib/bewertungen-basis';

// Admin → Bewertungen (Martin, 17.09.2026): Liste mit Filter, Aktionen je
// Bewertung (auch Zurückziehen und Antwort), und Eintragen von Bewertungen,
// die per Mail, Telefon, Brief oder bei Google kamen.

const JETZT = new Date(Date.UTC(2026, 8, 17, 10, 0, 0)); // 17.09.2026 12:00 Berlin
const ISO = JETZT.toISOString();

describe('Beschriftungen', () => {
  it('jeder Status und jede Herkunft hat ein Wort', () => {
    for (const s of STATUS) expect(STATUS_LABEL[s]).toBeTruthy();
    expect(STATUS_LABEL.bestaetigt).toBe('Wartet auf Freigabe');
    expect(HERKUNFT_LABEL).toEqual({
      formular: 'Formular auf primundus.de',
      team: 'Direkt an Primundus (Mail, Telefon, Brief)',
      google: 'Google',
    });
  });
  it('Aktionen nur aus fester Liste', () => {
    expect(Object.keys(ADMIN_AKTIONEN).sort()).toEqual(['ablehnen', 'freigeben', 'freigeben_kunde', 'zurueckziehen']);
    expect(adminAktionAus('zurueckziehen')).toBe('zurueckziehen');
    for (const a of ['antwort', '', 'toString', '__proto__', null]) expect(adminAktionAus(a)).toBeNull();
  });
  it('Admin-Spalten enthalten E-Mail und Herkunft, aber keine Tokens oder IP', () => {
    const spalten = ADMIN_SPALTEN.split(',').map((s) => s.trim());
    for (const s of ['email', 'herkunft', 'datum', 'lead_id', 'antwort', 'status']) expect(spalten).toContain(s);
    for (const s of ['ip_hash', 'bestaetigen_token_hash', 'moderation_token_hash']) expect(spalten).not.toContain(s);
  });
});

describe('Aktionen im Admin', () => {
  const plan = (status: BewertungStatus, aktion: Parameters<typeof adminPlan>[1], kunde = false) =>
    adminPlan({ status, kunde_bestaetigt: kunde }, aktion, ISO);

  it('Freigeben wie aus der Mail (setzt auch datum)', () => {
    expect(plan('bestaetigt', 'freigeben')).toEqual({
      art: 'aendern',
      vonStatus: 'bestaetigt',
      update: { status: 'veroeffentlicht', veroeffentlicht_am: ISO, datum: '2026-09-17' },
    });
    expect(plan('bestaetigt', 'freigeben_kunde')).toMatchObject({ art: 'aendern', update: { kunde_bestaetigt: true } });
  });

  it('Zurückziehen: veröffentlicht → abgelehnt mit abgelehnt_am', () => {
    expect(plan('veroeffentlicht', 'zurueckziehen', true)).toEqual({
      art: 'aendern',
      vonStatus: 'veroeffentlicht',
      update: { status: 'abgelehnt', abgelehnt_am: ISO },
    });
    expect(plan('abgelehnt', 'zurueckziehen').art).toBe('erledigt');
    expect(plan('bestaetigt', 'zurueckziehen').art).toBe('nicht_moeglich');
    expect(plan('unbestaetigt', 'zurueckziehen').art).toBe('nicht_moeglich');
  });

  it('Ablehnen geht im Admin auch vor der E-Mail-Bestätigung (Spam aufräumen)', () => {
    expect(plan('unbestaetigt', 'ablehnen')).toEqual({
      art: 'aendern',
      vonStatus: 'unbestaetigt',
      update: { status: 'abgelehnt', abgelehnt_am: ISO },
    });
  });

  it('Freigeben ohne E-Mail-Bestätigung geht nicht', () => {
    expect(plan('unbestaetigt', 'freigeben').art).toBe('nicht_moeglich');
    expect(plan('unbestaetigt', 'freigeben_kunde').art).toBe('nicht_moeglich');
  });

  it('veröffentlicht ablehnen verweist auf Zurückziehen', () => {
    const p = plan('veroeffentlicht', 'ablehnen');
    expect(p.art).toBe('nicht_moeglich');
    if (p.art === 'nicht_moeglich') expect(p.grund).toContain('Zurückziehen');
  });

  it('Knöpfe je Stand = genau die Aktionen, die etwas ändern', () => {
    expect(moeglicheAktionen('unbestaetigt', false)).toEqual(['ablehnen']);
    expect(moeglicheAktionen('bestaetigt', false)).toEqual(['freigeben', 'freigeben_kunde', 'ablehnen']);
    expect(moeglicheAktionen('veroeffentlicht', false)).toEqual(['freigeben_kunde', 'zurueckziehen']);
    expect(moeglicheAktionen('veroeffentlicht', true)).toEqual(['zurueckziehen']);
    expect(moeglicheAktionen('abgelehnt', false)).toEqual([]);
    for (const s of STATUS) {
      for (const k of [false, true]) {
        for (const a of moeglicheAktionen(s, k)) expect(adminPlan({ status: s, kunde_bestaetigt: k }, a, ISO).art).toBe('aendern');
      }
    }
  });
});

describe('Antwort von Primundus', () => {
  it('speichert getrimmt mit Zeitpunkt', () => {
    expect(antwortUpdate('  Danke für Ihre Worte!\r\n\r\n\r\nIhr Team  ', ISO)).toEqual({
      ok: true,
      update: { antwort: 'Danke für Ihre Worte!\n\nIhr Team', antwort_am: ISO },
    });
  });
  it('leer entfernt die Antwort', () => {
    for (const w of ['', '   ', null]) {
      expect(antwortUpdate(w, ISO)).toEqual({ ok: true, update: { antwort: null, antwort_am: null } });
    }
  });
  it('zu lang oder falscher Typ', () => {
    expect(antwortUpdate('x'.repeat(2001), ISO).ok).toBe(false);
    expect(antwortUpdate(42, ISO).ok).toBe(false);
  });
});

describe('Bewertung eintragen (Mail, Telefon, Brief, Google)', () => {
  const gueltig = (o: Record<string, unknown> = {}) => ({
    sterne: 5,
    text: 'Top Betreuung!',
    name: '  Hans   W. ',
    ort: ' München ',
    datum: '2026-03-02',
    herkunft: 'google',
    kunde_bestaetigt: true,
    ...o,
  });

  it('gültig ⇒ Zeile sofort veröffentlicht, ohne E-Mail, ohne Tokens', () => {
    const r = pruefeManuell(gueltig(), JETZT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.zeile).toEqual({
      sterne: 5,
      text: 'Top Betreuung!',
      name: 'Hans W.',
      ort: 'München',
      email: null,
      datum: '2026-03-02',
      herkunft: 'google',
      kunde_bestaetigt: true,
      status: 'veroeffentlicht',
      veroeffentlicht_am: ISO,
      quelle: 'admin/bewertungen',
    });
  });

  it('kurzer Text ist erlaubt (Google-Bewertungen sind oft kurz), leerer nicht', () => {
    expect(pruefeManuell(gueltig({ text: 'Gut' }), JETZT).ok).toBe(true);
    const leer = pruefeManuell(gueltig({ text: '   ' }), JETZT);
    expect(leer.ok).toBe(false);
    if (!leer.ok) expect(leer.fehler.text).toBeTruthy();
    expect(pruefeManuell(gueltig({ text: 'x'.repeat(2001) }), JETZT).ok).toBe(false);
  });

  it('Pflichtfelder und Grenzen', () => {
    const r = pruefeManuell({ sterne: 0, text: '', name: 'H', ort: 'x'.repeat(61), datum: '', herkunft: 'formular' }, JETZT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fehler).sort()).toEqual(['datum', 'herkunft', 'name', 'ort', 'sterne', 'text']);
  });

  it('Datum: echtes Kalenderdatum, nicht in der Zukunft (Berlin), heute erlaubt', () => {
    expect(pruefeManuell(gueltig({ datum: '2026-09-17' }), JETZT).ok).toBe(true);
    for (const d of ['2026-09-18', '2026-02-30', '17.09.2026', '2026-9-1', 42]) {
      const r = pruefeManuell(gueltig({ datum: d }), JETZT);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.datum).toBeTruthy();
    }
  });

  it('Kunde bestätigt ist optional, Ort auch', () => {
    const r = pruefeManuell(gueltig({ kunde_bestaetigt: undefined, ort: '' , herkunft: 'team' }), JETZT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.zeile.kunde_bestaetigt).toBe(false);
      expect(r.zeile.ort).toBeNull();
      expect(r.zeile.herkunft).toBe('team');
    }
  });

  it('kein Objekt', () => {
    expect(pruefeManuell(null, JETZT).ok).toBe(false);
  });
});

describe('Anzeige-Datum', () => {
  it('datum, sonst veroeffentlicht_am, sonst erstellt_am (Berlin)', () => {
    expect(anzeigeDatum({ datum: '2024-05-06', veroeffentlicht_am: '2026-09-02T22:30:00Z', erstellt_am: '2026-09-01T08:00:00Z' })).toBe('2024-05-06');
    expect(anzeigeDatum({ datum: null, veroeffentlicht_am: '2026-09-02T22:30:00Z', erstellt_am: '2026-09-01T08:00:00Z' })).toBe('2026-09-03');
    expect(anzeigeDatum({ datum: null, veroeffentlicht_am: null, erstellt_am: '2026-09-01T08:00:00Z' })).toBe('2026-09-01');
  });
});

describe('Admin-Seite bleibt ohne Node-Krypto im Browser-Bundle', () => {
  it('bewertungen-admin und -basis importieren weder crypto noch lib/bewertungen', () => {
    for (const datei of ['bewertungen-admin.ts', 'bewertungen-basis.ts']) {
      const quelle = readFileSync(join(__dirname, '..', '..', 'project 3', 'lib', datei), 'utf8');
      expect(quelle).not.toMatch(/from ['"](node:)?crypto['"]/);
      expect(quelle).not.toMatch(/from ['"]\.\/bewertungen['"]/);
    }
  });
});
