import { assertEquals } from '@std/assert';
import { capitalizeName } from '../names.ts';

// Anlass (Martin, 10.08.2026): Die Nachfass-Mail grüßte „Hallo Frau RUPPERT" —
// der Lead-Datensatz trug den Nachnamen in Versalien, und die alte capitalize()
// der Edge Function machte nur den ERSTEN Buchstaben groß und ließ den Rest
// stehen. In project 3/lib/email.ts war das längst korrekt.

Deno.test('ALL-CAPS wird zu normaler Schreibweise', () => {
  assertEquals(capitalizeName('RUPPERT'), 'Ruppert');
  assertEquals(capitalizeName('SANTUS'), 'Santus');
});

Deno.test('Kleinschreibung wird großgeschrieben', () => {
  assertEquals(capitalizeName('ruppert'), 'Ruppert');
  assertEquals(capitalizeName('marco santus'), 'Marco Santus');
});

Deno.test('bewusste gemischte Schreibweise bleibt erhalten', () => {
  assertEquals(capitalizeName('McDonald'), 'McDonald');
  assertEquals(capitalizeName('DiCaprio'), 'DiCaprio');
});

Deno.test('Bindestrich- und mehrteilige Namen je Teil', () => {
  assertEquals(capitalizeName('MÜLLER-LÜDENSCHEIDT'), 'Müller-Lüdenscheidt');
  assertEquals(capitalizeName('müller-lüdenscheidt'), 'Müller-Lüdenscheidt');
  // gemischt: der geschriebene Teil bleibt, der schreiende wird normalisiert
  assertEquals(capitalizeName('Ruppert-MÜLLER'), 'Ruppert-Müller');
});

Deno.test('Namens-Partikel bleiben klein (Anrede steht davor)', () => {
  assertEquals(capitalizeName('VON STEIN'), 'von Stein');
  assertEquals(capitalizeName('van der BERG'), 'van der Berg');
});

Deno.test('leere und kaputte Eingaben bleiben unverändert', () => {
  assertEquals(capitalizeName(''), '');
  assertEquals(capitalizeName('   '), '');
});
