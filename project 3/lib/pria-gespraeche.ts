/*
 * Aus einzelnen Protokollzeilen wird eine Liste von Gesprächen.
 *
 * Eigene Datei, damit die Regel prüfbar ist: sie entscheidet, ob im Admin am
 * Gespräch „Lead" steht — und genau das war am 29.08.2026 falsch. Martin hatte
 * ein Gespräch offen, dessen Kopf einen vollständigen Lead zeigte (Name,
 * E-Mail, Preis, Kunden- und Job-Nummer in mamamia), während in der Liste
 * daneben keine Marke stand.
 *
 * Die beiden Ansichten fragten Verschiedenes:
 *   – der Kopf:  gibt es eine Zeile mit `lead_id`? (Fremdschlüssel auf `leads`)
 *   – die Liste: gibt es eine Zeile mit `ereignis = 'lead'`? (ein Ereignis)
 *
 * Der Fremdschlüssel ist der Beweis, das Ereignis nur die Notiz — und die kann
 * fehlen. Zwei Wege dorthin, beide echt:
 *   1. Die Rückruf-Route legt einen Lead an und trägt `lead_id` nach, schreibt
 *      aber `ereignis = 'rueckruf'`. Es gab nie ein 'lead'-Ereignis.
 *   2. Die Marke entsteht im selben Atemzug wie der Sprung ins Kundenportal.
 *      Wurde ihr Paket unterwegs abgeschnitten, war die Zeile verloren.
 *
 * Deshalb zählt hier ab sofort beides. Wer `lead_id` hat, IST ein Lead.
 */

export type ProtokollZeile = {
  sid: string;
  rolle?: string | null;
  text?: string | null;
  ereignis?: string | null;
  lead_id?: string | null;
  zeit: string;
};

export type GespraechsZeile = {
  sid: string;
  beginn: string;
  ende: string;
  nachrichten: number;
  ersteFrage: string | null;
  lead: boolean;
  leadId: string | null;
  rueckruf: boolean;
};

/**
 * Fasst Protokollzeilen je `sid` zusammen, neuestes Gespräch zuerst.
 * Bewusst unabhängig von der Sortierung der Eingabe: Beginn, Ende und die
 * erste Kundenfrage werden über die Zeitstempel bestimmt, nicht über die
 * Reihenfolge. Vorher hing das Ergebnis stillschweigend daran, dass die
 * Abfrage absteigend sortiert — eine Kopplung, die kein Aufrufer sieht.
 */
export function fasseGespraecheZusammen(zeilen: ProtokollZeile[]): GespraechsZeile[] {
  const proSid = new Map<string, GespraechsZeile>();
  const ersteFrageZeit = new Map<string, string>();

  for (const z of zeilen) {
    if (!z || !z.sid) continue;
    let g = proSid.get(z.sid);
    if (!g) {
      g = { sid: z.sid, beginn: z.zeit, ende: z.zeit, nachrichten: 0,
            ersteFrage: null, lead: false, leadId: null, rueckruf: false };
      proSid.set(z.sid, g);
    }
    if (z.zeit < g.beginn) g.beginn = z.zeit;
    if (z.zeit > g.ende) g.ende = z.zeit;
    if (z.rolle === 'kunde' || z.rolle === 'pria') g.nachrichten++;
    if (z.rolle === 'kunde' && z.text) {
      const bisher = ersteFrageZeit.get(z.sid);
      if (!bisher || z.zeit < bisher) {
        g.ersteFrage = z.text.slice(0, 120);
        ersteFrageZeit.set(z.sid, z.zeit);
      }
    }
    // Der Fremdschlüssel wiegt schwerer als das Ereignis — siehe Kopf der Datei.
    if (z.ereignis === 'lead' || z.lead_id) g.lead = true;
    // Eine Rueckrufbitte ist der Grund, ein Gespraech zuerst zu oeffnen —
    // dort wartet jemand auf einen Anruf.
    if (z.ereignis === 'rueckruf') g.rueckruf = true;
    if (z.lead_id) g.leadId = z.lead_id;
  }

  // Array.from statt Spread: das Projekt kompiliert auf ein Ziel ohne
  // downlevelIteration, dort ist der Spread eines Iterators ein Typfehler.
  return Array.from(proSid.values()).sort((a, b) => (a.ende < b.ende ? 1 : -1));
}
