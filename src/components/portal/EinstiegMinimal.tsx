// Einstieg VOR dem ersten Speichern der Pflegesituation: „Minimal“ — Registry #147 (live seit 08.11.2026), neu gefasst mit #162
// (13.11.2026: Kopf, Liste ohne Preis und Einladen, Formular direkt unter der Liste, „So geht es weiter“ wie in der guten Phase).
//
// Martin 07.11.2026 zum Mockup (seo-reports/analysen/vorschlag-minimal-2026-11-07/mockup/portal.html): „Ja, alle drei“.
// Vorher (Abnahme 07.11.): auf dem iPhone 13 kam die erste Pflegekraft bei 1.426 px, das Formular bei 2.603 px.
// Seit #162 gibt es vor dem Speichern kein „Einladen“ mehr (Martin 13.11.: „nicht mehr mit einladen … das brauchen wir nicht“);
// die Logik aus #145 (Vormerken, nach dem ersten Speichern automatisch einladen) gilt nur noch für `?einstieg=zuerst`.
//
// Kontakt: Reiter am rechten Rand mit Martas Foto, wie die Ansprechpartnerin in der CG-App (umbrella/.notes/requests/
// opiekomat-start/makieta-v59.html, `.edge` + `.drawer`): halb eingeschoben, beim Scrollen weiter weg, nach dem Scrollen
// zurück; Tipp öffnet von rechts ein Panel mit Marta, Anrufen und WhatsApp (Martin 08.11.: „marta muss rechts schön platziert
// sein - schau in der cg app“). Statt „Rückruf vereinbaren“ (Martin 08.11.: „lieber anrufen
// oder schreiben?“) und statt einer Marta-Zeile in der Liste („wirkt wie Pflegekraft … dass rechts so ein kleines ding aufgeht
// wenn wir stoppen und dann kann man das anklicken“).
//
// Rückweg: `?einstieg=zuerst` zeigt „Pflegekräfte zuerst“ (#145) unverändert, `?einstieg=alt` den Stand 75b8df8.
//
// Fassung „CGA-Stil“ (Martin 08.11.2026: „optisch … zu gedrungen und nicht clean genug … schau was wir gerade bei umbrella
// bauen mit der app und cga“): weiße Karten ohne Rahmen auf `pm-grund`, Abschnittstitel in normaler Schreibung mit Zahl,
// Zeilen mit Trennlinie, weiße Knöpfe mit Rand. Zweite Runde 08.11. (Martin, diktiert): oben ruhig und clean, „Ihr
// persönliches Angebot“, ohne Chips, Zuschüsse und Pflegeheim-Vergleich in einer ruhigen Zeile, die Bestpreisgarantie
// „sehr vorteilhaft“ mit „keine Vermittlungsgebühr, täglich kündbar“, Sterne unter dem Gruß; die Pflegekräfte als Zeilen
// „wie auf dem ersten Bild“, immer mit Preis vor „Einladen“; der Hauptknopf schmal und fest unten, Wortlaut „Pflegesituation
// vervollständigen und Bewerbungen erhalten“.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Info, Phone, X } from 'lucide-react';
import type { Nurse } from '../../types';
import { formatEuro, type Lead } from '../../lib/supabase';
import { eigenanteilAus } from '../../lib/angebotZuschuss';
import { anzahlText, ERFAHRUNGEN_URL, sternFuellung, type SterneStand } from '../../lib/sterne';
import { BERATERIN, ERREICHBAR, TELEFON, TELEFON_HREF, WHATSAPP_HREF, istErreichbar } from '../../lib/kontakt';
import { initials } from './shared';
import { AbschnittPflegesituation, KostenAufstellung, type VorgemerkteKraft } from './EinstiegPflegekraefteZuerst';
import { FaqListe } from './FaqListe';
import { MartaBox } from './MartaBox';
import { WhatsAppIcon } from './WhatsAppIcon';

// Wortlaut (Martin 08.11.2026, diktiert; Entwurf, Freigabe des Wortlauts offen). Tests prüfen genau diese Texte.
/** NUR NOCH MAIL. Titel der Angebotskarte bis 13.11.2026; das Portal zeigt ihn seit dem neuen Kopf (KopfBereich) nicht mehr,
 *  dort steht KOPF_TITEL. Die Konstante bleibt für den Gleichlauf mit der kurzen Angebotsmail (kundenMails.ts, ANGEBOT_TITEL,
 *  Test angebotsmailWortlaut), die sich mit diesem Schritt NICHT ändert. Offen bei Martin: Soll die Mail auch „Ihr Preis für
 *  die Betreuung zu Hause“ heißen? */
export const ANGEBOT_TITEL = 'Ihr persönliches Angebot';
/** Titel des Kopfs (h1), zwei feste Zeilen (Martin 13.11.2026: „Ihr persönliches Angebot muss halt eben mehr in den
 *  Vordergrund oder Ihr Preis für die Betreuung zu Hause. Finde ich gut.“). Fester Umbruch statt `text-wrap: balance`, weil
 *  iOS vor 17.4 das nicht kann (am Pro Max stand sonst „Ihr Preis für die Betreuung / zu Hause“); „zu Hause“ mit geschütztem
 *  Leerzeichen. */
export const KOPF_TITEL_ZEILEN = ['Ihr Preis für die', 'Betreuung zu Hause'] as const;
export const KOPF_TITEL = KOPF_TITEL_ZEILEN.join(' ');
/** Überschrift der Liste (Martin 13.11.2026: „man soll sehen: Ihre Pflegekräfte-Auswahl“; vorher „Passende Pflegekräfte“). */
export const LISTE_TITEL = 'Ihre Pflegekräfte-Auswahl';
/** Überschrift im Kopf (Martin 13.11.2026: „Warum Primundus oder so?“; OpenAI-Runde über den ganzen Seitentext 13.11.). */
export const WARUM_TITEL = 'Warum Primundus?';
/** Unter der Listen-Überschrift (Martin 13.11.2026: „Es muss definitiv irgendwo stehen, diese Pflegekräfte sind verfügbar und
 *  passen zu ihrer Auswahl“). „Anfrage“ statt „Angaben“: im Portal filtert nur die Deutsch-Stufe. Nur über einer Liste mit Zeilen. */
export const LISTE_ZEILE = 'Diese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.';
/** Kasten unter der Liste (ENTWURF 14.11.2026, Martin: „Im Portal fehlt der Text und Button unter den PKs“, Bild „Neu, ganze
 *  Seite“ vom 13.11. vormittags): Hinweis, Satz und Knopf wie dort, der Knopf jetzt grün wie alle anderen. Der Satz stand
 *  seit #162 über dem Formular und steht jetzt nur noch hier. */
export const LISTE_UNVOLLSTAENDIG = 'Ihre Angaben sind noch unvollständig';
export const LISTE_WARUM = 'Beschreiben Sie kurz die Pflegesituation. So verstehen die Pflegekräfte, worauf es bei Ihnen ankommt, und können sich unverbindlich bewerben. Das dauert ca. 2 Minuten.';
export const LISTE_KNOPF = 'Pflegesituation vervollständigen';
/** Titel des Marta-Kastens unter dem Formular (13.11.2026, Martin: „Anbieten von Beratung“). */
export const MARTA_BERATUNG_TITEL = 'Lieber persönlich beraten lassen?';
/** Kopf über der Formularkarte (13.11.2026, Martin: „ob das formular als popup kommen müsste und wenn nicht, dann besser
 *  sichtbar als formular“, „Titel nicht doppeln“, „Pflegesituation vervollständigen finde ich ganz gut … der Text … passt“):
 *  Formular offen direkt unter der Liste wie in der guten Phase, Titel auf dem Seitengrund über der Karte. Der Satz darunter
 *  steht seit 14.11. im Kasten unter der Liste (LISTE_WARUM), sonst stünde er zweimal untereinander. */
export function formularKopf(): { titel: string; zeile: string; aussen: boolean } {
  return { titel: FORMULAR_TITEL, aussen: true, zeile: '' };
}
/** Kein fester Knopf mehr (Martin 13.11.2026: „button nicht hier schon anzeigen, weil zu fordernd gleich mit bewerbungen zu
 *  kommen“). FEST_TITEL und FEST_ZEILE bleiben nur für den Gleichlauf mit dem Knopf der Angebotsmail (Test angebotsmailWortlaut). */
/** Fester Knopf unten: eine Zeile Titel, darunter Martins Unterzeile (08.11.: „Pflegesituation vervollständigen &
 *  Bewerbungen erhalten - darunter: 100% kostenfrei & unverbindlich“, danach „definitiv zu langtextlich“). Kurz der Nutzen;
 *  „Pflegesituation vervollständigen“ steht als Titel direkt darunter am Formular. */
export const FEST_TITEL = 'Bewerbungen erhalten';
export const FEST_ZEILE = '100% kostenfrei & unverbindlich';
/** Titel über dem Formular (Wortlaut bis 08.11. und seit 13.11.2026, Martin: „Pflegesituation vervollständigen, finde ich ganz
 *  gut“). */
export const FORMULAR_TITEL = 'Pflegesituation vervollständigen';
/** Panel der Ansprechpartnerin: Unterzeile wie im Marta-Kasten („Ihre Beraterin“). */
/** Hinweis im Marta-Fenster und im Marta-Kasten außerhalb von 8–20 Uhr. */
export const AUSSERHALB_ZEITEN = 'Außerhalb der Geschäftszeiten können Sie Marta per WhatsApp schreiben.';
export const BERATERIN_ROLLE = 'Ihre Beraterin';
/** Punkte mit grünem Haken in der Preiskarte des Kopfs (bis 13.11.2026 ein grüner Kasten, Martin 13.11.: „zu bunt“; die
 *  Angebotsmail zeigt sie weiter im Kasten): vier gleichwertige, kurze Punkte, die Bestpreisgarantie zuerst (Martin: „Ist das
 *  unsere Bestpreisgarantie? Oder ist das nur ein Punkt davon?“ — die anderen drei gehören nicht zur Garantie; „Es gilt
 *  immer unsere Bestpreisgarantie“ mit „Mehr Infos“ darunter war ihm zu kompliziert: „Ich will das clean haben“).
 *  Hemmnis-Punkte nach Martin („Keine Vorauszahlung, keine Vermittlungsgebühr. Keine Mindestlaufzeit … Beides genügt.“;
 *  belegt: USP 4/5, Mustervertrag § 3 und § 4 „ab dem Tag der Ankunft“). Tipp auf „Bestpreisgarantie“ öffnet ihr Fenster. */
export const GARANTIE_TITEL = 'Bestpreisgarantie';
export const GARANTIE_PUNKTE = ['Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit'] as const;
/** Punkte im Portal-Kopf unter „Bestpreisgarantie“ (Martin 13.11.2026, wörtlich: „Punkte ändern zu: Bestpreisgarantie, Keine
 *  Vermittlungsgebühren, Tägliche Kündigung, Taggenaue Abrechnung“). GARANTIE_PUNKTE bleibt für den Gleichlauf mit der
 *  Angebotsmail, die sich in diesem Schritt nicht ändert. */
export const KOPF_PUNKTE = ['Keine Vermittlungsgebühren', 'Tägliche Kündigung', 'Taggenaue Abrechnung'] as const;
/** Vertrauen unten in der Angebotskarte (Martin: „seit 20 Jahren und 6 Jahre in Folge … Testsieger … die Sterne“): Wert
 *  groß, Beschriftung klein darunter, wie die Kennzahlen im CGA-Panel. Wortlaut „6× in Folge“ wie die Auszeichnungsseite. */
export const VERTRAUEN = [['20 Jahre', 'Erfahrung'], ['6× in Folge', 'Testsieger']] as const;
/** Knopf der Zeile nach dem Tipp auf „Einladen“ (statt „Vorgemerkt“, Martin: „sieht natürlich komisch aus“). „Eingeladen“
 *  (Martin 08.11. abends: „warum steht da ausgewählt, wenn ich eingeladen habe … muss auch eingeladen sein“); verschickt wird
 *  die Einladung technisch mit dem Absenden der Pflegesituation (Logik #145 unverändert). */
export const EINGELADEN = 'Eingeladen';
// Wie in der Navigationsleiste: Tippfläche ≥ 44 px über ein unsichtbares ::before, die sichtbare Pille bleibt kleiner.
const TIPPFLAECHE = "relative before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-['']";
// Für Textknöpfe in der Angebotskarte: unsichtbar bis 44 px hoch (Prüfung 09.11.2026: „Details“ und „Bestpreisgarantie“ lagen darunter).
const TIPPFLAECHE_HOCH = "relative before:absolute before:-inset-y-[11px] before:-inset-x-1 before:content-['']";
const FOKUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe';
// Knopf rechts in der Zeile: in allen Zuständen gleich breit und hoch, damit die Zeile ihre Höhe hält. 104 × 36 px (unter
// 375 px 96 px): „Eingeladen“ mit Haken in 13 px passt mit Luft hinein (Martin 08.11.: „passender in den Button … macht die
// Button-Tick größer von vornherein“); vorher 88 × 34 px mit 12 px Schrift.
const PILLE = 'flex h-11 w-[108px] max-[374px]:w-[104px] flex-none items-center justify-center rounded-[10px] font-semibold whitespace-nowrap';
// Karte wie im CGA-Panel: weiß auf dem Seitengrund, ohne Rahmen und Schatten.
const KARTE = 'rounded-card bg-white';
const STERN = 'M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z';
/** Fünf Sterne, anteilig gefüllt wie in der Bewertungszeile (Angebotskarte und Marta-Karte). */
function FuenfSterne({ wert, groesse = 12 }: { wert: number; groesse?: number }) {
  return (
    <span className="inline-flex gap-px" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fuellung = sternFuellung(wert, i);
        return (
          <svg key={i} viewBox="0 0 20 20" width={groesse} height={groesse} className="flex-none">
            <path d={STERN} fill="#E5E3DF" />
            {fuellung > 0 && <path d={STERN} fill="#D4A843" style={fuellung < 1 ? { clipPath: `inset(0 ${Math.round((1 - fuellung) * 100)}% 0 0)` } : undefined} />}
          </svg>
        );
      })}
    </span>
  );
}

// ── Kopf rechts: „6× Testsieger / DIE WELT“ mit Siegel (statt „Hilfe“ in der Navigationsleiste) ──────────────────────────
export function TestsiegerKopf() {
  return (
    <div className="flex items-center gap-2" data-testsieger-kopf>
      <p className="text-right text-[11.5px] leading-[1.3] text-pm-muted">
        <b className="block text-[12.5px] text-pm-ink">6× Testsieger</b>
        DIE&nbsp;WELT
      </p>
      {/* 44 px statt 48 (Mockup): 4 px für den Hauptknopf auf dem iPhone SE. */}
      <img src="/badge-testsieger.webp" alt="Testsieger Die Welt" className="h-11 w-auto flex-none object-contain" />
    </div>
  );
}

// ── Kopfbereich: Gruß, Titel, Preiskarte ─────────────────────────────────────────────────────────────────────────────────
// 13.11.2026. Ersetzt die große Überschrift „Guten Tag, …“ (22 px) und die Angebotskarte „Ihr
// persönliches Angebot“ mit dem mintgrünen Kasten (Stand c4f80d3).
//
// Martin 13.11.2026 (Sprachnachricht): „Ich möchte das so ähnlich machen, wie es vorher war. Guten Tag, Frau Müller muss
// kleiner. Ihr persönliches Angebot muss halt eben mehr in den Vordergrund oder Ihr Preis für die Betreuung zu Hause. Finde
// ich gut. Dann das jetzige ist mir zu bunt … ein bisschen luftiger … nach Zuschüssen ca. 1620 im Monat. Das kann von mir
// aus grün bleiben.“
//
// Wie Vorher (gute Phase, f062df3, live 12.09. bis 24.09.):
// - Gruß klein und grau über dem Titel (Vorher „Guten Tag, Frau Müller.“ 15 px grau; hier ohne Punkt wie live), kein Heading.
// - Titel groß und fett als h1, frei auf dem Seitengrund; darunter EINE Preiskarte mit dem Preis als Erstem.
// - Punkte mit schlichtem grünem Haken in dunkler Schrift auf hellem Grund, darüber eine Trennlinie, viel Luft.
// Anders als Vorher: kein Siegelbild der Bestpreisgarantie („zu bunt“, und es trug „6× Preis-Leistungssieger“ neben
// „6× Testsieger DIE WELT“); die Garantie bleibt der antippbare Punkt mit Info-Symbol und öffnet ihr Fenster (onBestpreis,
// kein Link nach außen).
//
// „zu bunt“: kein farbiger Kasten mehr. Farbe tragen nur die grüne Zeile „Nach Zuschüssen“ („kann von mir aus grün
// bleiben“), die Haken und die Sterne; „Details“ und das Info-Symbol in pm-taupe-ink als Zeichen „antippbar“.
// „luftiger“: ein Takt von 24 px (Karte oben und unten, über und unter beiden Trennlinien), 12 px zwischen den Haken. Gruß,
// Titel, Preis und Punkte auf EINER linken Kante mit der Überschrift der Liste darunter (16 px Innenrand auf allen Breiten;
// Prüfung Gestaltung 13.11.: mit 20 px stand der Kopf ab 390 px 4 px rechts von „Passende Pflegekräfte“). Auf allen Breiten
// dieselbe Luft, nichts zusammengedrückt; kleiner wird unter 390 px nur, was sonst nicht nebeneinander passt (Kennzahlen,
// unter 375 px die grüne Zeile, unter 360 px der Preis).
// Fest: Punkte GARANTIE_TITEL + KOPF_PUNKTE (Martin 13.11.; GARANTIE_PUNKTE gilt nur noch für die Angebotsmail), Kostensatz und Aufstellung nur hinter
// „Details“ („Ich will das clean haben. So clean wie möglich“), keine zusätzliche Zeile im Kopf; Kennzahlen wie live (ohne
// Sterne-Stand keine Spalte, nie ein Ersatzwert; Sterne nie im selben Block wie das Testsieger-Siegel). Beträge wie bisher:
// Preis `bruttopreis` (derselbe Ersatzwert wie die Kostenkarte), grüne Zeile über `eigenanteilAus` (wie die kurze
// Angebotsmail #148), Heim-Vergleich = Heim-Eigenanteil im 1. Jahr minus Eigenanteil, nur wenn wir günstiger sind; ohne
// belegten Eigenanteil fehlen beide Zeilen. Kennungen für Tests und Messung wie live: data-angebot-minimal (Preiskarte),
// data-garantie (Punkte), id angebot-details / data-angebot-details (aufgeklappt).
export function KopfBereich({ anrede, lead, heimEigenanteil, heimQuelle, sterne, onBestpreis, onKostenAufgeklappt }: {
  /** Anrede für „Guten Tag, …“ (customerSalutation), ohne Anrede nur „Guten Tag“. */
  anrede: string | null;
  lead: Lead | null;
  heimEigenanteil: number;
  heimQuelle: string;
  sterne: SterneStand | null;
  /** Öffnet das Fenster der Bestpreisgarantie (BestpreisSheet, Messpunkt bestpreis_geoeffnet). */
  onBestpreis: () => void;
  /** Messpunkt `kosten_aufgeklappt` (Registry #123) beim Öffnen von „Details“. */
  onKostenAufgeklappt?: () => void;
}) {
  // „Details“ klappt Satz und Kostenaufstellung in der Preiskarte auf (statt der Kostenkarte unten, Martin 08.11.).
  const [details, setDetails] = useState(false);
  const kalk = lead?.kalkulation;
  const brutto = kalk?.bruttopreis ?? 3050;
  const eigen = eigenanteilAus(kalk);
  const weniger = eigen ? heimEigenanteil - eigen.eigen : 0;
  const linie = 'border-t border-pm-line-soft';
  // Martin 13.11.2026: „statt des Striches unter den Punkte würde ich vielleicht schreiben: Warum Primundus oder so?“; am Bild
  // gewählt: Überschrift ÜBER den Punkten statt der Linie.
  // Schrift in wenigen Stufen (Martin 13.11.: „zu viele schriften dort oder? geht es harmonischer“): groß nur Titel (28) und
  // Preis (38) fett; die grüne Zeile halbfett; Kennzahl-Werte fett (Martin: „die unteren Punkte würde ich schon fett
  // lassen“); Text 16 px normal dunkel wie die Punkte, auch der Heimvergleich (Martin: „den Text so lassen, wie bei
  // Preisgarantie … dann haben wir nur dieses Grün und dann … wie die Punkte“); „Details“ in Taupe; klein 15 px grau
  // (Gruß, „Warum Primundus?“, „/ Monat“, Beschriftung der Kennzahlen).
  const warum = <h2 className="mt-8 text-[15px] font-normal leading-5 text-pm-muted" data-kopf-warum>{WARUM_TITEL}</h2>;
  return (
    <div data-kopf>
      {/* Gruß und Titel frei auf dem Seitengrund wie die Kopfzone Vorher; linke Kante = Inhalt der Karte. */}
      <div className="px-4 pt-6 pb-4">
        {/* Klein und grau (Martin 13.11.: „Guten Tag, Frau Müller muss kleiner“), kein Heading mehr. */}
        <p className="text-[15px] leading-5 text-pm-muted" data-kopf-gruss>
          Guten Tag{anrede ? `, ${anrede}` : ''}
        </p>
        {/* 28 px wie Vorher, das größte Wort der Seite nach dem Preis; zwei feste Zeilen (KOPF_TITEL_ZEILEN). */}
        <h1 className="mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-pm-ink" data-kopf-titel>
          {KOPF_TITEL_ZEILEN[0]}{' '}<br />{KOPF_TITEL_ZEILEN[1]}
        </h1>
      </div>

      {/* Ohne eigenen Namen: Die Karte hieß über aria-labelledby wie der Titel, Vorleseprogramme sagten ihn dann zweimal
          (Prüfung Wortlaut 13.11.). */}
      <section className={`${KARTE} px-4 py-6`} data-angebot-minimal>
        {/* Preis groß, „Details“ klein rechts auf derselben Grundlinie: keine eigene Zeile dafür („so clean wie möglich“).
            Unter 360 px 34 statt 38 px, sonst ragte „Details“ bei 320 px über den Rand (Prüfung Code 13.11.). „/ Monat“
            sichtbar wie bisher; vorgelesen „pro Monat“ statt „Schrägstrich Monat“. */}
        <div className="flex items-baseline justify-between gap-3">
          <p className="whitespace-nowrap text-[38px] font-bold leading-none tracking-[-0.025em] tabular-nums text-pm-ink max-[359px]:text-[34px]" data-kopf-preis>
            {formatEuro(brutto)} <span className="text-[15px] font-normal tracking-normal text-pm-muted" aria-hidden="true">/ Monat</span>
            <span className="sr-only">pro Monat</span>
          </p>
          <button
            type="button"
            onClick={() => { if (!details) onKostenAufgeklappt?.(); setDetails(!details); }}
            aria-expanded={details}
            aria-controls="angebot-details"
            className={`${TIPPFLAECHE_HOCH} ${FOKUS} flex flex-none items-center gap-0.5 rounded-md text-[16px] font-normal text-pm-taupe-ink`}
            data-kopf-details
          >
            Details
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${details ? 'rotate-180' : '-rotate-90'}`} aria-hidden="true" />
          </button>
        </div>
        {/* Grün bleibt (Martin 13.11.: „Das kann von mir aus grün bleiben“), darunter grau der Pflegeheim-Vergleich. Unter
            375 px 16 statt 16,5 px: Auf Android 360 brach die Zeile sonst in zwei Zeilen um (Aufnahme 13.11., wie live), und
            der feste Knopf schnitt dann die Kennzahlen zwischen Wert und Beschriftung. */}
        {eigen && (
          <>
            <p className="mt-2.5 text-[16px] font-semibold leading-[22px] text-pm-green" data-nach-zuschuessen>
              Nach Zuschüssen <span className="whitespace-nowrap">ca. {formatEuro(eigen.eigen)} im Monat</span>
            </p>
            {weniger > 0 && (
              <p className="mt-0.5 text-[16px] leading-[22px] text-pm-ink" data-heimvergleich>
                rund {formatEuro(weniger)} weniger als im Pflegeheim
              </p>
            )}
          </>
        )}
        {details && (
          // Wortlaut wie bisher: Satz unter dem Preis, dann die Aufstellung (ohne Siegel, das steht schon oben).
          <div id="angebot-details" className={`mt-6 ${linie} pt-5`} data-angebot-details>
            <p className="text-[14px] leading-[1.5] text-pm-muted">
              Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).
            </p>
            <KostenAufstellung lead={lead} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} siegel={false} />
          </div>
        )}
        {/* Vier gleichwertige Punkte wie Vorher: grüner Haken (18 px, gut lesbar), dunkle Schrift, kein Kasten (Martin 13.11.:
            „das jetzige ist mir zu bunt“). „Bestpreisgarantie“ zuerst und antippbar; das Info-Symbol in der Farbe von
            „Details“ zeigt, dass man tippen kann. */}
        {warum}
        <ul className="mt-4 grid gap-3" data-garantie data-kopf-garantie>
          <li className="flex items-center gap-2.5 text-[16px] leading-[22px] text-pm-ink">
            <Check className="h-[18px] w-[18px] flex-none text-pm-green" strokeWidth={2.75} aria-hidden="true" />
            <button
              type="button"
              onClick={onBestpreis}
              className={`${TIPPFLAECHE_HOCH} ${FOKUS} inline-flex items-center gap-1.5 rounded text-left`}
              data-kopf-bestpreis
            >
              {GARANTIE_TITEL}
              <Info className="h-[18px] w-[18px] flex-none text-pm-taupe-ink" aria-label="Mehr Infos" />
            </button>
          </li>
          {KOPF_PUNKTE.map((punkt) => (
            <li key={punkt} className="flex items-center gap-2.5 text-[16px] leading-[22px] text-pm-ink">
              <Check className="h-[18px] w-[18px] flex-none text-pm-green" strokeWidth={2.75} aria-hidden="true" />{punkt}
            </li>
          ))}
        </ul>
        {/* Kennzahlen wie live: Sterne (ohne Stand fehlt die Spalte, kein Ersatzwert), 20 Jahre, 6× in Folge Testsieger; gleiche
            Abstände zwischen den Spalten, Text linksbündig (Martin 08.11.: „der erste und zweite Punkt zu nah beieinander …
            linksbündig, aber der Abstand muss besser passen“). Ab 360 px brechen Werte und Beschriftungen nicht um. Rechts 24 px
            frei: Martas Reiter steht in Ruhe 42 px in den Bildschirm hinein und lag auf iPhone 13 und Android 360 genau auf „6×
            in Folge“ (gemessen 14 und 18 px verdeckt). Unter 360 px liegt er tiefer, dort kein Abstand.
            Prüfung 13.11.: Die Spalten schrumpfen nie unter ihren Text (kein min-w-0), sonst lief er bei 320 px in die Nachbar-
            spalte („126 BewertungenErfahrung“). Unter 390 px eine Stufe kleiner (Beschriftung 14 px), damit zwischen den
            Spalten Luft bleibt (Android 360 vorher 11 px, iPhone SE ohne Reserve); unter 360 px darf nur die kleine Beschriftung
            umbrechen, die Werte bleiben einzeilig (bei 320 px bricht so nur „126 Bewertungen“, statt dass alle drei Spalten brechen).
            Vorgelesen: „Bewertung: 4,9 von 5 Sternen, 126 Bewertungen“, „Erfahrung: 20 Jahre“, „Testsieger: 6× in Folge“ (die
            sichtbare Beschriftung ist für Vorleseprogramme ausgeblendet, sie steht schon im dt). */}
        <dl className={`mt-6 ${linie} pt-6 flex justify-between gap-3 whitespace-nowrap min-[360px]:pr-6`} data-vertrauen>
          {sterne && (
            <div>
              <dt className="sr-only">Bewertung</dt>
              {/* „4,9“ und dahinter alle fünf Sterne (Martin 08.11.), anteilig gefüllt wie in der Bewertungszeile. */}
              <dd className="flex items-center gap-1.5 text-[16px] font-bold leading-[22px] text-pm-ink max-[389px]:text-[15px]">
                <span>{sterne.schnitt}</span>
                <span className="sr-only"> von 5 Sternen</span>
                <FuenfSterne wert={sterne.wert} />
              </dd>
              <dd className="mt-0.5 text-[15px] leading-5 text-pm-muted max-[389px]:text-[14px] max-[359px]:whitespace-normal">{anzahlText(sterne.anzahl)}</dd>
            </div>
          )}
          {VERTRAUEN.map(([wert, wort]) => (
            <div key={wert}>
              <dt className="sr-only">{wort}</dt>
              <dd className="text-[16px] font-bold leading-[22px] text-pm-ink max-[389px]:text-[15px]">{wert}</dd>
              <dd className="mt-0.5 text-[15px] leading-5 text-pm-muted max-[389px]:text-[14px] max-[359px]:whitespace-normal" aria-hidden="true">{wort}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

// ── Eine Pflegekraft als Zeile ────────────────────────────────────────────────────────────────────────────────────────
/** „12 Jahre Erfahrung“ und „Deutsch Gut“ — wie `kraftZeile` im Kostenrechner (lib/kraefte-vorschau.ts); fehlende Angaben
 *  entfallen. Die Deutsch-Stufe ist der Wert aus `nurse.language.level` unverändert (Grund / Mittel / Gut), derselbe
 *  Wortlaut steht in den Nachfassmails an Kunden (`Deutsch ${deutschWort}`, Martin 19.08.2026: „Deutsch Mittel“). */
export function zeilenFakten(nurse: Pick<Nurse, 'experienceYears' | 'language'>): string[] {
  const teile: string[] = [];
  const jahre = nurse.experienceYears ?? 0;
  if (jahre > 0) teile.push(jahre === 1 ? '1 Jahr Erfahrung' : `${jahre} Jahre Erfahrung`);
  const stufe = nurse.language?.level;
  if (stufe && stufe !== '—') teile.push(`Deutsch ${stufe}`);
  return teile;
}

// Wie die Zeile im ersten Bild vom 08.11. (Martin: „die Pflegekräfte wie auf dem ersten Bild … aber ich würde hier immer
// den Preis darstellen, also auch den Preis und dann einladen“): rundes Foto, Name und Alter, darunter die Angaben je in
// einer eigenen Zeile; rechts der Preis (ohne „/ Monat“, Martin 08.11.) und darunter „Einladen“. Der Preis ist der des
// Kunden: Die Liste zeigt nur Kräfte mit seiner Deutsch-Stufe (`matchesGermanyWish`, strikt), und die Stufe ist der einzige
// Preisfaktor, der an der Kraft hängt (lib/preisJeKraft.ts im Zweig feat/portal-preis-bei-pflegekraeften).
export function PflegekraftZeile({ nurse, preis, vorgemerkt, gesperrt, onNurseClick, onInvite, onInviteConfirm }: {
  nurse: Nurse;
  /** Monatspreis des Kunden (`kalkulation.bruttopreis`); ohne Preis entfällt die Angabe. */
  preis?: number | null;
  /** Registry #145: vorgemerkt → `EINGELADEN` mit Haken, bleibt tippbar und öffnet das Fenster erneut. */
  vorgemerkt: boolean;
  /** Eine Einladung läuft gerade (nach dem Speichern) → „Bitte warten…“ wie auf der Karte. */
  gesperrt: boolean;
  /** Tipp auf Foto oder Namen: Profil (Messpunkt `profil_geoeffnet` mit Quelle `karte`, wie die Karte). */
  onNurseClick: () => void;
  /** Tipp auf „Einladen“ — wie bei der Karte: false = das Portal hat selbst reagiert (vor dem Speichern: vormerken). */
  onInvite: () => boolean;
  onInviteConfirm?: () => Promise<void>;
}) {
  const vorname = nurse.name.split(' ')[0] || nurse.name;
  const fakten = zeilenFakten(nurse);
  const einladen = () => {
    if (!onInvite()) return;
    // Nur nach dem Speichern erreichbar (dann steht diese Zeile nicht mehr da); Fehler meldet das Portal selbst.
    void onInviteConfirm?.().catch(() => {});
  };
  // Foto auf heller Kreisfläche mit feinem Ring: freigestellte Fotos und Initialen wirken gleich groß und rund.
  // Größer als im ersten Bild (Martin: „die Karten schön ein bisschen größer auch mit den Bildern“).
  // 13.11.2026 (Martin: „schöner präsentieren … nicht ganz so kompakt … der Preis würde ich da rausnehmen und
  // einladen erstmal auch“): Foto 72 px, mehr Luft, ohne Preis und „Einladen“; die ganze Zeile öffnet das Profil (Pfeil rechts).
  const foto = 'h-[72px] w-[72px] flex-none rounded-full ring-1 ring-pm-line';
  const preisText = preis ? (
    <span className="whitespace-nowrap text-[16.5px] font-semibold tabular-nums text-pm-ink" data-preis>{formatEuro(preis)}</span>
  ) : null;
  // „Einladen“ grün umrandet (Martin 08.11.: die Koralle-Fläche „wirkt nicht passend zum rest und wirkt negativ“); Grün wie
  // die Zuschuss-Zeile und der Kasten, „Eingeladen“ dann grün gefüllt (Mint).
  const knopf = gesperrt ? (
    <button type="button" disabled aria-disabled="true" className={`${PILLE} cursor-not-allowed bg-pm-grund text-[14px] text-pm-muted`}>
      Bitte warten…
    </button>
  ) : vorgemerkt ? (
    // Martin 10.11.2026: „wenn eingeladen, dann kein button, sondern nur grün und text“ — ohne Fläche und Rahmen, rechtsbündig
    // unter dem Preis; tippbar bleibt es (öffnet das Fenster erneut, Logik #145).
    <button type="button" onClick={einladen} aria-label={`${EINGELADEN} ✓`} className={`${TIPPFLAECHE} ${FOKUS} flex h-11 w-[108px] max-[374px]:w-[104px] flex-none items-center justify-end gap-1 rounded-[10px] whitespace-nowrap text-[15.5px] font-bold text-pm-green-deep`}>
      <Check aria-hidden="true" className="h-[18px] w-[18px] flex-none" strokeWidth={3} />{EINGELADEN}
    </button>
  ) : (
    <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} border-2 border-pm-green bg-white text-[15.5px] text-pm-green-deep hover:bg-pm-mint`}>
      Einladen
    </button>
  );
  return (
    <li className="border-t border-pm-line-soft" data-pflegekraft-zeile={nurse.caregiverId} data-vorgemerkt={vorgemerkt || undefined}>
      <button type="button" onClick={onNurseClick} className={`${FOKUS} focus-visible:outline-offset-[-3px] group flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-pm-paper`}>
        {nurse.image ? (
          <img src={nurse.image} alt="" className={`${foto} bg-pm-grund object-cover`} />
        ) : (
          <span aria-hidden="true" className={`${foto} flex items-center justify-center text-[18px] font-bold text-white`} style={{ backgroundColor: nurse.color }}>
            {initials(nurse.name).slice(0, 2)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-semibold leading-6 text-pm-ink">
            {vorname}
            {nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
          </span>
          {fakten.map((teil) => (
            <span key={teil} className="mt-0.5 block text-[16px] leading-[22px] text-pm-ink">{teil}</span>
          ))}
          {/* ENTWURF 14.11.2026: Einladen geht wieder über das Profil (Logik #145); vorgemerkt → grüner Text wie seit #161
              (Martin 10.11.: „wenn eingeladen, dann kein button, sondern nur grün und text“). */}
          {vorgemerkt && (
            <span className="mt-1 flex items-center gap-1 text-[15.5px] font-bold leading-[22px] text-pm-green-deep" data-zeile-eingeladen>
              <Check aria-hidden="true" className="h-[18px] w-[18px] flex-none" strokeWidth={3} />{EINGELADEN}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 flex-none text-pm-muted" aria-hidden="true" />
      </button>
    </li>
  );
}

// Platzhalter, solange die Liste lädt (beim Erstbesuch real 8–29 s, Abnahme 07.11.): gleiche Form wie eine Zeile, kein
// Text, damit der erste Bildschirm nie leer ist.
function Platzhalterzeile() {
  return (
    <li className="flex items-center gap-4 border-t border-pm-line-soft px-4 py-4" data-platzhalter>
      <span className="h-[72px] w-[72px] flex-none animate-pulse rounded-full bg-pm-shell" />
      <span className="min-w-0 flex-1">
        <span className="block h-[14px] w-24 animate-pulse rounded bg-pm-shell" />
        <span className="mt-[8px] block h-[11px] w-32 max-w-full animate-pulse rounded bg-pm-line-soft" />
      </span>
      {/* 13.11.2026: Platzhalter rechts wie der Pfeil der echten Zeilen, nicht mehr als Knopf („Einladen“ ist weg). */}
      <span className="h-4 w-2.5 flex-none animate-pulse rounded bg-pm-line-soft" />
    </li>
  );
}
const PLATZHALTER = 5;

// ── Kontakt-Reiter (wie die CG-App) ───────────────────────────────────────────────────────────────────────────────────
// Reiter: weiße Pille am rechten Rand mit Griff, Foto und Punkt (grün 8–20 Uhr, sonst grau); 20 px eingeschoben, beim
// Scrollen 44 px, 0,9 s nach dem Scrollen zurück, im Formular eingeklappt (44 px, Martin 08.11.: „auf dem Formular … rechts
// eingeklappt lassen“). Tipp öffnet eine kleine Karte direkt neben dem Reiter (Martin 08.11.: „diese Marta-Seite … viel zu
// groß … Da, wo man klickt, könnte man das öffnen. Und … den Testsieger und die Sterne da … schön platzieren“; vorher ein
// Panel über 86 % der Breite und die ganze Höhe): Foto, Name, Rolle, Erreichbarkeit, Anrufen und WhatsApp, darunter Siegel und
// Sterne wie im Marta-Kasten. Wortlaute wie im Marta-Kasten.
function KontaktReiter({ eingeklappt, erreichbar, sterne, verborgen = false }: { eingeklappt: boolean; erreichbar: boolean; sterne: SterneStand | null; verborgen?: boolean }) {
  const [scrollt, setScrollt] = useState(false);
  // Stelle des Reiters beim Tipp (Bildschirmkoordinaten): daran richtet sich die Karte aus.
  const [anker, setAnker] = useState<DOMRect | null>(null);
  const offen = anker !== null;
  const karte = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState<{ top: number } | null>(null);
  useEffect(() => {
    let t = 0;
    // `capture`: auch das Scrollen im Handyrahmen am Computer (#portal-scroll-container) kommt hier an.
    const beimScrollen = () => {
      setScrollt(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setScrollt(false), 900);
    };
    document.addEventListener('scroll', beimScrollen, { capture: true, passive: true });
    return () => { window.clearTimeout(t); document.removeEventListener('scroll', beimScrollen, { capture: true }); };
  }, []);
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setAnker(null); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [offen]);
  // Karte mittig neben dem Reiter, aber ganz im Bild (unter der Navigationsleiste, über dem unteren Rand).
  useLayoutEffect(() => {
    if (!anker || !karte.current) { setLage(null); return; }
    const hoehe = karte.current.offsetHeight;
    const oben = anker.top + anker.height / 2 - hoehe / 2;
    setLage({ top: Math.max(64, Math.min(oben, window.innerHeight - hoehe - 12)) });
  }, [anker]);
  const schliessen = () => setAnker(null);
  const weg = verborgen || offen;
  const kachel = `${FOKUS} flex flex-col items-center justify-center gap-2 rounded-[18px] px-2 py-3.5 text-[14.5px] font-medium shadow-[0_0_0_1px_rgba(28,28,28,.08)]`;
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnker(e.currentTarget.getBoundingClientRect())}
        aria-label={`${BERATERIN}, ${BERATERIN_ROLLE}: ${erreichbar ? 'anrufen oder schreiben' : 'per WhatsApp schreiben'}`}
        aria-hidden={weg || undefined}
        tabIndex={weg ? -1 : 0}
        className={`${FOKUS} absolute right-0 flex items-center gap-1.5 rounded-l-[26px] bg-white/95 py-[5px] pl-2 pr-[7px] shadow-[0_0_0_1px_rgba(28,28,28,.06),0_10px_28px_rgba(28,28,28,.16)] backdrop-blur transition-[transform,opacity] duration-300 motion-reduce:transition-none ${
          weg ? 'pointer-events-none translate-x-[80px] opacity-0' : scrollt || eingeklappt ? 'translate-x-[44px]' : 'translate-x-[20px] hover:translate-x-0'
        }`}
        data-eingeklappt={eingeklappt || undefined}
        style={{ bottom: 224 }}
        data-kontakt-reiter
      >
        <span className="h-4 w-[3px] rounded-sm bg-pm-chip" aria-hidden="true" />
        <span className="relative">
          <img src="/marta-kapcio.jpg" alt="" className="h-[38px] w-[38px] rounded-full object-cover object-top" />
          {/* Grün = jetzt erreichbar (8–20 Uhr), sonst grau wie in der CG-App am Abend (`body.abend .edge .on-dot`). */}
          <span className={`absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-white ${erreichbar ? 'bg-pm-green' : 'bg-pm-mute'}`} aria-hidden="true" data-erreichbar={erreichbar || undefined} />
        </span>
      </button>
      {/* Portal an <body>: `fixed` in einem Element mit `transform`/`backdrop-blur` hinge sonst an diesem Element. */}
      {offen && createPortal(
        <div className="fixed inset-0 z-50 font-pm" role="dialog" aria-modal="true" aria-label={`${BERATERIN}, ${BERATERIN_ROLLE}`} data-kontakt-panel>
          <div className="absolute inset-0 bg-[rgba(15,8,22,.22)]" onClick={schliessen} />
          <div
            ref={karte}
            className="absolute right-3 max-[374px]:right-2 w-[min(344px,calc(100vw-24px))] max-[374px]:w-[calc(100vw-16px)] origin-right rounded-[24px] bg-white p-5 max-[374px]:p-4 shadow-[0_18px_50px_rgba(15,8,22,.22),0_0_0_1px_rgba(28,28,28,.05)]"
            style={{ top: lage?.top ?? 64, visibility: lage ? 'visible' : 'hidden' }}
          >
            <div className="flex items-start gap-3.5">
              <img src="/marta-kapcio.jpg" alt="" className="h-16 w-16 max-[374px]:h-14 max-[374px]:w-14 flex-none rounded-full object-cover object-top" />
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-[18px] font-semibold leading-tight text-pm-ink">{BERATERIN}</p>
                <p className="mt-0.5 text-[14px] text-pm-muted">{BERATERIN_ROLLE}</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-medium ${erreichbar ? 'bg-pm-mint text-pm-green-deep' : 'bg-pm-shell text-pm-muted'}`}>
                  <span className={`h-2 w-2 rounded-full ${erreichbar ? 'bg-pm-green' : 'bg-pm-mute'}`} aria-hidden="true" />{ERREICHBAR}
                </span>
              </div>
              <button type="button" onClick={schliessen} aria-label="Schließen" className={`${FOKUS} -mr-1.5 -mt-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-pm-muted hover:bg-pm-grund`}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {/* Außerhalb von 8–20 Uhr ist Anrufen ausgegraut und nicht antippbar, WhatsApp bleibt (Martin 08.11.: „nicht den
                Button wegnehmen, das sieht irgendwie komisch aus, sondern einfach nur rausgrauen“). */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {erreichbar ? (
                <a href={TELEFON_HREF} aria-label={`${BERATERIN} anrufen: ${TELEFON}`} className={`${kachel} bg-white text-pm-ink`}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pm-green text-white"><Phone className="h-5 w-5" aria-hidden="true" /></span>
                  Anrufen
                </a>
              ) : (
                <span aria-disabled="true" className={`${kachel} bg-pm-grund/60 text-pm-mute`} data-anrufen-aus>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pm-line text-white"><Phone className="h-5 w-5" aria-hidden="true" /></span>
                  Anrufen
                </span>
              )}
              <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" aria-label={`${BERATERIN} per WhatsApp schreiben`} className={`${kachel} bg-white text-pm-ink`}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pm-whatsapp text-white"><WhatsAppIcon className="h-[22px] w-[22px]" /></span>
                WhatsApp
              </a>
            </div>
            {erreichbar
              ? <p className="mt-3 text-center text-[14px] tabular-nums text-pm-muted">{TELEFON}</p>
              // Wortlaut: Martin 08.11. („außerhalb der Geschäftszeiten senden Sie eine WhatsApp oder so“), OpenAI 08.11. ohne
              // Antwortversprechen.
              : <p className="mt-3 text-center text-[13.5px] leading-snug text-pm-muted">{AUSSERHALB_ZEITEN}</p>}
            {/* Sterne und Siegel als zwei getrennte Spalten wie die Kennzahlen der Angebotskarte, nicht in einem Block (Martin
                08.11.: „du kannst nicht die Sterne einfach bei den Testsieger reinpacken“; schon zu Fassung 20: „als würde das
                zusammengehören“). Ohne Stand keine Sterne-Spalte. */}
            <div className="mt-5 flex items-stretch border-t border-pm-line-soft pt-4" data-marta-vertrauen>
              {sterne && (
                <a href={ERFAHRUNGEN_URL} target="_blank" rel="noreferrer" className={`${FOKUS} flex flex-1 max-[374px]:flex-none flex-col justify-center whitespace-nowrap rounded pr-3`} data-marta-sterne>
                  <span className="flex items-center gap-1.5 text-[17px] font-bold leading-5 text-pm-ink">
                    {sterne.schnitt}
                    <FuenfSterne wert={sterne.wert} groesse={13} />
                  </span>
                  <span className="mt-1 text-[12.5px] leading-4 text-pm-muted underline underline-offset-2">{anzahlText(sterne.anzahl)}</span>
                </a>
              )}
              <div className={`flex flex-1 items-center gap-2.5 max-[374px]:gap-2 whitespace-nowrap ${sterne ? 'border-l border-pm-line-soft pl-3' : ''}`} data-marta-siegel>
                <img src="/badge-testsieger.webp" alt="Testsieger DIE WELT" className="h-11 max-[374px]:h-10 w-auto flex-none object-contain" />
                <p className="leading-[1.25]">
                  <b className="block text-[14.5px] max-[374px]:text-[14px] text-pm-ink">6× Testsieger</b>
                  <span className="text-[12.5px] font-bold text-pm-taupe">DIE WELT</span>
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── So geht es weiter ─────────────────────────────────────────────────────────────────────────────────────────────────
// 13.11.2026 (Martin: „in der ersten Fassung hatten wir das mit einem grünen Button. Pflegesituation vervollständigen.
// In der guten Phase … wollen wir das nicht auch noch überlegen?“): „So geht es weiter“ wie in der guten Phase (f062df3), unter dem
// Formular: Schritt 1 grün hinterlegt mit grünem Knopf, der zum Formular hochspringt. Ohne „einladen“ (Martin 13.11.), Anreise wie
// live („ab 3 Tagen“), „Vieles ist schon ausgefüllt“ ersetzt durch das, was stimmt; „Kostenrechner“ nie sichtbar (Martin 13.11.).
// Weicht damit bewusst vom Ablauf unter dem letzten Schritt des Rechners ab (project 3/components/calculator/FormularPortal.tsx,
// ABLAUF_NACH_ABSENDEN, Registry #151/#152), der bleibt vorerst.
export const ABLAUF_GUTE_PHASE: readonly { titel: string; text: string }[] = [
  // Martin 13.11.: „damit die Pflegekräfte wissen, worum es geht … das da auch nochmal mit aufnehmen“.
  { titel: 'Pflegesituation vervollständigen', text: 'Beschreiben Sie kurz die Situation, damit die Pflegekräfte wissen, worauf es bei Ihnen ankommt. Das dauert ca.\u00a02\u00a0Minuten, einiges ist aus Ihren bisherigen Angaben schon übernommen.' },
  // Martin 13.11.: „bei der Bewerbung … auch noch kostenfrei und unverbindlich … hinzuschreiben“.
  { titel: 'Bewerbungen innerhalb von 60\u00a0Minuten erhalten', text: 'Passende Pflegekräfte bewerben sich bei Ihnen, mit Profil, Erfahrung und Anreisedatum. Für Sie kostenfrei und unverbindlich.' },
  { titel: 'Auswählen und starten', text: 'Sie wählen in Ruhe aus, erst danach schließen Sie den Vertrag. Wir übernehmen den Rest, Anreise schon ab 3\u00a0Tagen möglich.' },
];

function AblaufGutePhase({ onZumFormular }: { onZumFormular?: () => void }) {
  return (
    <section aria-labelledby="ablauf-titel" data-ablauf-gute-phase>
      <h2 id="ablauf-titel" className="px-1 pb-3 text-[20px] font-bold leading-[26px] text-pm-ink">So geht es weiter</h2>
      <ol className="overflow-hidden rounded-card border border-pm-line bg-white">
        {ABLAUF_GUTE_PHASE.map((schritt, i) => {
          const jetzt = i === 0;
          return (
            <li key={schritt.titel} className={`px-4 py-4 ${jetzt ? 'bg-pm-mint' : 'border-t border-pm-line'}`} aria-current={jetzt ? 'step' : undefined}>
              <div className="flex gap-3">
                <span className={`mt-0.5 flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full text-[13px] font-bold text-white ${jetzt ? 'bg-pm-green' : 'bg-pm-taupe-deep'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[16.5px] font-bold leading-[1.35] ${jetzt ? 'text-pm-green-deep' : 'text-pm-ink'}`}>{schritt.titel}</p>
                  <p className={`mt-1 text-[15px] leading-[1.45] ${jetzt ? 'text-pm-body' : 'text-pm-muted'}`}>{schritt.text}</p>
                </div>
              </div>
              {/* Knopf über die ganze Kastenbreite, damit „Pflegesituation vervollständigen“ auch auf dem iPhone SE in eine Zeile passt;
                  unter 340 px (Anzeigezoom) etwas kleiner und ohne Pfeil, sonst ragt der Text über den Rand. */}
              {jetzt && onZumFormular && (
                <button
                  type="button"
                  onClick={onZumFormular}
                  className={`${FOKUS} mt-3.5 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-pm-green px-3 text-[16px] font-bold text-white hover:bg-pm-green-deep max-[339px]:text-[15px]`}
                  data-ablauf-link
                >
                  <span className="whitespace-nowrap">Pflegesituation vervollständigen</span>
                  <ArrowUp className="h-[18px] w-[18px] flex-none max-[339px]:hidden" strokeWidth={2.5} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Die Seite vor dem Speichern: Minimal ──────────────────────────────────────────────────────────────────────────────
export function EinstiegMinimal({
  anrede, lead, onBestpreis, heimEigenanteil, heimQuelle,
  laedt, zeilen, gehalteneEinladungen, vorschlaegeVorhanden, bereitsBearbeitet, formular, sterne, vorgemerkte,
  onListeZumFormular, onAblaufZumFormular, onKostenAufgeklappt, onFaqGeoeffnet,
}: {
  /** Anrede für „Guten Tag, …“ (customerSalutation), ohne Anrede nur „Guten Tag“. */
  anrede: string | null;
  lead: Lead | null;
  onBestpreis: () => void;
  heimEigenanteil: number;
  heimQuelle: string;
  /** Vorschläge laden noch (Sitzung, Liste oder Einladungsstand) → Platzhalterzeilen. */
  laedt: boolean;
  /** Die sichtbaren Pflegekräfte als `PflegekraftZeile` (Empfehlung zuerst, wie die Karten). */
  zeilen: ReactNode[];
  gehalteneEinladungen: number;
  vorschlaegeVorhanden: boolean;
  bereitsBearbeitet: ReactNode;
  /** Das offene Formular (AngebotCard mit `stand75b8df8`). */
  formular: ReactNode;
  sterne: SterneStand | null;
  vorgemerkte: VorgemerkteKraft[];
  /** Knopf im Kasten unter der Liste: Sprung zum Formular (Messpunkt `zur_pflegesituation`, Quelle `hauptknopf` wie der
   *  Knopf unter der Liste bis #162). */
  onListeZumFormular?: () => void;
  /** „Pflegesituation vervollständigen“ in „So geht es weiter“: Sprung zum Formular (Messpunkt `zur_pflegesituation`, Quelle
   *  `schritte`). Ohne Rückruf bleibt der Schritt reiner Text. */
  onAblaufZumFormular?: () => void;
  onKostenAufgeklappt?: () => void;
  onFaqGeoeffnet?: (schluessel: string) => void;
}) {
  // Formular im Bild: Martas Reiter klappt dort ein (den festen Knopf, der hier früher wegfuhr, gibt es seit #162 nicht mehr).
  const [formularImBild, setFormularImBild] = useState(false);
  useEffect(() => {
    const ziel = document.getElementById('patientendaten');
    if (!ziel || typeof IntersectionObserver === 'undefined') return;
    const beobachter = new IntersectionObserver(([e]) => setFormularImBild(e.isIntersecting || e.boundingClientRect.top < 0));
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, []);
  // Marta-Kasten im Bild → Reiter weg (sonst steht Marta am Seitenende doppelt).
  const martaKasten = useRef<HTMLDivElement>(null);
  const [kastenImBild, setKastenImBild] = useState(false);
  useEffect(() => {
    const ziel = martaKasten.current;
    if (!ziel || typeof IntersectionObserver === 'undefined') return;
    const beobachter = new IntersectionObserver(([e]) => setKastenImBild(e.isIntersecting));
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, []);
  // Marta erreichbar (täglich 8–20 Uhr deutscher Zeit)? Jede Minute neu, damit eine offene Seite um 20 Uhr umspringt.
  const [erreichbar, setErreichbar] = useState(() => istErreichbar());
  useEffect(() => {
    const t = window.setInterval(() => setErreichbar(istErreichbar()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const anzahl = zeilen.length;
  const leer = !laedt && anzahl === 0;
  const hinweis = (titel: string, text: string) => (
    <div className="border-t border-pm-line-soft px-5 pt-4 pb-5 text-center">
      <p className="text-[15px] font-semibold mb-1 text-pm-ink">{titel}</p>
      <p className="text-[14px] leading-relaxed text-pm-muted">{text}</p>
    </div>
  );
  return (
    // `overflow-x-clip` (kein Scrollbereich, sticky bleibt): der halb eingeschobene Kontakt-Reiter ragt über den rechten
    // Rand und darf keinen Querscroll erzeugen.
    <div className="bg-pm-grund overflow-x-clip" data-einstieg="minimal">
      {/* Erster Teil: Gruß, Angebotskarte, Pflegekräfte. */}
      {/* Seitenrand 12 px, unter 375 px 8 px (Android 360: mehr Platz für die Zeilen). */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2">
        {/* Kopf: Gruß klein, Titel groß, Preiskarte (Martin 13.11.2026; Begründung an KopfBereich). */}
        <KopfBereich
          anrede={anrede} lead={lead} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} sterne={sterne}
          onBestpreis={onBestpreis} onKostenAufgeklappt={onKostenAufgeklappt}
        />

        {/* id = Sprungziel des Mail-Deeplinks `goto=matches`. Ohne Vorschläge (und ohne Hinweis) entfällt der Abschnitt. */}
        {!(leer && gehalteneEinladungen === 0 && !vorschlaegeVorhanden) && (
          <section id="pflegekraefte" style={{ scrollMarginTop: 96 }} aria-labelledby="pflegekraefte-titel" className={`${KARTE} mt-3 overflow-hidden`}>
            <h2 id="pflegekraefte-titel" className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 text-[18px] font-semibold leading-6 text-pm-ink">
              {LISTE_TITEL}
              {!laedt && anzahl > 0 && (
                <span className="rounded-full bg-pm-grund px-2 py-px text-[13px] font-semibold leading-5 tabular-nums text-pm-muted">{anzahl}</span>
              )}
            </h2>
            {(laedt || anzahl > 0) && <p className="-mt-1 px-4 pb-3.5 text-[15px] leading-5 text-pm-muted" data-liste-zeile>{LISTE_ZEILE}</p>}
            {laedt ? (
              <ul aria-busy="true" aria-label="Wir laden Ihre Pflegekräfte …">
                {Array.from({ length: PLATZHALTER }, (_, i) => <Platzhalterzeile key={i} />)}
              </ul>
            ) : anzahl > 0 ? (
              <>
                <ul>{zeilen}</ul>
                {/* ENTWURF 14.11.2026 (Martin: „Im Portal fehlt der Text und Button unter den PKs“): wie im Bild vom 13.11.
                    vormittags, Knopf grün über die ganze Breite, Pfeil nach unten (das Formular steht direkt darunter). */}
                {onListeZumFormular && (
                  <div className="border-t border-pm-line-soft px-4 pt-5 pb-5" data-liste-knopf>
                    <p className="flex items-center gap-2 text-[16px] font-semibold leading-[22px] text-pm-amber-ink" data-liste-unvollstaendig>
                      <AlertCircle className="h-5 w-5 flex-none text-pm-amber" strokeWidth={2.25} aria-hidden="true" />
                      {LISTE_UNVOLLSTAENDIG}
                    </p>
                    <p className="mt-2 text-[16px] leading-[22px] text-pm-ink" data-liste-warum>{LISTE_WARUM}</p>
                    <button
                      type="button"
                      onClick={onListeZumFormular}
                      className={`${FOKUS} mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-pm-green px-3 text-[16px] font-bold text-white hover:bg-pm-green-deep active:scale-[0.99] max-[339px]:text-[15px]`}
                    >
                      <span className="whitespace-nowrap">{LISTE_KNOPF}</span>
                      <ArrowDown className="h-[18px] w-[18px] flex-none max-[339px]:hidden" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            ) : gehalteneEinladungen > 0 ? (
              hinweis('Ihre Auswahl ist eingeladen', 'Die Pflegekräfte melden sich meist innerhalb von 1–2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier. Meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.')
            ) : (
              hinweis('Alle aktuellen Vorschläge bearbeitet', 'Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor. Sie hören von uns.')
            )}
          </section>
        )}

      </div>

      {/* Pflegesituation mit offenem Formular direkt unter der Liste (13.11.2026). */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2 pb-4 space-y-4">
        {bereitsBearbeitet && <div className="pt-6">{bereitsBearbeitet}</div>}
        <AbschnittPflegesituation vorgemerkte={vorgemerkte} formular={formular} schlicht />
        {/* Martin 13.11.2026: „einen Marta-Kasten … mit Anbieten von Beratung und dann Schreiben, Anrufen“ (Standard-Baustein
            MartaBox, ohne Siegel und Sterne, die stehen schon im Kopf), darunter „So geht es weiter“ wie in der guten Phase. */}
        <div className="pt-2" data-marta-beratung>
          <MartaBox sterne={sterne} erreichbar={erreichbar} hinweisAusserhalb={AUSSERHALB_ZEITEN} ohneVertrauen titel={MARTA_BERATUNG_TITEL} />
        </div>
        <div className="pt-2"><AblaufGutePhase onZumFormular={onAblaufZumFormular} /></div>
      </div>

      {/* Die Kostenkarte entfällt hier: ihre Aufstellung steht unter „Details“ in der Angebotskarte (Martin 08.11.). */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2 pt-2 pb-6 space-y-4">
        <div className="pt-6">
          <FaqListe ruhig karte minimal onFrageGeoeffnet={onFaqGeoeffnet} />
        </div>
        <div className="pt-4" ref={martaKasten}>
          <MartaBox sterne={sterne} erreichbar={erreichbar} hinweisAusserhalb={AUSSERHALB_ZEITEN} />
        </div>
      </div>
      {/* Martas Reiter: eigener Sticky-Anker über die ganze Seite (rechter Rand), im Formular eingeklappt, weg beim Marta-Kasten. */}
      <div className="sticky bottom-0 z-20 h-0" data-reiter-anker>
        <KontaktReiter eingeklappt={formularImBild} erreichbar={erreichbar} sterne={sterne} verborgen={kastenImBild} />
      </div>
    </div>
  );
}
