import { STERNE_STAND_URL, pruefeSterneStand, type SterneStand } from './sterne-zeile';

/**
 * Server: Stand der Bewertungen für die Startseite (lib/sterne-zeile.ts).
 *
 * app/page.tsx wird stündlich neu erzeugt (`revalidate = 3600`), der Abruf
 * läuft im selben Takt über den Next-Datencache. Besucher warten nie darauf:
 * die Seite liegt fertig vor und wird im Hintergrund erneuert.
 *
 * Kein Ersatzwert. Bei HTTP-Fehler, Ausfall oder ungültiger Antwort: null,
 * dann fehlen beide Sterne-Zeilen, der Rest der Seite bleibt.
 */
export async function ladeSterneStand(): Promise<SterneStand | null> {
  try {
    const res = await fetch(STERNE_STAND_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error(`[sterne-zeile] ${STERNE_STAND_URL}: HTTP ${res.status}`);
      return null;
    }
    const stand = pruefeSterneStand(await res.json());
    if (!stand) console.error('[sterne-zeile] Antwort ungültig');
    return stand;
  } catch (e) {
    console.error('[sterne-zeile]', e);
    return null;
  }
}
