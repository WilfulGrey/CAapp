import { assert, assertEquals } from '@std/assert';
import {
  ABSCHIED_SATZ, ABSCHIED_VORGAENGER, abschiedNachholen, GESTRICHENE_MAILS, KETTE_NACH_MAIL1, OFFENE_STATUS, pauseAktiv, rueckmeldungLink,
} from '../kette.ts';
import { VOR_DEM_ABSENDEN } from '../stopRegeln.ts';

// Anlass (Martin, 14.09.2026): Die Abschiedsmail (nachfass_3) versprach
// „Falls wir nichts hören, melden wir uns nicht mehr", zwei Tage später kam
// trotzdem profil_nudge_3 („Können wir Sie bei etwas unterstützen?") — seit
// 14.08. bei 34 von 65 Kunden. Die Wechsel-Mail nach 7 Wochen bleibt.

const typen = KETTE_NACH_MAIL1.map(([typ]) => typ);

Deno.test('profil_nudge_3 wird nicht mehr eingeplant und gilt als gestrichen', () => {
  assert(!typen.includes('profil_nudge_3'));
  assert(GESTRICHENE_MAILS.has('profil_nudge_3'));
});

// Registry #167 (Martin 15.11.2026): Die Wechsel-Mail an Tag 49 führte auf einen abgelaufenen Link (Token 14 Tage).
Deno.test('reaktivierung_wechsel wird nicht mehr eingeplant, schon geplante verfallen beim Versand', () => {
  assert(!typen.includes('reaktivierung_wechsel'));
  assert(GESTRICHENE_MAILS.has('reaktivierung_wechsel'));
});

Deno.test('keine gestrichene Mail steht in der Kette', () => {
  for (const typ of typen) assert(!GESTRICHENE_MAILS.has(typ), typ);
});

// Registry #168 (Martin 15.11.2026, „A: Angebot + Erinnerungen"): Kette ohne Pflegesituation mit drei Mails statt fünf.
Deno.test('Kette: Nudge 1 +4 h, Nudge 2 +28 h, Abschied +72 h direkt nach Mail 1, zeitlich aufsteigend', () => {
  assertEquals(KETTE_NACH_MAIL1, [
    ['profil_nudge_1', 240],
    ['profil_nudge_2', 1680],
    ['nachfass_3', 4320],
  ]);
  const minuten = KETTE_NACH_MAIL1.map(([, m]) => m);
  assertEquals(minuten, [...minuten].sort((a, b) => a - b));
  assertEquals(new Set(typen).size, typen.length, 'jeder Typ einmal');
});

Deno.test('„Vier Dinge" und Nachfass 2 sind gestrichen: nicht in der Kette, schon geplante verfallen beim Versand', () => {
  for (const typ of ['warum_primundus', 'nachfass_2']) {
    assert(!typen.includes(typ), typ);
    assert(GESTRICHENE_MAILS.has(typ), typ);
  }
  assert(!GESTRICHENE_MAILS.has('nachfass_3'), 'der Abschied bleibt');
  assertEquals(ABSCHIED_VORGAENGER, 'nachfass_2');
  // Die Stopp-Regel vor dem Absenden gilt weiter für den Abschied (unverändert).
  assert(VOR_DEM_ABSENDEN.has('nachfass_3'));
});

Deno.test('Abschiedssatz in Ich-Form, ohne Versprechen einer späteren Mail und ohne „letzte E-Mail"', () => {
  assertEquals(ABSCHIED_SATZ, 'Ohne Ihre Rückmeldung schreibe ich Ihnen danach nicht mehr zu dieser Anfrage.');
  assert(ABSCHIED_SATZ.includes(' ich '));
  assert(!/Wochen|letzte|wir /i.test(ABSCHIED_SATZ));
});

// Laufende Kunden (Mail 1 vor dem Deploy von #168): Ihre geplante nachfass_2-Zeile verfällt, der Abschied wird nachgeholt.
const ANKER = '2026-11-14T10:00:00.000Z';
Deno.test('Abschied nachholen: nur für nachfass_2 und nur ohne Abschied dieser Runde', () => {
  // Normalfall laufender Kunde: noch keine nachfass_3-Zeile.
  assert(abschiedNachholen('nachfass_2', ANKER, []));
  // Andere gestrichene Typen holen nichts nach.
  for (const typ of ['warum_primundus', 'profil_nudge_3', 'reaktivierung_wechsel', 'nachfass_3']) {
    assert(!abschiedNachholen(typ, ANKER, []), typ);
  }
});

Deno.test('Abschied nachholen: nie ein zweiter Abschied', () => {
  // Offen (auch aus einer älteren Runde, die geht ohnehin noch raus).
  for (const status of ['pending', 'processing']) {
    assert(!abschiedNachholen('nachfass_2', ANKER, [{ status, created_at: '2026-10-01T08:00:00Z', sent_at: null }]), status);
  }
  // Schon gesendet oder abgebrochen in dieser Runde (angelegt oder gesendet nach dem Anker).
  assert(!abschiedNachholen('nachfass_2', ANKER, [{ status: 'sent', created_at: '2026-11-15T09:00:00Z', sent_at: '2026-11-17T08:00:00Z' }]));
  assert(!abschiedNachholen('nachfass_2', ANKER, [{ status: 'cancelled', created_at: '2026-11-15T09:00:00Z', sent_at: null }]));
  // Alte Runde angelegt, aber nach dem Anker gesendet (Kunde fragte erneut an, alte Zeile lief noch): zählt.
  assert(!abschiedNachholen('nachfass_2', ANKER, [{ status: 'sent', created_at: '2026-11-01T09:00:00Z', sent_at: '2026-11-14T12:00:00Z' }]));
  // Ohne Anker zählt jede Zeile.
  assert(!abschiedNachholen('nachfass_2', null, [{ status: 'sent', created_at: '2026-09-01T09:00:00Z', sent_at: '2026-09-03T09:00:00Z' }]));
  assert(abschiedNachholen('nachfass_2', null, []));
});

Deno.test('Abschied nachholen: ein Abschied aus einer älteren Runde zählt nicht', () => {
  // Kunde hatte im September schon einen Abschied, fragte im November neu an: diese Runde bekommt ihren eigenen.
  assert(abschiedNachholen('nachfass_2', ANKER, [
    { status: 'sent', created_at: '2026-09-01T09:00:00Z', sent_at: '2026-09-03T09:00:00Z' },
    { status: 'cancelled', created_at: '2026-09-01T09:00:00Z', sent_at: null },
  ]));
});

// Registry #72: alle drei Knöpfe der Abschiedsmail führen auf /rueckmeldung.
Deno.test('Knöpfe der Abschiedsmail verlinken /rueckmeldung mit Token und Knopf', () => {
  assertEquals(
    rueckmeldungLink('https://kostenrechner.primundus.de', 'abc123XYZ', 'aktuell-nicht'),
    'https://kostenrechner.primundus.de/rueckmeldung?token=abc123XYZ&knopf=aktuell-nicht',
  );
  assertEquals(
    rueckmeldungLink('https://kostenrechner.primundus.de/', 'a b&c', 'interesse'),
    'https://kostenrechner.primundus.de/rueckmeldung?token=a%20b%26c&knopf=interesse',
  );
});

Deno.test('Pause gilt bis zum Termin, endet früher, wenn der Kunde selbst aktiv wird', () => {
  const jetzt = new Date('2026-09-15T12:00:00Z');
  assert(pauseAktiv('2026-10-15T08:00:00.000Z', jetzt, false));
  assert(!pauseAktiv('2026-10-15T08:00:00.000Z', jetzt, true));
  assert(!pauseAktiv('2026-09-15T08:00:00.000Z', jetzt, false));
  assert(!pauseAktiv(null, jetzt, false));
  assert(!pauseAktiv('kein-datum', jetzt, false));
});

Deno.test('Wiedervorlage nur für offene Anfragen', () => {
  for (const s of ['angebot_requested', 'info_requested', 'manuell_pruefen']) assert(OFFENE_STATUS.has(s), s);
  for (const s of ['nicht_interessiert', 'vertrag_abgeschlossen', 'betreuung_beauftragt', 'folge_einsatz']) assert(!OFFENE_STATUS.has(s), s);
});
