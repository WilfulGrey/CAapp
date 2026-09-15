import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANLAESSE,
  anlassAus,
  istOffen,
  KNOEPFE,
  knopfAus,
  PREIS_ANLAESSE,
  SPAETER_ANLAESSE,
  teamMail,
  WANN,
  wannAus,
  wiedervorlageTermin,
  type TeamInfo,
} from '../../project 3/lib/rueckmeldung';

// Registry #72 (Martin 14./15.09.2026): Die Knöpfe der Abschiedsmail führen auf
// /rueckmeldung — Termin statt Abschied, Grund + Angebot, Abmelden nur klein.

describe('Eingaben nur aus festen Listen', () => {
  it('Knöpfe, Gründe, Termine', () => {
    expect(knopfAus('interesse')).toBe('interesse');
    expect(anlassAus('zu-teuer')).toBe('zu-teuer');
    expect(wannAus('1m')).toBe('1m');
  });
  it('alles andere ist null, auch geerbte Objekt-Schlüssel', () => {
    for (const w of ['', 'toString', '__proto__', 'constructor', 'ZU-TEUER', null, undefined, 3]) {
      expect(knopfAus(w)).toBeNull();
      expect(anlassAus(w)).toBeNull();
      expect(wannAus(w)).toBeNull();
    }
  });
  it('Preis-Gründe zeigen die Bestpreisgarantie, Familie/Heim bieten 3 Monate an', () => {
    expect([...PREIS_ANLAESSE].sort()).toEqual(['anderer-anbieter', 'zu-teuer']);
    expect([...SPAETER_ANLAESSE].sort()).toEqual(['familie', 'pflegeheim']);
    expect(Object.keys(ANLAESSE)).toContain('nicht-mehr-noetig');
  });
});

describe('istOffen', () => {
  it('nur offene Anfragen werden pausiert oder abgemeldet', () => {
    for (const s of ['angebot_requested', 'info_requested', 'manuell_pruefen']) expect(istOffen(s)).toBe(true);
    for (const s of ['vertrag_abgeschlossen', 'betreuung_beauftragt', 'folge_einsatz', 'nicht_interessiert', '', null, undefined]) {
      expect(istOffen(s)).toBe(false);
    }
  });
});

describe('wiedervorlageTermin', () => {
  it('rechnet vom Berliner Kalendertag und landet um 08:00 UTC', () => {
    // 15.09. 23:30 Berlin = 21:30 UTC — der Berliner Tag zählt, nicht der UTC-Tag.
    const t = wiedervorlageTermin(new Date('2026-09-15T21:30:00Z'), '1m');
    expect(t.datum).toBe('2026-10-15');
    expect(t.iso).toBe('2026-10-15T08:00:00.000Z');
    expect(t.text).toBe('15. Oktober');
  });
  it('kurz nach Mitternacht Berlin gilt schon der neue Tag', () => {
    const t = wiedervorlageTermin(new Date('2026-09-15T22:30:00Z'), '2w'); // 16.09. 00:30 Berlin
    expect(t.datum).toBe('2026-09-30');
  });
  it('Monatswechsel und Jahreswechsel', () => {
    expect(wiedervorlageTermin(new Date('2026-11-20T10:00:00Z'), '3m').text).toBe('19. Februar');
    expect(WANN['3m'].tage).toBe(91);
  });
});

describe('teamMail', () => {
  const basis: TeamInfo = {
    aktion: 'stoppen',
    kunde: 'Erika <b>Muster</b>',
    email: 'erika@example.de',
    telefon: '0170 1234567',
    quelle: 'rechner',
    adminUrl: 'https://kostenrechner.primundus.de/admin/leads/l-1',
    knopf: 'nicht-relevant',
    anlass: 'zu-teuer',
    statusVorher: 'angebot_requested',
    offen: true,
    mailsGestoppt: 2,
  };

  it('Abmeldung nennt Grund, Folge und Admin-Link, escaped den Namen', () => {
    const m = teamMail(basis);
    expect(m.subject).toContain('Abgemeldet');
    expect(m.text).toContain('Grund: Es ist uns zu teuer.');
    expect(m.text).toContain('2 geplante Mails sind gestoppt');
    expect(m.html).toContain(`href="${basis.adminUrl}"`);
    expect(m.html).not.toContain('<b>Muster</b>');
  });

  it('Wiedervorlage nennt Termin und wie das Team sie abbricht', () => {
    const m = teamMail({ ...basis, aktion: 'pausieren', knopf: 'aktuell-nicht', anlass: null, wann: '1m', datumText: '15. Oktober' });
    expect(m.subject).toBe('Wiedervorlage: Erika <b>Muster</b> am 15. Oktober');
    expect(m.text).toContain('„In 1 Monat“');
    expect(m.text).toContain('„Nicht interessiert“ klicken');
  });

  it('Preis-Einwand fordert zum Anruf auf und sagt, dass noch nicht abgemeldet ist', () => {
    const m = teamMail({ ...basis, aktion: 'grund' });
    expect(m.subject).toContain('Preis-Einwand');
    expect(m.text).toContain('NICHT abgemeldet');
  });

  it('Rückruf ohne Telefonnummer bittet um Mail', () => {
    expect(teamMail({ ...basis, aktion: 'rueckruf', telefon: '' }).text).toContain('Keine Telefonnummer');
  });

  it('gebuchte Kunden: Status NICHT geändert', () => {
    const m = teamMail({ ...basis, offen: false, statusVorher: 'betreuung_beauftragt' });
    expect(m.text).toContain('NICHT geändert');
    expect(m.text).not.toContain('gestoppt');
  });
});

describe('Gleichlauf mit der Mail-Funktion', () => {
  const mail = (datei: string) =>
    readFileSync(resolve(__dirname, '../../project 3/supabase/functions/send-scheduled-emails', datei), 'utf8');

  it('die Knopf-Texte der Abschiedsmail sind genau die Labels der Seite', () => {
    const index = mail('index.ts');
    for (const label of Object.values(KNOEPFE)) expect(index).toContain(`"${label}"`);
  });

  it('die Edge-Funktion kennt dieselben drei Knöpfe und dieselben offenen Status', () => {
    const kette = mail('kette.ts');
    for (const knopf of Object.keys(KNOEPFE)) expect(kette).toContain(`"${knopf}"`);
    for (const s of ['angebot_requested', 'info_requested', 'manuell_pruefen']) expect(kette).toContain(`"${s}"`);
  });

  it('die Mail-Funktion kennt den neuen Mail-Typ der Route', () => {
    expect(mail('index.ts')).toContain('email_type === "wiedervorlage"');
    expect(readFileSync(resolve(__dirname, '../../project 3/app/api/rueckmeldung/route.ts'), 'utf8')).toContain("email_type: 'wiedervorlage'");
  });
});
