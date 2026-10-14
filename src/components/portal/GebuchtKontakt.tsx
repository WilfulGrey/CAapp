// Kontaktbereich im Gebucht-Bildschirm. PROTOTYP 14.10.2026: nicht freigegeben, nicht live.
//
// Martin 14.10.2026: „Ich brauche bei einer akzeptierten Buchung einen Bereich oben mit einem Kontakt, eine Notruf-Rufnummer
// … Marta Kapcio oder Kollegen und diese Telefonnummer bitte melden, wenn es in dringenden Notfällen außerhalb auch der
// Geschäftszeiten." Geltung der Nummer (Martin 14.10., wörtlich freigegeben): „in dringenden Fällen jederzeit, vor allem
// außerhalb unserer Zeiten" — KEINE Uhrzeit-Beschränkung. Wortlaut der drei Varianten: seo-reports/analysen/
// gebucht-kontakt-2026-10-14/texte_final.md (Runde 3 + Nachprüfung 3b). Empfehlung V1. Ton (Memory erreichbarkeit-
// notfallnummer): Erreichbarkeit zuerst, die Notfallnummer als Absicherung, kein Dauer-Notfall-Klang.
//
// Die Notfallnummer steht NIRGENDS im Code: Repo und Portal-Bundle sind öffentlich. Sie kommt als Prop (später vom Server,
// nur für gebuchte Leads; in der Vorschau aus dem URL-Parameter &notfall=). Fehlt sie oder ist sie keine gültige
// polnische/deutsche Nummer (notfallTelHref → null), entfällt der ganze Notfallblock samt 112-Zeile — kein Ersatzwert,
// kein toter Knopf (Święta zasada 1). Einzige Ausnahme: der sichtbare Vorschau-Platzhalter NOTFALL_PLATZHALTER, der nur
// in ?preview=gebucht ohne &notfall= übergeben wird und als Text (ohne Link) erscheint.
// Bausteine: Personenzeile und runde Knöpfe aus MartaBox, Abschnitt mit Überschrift aus KompaktEinstieg. Der Notfallblock
// hat keinen eigenen runden Knopf: die sichtbare Nummer ist der Anruf-Link (leiser, Skeptiker-Befund Runde 1).
import type { ReactNode } from 'react';
import { ERREICHBAR, TELEFON, TELEFON_HREF } from '../../lib/kontakt';
import { MartaZeile } from './MartaBox';
import { AngebotAbschnitt } from './KompaktEinstieg';

export type KontaktVariante = 1 | 2 | 3;
/** Empfehlung aus texte_final.md (Runde 3): V1, ohne Überschrift, zwei gleich gebaute Zeilen. */
export const KONTAKT_EMPFEHLUNG: KontaktVariante = 1;
/** Was unten auf der Seite steht, wenn Marta schon im Kontaktbereich steht (Entscheidung 4). */
export type MartaUnten = 'marta' | 'siegel';
export const MARTA_UNTEN_STANDARD: MartaUnten = 'marta';
/** Wo der Bereich steht: oben unter der Einleitung (Standard) oder unter „Als Nächstes" (z. B. solange der Vertrag offen ist). */
export type KontaktPosition = 'oben' | 'unten';
export const KONTAKT_POSITION_STANDARD: KontaktPosition = 'oben';

/** Sichtbarer Platzhalter NUR für die Vorschau. Nie an echte Kunden. */
export const NOTFALL_PLATZHALTER = '[Notfallnummer]';

/** Martin 14.10.2026, wörtlich freigegeben. Nie umformulieren, nie um eine Uhrzeit ergänzen. */
export const NOTFALL_GELTUNG = 'in dringenden Fällen jederzeit, vor allem außerhalb unserer Zeiten';

/** Endwortlaut texte_final.md, „Für den Code". „täglich 8–20 Uhr" kommt immer aus ERREICHBAR. */
export const KONTAKT_TEXTE = {
  /** V1/V2: Bereichsname für Screenreader; V3: sichtbare h2. */
  bereich: 'So erreichen Sie uns',
  /** Unterzeile neben dem Foto (Wortlaut der Einleitung, Registry #116). */
  kollege: 'oder ein Kollege',
  /** V1/V3 */
  tagZeile: `Telefon und WhatsApp, ${ERREICHBAR}:`,
  /** V2 */
  v2Tag: `Bei Fragen erreichen Sie uns ${ERREICHBAR} per Telefon und WhatsApp:`,
  notfallName: 'Primundus-Notfallnummer',
  /** V1/V3 */
  notfallZeile: `Primundus-Notfallnummer, ${NOTFALL_GELTUNG}:`,
  /** V2 */
  v2Notfall: `Bitte melden Sie sich ${NOTFALL_GELTUNG}, unter der Primundus-Notfallnummer:`,
  hinweis112: 'Bei medizinischen Notfällen: 112',
  /** Screenreader der sichtbaren Tagesnummer („oder ein Kollege" steht daneben, daher nicht „Marta Kapcio anrufen"). */
  ariaTag: `Primundus anrufen: ${TELEFON}`,
} as const;

/** Screenreader der sichtbaren Notfallnummer. */
export function notfallAria(nummer: string): string {
  return `${KONTAKT_TEXTE.notfallName} anrufen: ${nummer.replace(/\s+/g, ' ').trim()}`;
}

/** Vorschau-Schalter `?kontakt=1|2|3`. Alles andere: Empfehlung. */
export function kontaktVarianteAusUrl(search: string): KontaktVariante {
  const wert = new URLSearchParams(search).get('kontakt');
  return wert === '1' ? 1 : wert === '2' ? 2 : wert === '3' ? 3 : KONTAKT_EMPFEHLUNG;
}

/** Vorschau-Schalter `?unten=marta|siegel`. Alles andere: Standard (Marta-Kasten wie heute). */
export function martaUntenAusUrl(search: string): MartaUnten {
  const wert = new URLSearchParams(search).get('unten');
  return wert === 'siegel' ? 'siegel' : wert === 'marta' ? 'marta' : MARTA_UNTEN_STANDARD;
}

/** Vorschau-Schalter `?kontaktpos=oben|unten`. Alles andere: oben. */
export function kontaktPositionAusUrl(search: string): KontaktPosition {
  return new URLSearchParams(search).get('kontaktpos') === 'unten' ? 'unten' : KONTAKT_POSITION_STANDARD;
}

/**
 * Vorschau-Schalter `?notfall=…` (NUR für ?preview=gebucht aufrufen): die Nummer kommt zur Laufzeit aus der URL, nie aus
 * dem Code. Ohne Parameter der sichtbare Platzhalter. URLSearchParams macht aus einem unkodierten „+" ein Leerzeichen;
 * „ 48 …" wird deshalb wieder zu „+48 …" (sonst fiele die Zeile in der Vorschau still weg).
 */
export function notfallAusVorschauUrl(search: string): string {
  const roh = new URLSearchParams(search).get('notfall');
  if (roh === null || !roh.trim()) return NOTFALL_PLATZHALTER;
  return (/^ \d/.test(roh) ? `+${roh.slice(1)}` : roh).trim();
}

/**
 * tel:-Adresse der Notfallnummer, nur für polnische (+48/0048, genau 9 Ziffern) und deutsche Nummern (+49/0049 oder
 * national mit 0, 6–13 Ziffern ohne die 0). Erlaubt: Ziffern, Leerzeichen, + vorne, / ( ) - . und „(0)" nach +49.
 * Alles andere — auch der Vorschau-Platzhalter und andere Ländervorwahlen — ⇒ null (dann entfällt der Notfallblock).
 */
export function notfallTelHref(nummer: string | null | undefined): string | null {
  const roh = (nummer ?? '').trim();
  if (!roh || !/^\+?[\d\s/().-]+$/.test(roh)) return null;
  let kurz = roh.replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
  if (kurz.startsWith('00')) kurz = `+${kurz.slice(2)}`;
  else if (kurz.startsWith('0')) kurz = `+49${kurz.slice(1)}`;
  if (!kurz.startsWith('+')) return null;
  const ziffern = kurz.slice(1);
  if (ziffern.startsWith('48')) {
    const national = ziffern.slice(2);
    return national.length === 9 ? `tel:+48${national}` : null;
  }
  if (ziffern.startsWith('49')) {
    let national = ziffern.slice(2);
    if (national.startsWith('0')) national = national.slice(1); // „+49 089 …"
    return national.length >= 6 && national.length <= 13 && !national.startsWith('0') ? `tel:+49${national}` : null;
  }
  return null;
}

/** Nummer bricht nie in sich um. */
function ohneUmbruch(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

/** Text mit ERREICHBAR: „8–20 Uhr" bricht nie um (weder am Leerzeichen noch nach dem Halbgeviertstrich). */
function mitZeiten(text: string): ReactNode {
  const i = text.indexOf(ERREICHBAR);
  if (i < 0) return text;
  const zeit = ERREICHBAR.match(/^(\D*)(\d.*)$/);
  const erreichbar = zeit ? <>{zeit[1]}<span className="whitespace-nowrap">{zeit[2]}</span></> : ERREICHBAR;
  return <>{text.slice(0, i)}{erreichbar}{text.slice(i + ERREICHBAR.length)}</>;
}

// Unter 375 px 16 statt 20 px Innenabstand (Platz für den Namen, siehe MartaZeile `eng`).
const KARTE = 'rounded-card border border-pm-line bg-white px-5 py-5 max-[374px]:px-4';
const ZEILE = 'text-pretty text-[15px] leading-[1.45] text-pm-body';
// Nummer auf eigener Zeile, Tippfläche 44 px hoch; -mt-2 zieht sie optisch an die Zeile darüber.
const NUMMER = 'inline-flex min-h-[44px] items-center text-[17px] font-semibold tabular-nums text-pm-taupe-ink hover:text-pm-ink';

function NummerLink({ href, aria, nummer }: { href: string; aria: string; nummer: string }) {
  return (
    <p className="-mt-2">
      <a href={href} aria-label={aria} className={NUMMER}>{ohneUmbruch(nummer)}</a>
    </p>
  );
}

/** Notfallblock: Zeile, Nummer als Anruf-Link (Platzhalter in der Vorschau nur als Text), 112 klein darunter. */
function NotfallBlock({ variante, nummer, href }: { variante: KontaktVariante; nummer: string; href: string | null }) {
  return (
    <div className="mt-2 border-t border-pm-line-soft pt-4" data-clarity-mask="true" data-notfall="">
      <p className={ZEILE}>{variante === 2 ? KONTAKT_TEXTE.v2Notfall : KONTAKT_TEXTE.notfallZeile}</p>
      {href ? (
        <NummerLink href={href} aria={notfallAria(nummer)} nummer={nummer} />
      ) : (
        <p className="-mt-2">
          <span data-platzhalter="notfall" className="inline-flex min-h-[44px] items-center text-[17px] font-semibold text-pm-ink">{nummer}</span>
        </p>
      )}
      <p className="text-[13.5px] leading-[1.4] text-pm-muted">{KONTAKT_TEXTE.hinweis112}</p>
    </div>
  );
}

/**
 * Kontaktbereich. `notfallTelefon` leer/null/ungültig ⇒ nur die Erreichbarkeit (kein Notfallblock, keine 112-Zeile:
 * die 112-Zeile klärt nur die Verwechslung mit der Primundus-Notfallnummer).
 */
export function GebuchtKontakt({ variante, notfallTelefon, className = 'mt-8' }: {
  variante: KontaktVariante;
  notfallTelefon: string | null | undefined;
  className?: string;
}) {
  const notfall = (notfallTelefon ?? '').trim() || null;
  const notfallHref = notfallTelHref(notfall);
  const zeigeNotfall = !!notfall && (!!notfallHref || notfall === NOTFALL_PLATZHALTER);

  const karte = (
    <div className={KARTE}>
      <MartaZeile eng unterzeile={KONTAKT_TEXTE.kollege} />
      <p className={`mt-4 ${ZEILE}`}>{mitZeiten(variante === 2 ? KONTAKT_TEXTE.v2Tag : KONTAKT_TEXTE.tagZeile)}</p>
      <NummerLink href={TELEFON_HREF} aria={KONTAKT_TEXTE.ariaTag} nummer={TELEFON} />
      {zeigeNotfall && notfall && <NotfallBlock variante={variante} nummer={notfall} href={notfallHref} />}
    </div>
  );

  if (variante === 3) {
    return (
      <div data-kontakt-variante="3" className={className}>
        <AngebotAbschnitt id="kontakt-bereich" titel={KONTAKT_TEXTE.bereich} className="" karte={false}>
          {karte}
        </AngebotAbschnitt>
      </div>
    );
  }

  return (
    <section aria-label={KONTAKT_TEXTE.bereich} data-kontakt-variante={String(variante)} className={className}>
      {karte}
    </section>
  );
}
