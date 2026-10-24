// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau): alle sichtbaren Texte an EINER Stelle.
//
// Endwortlaut: seo-reports/analysen/gebucht-seite-2026-10-15/texte_final.md, Nachtrag 3 (15.10. spät, „Karte B mit
// Schritten", N3.1–N3.12). Martin zum Bild aufgaben_390.png (Zustand AD): „finde ich super" — dessen Texte sind
// freigegeben (Marke „frei") und hier Zeichen für Zeichen übernommen. „live", „Mail" ebenso Zeichen für Zeichen.
// NEU R6 / R6b (OpenAI Runde 6 + Nachprüfung 6b, stop-slop) und ältere NEU-Texte: Martins Freigabe offen.
// Daten kommen immer als Argument — hier steht kein Datum, kein Name und keine Nummer.
// Dieses Modul hängt von keiner Zustandslogik ab (lib/gebuchtStand.ts importiert von hier, nicht umgekehrt).
import { formatJobDate } from './mamamia/leadJobs';

const NBSP = ' ';
/** Geschützter Bindestrich: „E‑Mail" bricht nie um (Portalregel Registry #91). */
const NB_BINDESTRICH = '‑';

/** Wortlaut-Konstanten. Kommentar = Marke aus texte_final.md, Nachtrag 3. */
export const GEBUCHT_TEXTE = {
  // ─── Einsatz-Karte (N3.1) ───
  ihrEinsatz: 'Ihr Einsatz', // frei 15.10. abends (Kopfleiste, h1)
  etikett: {
    gebucht: 'Gebucht', // frei 15.10. abends (AD); VO, VV, AF NEU R6
    heuteGeplant: 'Anreise heute geplant', // Wortlaut NEU R1/R2, Rolle R6b
    endetBald: 'Endet bald', // NEU R4b
    endetHeute: 'Endet heute', // NEU R4b
    beendet: 'Beendet', // NEU R4
  },
  ihrePflegekraft: 'Ihre Pflegekraft', // frei 15.10. abends
  profilAria: (pk: string) => `Profil von ${pk} ansehen`, // live (PflegekraftZeile), nur Screenreader
  profilAriaOhneName: 'Profil ansehen', // live („Profil ansehen ›", PflegekraftProfil), nur Screenreader
  anreise: 'Anreise', // frei (Spalte, Versalien per CSS)
  abreise: 'Abreise', // frei (Spalte, Versalien per CSS)
  geplant: 'geplant', // frei
  tagessatz: 'Tagessatz', // frei
  proTag: `${NBSP}/${NBSP}Tag`, // frei (live AppCard.tsx:56)
  kostenuebersicht: 'Kostenübersicht', // frei (Pfeil als Symbol)
  kostenGrundlage: 'Grundlage: Ihr Tagessatz und die angegebenen Daten für Anreise und Abreise.', // NEU R3b (T3b)

  // ─── Schritte (N3.4) ───
  soGehtEsWeiter: 'So geht es weiter', // frei 15.10. abends
  ihreUnterlagen: 'Ihre Unterlagen', // live (Fassung 34), Rolle NEU R6: Titel, wenn kein Schritt offen ist

  vertragUnterschrieben: 'Vertrag unterschrieben', // frei 15.10. abends
  vertragAm: (datum: string) => `am${NBSP}${datum}`, // frei 15.10. abends
  /** „·" hängt per geschütztem Leerzeichen am Datum, keine Zeile beginnt mit „·" (N3.10). */
  trenner: `${NBSP}· `, // frei
  vertragPdf: 'Vertrag als PDF', // frei 15.10. abends (Link)
  vertragPdfAria: 'Vertrag als PDF ansehen, öffnet in einem neuen Fenster', // NEU R2/2b, nur Screenreader
  vertragRueckfall: 'Unterschriebenen Vertrag ansehen →', // live (BookedScreen), nur ohne PDF-Link
  vertragFrueher: 'Vertrag aus früherer Buchung', // R6b (R6-11)
  unterschriebenAm: (datum: string) => `unterschrieben am${NBSP}${datum}`, // NEU R1/R2 (R6-11)
  vertragUnterschreiben: 'Vertrag unterschreiben', // NEU R6 (R6-3)
  vertragKnopf: 'Vertrag jetzt abschließen →', // live (BookedScreen)
  vertragVorbereitung: 'Vertrag in Vorbereitung', // NEU R6 (R6-4)
  vvSatz: `Wir bereiten Ihre Vertragsdokumente vor. Marta${NBSP}Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen.`, // frei (Fassung 35, live)

  anreiseAbgestimmt: 'Anreise wird abgestimmt', // NEU R6 (R6-5)
  anreiseBesprechen: `Marta${NBSP}Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.`, // frei (#116, Satz 2)
  warteSatz1: 'Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.', // NEU R1/R2
  warteSatz2: `Dann bekommen Sie auch eine E${NB_BINDESTRICH}Mail.`, // NEU R1/R2, Zeichen T6a
  anreiseOrganisiert: 'Anreise organisiert', // frei 15.10. abends
  ankunft: 'Ankunft', // frei (Mail)
  verkehrsmittel: 'Verkehrsmittel', // frei (Mail)
  adresse: 'Adresse', // frei (Mail)
  hierhinGebracht: (vorname: string) => `Hierhin wird ${vorname} gebracht.`, // frei (Mail)
  hierhinSelbst: (vorname: string) => `Hierhin reist ${vorname} selbst an.`, // Mail
  stimmtNicht: 'Stimmt eine Angabe nicht, sagen Sie uns bitte Bescheid.', // frei 15.10. abends
  anreisedaten: 'Anreisedaten', // live (BookedScreen „Als Nächstes"), Rolle R6b
  anreiseHeuteOffen: 'Uhrzeit und Verkehrsmittel stehen hier nicht. Rufen Sie uns bitte an, falls Ihnen diese Angaben fehlen.', // R6b (R6-6)

  nachDerAnreise: 'Nach der Anreise', // frei 15.10. abends
  nachSatz: 'Wir melden uns bei Ihnen und fragen nach, ob alles gut klappt.', // frei 15.10. abends

  heute: 'heute', // NEU R6 (nur „Folgeeinsatz ab heute", R6-10)
  folgeAb: (tag: string) => `Folgeeinsatz ab ${tag}`, // frei 15.10. abends
  folgeSucht: 'Für den Folgeeinsatz suchen wir eine Pflegekraft für Sie.', // frei 15.10. abends
  folgeGebucht: (name: string) => `Für den Folgeeinsatz ist ${name} gebucht.`, // NEU R6 (R6-7)
  folgeGebuchtOhneName: 'Für den Folgeeinsatz ist eine Pflegekraft gebucht.', // NEU R6 (R6-7)
  bewerbungenAnsehen: (n: number) => `${n}${NBSP}${n === 1 ? 'Bewerbung' : 'Bewerbungen'} ansehen${NBSP}›`, // NEU R6 (R6-9)
  // Martin 24.10.: Vor der Anlage gibt es nichts einzuladen. Der Schritt sagt, wann wir den Folgeeinsatz anlegen; erst
  // danach steht er mit Datum da und führt per Link in diesen Einsatz. Zeitpunkt gemessen (Prod, n=60): Median 33 Tage
  // vor dem Ende, mittlere Hälfte 17–57 Tage. NEU R7 (Freigabe offen).
  folgeTitel: 'Folgeeinsatz', // NEU R7
  folgeNochNicht: 'Wir legen den Folgeeinsatz normalerweise einige Wochen vor dem Ende dieses Einsatzes an, oft etwa einen Monat vorher. Danach sehen Sie ihn hier und können Pflegekräfte einladen. Außerdem suchen wir selbst eine passende Pflegekraft für Sie.', // NEU R7 (OpenAI R7 A)
  /** Ab „endet bald" (14 Tage) ohne angelegten Folgeeinsatz: kein Versprechen, ob es weitergeht, nur der Weg (OpenAI R7, Frage 2). */
  folgeBaldOhne: 'Wenn Sie eine weitere Betreuung wünschen und hier noch kein Folgeeinsatz steht, melden Sie sich bitte bei uns.', // NEU R7
  zumFolgeeinsatz: `Zum Folgeeinsatz wechseln${NBSP}›`, // NEU R7 (ersetzt „Folgeeinsatz ansehen ›" und „Pflegekräfte einladen ›")

  // ─── Nur im beendeten Einsatz mit neuerem Einsatz (N3.5 „B mit neuerem Einsatz") ───
  aktuellerEinsatz: 'Ihr aktueller Einsatz', // NEU R1/R2
  naechsterEinsatz: 'Ihr nächster Einsatz', // NEU R1/R2
  bewerbungen: (n: number) => `${n} ${n === 1 ? 'Bewerbung' : 'Bewerbungen'}`, // live (Einsatzübersicht)
  sucheOhneBewerbung: 'Suchlauf läuft — noch keine Bewerbungen', // live (Einsatzübersicht), unverändert
} as const;

// ─── Kopie aus der Anreise-Mail (Registry #119) ───────────────────────────────
// SYNC: project 3/supabase/functions/send-scheduled-emails/kundenMails.ts (VERKEHRSMITTEL, anreiseDatum, anreiseZeit).
// Die Edge Function kann nichts aus src/ importieren; Test `gebuchtTexte.test.ts` vergleicht beide Ausgaben.

/** Wörter für die drei Verkehrsmittel aus mamamia. Unbekannte Werte erscheinen so, wie mamamia sie liefert. */
export const VERKEHRSMITTEL: Record<string, string> = {
  'Minibus': 'Minibus',
  'Sindbad': 'Reisebus (Sindbad)',
  'Own transport': 'Eigene Anreise',
};

/** „2026-10-12" → „Montag, 12.10.2026" (Wochentag aus dem Kalendertag, nicht aus einer Uhrzeit). */
export function anreiseDatum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const tag = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(j, m - 1, t)));
  return `${tag}, ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** „14:00"/„18:00" → „14–18 Uhr", „14:30" bleibt, ohne Ende „ab 14 Uhr". */
export function anreiseZeit(von: string, bis: string | null): string {
  const u = (t: string) => (t.slice(3, 5) === '00' ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3, 5)}`);
  if (!bis) return `ab ${u(von)} Uhr`;
  if (bis === von) return `${u(von)} Uhr`;
  return `${u(von)}–${u(bis)} Uhr`;
}

// ─── Eigene Formate ────────────────────────────────────────────────────────────

/** „2026-10-12" → „12.10.2026" (wie die Einsatzübersicht). */
export function datumKurz(iso: string): string {
  return formatJobDate(iso);
}

/** Name mit geschütztem Leerzeichen („Maria K."), damit er nie mitten im Namen umbricht. */
export function nameFest(name: string): string {
  return name.trim().replace(/\s+/g, NBSP);
}

/** Ein Tag des Einsatzes in Teilen (Spalten der Karte) und als Text (Titel „Folgeeinsatz ab …"). */
export interface EinsatzTag {
  iso: string;
  /** „Montag" */
  wochentag: string;
  /** „19.10." */
  datum: string;
  /** „2026" nur nach der Jahr-Regel (N3.2, Regel 4), sonst null */
  jahr: string | null;
  /** „Montag, 19.10." bzw. „Montag, 31.12.2026" (bricht nie im Datum um) */
  text: string;
}

export function einsatzTag(iso: string, mitJahr: boolean): EinsatzTag {
  const [wochentag, voll] = anreiseDatum(iso).split(', '); // „Montag", „19.10.2026"
  const datum = voll.slice(0, 6);
  const jahr = mitJahr ? voll.slice(6) : null;
  return { iso, wochentag, datum, jahr, text: `${wochentag},${NBSP}${datum}${jahr ?? ''}` };
}
