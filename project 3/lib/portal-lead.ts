/* ─── Eingekaufte Leads: aus Portal-Angaben eine Kalkulation machen ──────
 *
 * Ein Lead aus unserem eigenen Kostenrechner hat alle neun Antworten, weil
 * der Kunde sie geklickt hat. Ein bei Pflegehilfe.org oder Pflegebund.eu
 * eingekaufter Lead hat davon nur einen Teil — den Rest muessen wir
 * annehmen, sonst gibt es keinen Preis und damit keine Mail.
 *
 * REGEL (Martin 30.08.): im Zweifel den teureren Wert. Ein Preis, der
 * spaeter faellt, weil der Kunde im Portal korrigiert, ist eine gute
 * Nachricht. Ein Preis, der steigt, ist ein Vertrauensschaden — und zwar
 * genau bei jemandem, der uns noch nicht kennt.
 *
 * Die Auswahl ist datengetrieben, nicht fest verdrahtet: welcher Wert der
 * teuerste ist, steht in pricing_config und darf sich dort aendern, ohne
 * dass jemand daran denken muss, diese Datei nachzuziehen.
 */

import type { FormularDaten } from './calculation';

/** Was ein Portal liefern KANN — alles optional. */
export type PortalAngaben = Partial<FormularDaten>;

/** Eine Zeile aus pricing_config, so viel wie wir hier brauchen. */
export interface PreisZeile {
  kategorie: string;
  antwort_key: string;
  aufschlag_euro: number;
}

/* Pflichtfelder der Kalkulation. fuehrerschein/geschlecht sind optional
 * (berechnePreis laesst sie weg, wenn leer) — die raten wir NICHT: ein
 * Aufschlag fuer einen Wunsch, den der Kunde nie geaeussert hat, waere
 * teuer ohne Gegenwert. */
const ZU_ERGAENZEN = [
  'betreuung_fuer',
  'weitere_personen',
  'mobilitaet',
  'nachteinsaetze',
  'deutschkenntnisse',
  'erfahrung',
] as const;

export interface ErgaenzungsErgebnis {
  daten: FormularDaten;
  /** Welche Felder WIR gesetzt haben — gehoert in den Lead-Nachweis. */
  angenommen: string[];
}

/**
 * Fuellt die Luecken. Rein und ohne DB, damit nachvollziehbar bleibt,
 * welcher Wert warum gewaehlt wurde.
 */
export function ergaenzeAngaben(
  teil: PortalAngaben,
  preistabelle: PreisZeile[],
): ErgaenzungsErgebnis {
  const angenommen: string[] = [];

  const teuerster = (kategorie: string): string | null => {
    const zeilen = preistabelle.filter((z) => z.kategorie === kategorie);
    if (zeilen.length === 0) return null;
    return zeilen.reduce((a, b) => (b.aufschlag_euro > a.aufschlag_euro ? b : a)).antwort_key;
  };

  const daten: any = {};

  for (const feld of ZU_ERGAENZEN) {
    const vorhanden = (teil as any)[feld];
    if (typeof vorhanden === 'string' && vorhanden.trim()) {
      daten[feld] = vorhanden;
      continue;
    }
    const gewaehlt = teuerster(feld);
    if (gewaehlt) {
      daten[feld] = gewaehlt;
      angenommen.push(feld);
    }
  }

  /* Pflegegrad ist der einzige Wert, bei dem "teuerster Aufschlag" die
   * FALSCHE Richtung waere: ein hoeherer Grad kostet zwar mehr, bringt
   * aber Pflegegeld und Entlastungsbudget — unterm Strich sinkt der
   * Eigenanteil, den der Kunde in der Mail sieht. Ohne Angabe deshalb 0:
   * keine Zuschuesse, hoechster Eigenanteil, und die Mail schreibt
   * "Nicht angegeben" statt einer erfundenen Zahl.
   *
   * Ein EXPLIZITES 0 ("Keinen", pflege-helfer24) ist eine Kundenangabe und
   * gehoert NICHT in `angenommen` — sonst behauptet Mail 1 "vorsichtig
   * angenommen" bei etwas, das der Kunde selbst gesagt hat (Klasse
   * Registry #13e: 0 ist falsy). */
  const roh = teil.pflegegrad as unknown;
  const grad = roh === undefined || roh === null || roh === '' ? NaN : Number(roh);
  if (Number.isFinite(grad) && grad >= 0) {
    daten.pflegegrad = grad;
  } else {
    daten.pflegegrad = 0;
    angenommen.push('pflegegrad');
  }

  // Nur uebernehmen, wenn das Portal sie liefert — nie raten.
  if (teil.fuehrerschein) daten.fuehrerschein = teil.fuehrerschein;
  if (teil.geschlecht) daten.geschlecht = teil.geschlecht;

  return { daten: daten as FormularDaten, angenommen };
}

/* ─── Herkunft im Admin ──────────────────────────────────────────────────
 *
 * leads.source ist "rechner" (Formular), "pria-chat" oder
 * "portal:<domain>" fuer eingekaufte Leads. Die beiden Welten gehoeren
 * getrennt betrachtet: eigene Anfragen kosten nichts und kommen von
 * jemandem, der uns gesucht hat. Eingekaufte haben Geld gekostet, sind
 * zeitkritisch (die Portale liefern an bis zu drei Anbieter) und ihre
 * Abschlussquote entscheidet, ob sich die Quelle rechnet.
 */

/* Die Portale, bei denen wir einkaufen — EINE Liste fuer alle, die sie
 * brauchen: der Eingang (api/portal-lead) laesst nur diese zu, der
 * Abholer holt genau diese Postfaecher, der Admin zeigt genau diese
 * Reiter. Ein neues Portal steht damit an einer Stelle statt an dreien.
 *
 * (Die Edge Function hat eine eigene Liste in herkunft.ts — Deno und die
 * Next-App koennen keinen Code teilen. Beide zusammen pflegen.)
 *
 * Der Anzeigename traegt hier die volle Domain: im Admin unterscheidet
 * sie die Quellen eindeutig, und intern verlinkt nichts. In der KUNDEN-
 * mail steht er ohne TLD (herkunft.ts) — dort machte Apple Mail einen
 * Link daraus und schickte den Kunden zurueck zum Portal.
 *
 * `abholung` sagt dem Abholer, WOHER die Leads kommen: 'imap' = Postfach
 * (Zugang <PRAEFIX>_USER/_PASS), 'api' = Partner-API des Portals
 * (lib/portal-helfer24.ts, Token PFLEGEHELFER24_API_TOKEN). */
export const PORTALE = [
  { domain: 'pflegehilfe.org', name: 'Pflegehilfe.org', abholung: 'imap' },
  { domain: 'pflegebund.eu', name: 'Pflegebund.eu', abholung: 'imap' },
  { domain: 'pflege-helfer24.de', name: 'Pflege-Helfer24.de', abholung: 'api' },
] as const;

export type PortalAbholung = (typeof PORTALE)[number]['abholung'];

/** Die source-Werte aller Portale — "portal:pflegehilfe.org", ... */
export const PORTAL_QUELLEN = PORTALE.map((p) => `portal:${p.domain}`);

export function istEingekauft(source?: string | null): boolean {
  return typeof source === 'string' && source.toLowerCase().startsWith('portal:');
}

/** Anzeigename fuer den Reiter: "portal:pflegebund.eu" → "Pflegebund.eu". */
export function quellenName(source?: string | null): string {
  if (!source) return 'Kostenrechner';
  if (!istEingekauft(source)) {
    if (source === 'pria-chat' || source.startsWith('chat:')) return 'Pria-Chat';
    if (source.startsWith('website:')) return 'Primundus.de';
    return 'Kostenrechner';
  }
  const domain = source.slice('portal:'.length).toLowerCase();
  const bekannt = PORTALE.find((p) => p.domain === domain);
  if (bekannt) return bekannt.name;
  /* Unbekanntes Portal: der Wert steht so in der Datenbank, also zeigen
     wir ihn — lieber ein roher Domainname im Admin als ein Lead, der
     unter keinem Reiter auftaucht. */
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

/* Die Reiter der Admin-Lead-Liste. Jedes Portal bekommt seinen Reiter,
   AUCH ohne Leads (Martin 01.09.): ein leerer Reiter mit "0" ist die
   Antwort auf "kommt da eigentlich was an?" — ein fehlender Reiter laesst
   offen, ob nichts ankam oder der Abholer steht. Gerade beim
   Scharfschalten die wichtigere Auskunft.

   Dazu kommt, was in den Daten steht, aber nicht in der Liste: ein Lead
   aus einem inzwischen entfernten Portal soll nicht unsichtbar unter
   "Alle" verschwinden.

   Lebt hier (nicht in der Seite), damit der Test dieselbe Funktion prueft,
   die im Admin laeuft — nicht eine Kopie, die driften kann. */
export function reiterFuer(
  leads: Array<{ source?: string | null }>,
): Array<{ key: string; label: string; anzahl: number }> {
  const quellen = Array.from(
    new Set([
      ...PORTAL_QUELLEN,
      ...leads.map((l) => l.source).filter((s): s is string => istEingekauft(s)),
    ]),
  ).sort();
  const zaehle = (pruefe: (l: { source?: string | null }) => boolean) =>
    leads.filter(pruefe).length;
  return [
    { key: 'all', label: 'Alle', anzahl: leads.length },
    { key: 'eigene', label: 'Eigene Anfragen', anzahl: zaehle((l) => !istEingekauft(l.source)) },
    ...quellen.map((q) => ({ key: q, label: quellenName(q), anzahl: zaehle((l) => l.source === q) })),
  ];
}
