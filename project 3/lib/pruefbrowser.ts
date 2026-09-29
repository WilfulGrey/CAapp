/* Automatische Prüfläufe aus der Statistik heraushalten (Registry #104, 28.09.2026).

   Befund der Ursachenanalyse vom 28.09.: Am 27.09. waren 8 der 9 „Website-
   Besucher“ im Rechner unsere eigenen Playwright-Läufe, und der Frage-1-Zähler
   bestand an dem Tag nur aus ihnen. Jeder automatisierte Browser (Playwright,
   Puppeteer, Selenium — Chromium, Chrome und WebKit gleichermaßen) meldet
   `navigator.webdriver === true`, ein echter Besucher nie. Das ist die
   Hauptregel. Dazu die Kennung im User-Agent: `HeadlessChrome` (Chrome ohne
   Fenster) und `PrimundusPruefung` (freiwillige Markierung für Skripte, die
   `webdriver` überschreiben). Der Server prüft nur den User-Agent — er sieht
   `webdriver` nicht — und speichert ihn dafür nicht. */

const KENNUNG = /HeadlessChrome|PrimundusPruefung/i;

type NavigatorTeil = { webdriver?: boolean; userAgent?: string };

/** Im Browser: läuft hier ein automatisierter Prüflauf? */
export function istPruefbrowser(nav: NavigatorTeil | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false;
  return nav.webdriver === true || KENNUNG.test(nav.userAgent || '');
}

/** Auf dem Server: stammt die Anfrage von einem markierten Prüflauf? */
export function istPruefAnfrage(userAgent: string | null | undefined): boolean {
  return KENNUNG.test(userAgent || '');
}
