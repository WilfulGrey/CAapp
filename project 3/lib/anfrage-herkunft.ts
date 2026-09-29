/* Herkunft JEDER Absendung (Registry #105, 28.09.2026).

   Befund der Ursachenanalyse vom 28.09.: Schickt jemand ab, der schon eine
   Anfrage hat, entsteht keine neue — `findOrCreateLead` hängt nur
   `angebot_requested_duplicate` an die alte, und die Lead-Quelle bleibt die
   erste (gewollt). Woher die NEUE Absendung kam, ging dabei verloren: Am 28.09.
   16:08 schickte ein Besucher von primundus.de ab und tauchte nirgends als
   Website-Anfrage auf; 8 von 19 Duplikaten seit 11.09. hatten eine Website-
   Sitzung davor. Deshalb schreibt die Absende-Route zu JEDER Absendung ein
   eigenes Ereignis `anfrage_herkunft` mit der Art und der Quelle dieser
   Absendung. Die Lead-Logik selbst bleibt unverändert. */

export type AnfrageArt = 'neu' | 'hochgestuft' | 'duplikat';

export function anfrageArt(ergebnis: { isNew: boolean; isUpgrade: boolean }): AnfrageArt {
  if (ergebnis.isNew) return 'neu';
  if (ergebnis.isUpgrade) return 'hochgestuft';
  return 'duplikat';
}

/* Sitzung und Gerät (Registry #106): Die Sitzungs-ID ist die zufällige Kennung,
   die lib/analytics.ts je Tab anlegt (`sess_<Zeit>_<Zufall>`) — über sie findet
   man die Zeile in `analytics_sessions` (Einstiegsseite, Verweis, Gerät) und,
   bei Einwilligung, die Schritte. Das Gerät ist dieselbe Klasse wie dort. Beides
   kommt vom Browser; alles, was nicht genau dieser Form entspricht, wird null. */
const SITZUNG_RE = /^sess_\d{10,14}_[a-z0-9]{1,20}$/;
const GERAETE = ['mobile', 'tablet', 'desktop'] as const;

export function sitzungPruefen(wert: unknown): string | null {
  return typeof wert === 'string' && SITZUNG_RE.test(wert) ? wert : null;
}

export function geraetPruefen(wert: unknown): (typeof GERAETE)[number] | null {
  return GERAETE.find((g) => g === wert) ?? null;
}

export function anfrageHerkunft(eingabe: {
  isNew: boolean;
  isUpgrade: boolean;
  /** schon bereinigt (quelleBereinigen), z. B. `website:apex-startseite` oder `rechner` */
  quelle: string;
  /** schon geprüft, sonst null */
  websitePfad: string | null;
  /** roh vom Browser, wird hier geprüft */
  sessionId?: unknown;
  geraet?: unknown;
}): { art: AnfrageArt; quelle: string; website_pfad: string | null; session_id: string | null; geraet: string | null } {
  return {
    art: anfrageArt(eingabe),
    quelle: eingabe.quelle,
    website_pfad: eingabe.websitePfad,
    session_id: sitzungPruefen(eingabe.sessionId),
    geraet: geraetPruefen(eingabe.geraet),
  };
}
