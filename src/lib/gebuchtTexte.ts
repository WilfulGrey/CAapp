// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau): alle sichtbaren Texte an EINER Stelle.
//
// Endwortlaut: seo-reports/analysen/gebucht-seite-2026-10-15/texte_final.md (zwei OpenAI-Runden + Nachprüfung 2b,
// stop-slop) und dessen Nachtrag vom 15.10. (Runde 3 + 3b, Marken „NEU R3"/„NEU R3b", Nummern T1–T6). NEU-Texte: Martins
// Freigabe offen. „frei", „live", „Mail" und „geprüft" Zeichen für Zeichen übernommen.
// Daten kommen immer als Argument — hier steht kein Datum, kein Name und keine Nummer.
import { formatJobDate } from './mamamia/leadJobs';
import { isoTag, vertragTag, type EinsatzZeile, type GebuchtStand } from './gebuchtStand';

const NBSP = '\u00a0';
/** Geschützter Bindestrich: „E‑Mail" bricht nie um (Portalregel Registry #91). */
const NB_BINDESTRICH = '\u2011';

/** Satzende: Das Datum „26.10.“ schließt den Satz schon mit seinem Punkt (kein „26.10..“). */
function mitPunkt(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

/** Wortlaut-Konstanten. Kommentar = Marke aus texte_final.md. */
export const GEBUCHT_TEXTE = {
  // 1. Status oben
  voH1: 'Buchung bestätigt', // NEU R3 (T1a, Wortlaut der Mail C)
  voSatz: 'Bitte schließen Sie noch Ihren Betreuungsvertrag ab.', // live (T1b, BookedScreen.tsx:93/191)
  anreiseH1: (tag: string) => `Anreise am ${tag}`, // NEU R1/R2 (VV, AF)
  vvSatz: `Wir bereiten Ihre Vertragsdokumente vor. Marta${NBSP}Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen.`, // frei (Fassung 35, live)
  afSatz: `Ihr Vertrag ist unterschrieben. Marta${NBSP}Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.`, // frei (#116)
  reistAn: (pk: string, tag: string) => `${pk} reist am ${tag} an`, // NEU R1/R2 (AD)
  reistHeuteAn: (pk: string) => `${pk} reist heute an`, // NEU R1/R2 (AT mit Daten)
  anreiseSatz: 'Wir haben die Anreise Ihrer Pflegekraft organisiert.', // Mail (Satzanfang groß)
  anreiseHeuteGeplant: 'Anreise heute geplant', // NEU R1/R2 (AT ohne Daten)
  gebuchtBis: (tag: string) => `Gebuchter Einsatz bis ${tag}`, // NEU R2/2b (L)
  uebernimmtAb: (folge: string, tag: string) => `${folge} übernimmt ab ${tag}`, // NEU R2/2b (EB, Folgekraft gebucht)
  uebernimmtHeute: (folge: string) => `${folge} übernimmt ab heute`, // NEU R2/2b
  ebFolgeSatz: (folge: string, pk: string, tag: string) =>
    `${folge} ist Ihre nächste Pflegekraft. Der Einsatz von ${pk} endet am ${mitPunkt(tag)}`, // NEU R2/2b
  ebFolgeSatzOhneJetzigenNamen: (folge: string, tag: string) =>
    `${folge} ist Ihre nächste Pflegekraft. Der Einsatz Ihrer jetzigen Pflegekraft endet am ${mitPunkt(tag)}`, // NEU R3 (T2)
  ebFolgeOhneName: (tag: string) => `Ihre nächste Pflegekraft übernimmt ab ${mitPunkt(tag)}`, // NEU 2b
  endetAm: (tag: string) => `Einsatz endet am ${tag}`, // NEU R2/2b (EB)
  endetHeute: 'Einsatz endet heute', // NEU R2/2b
  ebSucheSatz: 'Für die Zeit danach suchen wir eine Pflegekraft für Sie.', // NEU R1/R2
  beendetH1: 'Einsatz beendet', // live (Fassung 34)
  beendetSatz: (von: string, bis: string) =>
    `Der Einsatz vom ${von} bis ${bis} ist abgeschlossen. Ihre Unterlagen bleiben jederzeit zugänglich.`, // live (Fassung 34)
  aktuellerEinsatz: 'Ihr aktueller Einsatz', // NEU R1/R2
  naechsterEinsatz: 'Ihr nächster Einsatz', // NEU R1/R2

  // Hinweiszeile T5 (nur L und EB, Folgeeinsatz „geplant" mit Bewerbungen), Ziel wie „Bewerbungen ansehen".
  folgeHinweis: (n: number) =>
    `Folgeeinsatz: ${n}${NBSP}${n === 1 ? 'Bewerbung' : 'Bewerbungen'} ansehen${NBSP}›`, // NEU R3 (T5)
  /** Rückfall, falls die Zeile nur zum Abschnitt springt (Vorschau `&folgezeile=sprung`). */
  folgeHinweisSprung: (n: number) =>
    `${n}${NBSP}${n === 1 ? 'Bewerbung' : 'Bewerbungen'} für Ihren Folgeeinsatz${NBSP}›`, // NEU R3 (T5 Rückfall, vorgelegt)

  // 2. Vertragsknopf
  vertragKnopf: 'Vertrag jetzt abschließen →', // live

  // 3. Karte „Ihr Einsatz"
  /** Unsichtbare H1, wenn kein Datum belegt ist. */
  seiteOhneDatum: 'Ihr Einsatz', // NEU R1/R2
  /** Name der Karte für Screenreader; anders als die unsichtbare H1 (Gegenprüfung 15.10.). Nicht sichtbar. */
  kartenAria: (pk: string) => `Ihr Einsatz mit ${pk}`, // NEU, nur Screenreader, Freigabe offen
  kartenAriaOhneName: 'Ihr Einsatz mit Ihrer Pflegekraft', // NEU, nur Screenreader, Freigabe offen
  ihrePflegekraft: 'Ihre Pflegekraft', // Martin 15.10.
  profilAria: (pk: string) => `Profil von ${pk} ansehen`, // live (PflegekraftZeile)
  profilAriaOhneName: 'Profil ansehen', // live („Profil ansehen ›", PflegekraftProfil)
  anreise: 'Anreise', // live
  geplant: 'geplant', // NEU R1/R2
  warteSatz1: 'Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.', // NEU R1/R2
  warteSatz2: `Dann bekommen Sie auch eine E${NB_BINDESTRICH}Mail.`, // NEU R1/R2, Zeichen T6a
  ankunft: 'Ankunft', // Mail
  verkehrsmittel: 'Verkehrsmittel', // Mail
  adresse: 'Adresse', // Mail
  hierhinGebracht: (vorname: string) => `Hierhin wird ${vorname} gebracht.`, // Mail
  hierhinSelbst: (vorname: string) => `Hierhin reist ${vorname} selbst an.`, // Mail
  abreise: 'Abreise', // live
  tagessatz: 'Tagessatz', // live (AppCard.tsx:55)
  proTag: `${NBSP}/${NBSP}Tag`, // live (AppCard.tsx:56)
  reisekosten: 'Anreise und Abreise pauschal je 125 €.', // live (FaqListe.tsx:57)
  kostenQuelle: (datum: string) => `Laut Ihrem Vertrag vom ${datum}`, // NEU R1/R2, Lage T3a: direkt unter dem Tagessatz
  kostenAuf: 'Alle Kosten im Überblick', // live (EinstiegVorSpeichern.tsx:170)
  kostenZu: 'Weniger anzeigen', // live (EinstiegVorSpeichern.tsx:170)
  kostenGrundlage: 'Grundlage: Ihr Tagessatz und die angegebenen Daten für Anreise und Abreise.', // NEU R3b (T3b)

  // 4. Satz unter der Karte (AD, AT mit Anreise-Eintrag)
  unterKarte:
    'Stimmt eine Angabe nicht, sagen Sie uns bitte Bescheid. Nach der Anreise melden wir uns bei Ihnen und fragen nach, ob alles gut klappt.', // NEU R1/R2

  // 5. Kontakt (Überschrift; der Rest kommt aus GebuchtKontakt.tsx / KONTAKT_TEXTE)
  kontaktA: 'Ihr Kontakt zur Agentur', // Martin 15.10. (bleibt im Bau, bis Martin wählt)
  kontaktB: 'Ihr Kontakt zu Primundus', // NEU R1/R2 (Empfehlung)

  // 6. Folgeeinsatz
  folgeeinsatz: 'Folgeeinsatz', // NEU R1/R2 (Martins Wort)
  bewerbungen: (n: number) => `${n} ${n === 1 ? 'Bewerbung' : 'Bewerbungen'}`, // live (Einsatzübersicht)
  sucheOhneBewerbung: 'Suchlauf läuft — noch keine Bewerbungen', // live (Einsatzübersicht)
  bewerbungenAnsehen: 'Bewerbungen ansehen', // NEU R1/R2
  einladen: `Pflegekräfte einladen${NBSP}›`, // live (KompaktEinstieg.tsx:394 `{EINLADEN_TITEL}&nbsp;›`), Zeichen T6c

  // 7. Ihre Unterlagen
  unterlagen: 'Ihre Unterlagen', // live (Fassung 34)
  dokument: 'Dienstleistungsvertrag', // live
  dokumentFrueher: 'Dienstleistungsvertrag zur früheren Buchung', // NEU R3b (T4a, nur Vertragsstand „anderer")
  unterschriebenAm: (datum: string) => `unterschrieben am ${datum}`, // NEU R1/R2
  unterschriebenMitBeginn: (datum: string, beginn: string) =>
    `unterschrieben am ${datum}, Vertragsbeginn ${beginn}`, // NEU R3 (T4b, nur Vertragsstand „anderer")
  vertragPdf: 'Vertrag ansehen (PDF)', // NEU R1/R2
  vertragPdfAria: 'Vertrag als PDF ansehen, öffnet in einem neuen Fenster', // NEU R2/2b
  kopieMail: `Eine Kopie haben Sie auch per E${NB_BINDESTRICH}Mail erhalten.`, // live, Zeichen T6b
  vertragRueckfall: 'Unterschriebenen Vertrag ansehen →', // live
  alleEinsaetze: `Alle meine Einsätze${NBSP}›`, // live (ohne „←"), Zeichen T6d
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

/** H1-Datum ohne Jahr, Wochentag und Datum mit geschütztem Leerzeichen: „Montag,\u00a019.10.". */
export function h1Tag(iso: string): string {
  const voll = anreiseDatum(iso); // „Montag, 19.10.2026"
  const [wochentag, datum] = voll.split(', ');
  return `${wochentag},${NBSP}${datum.slice(0, 6)}`;
}

/** „2026-10-12" → „12.10.2026" (wie die Einsatzübersicht). */
export function datumKurz(iso: string): string {
  return formatJobDate(iso);
}

/**
 * Vertragsdatum für „unterschrieben am", „Laut Ihrem Vertrag vom" und „Vertragsbeginn": „12.10.2026", Berliner Tag
 * (`vertragTag`, Registry #20). `contract_snapshot.datum`/`.vertragsbeginn` kommen schon als „dd.mm.yyyy", `accepted_at`
 * als Zeitstempel. Unlesbar ⇒ null (dann entfällt die Angabe, nichts geraten).
 */
export function vertragDatum(wert: string | null | undefined): string | null {
  const tag = vertragTag(wert);
  return tag ? formatJobDate(tag) : null;
}

/** Name mit geschütztem Leerzeichen („Maria\u00a0K."), damit die H1 nicht mitten im Namen umbricht. */
export function nameFest(name: string): string {
  return name.trim().replace(/\s+/g, NBSP);
}

// ─── Status oben: H1 und Satz je Zustand (texte_final.md, Abschnitt 1) ────────

export interface StatusEingabe {
  stand: GebuchtStand;
  heute: string;
  /** Kurzname der Pflegekraft dieses Einsatzes („Maria K."), sonst null. */
  pflegekraft: string | null;
  /** Folgeeinsatz F (nur EB nutzt ihn für die H1). */
  folge: EinsatzZeile | null;
}

export interface StatusTexte {
  /** null = kein belegtes Datum für die H1; die Seite setzt dann nur eine unsichtbare Überschrift. */
  h1: string | null;
  satz: string | null;
}

/**
 * H1 und Satz je Zustand. Kein Name ⇒ „Ihre Pflegekraft" (am Satzanfang groß); im EB-Satz ohne Namen der jetzigen
 * Pflegekraft der eigene Satz T2. Kein Pronomen für die Pflegekraft (Nachtrag T1). Kein Datum ⇒ keine H1 mit erfundenem
 * Datum.
 */
export function statusTexte({ stand, heute, pflegekraft, folge }: StatusEingabe): StatusTexte {
  const T = GEBUCHT_TEXTE;
  const pk = pflegekraft ? nameFest(pflegekraft) : T.ihrePflegekraft;
  const an = stand.anreiseDatum;
  const ab = stand.abreiseDatum;
  switch (stand.zustand) {
    case 'VO':
      return { h1: T.voH1, satz: T.voSatz };
    case 'VV':
      return { h1: an ? T.anreiseH1(h1Tag(an)) : null, satz: T.vvSatz };
    case 'AF':
      return { h1: an ? T.anreiseH1(h1Tag(an)) : null, satz: T.afSatz };
    case 'AD':
      return { h1: an ? T.reistAn(pk, h1Tag(an)) : null, satz: T.anreiseSatz };
    case 'AT':
      return stand.mitAnreiseDaten
        ? { h1: T.reistHeuteAn(pk), satz: T.anreiseSatz }
        : { h1: T.anreiseHeuteGeplant, satz: null };
    case 'L':
      return { h1: ab ? T.gebuchtBis(h1Tag(ab)) : null, satz: null };
    case 'EB': {
      const endet = ab === heute ? T.endetHeute : ab ? T.endetAm(h1Tag(ab)) : null;
      const folgeAn = isoTag(folge?.anreise);
      if (folge && folge.status === 'gebucht' && folgeAn) {
        if (folge.pflegekraft && ab) {
          const name = nameFest(folge.pflegekraft);
          return {
            h1: folgeAn === heute ? T.uebernimmtHeute(name) : T.uebernimmtAb(name, h1Tag(folgeAn)),
            satz: pflegekraft
              ? T.ebFolgeSatz(name, nameFest(pflegekraft), h1Tag(ab))
              : T.ebFolgeSatzOhneJetzigenNamen(name, h1Tag(ab)),
          };
        }
        return { h1: endet, satz: T.ebFolgeOhneName(h1Tag(folgeAn)) };
      }
      if (folge && folge.status === 'geplant') return { h1: endet, satz: T.ebSucheSatz };
      return { h1: endet, satz: null };
    }
    case 'B':
      return { h1: T.beendetH1, satz: an && ab ? T.beendetSatz(datumKurz(an), datumKurz(ab)) : null };
  }
}
