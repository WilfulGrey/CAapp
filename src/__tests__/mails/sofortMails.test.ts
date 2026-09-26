import { describe, it, expect, vi } from 'vitest';

// lib/email.ts zieht über lead-management einen Supabase-Client beim Import (nur Attrappe).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://attrappe.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'attrappe';
});
import {
  getPatientDataSavedEmailTemplate,
  getCaregiverInterestEmailTemplate,
  getApplicationReceivedEmailTemplate,
  getBookingConfirmedEmailTemplate,
  getTokenRegenerationEmailTemplate,
} from '../../../project 3/lib/email';

// Sofort-Mails des Kostenrechners nach der Vorschau v2 (Martin 26.09.2026): Mail D „Ihre
// Suche läuft", A „interessiert sich", B „Neue Bewerbung", C „Buchung bestätigt",
// Zugangslink. Rauchtests: Anrede ohne Vorname, Knopf + Ziel, keine Platzhalter, kein altes
// Vokabular, klein genug für Gmail (102 KB).

const PORTAL = 'https://kundenportal.primundus.de/?token=tok&job=u1';
const lead = { id: 'l1', email: 'k@example.com', vorname: 'Anna', nachname: 'Müller', anrede_text: 'Frau', token: 'tok' } as any;
// Vorname unbekannt (nicht in der Namensliste), keine Anrede → nur „Guten Tag", nie der Vorname.
const ohneAnrede = { ...lead, anrede_text: null, vorname: 'Zorbex', nachname: 'Kowalski' };
const B = { schnitt: '4,9', anzahl: 126 };
const cg = { name: 'Maria K.', age: 62, germanLevel: 'Gut', yearsExperience: 6, einsatzCount: 14, photoUrl: 'cid:x@p', aboutText: 'Maria ist ruhig & einfühlsam.' };
const offer = { salary: 3050, arrivalAt: '2026-10-15', departureAt: '2026-12-10', arrivalFee: 125, departureFee: 125 };
const sichtbar = (h: string) => h.replace(/<(style|head)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<div style="display:none[^>]*>[^<]*<\/div>/, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

function pruefe(name: string, t: { subject: string; html: string; text: string }, knopf: string, link: string) {
  expect(t.html, name).toContain('Guten Tag Frau Müller,');
  expect(t.text, name).toContain('Guten Tag Frau Müller,');
  expect(t.html, `${name}: Knopf`).toContain(`>${knopf}</a>`);
  expect(t.html, `${name}: Link`).toContain(link);
  expect(t.text, `${name}: Link im Text`).toContain(link);
  for (const f of [t.html, t.text, t.subject]) expect(f, name).not.toMatch(/undefined|NaN|\[object Object\]/);
  const s = sichtbar(t.html);
  for (const w of ['Kostenrechner', 'Betreuungskräfte', '4–7', 'in Ruhe', 'Keine Vertragsbindung', 'Hallo ', 'vervollständig', 'Bewerbungen anfragen']) {
    expect(s.includes(w) || t.text.includes(w), `${name}: „${w}"`).toBe(false);
  }
  expect(t.html.length, name).toBeLessThan(90_000);
}

describe('Sofort-Mails (Vorschau v2)', () => {
  it('D: Ihre Suche läuft', () => {
    const t = getPatientDataSavedEmailTemplate(lead, PORTAL, B);
    pruefe('D', t, 'Stand Ihrer Suche ansehen', PORTAL);
    expect(t.subject).toBe('Ihre Suche läuft – das passiert jetzt');
    for (const s of ['Ihre Suche läuft', 'Stand heute', 'Pflegesituation beschrieben', '72 Stunden für Sie reserviert', 'ab 3 Tagen nach Ihrer Zusage', 'Mein Tipp:']) {
      expect(sichtbar(t.html)).toContain(s);
    }
  });

  it('A: interessiert sich — einladen, Über-Text escaped', () => {
    const t = getCaregiverInterestEmailTemplate(lead, cg, PORTAL, B);
    pruefe('A', t, 'Maria zur Bewerbung einladen', PORTAL);
    expect(t.subject).toBe('Maria interessiert sich für Ihre Anfrage');
    expect(t.html).toContain(`${PORTAL}&amp;goto=matches`.replace('&amp;', '&'));
    expect(t.html).toContain('ruhig &amp; einfühlsam');
    expect(sichtbar(t.html)).toContain('Sie können natürlich auch weitere Pflegekräfte einladen');
    // ohne Über-Text kein leerer Abschnitt
    expect(getCaregiverInterestEmailTemplate(lead, { ...cg, aboutText: undefined }, PORTAL, B).html).not.toContain('Über Maria');
  });

  it('B: Neue Bewerbung — Karte, Angebot prüfen, Punkte, Konditionen', () => {
    const t = getApplicationReceivedEmailTemplate(lead, cg, PORTAL, offer, B);
    pruefe('B', t, 'Angebot prüfen', `${PORTAL}&view=application`);
    expect(t.subject).toBe('Neue Bewerbung von Maria – 72 Stunden für Sie reserviert');
    const s = sichtbar(t.html);
    for (const x of ['Sie haben eine aktive Bewerbung', '72 Stunden für Sie reserviert', '102 € / Tag', '15.10.2026 – 10.12.2026', 'Reisekosten à 125 €',
      'Keine Vermittlungsgebühr', 'Kein Vertrag vor Ihrer Auswahl', 'Täglich kündbar, taggenau abgerechnet', 'Bestpreisgarantie', '4,9 von 5', '3.050 €', 'doppelter Tagessatz']) {
      expect(s, x).toContain(x);
    }
    expect(t.html).toContain('Anreise ab 15. Oktober, 3.050 € im Monat.');
    // ohne Konditionen: Mail steht trotzdem, ohne Zahlen
    const leer = getApplicationReceivedEmailTemplate(lead, cg, PORTAL, undefined, B);
    pruefe('B leer', leer, 'Angebot prüfen', 'view=application');
    expect(sichtbar(leer.html)).not.toContain('€ / Tag');
  });

  it('C: Buchung bestätigt — „im Anhang" nur mit Vertrag', () => {
    const mit = getBookingConfirmedEmailTemplate(lead, cg, PORTAL, B, true);
    pruefe('C', mit, 'Nächste Schritte ansehen', PORTAL);
    expect(mit.subject).toBe('Buchung bestätigt – so geht es jetzt weiter');
    expect(sichtbar(mit.html)).toContain('Ihren Vertrag finden Sie im Anhang.');
    const ohne = getBookingConfirmedEmailTemplate(lead, cg, PORTAL, B, false);
    expect(ohne.html + ohne.text).not.toContain('im Anhang');
    expect(sichtbar(mit.html)).not.toMatch(/unverbindlich/i);
  });

  it('Zugangslink: Pflegesituation statt Patientenangaben', () => {
    const t = getTokenRegenerationEmailTemplate(lead, PORTAL, B);
    expect(t.html).toContain('Angebot &amp; Stand ansehen →');
    expect(t.html).not.toContain('Patientenangaben');
  });

  it('Anrede nie mit Vornamen', () => {
    const t = getPatientDataSavedEmailTemplate(ohneAnrede, PORTAL, B);
    expect(t.html).toContain('Guten Tag,');
    expect(t.html).not.toContain('Guten Tag Zorbex');
  });
});
