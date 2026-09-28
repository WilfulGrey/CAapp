/* Geräteklasse aus dem User-Agent (Registry #103, 28.09.2026). Dieselbe Regel
   wie die Sitzungen (lib/analytics.ts, Spalte `analytics_sessions.device_type`),
   damit Zähler und Sitzungen gleich einteilen. Gesendet wird immer nur die
   Klasse, nie der User-Agent selbst. */

export type GeraeteTyp = 'mobile' | 'tablet' | 'desktop';

export function geraeteTyp(ua: string): GeraeteTyp {
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile';
  return 'desktop';
}

/** Für den anonymen Zähler nur zwei Klassen: Handy und Tablet zählen als mobil. */
export type ZaehlerGeraet = 'mobil' | 'desktop';

export function zaehlerGeraetAus(ua: string): ZaehlerGeraet {
  return geraeteTyp(ua) === 'desktop' ? 'desktop' : 'mobil';
}
