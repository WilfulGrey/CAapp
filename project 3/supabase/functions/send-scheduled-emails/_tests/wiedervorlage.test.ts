import { assert, assertEquals } from '@std/assert';
import { WIEDERVORLAGE_BETREFF, WIEDERVORLAGE_KERN, wiedervorlageEinstieg } from '../wiedervorlage.ts';

// Registry #72: Nachfrage zum Wunschtermin nach „Aktuell nicht — vielleicht später".

Deno.test('Einstieg nennt, wann der Kunde um die Nachfrage gebeten hat', () => {
  assertEquals(
    wiedervorlageEinstieg('vor einem Monat'),
    'Vor einem Monat haben Sie uns gebeten, uns heute wieder zu melden. Ist die Betreuung zu Hause jetzt ein Thema?',
  );
  assert(wiedervorlageEinstieg('vor zwei Wochen').startsWith('Vor zwei Wochen '));
  assert(wiedervorlageEinstieg(null).startsWith('Vor einiger Zeit '));
});

Deno.test('ruhiger Ton: kein Druck, Vertrag erst nach Auswahl', () => {
  const alles = `${WIEDERVORLAGE_BETREFF} ${wiedervorlageEinstieg('vor einem Monat')} ${WIEDERVORLAGE_KERN}`;
  for (const druck of ['nur noch', 'letzte Chance', 'sofort', 'warten', 'jetzt handeln']) assert(!alles.includes(druck), druck);
  assert(WIEDERVORLAGE_KERN.includes('Ein Vertrag entsteht erst'));
});
