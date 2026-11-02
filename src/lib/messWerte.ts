// Grobe Klassen für die Kernmessung (Registry #144). Bewusst kein vollständiger User-Agent und keine genaue Höhe:
// Gerät, Browser und In-App-Browser reichen, um Android und iPhone zu trennen, und erkennen niemanden wieder.

export interface GeraetKlasse {
  geraet: 'iphone' | 'ipad' | 'android' | 'computer';
  browser: 'safari' | 'chrome' | 'samsung' | 'firefox' | 'edge' | 'sonst';
  in_app: boolean;
  hoehe: 'unter_600' | 'unter_700' | 'unter_800' | 'ab_800';
}

export function geraetKlasse(ua: string, hoehe: number, beruehrbar = false): GeraetKlasse {
  const geraet: GeraetKlasse['geraet'] = /iPhone|iPod/.test(ua) ? 'iphone'
    // iPadOS meldet sich als Macintosh, nur die Touch-Punkte verraten es.
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && beruehrbar) ? 'ipad'
    : /Android/.test(ua) ? 'android'
    : 'computer';
  const browser: GeraetKlasse['browser'] = /SamsungBrowser/.test(ua) ? 'samsung'
    : /Edg(e|A|iOS)?\//.test(ua) ? 'edge'
    : /FxiOS|Firefox/.test(ua) ? 'firefox'
    : /CriOS|Chrome/.test(ua) ? 'chrome'
    : /Safari/.test(ua) ? 'safari'
    : 'sonst';
  // Mail- und Social-Apps öffnen den Link im eigenen Fenster: iOS ohne „Safari/“, Android mit „; wv)“.
  const in_app = /FBAN|FBAV|Instagram|GSA\/|; wv\)/.test(ua) || (/iPhone|iPad/.test(ua) && !/Safari\//.test(ua));
  const klasse: GeraetKlasse['hoehe'] = hoehe < 600 ? 'unter_600' : hoehe < 700 ? 'unter_700' : hoehe < 800 ? 'unter_800' : 'ab_800';
  return { geraet, browser, in_app, hoehe: klasse };
}

/** Fehlertext für `portal_fehler`: ohne Adressen und Zahlen, abgeschnitten ab dem ersten Anführungszeichen (dort stehen in
 *  JS-Fehlern die Inhalte). Reicht, um Fehler zu unterscheiden. Freier Text ohne Anführungszeichen bleibt stehen; Fehler mit
 *  Antworttexten des Servers gehören deshalb nicht hierher (`MamamiaError` meldet das Portal nur als Klasse). */
export function fehlerKurz(text: unknown): string {
  return String(text ?? '')
    .slice(0, 300)
    .replace(/(\p{L})'(\p{L})/gu, '$1’$2') // „Can't find variable“: kein Zitat
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/\S+\s?@\s?\S+/g, 'MAIL')
    .replace(/["'„“‚‘`{].*$/su, '…')
    .replace(/\d+/g, '#')
    .slice(0, 100);
}

const leer = (v: unknown) => v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0);

/** Schlüssel, die von leer auf belegt gewechselt sind. Nur die Namen, nie die Werte. */
export function neuBelegteFelder(vorher: object, nachher: object): string[] {
  const alt = vorher as Record<string, unknown>;
  return Object.entries(nachher as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && leer(alt[k]) && !leer(v))
    .map(([k]) => k);
}
