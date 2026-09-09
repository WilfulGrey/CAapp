import { assertEquals } from '@std/assert';
import { buildLeadRef, capitalizeName } from '../names.ts';

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

// ── buildLeadRef: Name im Betreff der Nachfass-3-Antwortknöpfe ────────────
// Anlass Oehlert/Stein (08.09.2026): die Antwort kam über ein anderes
// t-online-Konto, im Postfach stand ein Kunde als Absender und im Betreff ein
// anderer — beide echte offene Leads. Der Name im Betreff macht die Zuordnung
// eindeutig, egal aus welchem Postfach geantwortet wird.
Deno.test('buildLeadRef: Name zuerst, Adresse in Klammern', () => {
  assertEquals(
    buildLeadRef({ vorname: 'Thea', nachname: 'Oehlert', email: 'Humbug62@t-online.de', id: 'abc' }),
    'Thea Oehlert (Humbug62@t-online.de)',
  );
});

Deno.test('buildLeadRef: ALL-CAPS wird normalisiert', () => {
  assertEquals(
    buildLeadRef({ vorname: 'CATARINA', nachname: 'STEIN', email: 'c@example.com', id: 'abc' }),
    'Catarina Stein (c@example.com)',
  );
});

Deno.test('buildLeadRef: ohne brauchbaren Namen bleibt es bei der Adresse', () => {
  assertEquals(
    buildLeadRef({ vorname: '', nachname: '(Sohn)', email: 'k@example.com', id: 'abc' }),
    'k@example.com',
  );
});

Deno.test('buildLeadRef: ohne E-Mail faellt es auf die Lead-ID zurueck', () => {
  assertEquals(
    buildLeadRef({ vorname: null, nachname: null, email: null, id: 'lead-uuid-1' }),
    'lead-uuid-1',
  );
});

Deno.test('buildLeadRef: nur Nachname reicht', () => {
  assertEquals(
    buildLeadRef({ vorname: null, nachname: 'Quade', email: 'q@example.com', id: 'abc' }),
    'Quade (q@example.com)',
  );
});
