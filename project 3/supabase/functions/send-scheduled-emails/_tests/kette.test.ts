import { assert, assertEquals } from '@std/assert';
import { ABSCHIED_SATZ, GESTRICHENE_MAILS, KETTE_NACH_MAIL1 } from '../kette.ts';

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
  assertEquals(ABSCHIED_SATZ, 'Falls wir nichts hören, melden wir uns erst in einigen Wochen noch einmal.');
});
