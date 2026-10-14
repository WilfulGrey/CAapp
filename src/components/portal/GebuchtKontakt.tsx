// Kontaktbereich oben im Gebucht-Bildschirm. PROTOTYP 14.10.2026: nicht freigegeben, nicht live.
//
// Martin 14.10.2026: „Ich brauche bei einer akzeptierten Buchung einen Bereich oben mit einem Kontakt, eine Notruf-Rufnummer
// … Marta Kapcio oder Kollegen und diese Telefonnummer bitte melden, wenn es in dringenden Notfällen außerhalb auch der
// Geschäftszeiten." Wortlaut der drei Varianten: seo-reports/analysen/gebucht-kontakt-2026-10-14/texte_final.md (zwei
// OpenAI-Runden). Empfehlung V3. Ton (Memory erreichbarkeit-notfallnummer): Erreichbarkeit zuerst, die Notfallnummer als
// Absicherung, nicht so, als gäbe es ständig Notfälle.
//
// Die Notfallnummer steht NIRGENDS im Code: Repo und Portal-Bundle sind öffentlich. Sie kommt als Prop (später vom Server,
// nur für gebuchte Leads). Fehlt sie (null/leer), entfallen die Nachtzeile und der 112-Hinweis — kein Ersatzwert (Święta
// zasada 1). Die Vorschau ?preview=gebucht übergibt den sichtbaren Platzhalter NOTFALL_PLATZHALTER; der ist keine
// Telefonnummer und bekommt deshalb keinen tel:-Link (der runde Knopf steht dann nur als Bild da).
// Bausteine: Personenzeile und Knopfklassen aus MartaBox, Abschnitt mit Überschrift aus KompaktEinstieg. Keine neuen Knöpfe.
import { Phone } from 'lucide-react';
import { BERATERIN, ERREICHBAR, TELEFON, TELEFON_HREF } from '../../lib/kontakt';
import { KNOPF_ANRUFEN, MartaZeile } from './MartaBox';
import { AngebotAbschnitt } from './KompaktEinstieg';

export type KontaktVariante = 1 | 2 | 3;
/** Empfehlung aus texte_final.md: Überschrift + zwei Zeilen mit Uhrzeit. */
export const KONTAKT_EMPFEHLUNG: KontaktVariante = 3;
/** Was unten auf der Seite steht, wenn Marta schon oben steht (Entscheidung 5). */
export type MartaUnten = 'marta' | 'siegel';
export const MARTA_UNTEN_STANDARD: MartaUnten = 'marta';

/** Sichtbarer Platzhalter NUR für die Vorschau. Nie an echte Kunden. */
export const NOTFALL_PLATZHALTER = '[Notfallnummer]';

export const KONTAKT_TEXTE = {
  v1Kopf: 'Ihr Kontakt bei Primundus',
  v2Satz: `Bei Fragen erreichen Sie Marta\u00a0Kapcio oder einen Kollegen täglich von 8 bis 20\u00a0Uhr.`,
  v3Titel: 'So erreichen Sie uns',
  v3Tag: 'Täglich 8 bis 20 Uhr',
  v3Kollege: 'oder ein Kollege',
  v3Nacht: 'Von 20 bis 8 Uhr',
  nummerLabel: 'Telefon und WhatsApp:',
  notfallName: 'Primundus-Notfallnummer',
  v1Nacht: 'Von 20 bis 8\u00a0Uhr, wenn etwas nicht bis zum Morgen warten kann:',
  v2Nacht: 'Wenn zwischen 20 und 8\u00a0Uhr etwas nicht bis zum Morgen warten kann, rufen Sie die Primundus-Notfallnummer an:',
  v3NachtHinweis: 'Wenn etwas nicht bis zum Morgen warten kann.',
  hinweis112: 'Bei medizinischen Notfällen: 112',
} as const;

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

/**
 * tel:-Adresse aus einer angezeigten deutschen Nummer („089 200 000 830" → „tel:+4989200000830").
 * Nur Ziffern, Leerzeichen und + / ( ) - erlaubt, 6 bis 15 Ziffern. Alles andere (auch der Platzhalter) ⇒ null.
 */
export function notfallTelHref(nummer: string | null | undefined): string | null {
  const roh = (nummer ?? '').trim();
  if (!roh || !/^\+?[\d\s/()-]+$/.test(roh)) return null;
  let kurz = roh.replace(/[^\d+]/g, '');
  if (kurz.startsWith('00')) kurz = `+${kurz.slice(2)}`;
  else if (kurz.startsWith('0')) kurz = `+49${kurz.slice(1)}`;
  if (!kurz.startsWith('+')) return null;
  const ziffern = kurz.slice(1);
  if (ziffern.length < 6 || ziffern.length > 15) return null;
  return `tel:${kurz}`;
}

/** Nummer bricht nie in sich um. */
function ohneUmbruch(text: string) {
  return text.replace(/ /g, '\u00a0');
}

// Unter 375 px 16 statt 20 px Innenabstand (Platz für den Namen, siehe MartaZeile `eng`).
const KARTE = 'rounded-card border border-pm-line bg-white px-5 py-5 max-[374px]:px-4';
const ETIKETT = 'text-[13px] font-semibold uppercase tracking-[0.06em] text-pm-taupe-ink';
const LINK = 'inline-flex min-h-[44px] -my-3 items-center font-semibold tabular-nums text-pm-taupe-ink hover:text-pm-ink';

/** „Telefon und WhatsApp: 089 200 000 830" — die Nummer als Anruf-Link, eigene Zeile. */
function SichtbareNummer() {
  return (
    <p className="mt-4 text-[15px] leading-[1.45] text-pm-body">
      {KONTAKT_TEXTE.nummerLabel}{' '}
      <a href={TELEFON_HREF} aria-label={`${BERATERIN} anrufen: ${TELEFON}`} className={LINK}>{ohneUmbruch(TELEFON)}</a>
    </p>
  );
}

/** Die Notfallnummer selbst: mit gültiger Nummer ein Anruf-Link, sonst (Vorschau-Platzhalter) nur Text. */
function NotfallNummer({ nummer }: { nummer: string }) {
  const href = notfallTelHref(nummer);
  if (!href) return <span className="font-semibold text-pm-ink">{nummer}</span>;
  return (
    <a href={href} aria-label={`${KONTAKT_TEXTE.notfallName} anrufen: ${nummer}`} className={LINK}>{ohneUmbruch(nummer)}</a>
  );
}

/** Runder Anruf-Knopf der Nachtzeile (V3) — Klassen des Marta-Kastens. Ohne gültige Nummer nur als Bild. */
function NotfallKnopf({ nummer }: { nummer: string }) {
  const href = notfallTelHref(nummer);
  if (!href) {
    return (
      <span aria-hidden="true" data-platzhalter="notfall-knopf" className={KNOPF_ANRUFEN}>
        <Phone className="w-5 h-5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <a href={href} aria-label={`${KONTAKT_TEXTE.notfallName} anrufen: ${nummer}`} className={KNOPF_ANRUFEN}>
      <Phone className="w-5 h-5" aria-hidden="true" />
    </a>
  );
}

function Hinweis112() {
  return <p className="mt-3 text-[13.5px] leading-[1.4] text-pm-muted">{KONTAKT_TEXTE.hinweis112}</p>;
}

/**
 * Kontaktbereich oben. `notfallTelefon` leer/null ⇒ nur die Erreichbarkeit (keine Nachtzeile, kein 112-Hinweis: die
 * 112-Zeile klärt nur die Verwechslung mit der Primundus-Notfallnummer).
 */
export function GebuchtKontakt({ variante, notfallTelefon, className = 'mt-8' }: {
  variante: KontaktVariante;
  notfallTelefon: string | null | undefined;
  className?: string;
}) {
  const notfall = (notfallTelefon ?? '').trim() || null;

  if (variante === 3) {
    return (
      <div data-kontakt-variante="3" className={className}>
        <AngebotAbschnitt id="kontakt-oben" titel={KONTAKT_TEXTE.v3Titel} className="" karte={false}>
          <div className={KARTE}>
          <p className={ETIKETT}>{KONTAKT_TEXTE.v3Tag}</p>
          <MartaZeile eng className="mt-3" unterzeile={KONTAKT_TEXTE.v3Kollege} />
          <SichtbareNummer />
          {notfall && (
            <div className="mt-4 border-t border-pm-line-soft pt-4" data-clarity-mask="true" data-notfall="">
              <p className={ETIKETT}>{KONTAKT_TEXTE.v3Nacht}</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="min-w-0 flex-1 leading-[1.35]">
                  <p className="text-[15.5px] font-semibold text-pm-ink">{KONTAKT_TEXTE.notfallName}</p>
                  <p className="text-[15.5px]"><NotfallNummer nummer={notfall} /></p>
                  <p className="mt-0.5 text-[13.5px] text-pm-muted">{KONTAKT_TEXTE.v3NachtHinweis}</p>
                </div>
                <NotfallKnopf nummer={notfall} />
              </div>
            </div>
          )}
          </div>
        </AngebotAbschnitt>
        {notfall && <Hinweis112 />}
      </div>
    );
  }

  return (
    <section aria-label={KONTAKT_TEXTE.v3Titel} data-kontakt-variante={String(variante)} className={className}>
      <div className={KARTE}>
        {variante === 1 ? (
          <>
            <h2 className="text-[15px] font-bold text-pm-ink">{KONTAKT_TEXTE.v1Kopf}</h2>
            <MartaZeile eng className="mt-3" unterzeile={<>Ihre Beraterin · {ERREICHBAR}</>} />
          </>
        ) : (
          <>
            <p className="text-pretty text-[15px] leading-[1.5] text-pm-body">{KONTAKT_TEXTE.v2Satz}</p>
            <MartaZeile eng className="mt-3" unterzeile="Ihre Beraterin" />
          </>
        )}
        <SichtbareNummer />
        {notfall && (
          <div className="mt-4 border-t border-pm-line-soft pt-4 text-[15px] leading-[1.5] text-pm-body" data-clarity-mask="true" data-notfall="">
            {variante === 1 ? (
              <>
                <p className="text-pretty">{KONTAKT_TEXTE.v1Nacht}</p>
                <p className="mt-1">{KONTAKT_TEXTE.notfallName} <NotfallNummer nummer={notfall} /></p>
              </>
            ) : (
              <p className="text-pretty">{KONTAKT_TEXTE.v2Nacht} <NotfallNummer nummer={notfall} /></p>
            )}
          </div>
        )}
      </div>
      {notfall && <Hinweis112 />}
    </section>
  );
}
