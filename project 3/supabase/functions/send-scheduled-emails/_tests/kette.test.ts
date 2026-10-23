import { assert, assertEquals } from '@std/assert';
import { ABSCHIED_SATZ, GESTRICHENE_MAILS, KETTE_NACH_MAIL1, OFFENE_STATUS, pauseAktiv, rueckmeldungLink } from '../kette.ts';

// Anlass (Martin, 14.09.2026): Die Abschiedsmail (nachfass_3) versprach
// „Falls wir nichts hören, melden wir uns nicht mehr", zwei Tage später kam
// trotzdem profil_nudge_3 („Können wir Sie bei etwas unterstützen?") — seit
// 14.08. bei 34 von 65 Kunden. Die Wechsel-Mail nach 7 Wochen bleibt.

const typen = KETTE_NACH_MAIL1.map(([typ]) => typ);

Deno.test('profil_nudge_3 wird nicht mehr eingeplant und gilt als gestrichen', () => {
  assert(!typen.includes('profil_nudge_3'));
  assert(GESTRICHENE_MAILS.has('profil_nudge_3'));
});

Deno.test('keine gestrichene Mail steht in der Kette', () => {
  for (const typ of typen) assert(!GESTRICHENE_MAILS.has(typ), typ);
});

Deno.test('Kette bleibt sonst unverändert, zeitlich aufsteigend', () => {
  assertEquals(KETTE_NACH_MAIL1, [
    ['profil_nudge_1', 240],
    ['profil_nudge_2', 1680],
    ['warum_primundus', 2880],
    ['nachfass_2', 4320],
    ['reaktivierung_wechsel', 70560],
  ]);
});

Deno.test('Abschiedssatz verspricht keine Funkstille mehr', () => {
  assert(!ABSCHIED_SATZ.includes('nicht mehr'));
  assertEquals(ABSCHIED_SATZ, 'Wenn ich nichts von Ihnen höre, melde ich mich erst in einigen Wochen wieder.');
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
