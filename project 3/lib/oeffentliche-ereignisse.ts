// Was GET /api/lead-event vom Ereignis `caregiver_arrival_scheduled` an das Portal gibt (Gebucht-Seite, Registry #138).
//
// Das Ereignis trägt viel mehr als die Seite braucht: `hinweis` (Notiz der Agentur: Busunternehmen, polnische
// Disponenten-Nummer, Arbeitsnotizen — Michał 09.10.: geht nie an den Kunden), Foto-URL und Name der Pflegekraft,
// `confirmation_id`, `arrival_key`. An den Browser gehen nur die Felder der Anreise-Mail (Registry #119), sonst nichts.
// Pure (kein Next, kein Supabase), damit der Root-Vitest es direkt prüfen kann.

/** Genau diese Schlüssel aus `detect-caregiver-events/anreise.ts` (AnreiseDaten) plus Job und Test-Marke. */
export const ANREISE_OEFFENTLICH = [
  'mamamia_job_offer_id',
  'anreise_datum',
  'anreise_von',
  'anreise_bis',
  'verkehrsmittel',
  'einsatzort_strasse',
  'einsatzort_plz_ort',
  'test',
] as const;

/**
 * Metadaten eines Ereignisses für den GET der Brücke. `caregiver_arrival_scheduled` ⇒ nur die erlaubten Schlüssel
 * (fehlende bleiben weg, nichts wird ergänzt); jeder andere Typ ⇒ unverändert wie bisher.
 */
export function oeffentlicheMetadata(eventType: string, metadata: unknown): unknown {
  if (eventType !== 'caregiver_arrival_scheduled') return metadata;
  if (!metadata || typeof metadata !== 'object') return {};
  const m = metadata as Record<string, unknown>;
  const aus: Record<string, unknown> = {};
  for (const k of ANREISE_OEFFENTLICH) if (k in m) aus[k] = m[k];
  return aus;
}
