import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  darfStatusSetzen,
  grundAus,
  grundLabel,
  KEIN_INTERESSE_GRUENDE,
  teamMailKeinInteresse,
} from '../../project 3/lib/kein-interesse';

// Registry #72 (Martin 14.09.2026): „Aktuell nicht" / „Doch nicht relevant" in
// der Abschiedsmail stoppen nach einem Bestätigungsklick alle Mails.

describe('grundAus', () => {
  it('nimmt nur die zwei Gründe der Knöpfe', () => {
    expect(grundAus('aktuell-nicht')).toBe('aktuell-nicht');
    expect(grundAus('nicht-relevant')).toBe('nicht-relevant');
  });
  it('alles andere ist kein Grund, auch geerbte Objekt-Schlüssel', () => {
    for (const w of ['', 'toString', '__proto__', 'constructor', 'AKTUELL-NICHT', null, undefined, 3]) {
      expect(grundAus(w)).toBeNull();
    }
  });
});

describe('darfStatusSetzen', () => {
  it('offene Anfragen werden auf nicht interessiert gesetzt', () => {
    for (const s of ['angebot_requested', 'info_requested', 'manuell_pruefen']) expect(darfStatusSetzen(s)).toBe(true);
  });
  it('gebuchte Kunden, Folge-Einsätze und leere Status bleiben unangetastet', () => {
    for (const s of ['vertrag_abgeschlossen', 'betreuung_beauftragt', 'folge_einsatz', 'nicht_interessiert', '', null, undefined]) {
      expect(darfStatusSetzen(s)).toBe(false);
    }
  });
});

describe('teamMailKeinInteresse', () => {
  const basis = {
    kunde: 'Erika <b>Muster</b>',
    email: 'erika@example.de',
    telefon: '0170 1234567',
    quelle: 'rechner',
    leadId: 'l-1',
    grund: 'aktuell-nicht' as const,
    statusVorher: 'angebot_requested',
    statusGesetzt: true,
    mailsGestoppt: 3,
    adminUrl: 'https://kostenrechner.primundus.de/admin/leads/l-1',
  };

  it('nennt Kunde, Knopf, Folge und Admin-Link', () => {
    const m = teamMailKeinInteresse(basis);
    expect(m.subject).toContain('Aktuell nicht — vielleicht später');
    expect(m.text).toContain('3 geplante Mails sind gestoppt');
    expect(m.text).toContain(basis.adminUrl);
    expect(m.html).toContain(`href="${basis.adminUrl}"`);
  });

  it('escaped den Kundennamen im HTML (kommt aus dem Formular)', () => {
    const m = teamMailKeinInteresse(basis);
    expect(m.html).not.toContain('<b>Muster</b>');
    expect(m.html).toContain('&lt;b&gt;Muster&lt;/b&gt;');
  });

  it('sagt bei gebuchten Kunden, dass der Status NICHT geändert wurde', () => {
    const m = teamMailKeinInteresse({ ...basis, statusGesetzt: false, statusVorher: 'betreuung_beauftragt', mailsGestoppt: 0 });
    expect(m.text).toContain('NICHT geändert');
    expect(m.text).toContain('betreuung_beauftragt');
    expect(m.text).not.toContain('gestoppt');
  });

  it('ohne Grund steht „ohne Angabe"', () => {
    expect(grundLabel(null)).toBe('ohne Angabe');
    expect(teamMailKeinInteresse({ ...basis, grund: null }).subject).toContain('ohne Angabe');
  });
});

describe('Gleichlauf mit der Mail-Funktion', () => {
  const mail = (datei: string) =>
    readFileSync(resolve(__dirname, '../../project 3/supabase/functions/send-scheduled-emails', datei), 'utf8');

  it('die Knopf-Texte der Abschiedsmail sind genau die Labels der Seite', () => {
    const index = mail('index.ts');
    for (const label of Object.values(KEIN_INTERESSE_GRUENDE)) expect(index).toContain(`"${label}"`);
  });

  it('die Edge-Funktion kennt dieselben zwei Gründe', () => {
    const kette = mail('kette.ts');
    for (const grund of Object.keys(KEIN_INTERESSE_GRUENDE)) expect(kette).toContain(`"${grund}"`);
  });
});
