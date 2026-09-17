import { describe, expect, it } from 'vitest';
import {
  bestaetigungsMail,
  ergebnisSeite,
  hinweisSeite,
  moderationsSeite,
  teamMail,
} from '../../project 3/lib/bewertungen-mails';

// Mails und kleine HTML-Seiten der Bewertungen. Geprüft wird, was schiefgehen
// darf nicht: Anrede ohne Vorname, Links drin, Nutzertext escaped, keine
// Gedankenstriche im Kundentext, GET-Seite ändert nichts (nur ein POST-Formular).

const BEWERTUNG = {
  sterne: 4,
  text: 'Die Pflegekraft <b>Ewa</b> kam pünktlich & spricht gut Deutsch.\nDanke!',
  name: 'Renate "M."',
  ort: 'Augsburg',
  email: 'renate@example.de',
  erstellt_am: '2026-09-17T07:15:00Z',
};

describe('Bestätigungsmail an die Person, die bewertet hat', () => {
  const link = 'https://kostenrechner.primundus.de/api/bewertungen/bestaetigen?t=abc_DEF-123';
  const mail = bestaetigungsMail({ ...BEWERTUNG, link, basis: 'https://kostenrechner.primundus.de' });

  it('Betreff', () => {
    expect(mail.subject).toBe('Bitte bestätigen Sie Ihre Bewertung');
  });

  it('Anrede "Guten Tag," ohne Namen', () => {
    expect(mail.html).toContain('Guten Tag,');
    expect(mail.text.startsWith('Guten Tag,')).toBe(true);
    expect(mail.text).not.toMatch(/Guten Tag,? Renate/);
  });

  it('Sterne, Text (escaped) und Knopf mit Link', () => {
    expect(mail.html).toContain('★★★★☆');
    expect(mail.html).toContain('&lt;b&gt;Ewa&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Ewa</b>');
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain('Bewertung bestätigen');
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('★★★★☆');
  });

  it('Pflichtsätze', () => {
    for (const satz of [
      'Danach prüfen wir die Bewertung und veröffentlichen sie auf primundus.de/erfahrungen.',
      'Wir veröffentlichen positive und kritische Bewertungen.',
      'Der Link gilt 7 Tage.',
      'Haben Sie keine Bewertung geschrieben? Dann ignorieren Sie diese E-Mail.',
    ]) {
      expect(mail.text).toContain(satz);
      expect(mail.html.replace(/\s+/g, ' ')).toContain(satz);
    }
  });

  it('Fußzeile nennt den richtigen Grund, nicht die Kalkulation', () => {
    expect(mail.html).not.toContain('Kalkulation auf primundus.de angefordert');
    expect(mail.html).toContain('renate@example.de');
    expect(mail.html).not.toContain('{{EMAIL}}');
  });

  it('keine Gedankenstriche im Kundentext', () => {
    expect(mail.text).not.toMatch(/[—–]/);
    // Kommentare im gemeinsamen Layout (CSS/HTML) sieht niemand.
    const sichtbar = mail.html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sichtbar).not.toMatch(/[—–]|&mdash;|&ndash;/);
  });
});

describe('Team-Mail zur Freigabe', () => {
  const links = {
    freigeben: 'https://k.example/api/bewertungen/moderation?t=T&aktion=freigeben',
    freigeben_kunde: 'https://k.example/api/bewertungen/moderation?t=T&aktion=freigeben_kunde',
    ablehnen: 'https://k.example/api/bewertungen/moderation?t=T&aktion=ablehnen',
  };

  it('Betreff mit Sternen und Name', () => {
    const m = teamMail({ bewertung: BEWERTUNG, lead: null, links });
    expect(m.subject).toBe('Neue Bewertung zur Freigabe: ★★★★☆ von Renate "M."');
  });

  it('Betreff ohne Zeilenumbrüche, auch wenn der Name welche hätte', () => {
    const m = teamMail({ bewertung: { ...BEWERTUNG, name: 'A\r\nBcc: x@y.de' }, lead: null, links });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it('alle Angaben und die drei Links', () => {
    const m = teamMail({ bewertung: BEWERTUNG, lead: null, links });
    for (const teil of ['Augsburg', 'renate@example.de', '17.09.2026, 09:15 Uhr', '&lt;b&gt;Ewa&lt;/b&gt;']) {
      expect(m.html).toContain(teil);
    }
    expect(m.html).toContain(`href="${links.freigeben.replace(/&/g, '&amp;')}"`);
    expect(m.html).toContain(`href="${links.freigeben_kunde.replace(/&/g, '&amp;')}"`);
    expect(m.html).toContain(`href="${links.ablehnen.replace(/&/g, '&amp;')}"`);
    expect(m.html).toContain('Freigeben, als bestätigter Kunde markieren');
    expect(m.text).toContain(links.freigeben_kunde);
    expect(m.text).toContain('Kein Lead mit dieser E-Mail-Adresse gefunden');
  });

  it('passender Lead mit Name, Datum, Status und Admin-Link', () => {
    const m = teamMail({
      bewertung: BEWERTUNG,
      lead: { name: 'Renate Meier', erstellt_am: '2026-07-01T10:00:00Z', status: 'angebot_requested', adminUrl: 'https://k.example/admin/leads/abc' },
      links,
    });
    expect(m.html).toContain('Renate Meier');
    expect(m.html).toContain('01.07.2026');
    expect(m.html).toContain('angebot_requested');
    expect(m.html).toContain('href="https://k.example/admin/leads/abc"');
    expect(m.text).toContain('https://k.example/admin/leads/abc');
    expect(m.text).not.toContain('Kein Lead');
  });

  it('Lead-Suche fehlgeschlagen: sagt das, statt "kein Lead" zu behaupten', () => {
    const m = teamMail({ bewertung: BEWERTUNG, lead: 'fehler', links });
    expect(m.text).toContain('Lead-Suche ist fehlgeschlagen');
    expect(m.text).not.toContain('Kein Lead');
  });
});

describe('Moderationsseite (GET, ändert nichts)', () => {
  const basis = { bewertung: BEWERTUNG, token: 'TOKEN_abc-1', kundeBestaetigt: false, status: 'bestaetigt' as const };

  it.each([
    ['freigeben', 'Jetzt freigeben'],
    ['freigeben_kunde', 'Freigeben als bestätigter Kunde'],
    ['ablehnen', 'Ablehnen'],
  ] as const)('%s: genau ein POST-Formular mit Knopf "%s"', (aktion, knopf) => {
    const html = moderationsSeite({ ...basis, aktion, plan: { art: 'aendern' } });
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toMatch(/<form[^>]*method="post"/i);
    expect(html).toContain('action="/api/bewertungen/moderation"');
    expect(html).toContain('name="t" value="TOKEN_abc-1"');
    expect(html).toContain(`name="aktion" value="${aktion}"`);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(`>${knopf}</button>`);
  });

  it('eigenständig: keine externen Ressourcen, noindex, kein Referrer', () => {
    const html = moderationsSeite({ ...basis, aktion: 'freigeben', plan: { art: 'aendern' } });
    expect(html).not.toMatch(/<link|<script|src="http/);
    expect(html).toContain('noindex');
    expect(html).toContain('no-referrer');
    expect(html).toContain('&lt;b&gt;Ewa&lt;/b&gt;');
  });

  it('ohne E-Mail (eingetragene Bewertung): kein "null" auf der Seite', () => {
    const html = moderationsSeite({ ...basis, bewertung: { ...BEWERTUNG, email: null }, aktion: 'freigeben', plan: { art: 'aendern' } });
    expect(html).not.toContain('null');
  });

  it('schon erledigt oder nicht möglich: kein Knopf, sondern Hinweis', () => {
    const erledigt = moderationsSeite({ ...basis, status: 'veroeffentlicht', aktion: 'freigeben', plan: { art: 'erledigt' } });
    expect(erledigt).not.toContain('<form');
    const nicht = moderationsSeite({ ...basis, status: 'abgelehnt', aktion: 'freigeben', plan: { art: 'nicht_moeglich', grund: 'Die Bewertung wurde bereits abgelehnt.' } });
    expect(nicht).not.toContain('<form');
    expect(nicht).toContain('Die Bewertung wurde bereits abgelehnt.');
  });
});

describe('Ergebnis- und Hinweisseiten', () => {
  it('veröffentlicht mit Link', () => {
    const html = ergebnisSeite('freigeben');
    expect(html).toContain('Bewertung veröffentlicht. Sie erscheint innerhalb von etwa 5 Minuten auf primundus.de/erfahrungen.');
    expect(html).toContain('href="https://primundus.de/erfahrungen"');
  });
  it('als Kunde veröffentlicht', () => {
    expect(ergebnisSeite('freigeben_kunde')).toContain('Bewertung veröffentlicht.');
    expect(ergebnisSeite('freigeben_kunde')).toContain('bestätigter Kunde');
  });
  it('abgelehnt', () => {
    expect(ergebnisSeite('ablehnen')).toContain('Bewertung abgelehnt.');
  });
  it('Hinweisseite escaped', () => {
    const html = hinweisSeite('Link ungültig', 'Der <Link> ist abgelaufen.');
    expect(html).toContain('Der &lt;Link&gt; ist abgelaufen.');
    expect(html).toContain('<title>Link ungültig</title>');
  });
});
