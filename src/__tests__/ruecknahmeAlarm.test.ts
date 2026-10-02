import { describe, it, expect } from 'vitest';
// Cross-App-Import (reines Modul, Muster wie portalMailLog.test.ts): Mail-Text und
// Auth des Team-Alarms „Bewerbung nach Unterschrift still zurückgezogen"
// (Registry #110) leben im Kostenrechner (project 3/lib/ruecknahme-alarm.ts).
import {
  berlinZeit,
  buildRuecknahmeAlarm,
  istServiceRoleAnfrage,
  ruecknahmeInfo,
} from '../../project 3/lib/ruecknahme-alarm';

const LEAD = { id: 'lead-h', vorname: 'Christel', nachname: 'Muster', email: 'kunde@example.de', telefon: '0176' };
const INFO = ruecknahmeInfo({
  application_id: 13824,
  caregiver_id: 16414,
  confirmation_id: 5122,
  accepted_at: '2026-09-28 09:33:26.889048+00',
  confirmation_created_at: '2026-09-28T09:33:33.000Z',
  rejected_at: '2026-09-28T09:34:01.000Z',
  von: 'Rekruterin A.',
  reject_type: 'caregiverAgency',
  reject_message: 'Die PK hat abgesagt.',
})!;

describe('istServiceRoleAnfrage', () => {
  it('ohne konfigurierten Key ⇒ fehlt (lieber zu als offen)', () => {
    expect(istServiceRoleAnfrage('Bearer srv', undefined)).toBe('fehlt');
    expect(istServiceRoleAnfrage('Bearer srv', '')).toBe('fehlt');
  });
  it('leer, andere Länge oder falscher Key ⇒ nein', () => {
    expect(istServiceRoleAnfrage(null, 'srv-key')).toBe('nein');
    expect(istServiceRoleAnfrage('Bearer kurz', 'srv-key')).toBe('nein');
    expect(istServiceRoleAnfrage('Bearer srv-kex', 'srv-key')).toBe('nein');
  });
  it('richtiger Key mit Bearer (Groß/klein egal) ⇒ ok', () => {
    expect(istServiceRoleAnfrage('Bearer srv-key', 'srv-key')).toBe('ok');
    expect(istServiceRoleAnfrage('bearer srv-key', 'srv-key')).toBe('ok');
  });
});

describe('ruecknahmeInfo', () => {
  it('ohne application_id ⇒ null', () => {
    expect(ruecknahmeInfo({ confirmation_id: 1 })).toBeNull();
  });
  it('Zahlen werden zu Strings, Leeres zu null', () => {
    expect(INFO.application_id).toBe('13824');
    expect(INFO.confirmation_id).toBe('5122');
    expect(ruecknahmeInfo({ application_id: 1, von: '  ' })!.von).toBeNull();
  });
});

describe('buildRuecknahmeAlarm', () => {
  it('Betreff nennt Kunde und Bewerbung', () => {
    const t = buildRuecknahmeAlarm(LEAD, INFO);
    expect(t.subject).toBe('🚨 ALARM: Bewerbung nach Unterschrift zurückgezogen — Christel Muster (Bewerbung 13824)');
  });
  it('Zeiten in Europe/Berlin aus den UTC-Feldern', () => {
    expect(berlinZeit('2026-09-28T09:34:01.000Z')).toBe('28.09.2026, 11:34');
    expect(berlinZeit(null)).toBe('—');
    const t = buildRuecknahmeAlarm(LEAD, INFO);
    expect(t.text).toContain('Bewerbung abgelehnt: 28.09.2026, 11:34');
    expect(t.text).toContain('Unterschrift: 28.09.2026, 11:33');
  });
  it('Lage: Buchung steht, Bewerbung weg, wer hat abgelehnt', () => {
    const t = buildRuecknahmeAlarm(LEAD, INFO);
    expect(t.text).toContain('von der Pflegeagentur (Rekruterin A.)');
    expect(t.text).toContain('Buchung selbst aber NICHT storniert');
    expect(t.text).toContain('Kunden sofort informieren');
  });
  it('reject_type null ⇒ „automatisch von Mamamia", nicht „Agentur"', () => {
    const t = buildRuecknahmeAlarm(LEAD, { ...INFO, reject_type: null, von: null });
    expect(t.text).toContain('automatisch von Mamamia (System)');
    expect(t.text).not.toContain('Pflegeagentur');
  });
  it('Freitext aus Mamamia wird im HTML escaped', () => {
    const t = buildRuecknahmeAlarm(LEAD, { ...INFO, reject_message: '<script>x</script>', von: 'A & "B"' });
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(t.html).toContain('A &amp; &quot;B&quot;');
  });
});
