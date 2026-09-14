import { assert, assertEquals } from '@std/assert';
import { MEILENSTEIN_EREIGNISSE, meilensteinAus } from '../meilenstein.ts';

// Anlass (Martin, 14.09.2026): Ein helfer24-Kunde bekam am 08.09. um 13:16 die
// erste Bewerbung — das Profil hatte das Team im SA-Portal ausgefüllt, ein
// patient_data_saved gab es nicht. Um 14:25 und am Folgetag gingen trotzdem die
// Profil-Erinnerungen raus („Profil unvollständig — Sie können noch keine
// Bewerbungen erhalten"). Seit 14.08. traf das 4 Kunden.

Deno.test('ohne Ereignisse: none', () => {
  assertEquals(meilensteinAus([]), 'none');
});

Deno.test('nur Portal geöffnet: portal_opened', () => {
  assertEquals(meilensteinAus(['portal_opened']), 'portal_opened');
});

Deno.test('Profil selbst gespeichert: patient_data_saved (unverändert)', () => {
  assertEquals(meilensteinAus(['portal_opened', 'patient_data_saved']), 'patient_data_saved');
});

Deno.test('Bewerbung ohne eigenes Speichern (Team-Profil): zählt als fertiges Profil', () => {
  assertEquals(meilensteinAus(['application_received']), 'patient_data_saved');
  assertEquals(meilensteinAus(['portal_opened', 'application_received']), 'patient_data_saved');
});

Deno.test('Einladung gewinnt weiter vor allem anderen', () => {
  assertEquals(meilensteinAus(['application_received', 'caregiver_invited']), 'caregiver_invited');
  assertEquals(meilensteinAus(['patient_data_saved', 'caregiver_invited', 'portal_opened']), 'caregiver_invited');
});

Deno.test('fremde Ereignisse ändern nichts', () => {
  assertEquals(meilensteinAus(['email_profil_nudge_1_sent', 'offer_updated']), 'none');
});

Deno.test('die Abfrage liest Bewerbungen mit (sonst greift die Regel nie)', () => {
  assert((MEILENSTEIN_EREIGNISSE as readonly string[]).includes('application_received'));
  for (const typ of ['portal_opened', 'patient_data_saved', 'caregiver_invited']) {
    assert((MEILENSTEIN_EREIGNISSE as readonly string[]).includes(typ), typ);
  }
});
