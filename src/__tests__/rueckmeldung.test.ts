import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANLAESSE,
  anlassAus,
  istOffen,
  KNOEPFE,
  knopfAus,
  PORTAL_ORIGINS,
  portalCors,
  portalDarf,
  PREIS_ANLAESSE,
  quelleAus,
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

  it('Rückruf aus der Abschiedsmail: Wortlaut wie bisher (ohne herkunft)', () => {
    const m = teamMail({ ...basis, aktion: 'rueckruf', knopf: 'interesse' });
    expect(m.subject).toBe('📞 Rückruf erbeten: Erika <b>Muster</b>');
    expect(m.text).toContain('(Knopf „Ja, ich habe noch Interesse“ in der letzten Nachfass-Mail). Die Seite sagt dem Kunden: „Marta ruft Sie an.“');
    expect(teamMail({ ...basis, aktion: 'rueckruf', herkunft: 'nachfass_3' }).subject).toBe('📞 Rückruf erbeten: Erika <b>Muster</b>');
  });

  it('Rückruf aus dem Kundenportal (Registry #147): eigener Betreff, Knopf und Satz des Portals, nicht „Nachfass-Mail“', () => {
    const m = teamMail({ ...basis, aktion: 'rueckruf', knopf: null, herkunft: 'portal_einstieg' });
    expect(m.subject).toBe('📞 Rückruf erbeten (Kundenportal): Erika <b>Muster</b>');
    expect(m.text).toContain('„Rückruf vereinbaren“ im Kundenportal');
    expect(m.text).toContain('„Danke, Marta ruft Sie an.“');
    expect(m.text).not.toContain('Nachfass-Mail');
    expect(m.text).not.toContain('Keine Telefonnummer');
    expect(m.text).toContain('Telefon: 0170 1234567');
    expect(m.html).not.toContain('<b>Muster</b>');
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
    const kette = mail('kette.ts');
    for (const [knopf, label] of Object.entries(KNOEPFE)) expect(kette).toContain(`"${knopf}": "${label}"`);
    expect(mail('kundenMails.ts')).toContain('RUECKMELDUNG_KNOEPFE');
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

describe('Quelle, CORS und Erlaubnis fürs Kundenportal (Registry #147)', () => {
  it('quelleAus: nur nachfass_3 und portal_einstieg', () => {
    expect(quelleAus('nachfass_3')).toBe('nachfass_3');
    expect(quelleAus('portal_einstieg')).toBe('portal_einstieg');
    for (const w of ['', 'toString', '__proto__', 'constructor', 'PORTAL_EINSTIEG', null, undefined, 3]) expect(quelleAus(w)).toBeNull();
  });

  it('portalCors: Origin-Echo nur für die vier Portal-Hosts, nie *, nie Credentials, immer Vary', () => {
    expect(PORTAL_ORIGINS).toEqual([
      'https://kundenportal.primundus.de',
      'https://caapp-beta.onrender.com',
      'https://caapp-staging.onrender.com',
      'http://localhost:5173',
    ]);
    for (const o of PORTAL_ORIGINS) {
      const h = portalCors(o);
      expect(h['Access-Control-Allow-Origin']).toBe(o);
      expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
      expect(h['Access-Control-Allow-Headers']).toBe('Content-Type');
      expect(h.Vary).toBe('Origin');
    }
    for (const o of ['https://primundus.de', 'https://evil.test', 'https://kundenportal.primundus.de.evil.test', 'null', null, undefined]) {
      const h = portalCors(o);
      expect(h['Access-Control-Allow-Origin']).toBeUndefined();
      expect(h.Vary).toBe('Origin');
    }
    const alle = JSON.stringify(PORTAL_ORIGINS.map(portalCors));
    expect(alle).not.toContain('"*"');
    expect(alle).not.toContain('Credentials');
  });

  it('portalDarf: aus dem Portal nur Rückruf mit portal_einstieg; portal_einstieg nur mit Rückruf; die Seite wie bisher', () => {
    const portal = 'https://kundenportal.primundus.de';
    expect(portalDarf(portal, 'rueckruf', 'portal_einstieg')).toBe(true);
    for (const a of ['stoppen', 'pausieren', 'grund']) {
      expect(portalDarf(portal, a, 'portal_einstieg')).toBe(false);
      expect(portalDarf(portal, a, 'nachfass_3')).toBe(false);
      expect(portalDarf('https://kostenrechner.primundus.de', a, 'portal_einstieg')).toBe(false);
      expect(portalDarf('https://kostenrechner.primundus.de', a, 'nachfass_3')).toBe(true);
    }
    expect(portalDarf(portal, 'rueckruf', 'nachfass_3')).toBe(false);
    expect(portalDarf(null, 'rueckruf', 'nachfass_3')).toBe(true);
    expect(portalDarf(null, 'rueckruf', 'portal_einstieg')).toBe(true);
  });
});
