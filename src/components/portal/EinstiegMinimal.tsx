// Einstieg VOR dem ersten Speichern der Pflegesituation: „Minimal“ — Registry #147 (Entwurf, nicht live).
//
// Martin 07.11.2026 zum Mockup (seo-reports/analysen/vorschlag-minimal-2026-11-07/mockup/portal.html): „Ja, alle drei“.
// Vorher (Abnahme 07.11.): auf dem iPhone 13 kam die erste Pflegekraft bei 1.426 px, das Formular bei 2.603 px.
// „Einladen“ ist die Logik aus #145 unverändert (CustomerPortalPage: Fenster „{Name} einladen“, Vormerken, nach dem
// ersten Speichern automatisch einladen).
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
import { ArrowRight, ArrowUp, Check, ChevronDown, Info, Phone, X } from 'lucide-react';
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
export const ANGEBOT_TITEL = 'Ihr persönliches Angebot';
/** Fester Knopf unten: eine Zeile Titel, darunter Martins Unterzeile (08.11.: „Pflegesituation vervollständigen &
 *  Bewerbungen erhalten - darunter: 100% kostenfrei & unverbindlich“, danach „definitiv zu langtextlich“). Kurz der Nutzen;
 *  „Pflegesituation vervollständigen“ steht als Titel direkt darunter am Formular. */
export const FEST_TITEL = 'Bewerbungen erhalten';
export const FEST_ZEILE = '100% kostenfrei & unverbindlich';
/** Kopf des Formulars in der weißen Karte (Martin 08.11.: „was soll das heißen: Pflegesituation vervollständigen“); der Satz
 *  darunter ist der bisherige Satz des Abschnitts (Martins 60-Minuten-Satz). */
export const FORMULAR_TITEL = 'Pflegesituation vervollständigen';
export const FORMULAR_ZEILE = 'Danach können Sie Pflegekräfte einladen und bekommen Bewerbungen. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.';
/** Panel der Ansprechpartnerin: Unterzeile wie im Marta-Kasten („Ihre Beraterin“). */
/** Hinweis im Marta-Fenster und im Marta-Kasten außerhalb von 8–20 Uhr. */
export const AUSSERHALB_ZEITEN = 'Außerhalb der Geschäftszeiten können Sie Marta per WhatsApp schreiben.';
export const BERATERIN_ROLLE = 'Ihre Beraterin';
/** Grüner Kasten in der Angebotskarte: vier gleichwertige, kurze Punkte, die Bestpreisgarantie zuerst (Martin: „Ist das
 *  unsere Bestpreisgarantie? Oder ist das nur ein Punkt davon?“ — die anderen drei gehören nicht zur Garantie; „Es gilt
 *  immer unsere Bestpreisgarantie“ mit „Mehr Infos“ darunter war ihm zu kompliziert: „Ich will das clean haben“).
 *  Hemmnis-Punkte nach Martin („Keine Vorauszahlung, keine Vermittlungsgebühr. Keine Mindestlaufzeit … Beides genügt.“;
 *  belegt: USP 4/5, Mustervertrag § 3 und § 4 „ab dem Tag der Ankunft“). Tipp auf „Bestpreisgarantie“ öffnet ihr Fenster. */
export const GARANTIE_TITEL = 'Bestpreisgarantie';
export const GARANTIE_PUNKTE = ['Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit'] as const;
/** Vertrauen unten in der Angebotskarte (Martin: „seit 20 Jahren und 6 Jahre in Folge … Testsieger … die Sterne“): Wert
 *  groß, Beschriftung klein darunter, wie die Kennzahlen im CGA-Panel. Wortlaut „6× in Folge“ wie die Auszeichnungsseite. */
export const VERTRAUEN = [['20 Jahre', 'Erfahrung'], ['6× in Folge', 'Testsieger']] as const;
/** Knopf der Zeile nach dem Tipp auf „Einladen“ (statt „Vorgemerkt“, Martin: „sieht natürlich komisch aus“). „Eingeladen“
 *  (Martin 08.11. abends: „warum steht da ausgewählt, wenn ich eingeladen habe … muss auch eingeladen sein“); verschickt wird
 *  die Einladung technisch mit dem Absenden der Pflegesituation (Logik #145 unverändert). */
export const EINGELADEN = 'Eingeladen';
// Wie in der Navigationsleiste: Tippfläche ≥ 44 px über ein unsichtbares ::before, die sichtbare Pille bleibt kleiner.
const TIPPFLAECHE = "relative before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-['']";
const FOKUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe';
// Knopf rechts in der Zeile: in allen Zuständen gleich breit und hoch, damit die Zeile ihre Höhe hält. 104 × 36 px (unter
// 375 px 96 px): „Eingeladen“ mit Haken in 13 px passt mit Luft hinein (Martin 08.11.: „passender in den Button … macht die
// Button-Tick größer von vornherein“); vorher 88 × 34 px mit 12 px Schrift.
const PILLE = 'flex h-10 w-[108px] max-[374px]:w-[104px] flex-none items-center justify-center rounded-[10px] font-semibold whitespace-nowrap';
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

// ── Angebotskarte ────────────────────────────────────────────────────────────────────────────────────────────────────────
// „Ihr persönliches Angebot“, Preis „/ Monat“, eine ruhige Zeile „Nach Zuschüssen ca. … €, rund … € weniger als im
// Pflegeheim“ (Zuschüsse wie die kurze Angebotsmail #148, src/lib/angebotZuschuss.ts; Heim-Eigenanteil im 1. Jahr minus
// Eigenanteil, Quelle in „Details ›“), darunter die Bestpreisgarantie als grüner Kasten. Ohne belegten Eigenanteil fehlt die
// Zeile, den Vergleich gibt es nur, wenn wir günstiger sind. Preis wie in der Kostenkarte (`bruttopreis`, dort derselbe
// Ersatzwert).
export function AngebotKarteMinimal({ lead, heimEigenanteil, heimQuelle, sterne, onBestpreis, onKostenAufgeklappt }: {
  lead: Lead | null;
  heimEigenanteil: number;
  heimQuelle: string;
  sterne: SterneStand | null;
  onBestpreis: () => void;
  /** Messpunkt `kosten_aufgeklappt` (Registry #123) beim Öffnen von „Details“. */
  onKostenAufgeklappt?: () => void;
}) {
  // „Details“ klappt die Kostenaufstellung hier in der Karte auf (statt der Kostenkarte unten, Martin 08.11.).
  const [details, setDetails] = useState(false);
  const kalk = lead?.kalkulation;
  const brutto = kalk?.bruttopreis ?? 3050;
  const eigen = eigenanteilAus(kalk);
  const weniger = eigen ? heimEigenanteil - eigen.eigen : 0;
  return (
    <section className={`${KARTE} px-4 pb-4 pt-3.5`} aria-labelledby="angebot-titel" data-angebot-minimal>
      <div className="flex items-center justify-between gap-3">
        <h2 id="angebot-titel" className="text-[15px] font-medium leading-5 text-pm-muted">{ANGEBOT_TITEL}</h2>
        <button
          type="button"
          onClick={() => { if (!details) onKostenAufgeklappt?.(); setDetails(!details); }}
          aria-expanded={details}
          aria-controls="angebot-details"
          className={`${TIPPFLAECHE} ${FOKUS} flex flex-none items-center gap-0.5 rounded-md text-[15px] font-semibold text-pm-taupe-ink`}
        >
          Details
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${details ? 'rotate-180' : '-rotate-90'}`} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 whitespace-nowrap text-[30px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-pm-ink">
        {formatEuro(brutto)} <span className="text-[15px] font-medium tracking-normal text-pm-muted">/ Monat</span>
      </p>
      {/* Grün wie der Kasten der kurzen Angebotsmail (Martin 08.11.: „vorher schon besser mit dem Grün nach Zuschüssen“),
          darunter klein der Pflegeheim-Vergleich. */}
      {eigen && (
        <>
          <p className="mt-1.5 text-[16.5px] font-semibold leading-snug text-pm-green" data-nach-zuschuessen>
            Nach Zuschüssen <span className="whitespace-nowrap">ca. {formatEuro(eigen.eigen)} im Monat</span>
          </p>
          {weniger > 0 && (
            <p className="mt-0.5 text-[15px] leading-snug text-pm-muted" data-heimvergleich>
              rund {formatEuro(weniger)} weniger als im Pflegeheim
            </p>
          )}
        </>
      )}
      {details && (
        // Wortlaut der bisherigen Kostenkarte: Satz unter dem Preis, dann die Aufstellung hinter „Alle Kosten im Überblick“.
        <div id="angebot-details" className="mt-3 border-t border-pm-line-soft pt-3" data-angebot-details>
          <p className="text-[14px] leading-[1.5] text-pm-muted">
            Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).
          </p>
          <KostenAufstellung lead={lead} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} siegel={false} />
        </div>
      )}
      {/* Vier gleichwertige Punkte untereinander, gleiche Schrift; „Bestpreisgarantie“ ist antippbar (kleines Info-Symbol). */}
      <ul className="mt-3.5 grid gap-1.5 rounded-[14px] bg-pm-mint px-4 py-3" data-garantie>
        <li className="flex items-center gap-2 text-[16px] leading-[22px] text-pm-green-deep">
          <Check className="h-4 w-4 flex-none" strokeWidth={3} aria-hidden="true" />
          <button type="button" onClick={onBestpreis} className={`${FOKUS} inline-flex items-center gap-1.5 rounded text-left`}>
            {GARANTIE_TITEL}
            <Info className="h-3.5 w-3.5 flex-none opacity-70" aria-label="Mehr Infos" />
          </button>
        </li>
        {GARANTIE_PUNKTE.map((punkt) => (
          <li key={punkt} className="flex items-center gap-2 text-[16px] leading-[22px] text-pm-green-deep">
            <Check className="h-4 w-4 flex-none" strokeWidth={3} aria-hidden="true" />{punkt}
          </li>
        ))}
      </ul>
      {/* Vertrauen: Sterne (ohne Stand fehlt die Spalte, kein Ersatzwert), 20 Jahre, 6× in Folge Testsieger. Gleiche Abstände
          zwischen den Spalten, Text linksbündig (Martin 08.11.: „der erste und zweite Punkt zu nah beieinander … linksbündig,
          aber der Abstand muss besser passen“); vorher drei gleich breite Spalten, darin 16 px und 50 px Lücke. Rechts 24 px
          frei: Martas Reiter steht in Ruhe 42 px in den Bildschirm hinein und lag auf iPhone 13 und Android 360 genau auf
          „6× in Folge“ (gemessen 14 und 18 px verdeckt). Unter 360 px (iPhone SE) liegt er tiefer, dort kein Abstand. */}
      <dl className="mt-3.5 flex justify-between gap-3 border-t border-pm-line-soft pt-3 min-[360px]:pr-6" data-vertrauen>
        {sterne && (
          <div className="min-w-0">
            <dt className="sr-only">Bewertungen</dt>
            {/* „4,9“ und dahinter alle fünf Sterne (Martin 08.11.), anteilig gefüllt wie in der Bewertungszeile. */}
            <dd className="flex items-center gap-1.5 text-[16.5px] font-bold leading-5 text-pm-ink">
              {sterne.schnitt}
              <FuenfSterne wert={sterne.wert} />
            </dd>
            <dd className="mt-0.5 text-[13.5px] leading-4 text-pm-muted">{anzahlText(sterne.anzahl)}</dd>
          </div>
        )}
        {VERTRAUEN.map(([wert, wort]) => (
          <div key={wert} className="min-w-0">
            <dt className="sr-only">{wort}</dt>
            <dd className="text-[16.5px] font-bold leading-5 text-pm-ink">{wert}</dd>
            <dd className="mt-0.5 text-[13.5px] leading-4 text-pm-muted">{wort}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  const foto = 'h-14 w-14 flex-none rounded-full ring-1 ring-pm-line';
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
    <button type="button" onClick={einladen} aria-label={`${EINGELADEN} ✓`} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} gap-1 bg-pm-green text-[14.5px] text-white`}>
      <Check aria-hidden="true" className="h-4 w-4 flex-none" strokeWidth={3} />{EINGELADEN}
    </button>
  ) : (
    <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} border-[1.5px] border-pm-green bg-white text-[15.5px] text-pm-green-deep hover:bg-pm-mint`}>
      Einladen
    </button>
  );
  return (
    <li className={`flex items-center gap-2.5 border-t border-pm-line-soft px-3.5 max-[374px]:px-3 py-3.5 ${vorgemerkt ? 'bg-pm-mint/70' : ''}`} data-pflegekraft-zeile={nurse.caregiverId} data-vorgemerkt={vorgemerkt || undefined}>
      <button type="button" onClick={onNurseClick} className={`${FOKUS} group flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] text-left`}>
        {nurse.image ? (
          <img src={nurse.image} alt="" className={`${foto} bg-pm-grund object-cover`} />
        ) : (
          <span aria-hidden="true" className={`${foto} flex items-center justify-center text-[15px] font-bold text-white`} style={{ backgroundColor: nurse.color }}>
            {initials(nurse.name).slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          {/* Name unterstrichen: man sieht, dass sich das Profil öffnen lässt (Martin 08.11.). */}
          <span className="block text-[18px] font-semibold leading-[1.3] text-pm-ink">
            <span className="underline decoration-pm-chip decoration-[1.5px] underline-offset-[3px] group-hover:decoration-pm-taupe">{vorname}</span>
            {nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
          </span>
          {fakten.map((teil) => (
            <span key={teil} className="block text-[15px] leading-[1.4] text-pm-muted">{teil}</span>
          ))}
        </span>
      </button>
      <div className="flex flex-none flex-col items-end gap-1.5">
        {preisText}
        {knopf}
      </div>
    </li>
  );
}

// Platzhalter, solange die Liste lädt (beim Erstbesuch real 8–29 s, Abnahme 07.11.): gleiche Form wie eine Zeile, kein
// Text, damit der erste Bildschirm nie leer ist.
function Platzhalterzeile() {
  return (
    <li className="flex items-center gap-3 border-t border-pm-line-soft px-3.5 py-3" data-platzhalter>
      <span className="h-[60px] w-[60px] flex-none animate-pulse rounded-full bg-pm-shell" />
      <span className="min-w-0 flex-1">
        <span className="block h-[14px] w-24 animate-pulse rounded bg-pm-shell" />
        <span className="mt-[8px] block h-[11px] w-32 max-w-full animate-pulse rounded bg-pm-line-soft" />
      </span>
      <span className="h-[34px] w-[88px] flex-none animate-pulse rounded-[10px] bg-pm-line-soft" />
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
// Martin 08.11.: „der Ablauf deutlich schöner dargestellt … optisch ist das nicht schön“. Wie die Stufen im CGA-Panel:
// weiße Karte, Punkte auf einer senkrechten Linie, der aktuelle Schritt hervorgehoben.
// Registry #152 (Martin 09.11.: „wie wir das im Portal auch haben, also dass das alles gleich ist“): dieselben drei Schritte
// wie unter dem letzten Schritt des Rechners (project 3/components/calculator/FormularPortal.tsx, ABLAUF_NACH_ABSENDEN, Registry
// #151; der Rechner kann nicht aus src/ importieren, beide Stellen gleich halten). Hier ist Schritt 1 erledigt (der Kunde sieht
// Angebot und Pflegekräfte), Schritt 2 der aktuelle und springt zum Formular. Der alte Wortlaut bleibt für `?einstieg=alt`
// (EinstiegVorSpeichern.tsx, SCHRITTE_STAND_75B8DF8).
export const ABLAUF_MINIMAL: readonly { titel: string; text?: string }[] = [
  { titel: 'Angebot und passende Pflegekräfte sofort sehen, inklusive aller Zuschüsse' },
  { titel: 'Bewerbungen innerhalb von 60\u00a0Minuten erhalten', text: 'Auf Wunsch: Pflegesituation kurz beschreiben, dann bewerben sich passende Pflegekräfte bei Ihnen.' },
  { titel: 'Auswählen und starten', text: 'Sie wählen in Ruhe aus, erst danach schließen Sie den Vertrag. Wir übernehmen den Rest, Anreise schon ab 3\u00a0Tagen möglich.' },
];
const ABLAUF_ERLEDIGT = 0;
const ABLAUF_JETZT = 1;

function AblaufMinimal({ onZumFormular }: { onZumFormular?: () => void }) {
  return (
    <section className={`${KARTE} px-4 pt-3.5 pb-2`} aria-labelledby="ablauf-titel" data-ablauf-minimal>
      <h2 id="ablauf-titel" className="text-[18px] font-semibold leading-6 text-pm-ink">So geht es weiter</h2>
      <ol className="mt-2">
        {ABLAUF_MINIMAL.map((schritt, i) => {
          const erledigt = i === ABLAUF_ERLEDIGT;
          const jetzt = i === ABLAUF_JETZT;
          const letzter = i === ABLAUF_MINIMAL.length - 1;
          return (
            <li key={schritt.titel} className="relative flex gap-3 pb-3" aria-current={jetzt ? 'step' : undefined}>
              {!letzter && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-pm-line" aria-hidden="true" />}
              <span
                className={`relative z-[1] mt-1 flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full text-[13px] font-bold ${
                  erledigt ? 'bg-pm-mint text-pm-green-deep' : jetzt ? 'bg-pm-coral text-white' : 'border border-pm-line bg-white text-pm-muted'
                }`}
              >
                {erledigt ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-label="erledigt" /> : i + 1}
              </span>
              {jetzt && onZumFormular ? (
                // Martin 08.11.: „wenn ich da draufklicke, dass ich nach oben springe. Nicht zu auffällig, aber schon ein Link …
                // mit so einem Pfeil da auch rechts, ganz dezent. Darf nicht umspringen“: gleiche Fläche als Knopf, kleiner Pfeil
                // in der Titelzeile, nichts verschiebt sich.
                <button type="button" onClick={onZumFormular} className={`${FOKUS} block min-w-0 flex-1 rounded-[12px] bg-pm-coral-tint px-3 py-2 text-left hover:bg-pm-coral/15`} data-ablauf-link>
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[16.5px] font-semibold leading-[1.35] text-pm-ink">{schritt.titel}</span>
                    <ArrowUp className="mt-0.5 h-4 w-4 flex-none text-pm-coral-deep/70" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  {schritt.text && <span className="mt-1 block text-[15px] leading-[1.45] text-pm-muted">{schritt.text}</span>}
                </button>
              ) : (
                <div className={`min-w-0 flex-1 rounded-[12px] px-3 py-2 ${jetzt ? 'bg-pm-coral-tint' : ''}`}>
                  <p className={`text-[16.5px] font-semibold leading-[1.35] ${erledigt ? 'text-pm-muted' : 'text-pm-ink'}`}>{schritt.titel}</p>
                  {schritt.text && <p className="mt-1 text-[15px] leading-[1.45] text-pm-muted">{schritt.text}</p>}
                </div>
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
  onVervollstaendigen, onAblaufZumFormular, onKostenAufgeklappt, onFaqGeoeffnet,
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
  /** Fester Knopf unten: ins Formular (CustomerPortalPage, Messpunkt `zur_pflegesituation` mit Quelle `hauptknopf`). */
  onVervollstaendigen: () => void;
  /** „Pflegesituation vervollständigen“ in „So geht es weiter“: Sprung zum Formular (Messpunkt `zur_pflegesituation`, Quelle
   *  `schritte`). Ohne Rückruf bleibt der Schritt reiner Text. */
  onAblaufZumFormular?: () => void;
  onKostenAufgeklappt?: () => void;
  onFaqGeoeffnet?: (schluessel: string) => void;
}) {
  // Der feste Knopf steht nur über Angebot und Pflegekräften (Martin 08.11.: „den wir festmachen unten“). Kommt das Formular
  // ins Bild, fährt er weg; im Formular steht dessen eigener Knopf fest UNTER dem Formular, nichts schwebt mehr darüber (Martin
  // 08.11. abends: „den Button dann schon immer unter dem Formular lassen und nicht mehr Flugding“; „wozu brauche ich dann
  // Bewerbungen erhalten? … dann ist es vorbei“ → dort „Weiter →“, erst im letzten Schritt „Bewerbungen erhalten“).
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
      {/* Erster Teil: Gruß, Angebotskarte, Pflegekräfte; der feste Knopf hängt am Ende dieses Teils und bleibt bis dorthin unten
          am Bildschirm stehen (sticky, ohne Skript: auch im Handyrahmen am Computer). */}
      {/* Seitenrand 12 px, unter 375 px 8 px (Android 360: mehr Platz für die Zeilen). */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2">
        <h1 className="px-1 pt-4 pb-3 text-[22px] font-semibold leading-[1.2] tracking-[-0.015em] text-pm-ink">
          Guten Tag{anrede ? `, ${anrede}` : ''}
        </h1>
        <AngebotKarteMinimal
          lead={lead} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} sterne={sterne}
          onBestpreis={onBestpreis} onKostenAufgeklappt={onKostenAufgeklappt}
        />

        {/* id = Sprungziel des Mail-Deeplinks `goto=matches`. Ohne Vorschläge (und ohne Hinweis) entfällt der Abschnitt. */}
        {!(leer && gehalteneEinladungen === 0 && !vorschlaegeVorhanden) && (
          <section id="pflegekraefte" style={{ scrollMarginTop: 96 }} aria-labelledby="pflegekraefte-titel" className={`${KARTE} mt-3 overflow-hidden`}>
            <h2 id="pflegekraefte-titel" className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 text-[18px] font-semibold leading-6 text-pm-ink">
              Passende Pflegekräfte
              {!laedt && anzahl > 0 && (
                <span className="rounded-full bg-pm-grund px-2 py-px text-[13px] font-semibold leading-5 tabular-nums text-pm-muted">{anzahl}</span>
              )}
            </h2>
            {laedt ? (
              <ul aria-busy="true" aria-label="Wir laden Ihre Pflegekräfte …">
                {Array.from({ length: PLATZHALTER }, (_, i) => <Platzhalterzeile key={i} />)}
              </ul>
            ) : anzahl > 0 ? (
              <ul>{zeilen}</ul>
            ) : gehalteneEinladungen > 0 ? (
              hinweis('Ihre Auswahl ist eingeladen', 'Die Pflegekräfte melden sich meist innerhalb von 1–2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier. Meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.')
            ) : (
              hinweis('Alle aktuellen Vorschläge bearbeitet', 'Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor. Sie hören von uns.')
            )}
          </section>
        )}

        {/* Fester Knopf: Sticky-Anker ohne Höhe am Ende des ersten Teils, das Band hängt nach oben daran. Sobald das Formular ins
            Bild kommt, fährt es nach unten weg; dann gilt der Knopf unter dem Formular. */}
        <div className="sticky bottom-0 z-20 h-0" data-fester-knopf-anker>
          <div
            className={`absolute bottom-0 -left-3 -right-3 max-[374px]:-left-2 max-[374px]:-right-2 bg-pm-grund/95 px-3 max-[374px]:px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_18px_-14px_rgba(28,28,28,.35)] backdrop-blur transition-[transform,opacity] duration-300 motion-reduce:transition-none ${
              formularImBild ? 'pointer-events-none translate-y-full opacity-0' : ''
            }`}
            aria-hidden={formularImBild || undefined}
            data-fester-knopf
          >
            <button
              type="button"
              onClick={onVervollstaendigen}
              tabIndex={formularImBild ? -1 : 0}
              className={`${FOKUS} block w-full rounded-[12px] bg-pm-coral px-4 py-2.5 text-center text-white transition-colors hover:bg-pm-coral-deep active:scale-[0.99]`}
            >
              {/* Pfeil (Martin 08.11.: „wir lassen Bewerbungen erhalten. Und dann kommt so ein Pfeil dahin“). */}
              <span className="flex items-center justify-center gap-1.5 text-[16px] font-bold leading-5">
                {FEST_TITEL}
                <ArrowRight className="h-[18px] w-[18px] flex-none" strokeWidth={2.5} aria-hidden="true" data-pfeil />
              </span>
              <span className="mt-0.5 block text-[13.5px] font-medium leading-4 opacity-90">{FEST_ZEILE}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pflegesituation mit offenem Formular (Logik wie „Pflegekräfte zuerst“, #145); der Knopf steht fest darunter. */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2 pb-4 space-y-4">
        {bereitsBearbeitet && <div className="pt-6">{bereitsBearbeitet}</div>}
        <AbschnittPflegesituation vorgemerkte={vorgemerkte} formular={formular} schlicht />
      </div>

      {/* Die Kostenkarte entfällt hier: ihre Aufstellung steht unter „Details“ in der Angebotskarte (Martin 08.11.). */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2 pt-2 pb-6 space-y-4">
        <AblaufMinimal onZumFormular={onAblaufZumFormular} />
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
