/*
 * Die Liste im Admin muss dasselbe sagen wie der Kopf daneben.
 *
 * Warum dieser Test existiert (29.08.2026): Martin hatte ein Gespräch offen,
 * dessen Kopf einen vollständigen Lead zeigte — Name, E-Mail, 2.750 €, Kunde
 * 10456 und Job 35696 in mamamia — während in der Liste daneben keine Marke
 * stand. „das ist doch ein Lead, warum ist er nicht gekennzeichnet".
 *
 * Die beiden Ansichten fragten Verschiedenes: der Kopf nach einer Zeile mit
 * `lead_id` (Fremdschlüssel auf `leads`), die Liste nach einer Zeile mit
 * `ereignis = 'lead'` (einer Notiz). Der Fremdschlüssel ist der Beweis, die
 * Notiz kann fehlen — die Rückruf-Route schreibt sie nie, und beim Sprung ins
 * Kundenportal konnte ihr Paket unterwegs abgeschnitten werden.
 */
import { describe, it, expect } from 'vitest';
import { fasseGespraecheZusammen, type ProtokollZeile } from '../../../project 3/lib/pria-gespraeche';

const z = (t: Partial<ProtokollZeile> & { zeit: string }): ProtokollZeile =>
  ({ sid: 's1', rolle: 'pria', text: '', ereignis: null, lead_id: null, ...t });

describe('Pria-Gespräche — wann ein Gespräch als Lead gilt', () => {
  it('markiert ein Gespräch mit lead_id, auch ohne lead-Ereignis', () => {
    // Genau Martins Fall: der Lead ist verknüpft, die Notiz fehlt.
    const [g] = fasseGespraecheZusammen([
      z({ zeit: '2026-08-29T10:20:00Z', rolle: 'kunde', text: 'Preis berechnen', lead_id: 'L-1' }),
      z({ zeit: '2026-08-29T10:21:00Z', lead_id: 'L-1' }),
    ]);
    expect(g.lead, 'lead_id ohne Ereignis wird nicht als Lead erkannt').toBe(true);
    expect(g.leadId).toBe('L-1');
  });

  it('markiert auch, wenn nur das Ereignis da ist', () => {
    // Der umgekehrte Fall: die Zeile kam an, das Nachtragen der lead_id nicht.
    const [g] = fasseGespraecheZusammen([
      z({ zeit: '2026-08-29T10:20:00Z', rolle: 'system', text: 'Kontaktdaten abgeschickt', ereignis: 'lead' }),
    ]);
    expect(g.lead).toBe(true);
  });

  it('markiert einen Rückruf, aus dem ein Lead wurde, als beides', () => {
    // Die Rückruf-Route legt einen Lead an und trägt lead_id nach, schreibt
    // aber ereignis='rueckruf'. Beide Marken gehören ans Gespräch.
    const [g] = fasseGespraecheZusammen([
      z({ zeit: '2026-08-29T09:00:00Z', rolle: 'system', text: 'Rückruf erbeten', ereignis: 'rueckruf', lead_id: 'L-2' }),
    ]);
    expect(g.rueckruf).toBe(true);
    expect(g.lead).toBe(true);
  });

  it('markiert ein Gespräch ohne Lead nicht', () => {
    // Ohne diesen Fall wäre „markiert alles" ein bestandener Test.
    const [g] = fasseGespraecheZusammen([
      z({ zeit: '2026-08-29T10:20:00Z', rolle: 'kunde', text: 'Was kostet das?' }),
    ]);
    expect(g.lead).toBe(false);
    expect(g.leadId).toBeNull();
  });

  it('liest Beginn, Ende und erste Frage unabhängig von der Sortierung', () => {
    /* Vorher hing das Ergebnis stillschweigend daran, dass die Abfrage
       absteigend sortiert („das zuletzt Gesehene ist das Früheste") — eine
       Kopplung, die kein Aufrufer sieht und die eine geänderte ORDER BY
       lautlos umgedreht hätte. */
    const zeilen = [
      z({ zeit: '2026-08-29T10:00:00Z', rolle: 'kunde', text: 'erste Frage' }),
      z({ zeit: '2026-08-29T10:05:00Z', rolle: 'pria', text: 'Antwort' }),
      z({ zeit: '2026-08-29T10:09:00Z', rolle: 'kunde', text: 'zweite Frage' }),
    ];
    for (const reihenfolge of [zeilen, [...zeilen].reverse()]) {
      const [g] = fasseGespraecheZusammen(reihenfolge);
      expect(g.beginn).toBe('2026-08-29T10:00:00Z');
      expect(g.ende).toBe('2026-08-29T10:09:00Z');
      expect(g.ersteFrage).toBe('erste Frage');
      expect(g.nachrichten).toBe(3);
    }
  });

  it('sortiert das zuletzt aktive Gespräch nach oben', () => {
    const liste = fasseGespraecheZusammen([
      z({ sid: 'alt',  zeit: '2026-08-29T08:00:00Z' }),
      z({ sid: 'neu',  zeit: '2026-08-29T12:00:00Z' }),
    ]);
    expect(liste.map((g) => g.sid)).toEqual(['neu', 'alt']);
  });
});
