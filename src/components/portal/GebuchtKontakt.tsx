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
import { Phone } from 'lucide-react';
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
  /** Gebucht-Seite neu (Martin 24.10.): Geltung als eigener Satz unter dem Namen, Wortlaut NOTFALL_GELTUNG unverändert. */
  notfallGeltungSatz: `${NOTFALL_GELTUNG.charAt(0).toUpperCase()}${NOTFALL_GELTUNG.slice(1)}.`,
  /** Gebucht-Seite neu: Zeile über Marta, wenn die Notfallnummer darüber steht (OpenAI R7, Frage 4: sonst liest man die
   *  Notfallnummer als ersten Anlaufpunkt). */
  alleAnderenFragen: 'Für alle anderen Fragen',
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

/** Hosts, auf denen die Vorschau eine Nummer aus der URL annimmt: nur der eigene Rechner. */
const LOKALE_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** true nur für localhost, 127.0.0.1 und ::1 (im Browser als „[::1]"). */
export function vorschauHostLokal(hostname: string | null | undefined): boolean {
  return LOKALE_HOSTS.has((hostname ?? '').trim().toLowerCase());
}

/**
 * Vorschau-Schalter `?notfall=…` (NUR für ?preview=gebucht aufrufen): die Nummer kommt zur Laufzeit aus der URL, nie aus
 * dem Code. Ohne Parameter der sichtbare Platzhalter. URLSearchParams macht aus einem unkodierten „+" ein Leerzeichen;
 * „ 48 …" wird deshalb wieder zu „+48 …" (sonst fiele die Zeile in der Vorschau still weg).
 *
 * Sicherheit (Gegenprüfung 15.10.): Die Nummer aus der URL gilt NUR auf localhost/127.0.0.1/::1. Auf jedem anderen Host
 * (Staging, kundenportal.primundus.de) steht immer der Platzhalter ohne Anruf-Link — sonst könnte jeder einen Link mit
 * einer fremden Nummer als „Primundus-Notfallnummer" auf unserer Domain verschicken.
 */
export function notfallAusVorschauUrl(
  search: string,
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
): string {
  if (!vorschauHostLokal(hostname)) return NOTFALL_PLATZHALTER;
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

// ─── Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau) ─────────────────────
// Spezifikation gebucht-seite-2026-10-15, Abschnitt 6.5: Kontakt als eigener Abschnitt mit Überschrift (Martin: „Ihr Kontakt
// zur Agentur … schöner"). Martin 24.10.: „Die Notfallnummer ist mir nicht prominent genug. Die ist wichtiger als der andere
// Kontakt." Deshalb steht das Notfallfeld OBEN in der Karte, die Nummer selbst ist ein großer Anruf-Knopf, Martas
// Tageskontakt folgt darunter. Wortlaut aus KONTAKT_TEXTE; Martins Phrase NOTFALL_GELTUNG wörtlich (nur als eigener Satz mit
// großem Anfangsbuchstaben). Die alten Varianten oben bleiben für `&seite=alt`.

/** Entscheidung 2: A = Martins Wortlaut (steht im Bau, bis er wählt), B = Empfehlung (texte_final.md). */
export const KONTAKT_TITEL = {
  a: 'Ihr Kontakt zur Agentur',
  b: 'Ihr Kontakt zu Primundus',
} as const;
export type KontaktTitel = keyof typeof KONTAKT_TITEL;

/** Vorschau-Schalter `&kontakt=a|b` (nur Gebucht-Seite neu). Alles andere: A (Martins Wortlaut). */
export function kontaktTitelAusUrl(search: string): KontaktTitel {
  return new URLSearchParams(search).get('kontakt') === 'b' ? 'b' : 'a';
}

/**
 * Was vom Notfallfeld erscheint: null = nichts (kein gültiger Wert). Gültig ist eine Nummer mit tel:-Adresse
 * (notfallTelHref) oder — nur in der Vorschau — der sichtbare Platzhalter ohne Link.
 */
export function notfallAnzeige(nummer: string | null | undefined): { nummer: string; href: string | null } | null {
  const wert = (nummer ?? '').trim();
  if (!wert) return null;
  const href = notfallTelHref(wert);
  if (href) return { nummer: wert, href };
  return wert === NOTFALL_PLATZHALTER ? { nummer: wert, href: null } : null;
}

// Nummer als Knopf über die volle Breite: 52 px hoch, 20 px fett, bricht nie um.
const NOTFALL_KNOPF = 'mt-3 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] px-4 text-[20px] font-bold tabular-nums text-white';

/**
 * Notfallfeld (Martin 24.10.: wichtiger als der Tageskontakt): Name, Geltung, die Nummer als großer Anruf-Knopf, 112 klein
 * darunter. Platzhalter der Vorschau im selben Look, aber ohne Link. Ohne gültige Nummer: nichts.
 */
export function NotfallFeld({ nummer, className = '' }: { nummer: string | null | undefined; className?: string }) {
  const anzeige = notfallAnzeige(nummer);
  if (!anzeige) return null;
  const inhalt = (
    <>
      <Phone className="h-5 w-5 flex-none" aria-hidden="true" />
      <span className="whitespace-nowrap">{ohneUmbruch(anzeige.nummer)}</span>
    </>
  );
  return (
    <div className={`rounded-[16px] border border-pm-coral/30 bg-pm-coral-tint px-4 pb-3.5 pt-4 ${className}`.trim()} data-clarity-mask="true" data-notfall="">
      <p className="text-[16px] font-bold leading-[1.3] text-pm-coral-ink">{KONTAKT_TEXTE.notfallName}</p>
      <p className={`mt-1 ${ZEILE}`}>{KONTAKT_TEXTE.notfallGeltungSatz}</p>
      {anzeige.href ? (
        <a href={anzeige.href} aria-label={notfallAria(anzeige.nummer)} className={`${NOTFALL_KNOPF} bg-pm-coral-ink hover:bg-pm-ink`} data-teil="notfall-knopf">
          {inhalt}
        </a>
      ) : (
        <p className={`${NOTFALL_KNOPF} bg-pm-coral-ink`} data-platzhalter="notfall">{inhalt}</p>
      )}
      <p className="mt-2.5 text-[13.5px] leading-[1.4] text-pm-muted">{KONTAKT_TEXTE.hinweis112}</p>
    </div>
  );
}

/**
 * Kontakt-Abschnitt der neuen Gebucht-Seite: h2 (Entscheidung 2) + Karte mit — nur mit gültiger Nummer und `mitNotfall` —
 * dem Notfallfeld OBEN, darunter Marta, Tageszeile und Tagesnummer. `mitNotfall` = false im beendeten Einsatz.
 */
export function GebuchtKontaktKarte({ titel, notfallTelefon, mitNotfall, className = 'mt-10' }: {
  titel: KontaktTitel;
  notfallTelefon: string | null | undefined;
  mitNotfall: boolean;
  className?: string;
}) {
  const notfall = mitNotfall && !!notfallAnzeige(notfallTelefon);
  return (
    <section aria-labelledby="kontakt-gebucht" className={className} data-baustein="kontakt">
      <h2 id="kontakt-gebucht" className="text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink">{KONTAKT_TITEL[titel]}</h2>
      <div className={`mt-4 ${KARTE}`}>
        {notfall && <NotfallFeld nummer={notfallTelefon} />}
        <div className={notfall ? 'mt-5 border-t border-pm-line-soft pt-5' : ''} data-teil="tageskontakt">
          {notfall && <p className="mb-3 text-[13.5px] font-semibold leading-[1.4] text-pm-muted">{KONTAKT_TEXTE.alleAnderenFragen}</p>}
          <MartaZeile eng unterzeile={KONTAKT_TEXTE.kollege} />
          <p className={`mt-4 ${ZEILE}`}>{mitZeiten(KONTAKT_TEXTE.tagZeile)}</p>
          <NummerLink href={TELEFON_HREF} aria={KONTAKT_TEXTE.ariaTag} nummer={TELEFON} />
        </div>
      </div>
    </section>
  );
}
