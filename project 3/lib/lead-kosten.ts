/**
 * Kosten und Ertrag je Lead-Quelle (Martin, 06.09.2026: „geil waere, wenn wir
 * einen bereich haetten im system wo wir das so sehen koennten, filtern
 * koennten und auch nach zeit filtern … das eingekaufte nicht nur als summe
 * zeigen, sondern nach jeder quelle, um diese besser zu bewerten").
 *
 * Reine Rechenlogik ohne Datenbank — dadurch testbar.
 */

/** Einkaufspreis je Portal, NETTO in Euro. Eine Stelle, hier aendern genuegt. */
export const PORTAL_PREISE: Record<string, number> = {
  'pflegehilfe.org': 37,
  'pflege-helfer24.de': 50,
  // Vermittler: die Anfrage selbst kostet nichts, die Provision (10 EUR/Tag)
  // faellt erst mit dem Auftrag an. 0 ist hier eine Aussage, kein Platzhalter
  // — deshalb steht der Schluessel drin und fehlt nicht.
  'pflegena.de': 0,
};

export type Lead = { id: string; source?: string | null; ist_test?: boolean | null };

export type QuellenZeile = {
  /** Rohwert, z. B. "portal:pflegehilfe.org" oder "rechner". */
  key: string;
  /** Lesbarer Name. */
  name: string;
  /** "eigene" (Formular/Chat) oder "eingekauft" (Portale). */
  gruppe: 'eigene' | 'eingekauft';
  leads: number;
  profile: number;
  /** Kosten netto in Euro. Bei eigenen Quellen anteilig aus dem Werbebudget. */
  kosten: number;
  /** Bei eingekauften Quellen: Stueckpreis; null, wenn keiner hinterlegt ist. */
  preis: number | null;
  jeLead: number | null;
  jeProfil: number | null;
};

export const istEingekauft = (source?: string | null) =>
  String(source ?? '').toLowerCase().startsWith('portal:');

/**
 * Quellen zusammenfassen, die dasselbe bedeuten.
 *
 * `rechner` und `rechner:kosten-berechnen` sind nur die beiden Fassungen des
 * laufenden A/B-Tests — dieselbe Seite unter derselben Adresse. Fuer die
 * Kostenbetrachtung sind sie EIN Kanal (Martin, 06.09.2026: „die a/B varianten
 * musst du nicht trennen"). Der Test selbst wird woanders ausgewertet, dort
 * zaehlt die Quote, nicht die Stueckzahl.
 *
 * Portale werden NICHT zusammengefasst — sie einzeln bewerten zu koennen war
 * der Anlass fuer die Seite.
 */
export function quellenSchluessel(source?: string | null): string {
  const s = String(source ?? '').trim();
  if (!s) return 'unbekannt';
  if (istEingekauft(s)) return s.toLowerCase();
  if (s === 'rechner' || s.startsWith('rechner:')) return 'rechner';
  if (s === 'pria-chat' || s.startsWith('chat:')) return 'chat';
  if (s.startsWith('website:')) return 'website';
  return s;
}

/** Lesbarer Name je zusammengefasster Quelle. */
export function quellenName(schluessel: string): string {
  if (istEingekauft(schluessel)) {
    const d = schluessel.slice('portal:'.length);
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  if (schluessel === 'chat') return 'Pria-Chat';
  if (schluessel === 'website') return 'Primundus.de';
  if (schluessel === 'rechner') return 'Kostenrechner';
  return schluessel || 'unbekannt';
}

const teile = (zaehler: number, nenner: number) => (nenner > 0 ? zaehler / nenner : null);

/**
 * Eine Zeile je Quelle.
 *
 * Die Werbeausgaben lassen sich nicht je eigener Quelle messen (eine Anzeige
 * fuehrt auf die Seite, nicht auf „Formular" oder „Chat"). Sie werden deshalb
 * NACH LEAD-ANTEIL auf die eigenen Quellen verteilt und der Anteil ist als
 * solcher gekennzeichnet — geschaetzt ist ehrlicher als so zu tun, als waere
 * es gemessen.
 */
export function quellenAuswertung(
  leads: Lead[],
  profileJeLeadId: Set<string>,
  werbekosten: number,
): { zeilen: QuellenZeile[]; ohnePreis: string[] } {
  const echte = leads.filter((l) => !l.ist_test);
  const gruppen = new Map<string, { leads: number; profile: number }>();
  for (const l of echte) {
    const key = quellenSchluessel(l.source);
    const g = gruppen.get(key) ?? { leads: 0, profile: 0 };
    g.leads++;
    if (profileJeLeadId.has(l.id)) g.profile++;
    gruppen.set(key, g);
  }

  const eigeneLeads = echte.filter((l) => !istEingekauft(l.source)).length;
  const ohnePreis = new Set<string>();

  const zeilen: QuellenZeile[] = Array.from(gruppen.entries()).map(([key, g]) => {
    const eingekauft = istEingekauft(key);
    const preis = eingekauft ? (PORTAL_PREISE[key.slice('portal:'.length).toLowerCase()] ?? null) : null;
    if (eingekauft && preis === null) ohnePreis.add(key.slice('portal:'.length));
    const kosten = eingekauft
      ? (preis ?? 0) * g.leads
      // Werbebudget anteilig nach Leads auf die eigenen Quellen.
      : (eigeneLeads > 0 ? (werbekosten * g.leads) / eigeneLeads : 0);
    return {
      key,
      name: quellenName(key),
      gruppe: eingekauft ? 'eingekauft' : 'eigene',
      leads: g.leads,
      profile: g.profile,
      kosten: Math.round(kosten * 100) / 100,
      preis,
      jeLead: teile(kosten, g.leads),
      jeProfil: teile(kosten, g.profile),
    };
  });

  zeilen.sort((a, b) => (a.gruppe === b.gruppe ? b.leads - a.leads : a.gruppe === 'eigene' ? -1 : 1));
  return { zeilen, ohnePreis: Array.from(ohnePreis) };
}

/** Summe einer Gruppe — dieselbe Rechnung wie in der Zeile, nur zusammengefasst. */
export function gruppenSumme(zeilen: QuellenZeile[], gruppe?: 'eigene' | 'eingekauft') {
  const rel = gruppe ? zeilen.filter((z) => z.gruppe === gruppe) : zeilen;
  const leads = rel.reduce((s, z) => s + z.leads, 0);
  const profile = rel.reduce((s, z) => s + z.profile, 0);
  const kosten = Math.round(rel.reduce((s, z) => s + z.kosten, 0) * 100) / 100;
  return { leads, profile, kosten, jeLead: teile(kosten, leads), jeProfil: teile(kosten, profile) };
}
