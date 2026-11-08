// Einstieg VOR dem ersten Speichern der Pflegesituation: „Minimal“ — Registry #147 (Entwurf, nicht live).
//
// Martin 07.11.2026 zum Mockup (seo-reports/analysen/vorschlag-minimal-2026-11-07/mockup/portal.html): „Ja, alle drei“.
// Vorher (Abnahme 07.11.): auf dem iPhone 13 kam die erste Pflegekraft bei 1.426 px, das Formular bei 2.603 px.
// „Einladen“ ist die Logik aus #145 unverändert (CustomerPortalPage: Fenster „{Name} einladen“, Vormerken, nach dem
// ersten Speichern automatisch einladen).
//
// „Rückruf vereinbaren“ schickt mit `onRueckruf` die Bitte über `/api/rueckmeldung` (Aktion `rueckruf`, Quelle
// `portal_einstieg`, Team-Mail an info@, src/lib/rueckruf.ts). Ohne `onRueckruf` (Vorschau, Lead ohne Rückrufnummer)
// bleibt es ein Anruf-Link. Wortlaut von Erfolg und Fehler aus der Rückmeldeseite (project 3/app/rueckmeldung/page.tsx).
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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Nurse } from '../../types';
import { formatEuro, type Lead } from '../../lib/supabase';
import { eigenanteilAus } from '../../lib/angebotZuschuss';
import { anzahlText, type SterneStand } from '../../lib/sterne';
import { ERREICHBAR, TELEFON, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';
import { initials } from './shared';
import { SCHRITTE_STAND_75B8DF8 } from './EinstiegVorSpeichern';
import { AbschnittPflegesituation, KostenAufstellung, type VorgemerkteKraft } from './EinstiegPflegekraefteZuerst';
import { FaqListe } from './FaqListe';
import { MartaBox } from './MartaBox';

// Wortlaut (Martin 08.11.2026, diktiert; Entwurf, Freigabe des Wortlauts offen). Tests prüfen genau diese Texte.
export const ANGEBOT_TITEL = 'Ihr persönliches Angebot';
/** Fester schmaler Knopf unten, zwei Zeilen (Martin: „Pflegesituation vervollständigen und Bewerbung erhalten. So müsste das
 *  doch sein.“; Mehrzahl wie im freigegebenen Hauptknopf vom 07.11.). */
export const FEST_KNOPF = ['Pflegesituation vervollständigen', 'und Bewerbungen erhalten'] as const;
/** Grüner Kasten in der Angebotskarte: die Bestpreisgarantie als erster von vier gleichwertigen Punkten (Martin: „Ist das
 *  unsere Bestpreisgarantie? Oder ist das nur ein Punkt davon?“ — die anderen drei gehören nicht zur Garantie), dazu die
 *  Punkte, die Hemmnisse nehmen (Martin: „Keine Vorauszahlung, keine Vermittlungsgebühr. Keine Mindestlaufzeit … oder
 *  keine Kündigungsfrist. Beides genügt.“; belegt: USP 4/5, Mustervertrag § 3 und § 4 „ab dem Tag der Ankunft“).
 *  „Mehr Infos“ unter der Garantie öffnet ihr Fenster. */
export const GARANTIE_TITEL = 'Es gilt immer unsere Bestpreisgarantie';
export const GARANTIE_PUNKTE = ['Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit'] as const;
/** Vertrauen unten in der Angebotskarte (Martin: „seit 20 Jahren und 6 Jahre in Folge … Testsieger … die Sterne“): Wert
 *  groß, Beschriftung klein darunter, wie die Kennzahlen im CGA-Panel. Wortlaut „6× in Folge“ wie die Auszeichnungsseite. */
export const VERTRAUEN = [['20 Jahre', 'Erfahrung'], ['6× in Folge', 'Testsieger']] as const;
/** Knopf der Zeile nach dem Tipp auf „Einladen“ (statt „Vorgemerkt“, Martin: „sieht natürlich komisch aus“). „Ausgewählt“
 *  statt „Eingeladen“ (OpenAI-Prüfung 08.11.): verschickt wird die Einladung erst nach dem Speichern der Pflegesituation. */
export const AUSGEWAEHLT = 'Ausgewählt';
export const RUECKRUF = 'Rückruf vereinbaren';
// Rückruf erbeten: wörtlich die Rückmeldeseite (project 3/app/rueckmeldung/page.tsx, Zustand „rueckruf-ok“ Überschrift,
// live seit Registry #72; die Team-Mail zitiert denselben Satz, project 3/lib/rueckmeldung.ts). Der Folgesatz der Seite
// („Sie möchten nicht warten? Rufen Sie an: …“) entfällt, weil die Nummer direkt darunter steht.
export const RUECKRUF_OK = 'Danke, Marta ruft Sie an.';
// Fehler: wörtlich die Überschrift des Zustands „fehler“ derselben Seite (ohne Punkt wie dort). Der Knopf bleibt darunter
// zum Wiederholen stehen, die Nummer darunter ebenfalls.
export const RUECKRUF_FEHLER = 'Das hat nicht geklappt';

// Wie in der Navigationsleiste: Tippfläche ≥ 44 px über ein unsichtbares ::before, die sichtbare Pille bleibt kleiner.
const TIPPFLAECHE = "relative before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-['']";
const FOKUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe';
// Knopf rechts in der Zeile: in allen Zuständen gleich breit und hoch (88 × 34 px), damit die Zeile ihre Höhe hält.
// 88 px: „Ausgewählt“ mit Haken-Symbol (12 px halbfett, ca. 83 px) passt mit etwas Luft hinein.
const PILLE = 'flex h-[34px] w-[88px] flex-none items-center justify-center rounded-[10px] font-semibold whitespace-nowrap';
// Karte wie im CGA-Panel: weiß auf dem Seitengrund, ohne Rahmen und Schatten.
const KARTE = 'rounded-card bg-white';

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
  const zahl = (betrag: number) => <span className="whitespace-nowrap font-semibold text-pm-ink">{formatEuro(betrag)}</span>;
  return (
    <section className={`${KARTE} px-4 pb-4 pt-3.5`} aria-labelledby="angebot-titel" data-angebot-minimal>
      <div className="flex items-center justify-between gap-3">
        <h2 id="angebot-titel" className="text-[13.5px] font-medium leading-5 text-pm-muted">{ANGEBOT_TITEL}</h2>
        <button
          type="button"
          onClick={() => { if (!details) onKostenAufgeklappt?.(); setDetails(!details); }}
          aria-expanded={details}
          aria-controls="angebot-details"
          className={`${TIPPFLAECHE} ${FOKUS} flex flex-none items-center gap-0.5 rounded-md text-[14px] font-semibold text-pm-taupe-ink`}
        >
          Details
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${details ? 'rotate-180' : '-rotate-90'}`} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 whitespace-nowrap text-[30px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-pm-ink">
        {formatEuro(brutto)} <span className="text-[15px] font-medium tracking-normal text-pm-muted">/ Monat</span>
      </p>
      {/* Zusatzkosten nah am Preis (Preisangaben; Martin 08.11.: „Ja, klein unter den Preis“), Wortlaut wie live in der
          Kostenkarte. */}
      <p className="mt-1 text-[12.5px] leading-[1.4] text-pm-muted" data-preis-hinweis>
        {/* „(125 € pro Fahrt)“ bricht nur als Ganzes um. */}
        Zzgl. Kost und Logis sowie Reisekosten <span className="whitespace-nowrap">(125 € pro Fahrt).</span>
      </p>
      {eigen && (
        <p className="mt-1.5 text-[14px] leading-[1.45] text-pm-muted" data-nach-zuschuessen>
          Nach Zuschüssen ca. {zahl(eigen.eigen)}
          {weniger > 0 && <>, rund {zahl(weniger)} weniger als im Pflegeheim</>}
        </p>
      )}
      {details && (
        // Wortlaut der bisherigen Kostenkarte: erster Satz unter dem Preis (der zweite steht schon oben), dann die Aufstellung
        // hinter „Alle Kosten im Überblick“.
        <div id="angebot-details" className="mt-3 border-t border-pm-line-soft pt-3" data-angebot-details>
          <p className="text-[14px] leading-[1.5] text-pm-muted">Monatlich inkl. Steuern, Gebühren und Sozialabgaben.</p>
          <KostenAufstellung lead={lead} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} siegel={false} />
        </div>
      )}
      {/* Vier gleichwertige Punkte, der Garantie-Satz zuerst und halbfett, „Mehr Infos“ darunter. Unter 375 px etwas enger,
          damit der Garantie-Satz einzeilig bleibt (Android 360). */}
      <ul className="mt-3.5 grid gap-1.5 rounded-[14px] bg-pm-mint px-4 max-[374px]:px-3 py-3" data-garantie>
        <li className="flex items-start gap-2 text-[14px] max-[374px]:text-[13.5px] leading-5 text-pm-green-deep">
          <Check className="mt-[3px] h-3.5 w-3.5 flex-none" strokeWidth={3} aria-hidden="true" />
          <span>
            <span className="font-bold">{GARANTIE_TITEL}</span>
            <button type="button" onClick={onBestpreis} className={`${FOKUS} mt-0.5 block rounded text-[13px] font-semibold leading-5 underline underline-offset-2`}>
              Mehr Infos
            </button>
          </span>
        </li>
        {GARANTIE_PUNKTE.map((punkt) => (
          <li key={punkt} className="flex items-start gap-2 text-[14px] leading-5 text-pm-green-deep">
            <Check className="mt-[3px] h-3.5 w-3.5 flex-none" strokeWidth={3} aria-hidden="true" />{punkt}
          </li>
        ))}
      </ul>
      {/* Vertrauen: Sterne (ohne Stand fehlt die Spalte, kein Ersatzwert), 20 Jahre, 6× in Folge Testsieger. */}
      <dl className={`mt-3.5 grid ${sterne ? 'grid-cols-3' : 'grid-cols-2'} gap-2 border-t border-pm-line-soft pt-3`} data-vertrauen>
        {sterne && (
          <div className="min-w-0">
            <dt className="sr-only">Bewertungen</dt>
            <dd className="flex items-center gap-1 text-[15px] font-bold leading-5 text-pm-ink">
              {sterne.schnitt}
              <svg viewBox="0 0 20 20" width={15} height={15} className="flex-none" aria-hidden="true">
                <path d="M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z" fill="#D4A843" />
              </svg>
            </dd>
            <dd className="text-[12px] leading-4 text-pm-muted">{anzahlText(sterne.anzahl)}</dd>
          </div>
        )}
        {VERTRAUEN.map(([wert, wort]) => (
          <div key={wert} className="min-w-0">
            <dt className="sr-only">{wort}</dt>
            <dd className="text-[15px] font-bold leading-5 text-pm-ink">{wert}</dd>
            <dd className="text-[12px] leading-4 text-pm-muted">{wort}</dd>
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
  /** Registry #145: vorgemerkt → `AUSGEWAEHLT` mit Haken, bleibt tippbar und öffnet das Fenster erneut. */
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
  const foto = 'h-[60px] w-[60px] max-[374px]:h-14 max-[374px]:w-14 flex-none rounded-full ring-1 ring-pm-line';
  return (
    <li className="flex items-center gap-3 max-[374px]:gap-2.5 border-t border-pm-line-soft px-3.5 max-[374px]:px-3 py-3" data-pflegekraft-zeile={nurse.caregiverId} data-vorgemerkt={vorgemerkt || undefined}>
      <button type="button" onClick={onNurseClick} className={`${FOKUS} flex min-w-0 flex-1 items-center gap-3 max-[374px]:gap-2.5 rounded-[12px] text-left`}>
        {nurse.image ? (
          <img src={nurse.image} alt="" className={`${foto} bg-pm-grund object-cover`} />
        ) : (
          <span aria-hidden="true" className={`${foto} flex items-center justify-center text-[15px] font-bold text-white`} style={{ backgroundColor: nurse.color }}>
            {initials(nurse.name).slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[16.5px] font-semibold leading-[1.3] text-pm-ink">
            {vorname}{nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
          </span>
          {fakten.map((teil) => (
            <span key={teil} className="block text-[13.5px] leading-[1.4] text-pm-muted">{teil}</span>
          ))}
        </span>
      </button>
      <div className="flex flex-none flex-col items-end gap-1.5">
        {preis ? (
          <p className="whitespace-nowrap text-right leading-none" data-preis>
            <span className="text-[15px] font-semibold tabular-nums text-pm-ink">{formatEuro(preis)}</span>
          </p>
        ) : null}
        {gesperrt ? (
          <button type="button" disabled aria-disabled="true" className={`${PILLE} cursor-not-allowed bg-pm-grund text-[12px] text-pm-muted`}>
            Bitte warten…
          </button>
        ) : vorgemerkt ? (
          <button type="button" onClick={einladen} aria-label={`${AUSGEWAEHLT} ✓`} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} gap-0.5 bg-pm-mint text-[12px] text-pm-green-deep`}>
            {AUSGEWAEHLT}<Check aria-hidden="true" className="h-3 w-3 flex-none" strokeWidth={3} />
          </button>
        ) : (
          <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} border border-pm-line bg-white text-[13.5px] text-pm-ink hover:border-pm-taupe-light`}>
            Einladen
          </button>
        )}
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

// ── „Rückruf vereinbaren“ ─────────────────────────────────────────────────────────────────────────────────────────────
type RueckrufStand = 'bereit' | 'laeuft' | 'ok' | 'fehler';
const RUECKRUF_KNOPF = `${FOKUS} flex min-h-[48px] w-full items-center justify-center rounded-[14px] border border-pm-line bg-white px-4 text-[15px] font-semibold text-pm-ink transition-colors hover:border-pm-taupe-light`;

// Tastatur und Screenreader (Prüfung 07.11.): Während der Anfrage bleibt der Knopf fokussierbar (`aria-disabled` statt
// `disabled`; ein gesperrter Knopf verliert den Fokus, er fiel auf den Seitenanfang). Der Statusbereich steht von Anfang an
// leer im DOM und bekommt erst beim Erfolg den Dank (wie der Toast-Rahmen in #145): ein Bereich, der erst mit seinem Text
// eingefügt wird, sagen Screenreader (vor allem VoiceOver auf iOS) unzuverlässig an. Weil der Knopf danach entfällt, geht
// der Fokus auf den Dank an seiner Stelle. Die Fehlermeldung bleibt `role="alert"` über dem Knopf, der Fokus auf dem Knopf.
function RueckrufKnopf({ onRueckruf }: { onRueckruf?: () => Promise<boolean> }) {
  const [stand, setStand] = useState<RueckrufStand>('bereit');
  const laeuft = useRef(false);
  const dank = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (stand === 'ok') dank.current?.focus();
  }, [stand]);
  if (!onRueckruf) {
    return <a href={TELEFON_HREF} className={RUECKRUF_KNOPF}>{RUECKRUF}</a>;
  }
  const anfordern = async () => {
    if (laeuft.current) return; // Doppeltipp (und Tipp während der Anfrage): eine Anfrage
    laeuft.current = true;
    setStand('laeuft');
    let ok = false;
    try { ok = await onRueckruf(); } catch { ok = false; }
    laeuft.current = false;
    setStand(ok ? 'ok' : 'fehler');
  };
  const busy = stand === 'laeuft';
  // EIN Element im Raster darüber: der leere Statusbereich nimmt so keinen Abstand ein, nichts verschiebt sich.
  return (
    <div data-rueckruf>
      {stand === 'fehler' && (
        <p role="alert" className="mb-2 text-center text-[13px] font-semibold leading-snug text-pm-error-ink">{RUECKRUF_FEHLER}</p>
      )}
      <div role="status">
        {stand === 'ok' && (
          // An der Stelle des Knopfs, gleich hoch (nichts springt).
          <p ref={dank} tabIndex={-1} className={`${FOKUS} flex min-h-[48px] items-center justify-center rounded-[14px] bg-pm-mint px-4 text-center text-[15px] font-semibold text-pm-green-deep`}>
            {RUECKRUF_OK}
          </p>
        )}
      </div>
      {stand !== 'ok' && (
        <button
          type="button"
          onClick={anfordern}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className={`${RUECKRUF_KNOPF} aria-disabled:cursor-wait aria-disabled:opacity-70`}
        >
          {RUECKRUF}
        </button>
      )}
    </div>
  );
}

// ── So geht es weiter ─────────────────────────────────────────────────────────────────────────────────────────────────
// Martin 08.11.: „der Ablauf deutlich schöner dargestellt … optisch ist das nicht schön“. Wie die Stufen im CGA-Panel:
// weiße Karte, Punkte auf einer senkrechten Linie, der aktuelle Schritt hervorgehoben. Wortlaut der drei Schritte
// unverändert (`SCHRITTE_STAND_75B8DF8`, Stand 75b8df8); vor dem Speichern ist Schritt 1 der aktuelle.
function AblaufMinimal() {
  return (
    <section className={`${KARTE} px-4 pt-3.5 pb-2`} aria-labelledby="ablauf-titel" data-ablauf-minimal>
      <h2 id="ablauf-titel" className="text-[16px] font-semibold leading-6 text-pm-ink">So geht es weiter</h2>
      <ol className="mt-2">
        {SCHRITTE_STAND_75B8DF8.map((schritt, i) => {
          const jetzt = i === 0;
          const letzter = i === SCHRITTE_STAND_75B8DF8.length - 1;
          return (
            <li key={schritt.titel} className="relative flex gap-3 pb-3" aria-current={jetzt ? 'step' : undefined}>
              {!letzter && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-pm-line" aria-hidden="true" />}
              <span
                className={`relative z-[1] mt-1 flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full text-[13px] font-bold ${
                  jetzt ? 'bg-pm-coral text-white' : 'border border-pm-line bg-white text-pm-muted'
                }`}
              >
                {i + 1}
              </span>
              <div className={`min-w-0 flex-1 rounded-[12px] px-3 py-2 ${jetzt ? 'bg-pm-coral-tint' : ''}`}>
                <p className="text-[15px] font-semibold leading-5 text-pm-ink">{schritt.titel}</p>
                <p className="mt-0.5 text-[13.5px] leading-[1.45] text-pm-muted">{schritt.text}</p>
              </div>
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
  onVervollstaendigen, onRueckruf, onKostenAufgeklappt, onFaqGeoeffnet,
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
  /** „Rückruf vereinbaren“: Bitte ans Team senden; `true` = angekommen. Ohne (Vorschau, Lead ohne Rückrufnummer) bleibt
   *  der Knopf ein Anruf-Link. */
  onRueckruf?: () => Promise<boolean>;
  onKostenAufgeklappt?: () => void;
  onFaqGeoeffnet?: (schluessel: string) => void;
}) {
  const anzahl = zeilen.length;
  const leer = !laedt && anzahl === 0;
  const hinweis = (titel: string, text: string) => (
    <div className="border-t border-pm-line-soft px-5 pt-4 pb-5 text-center">
      <p className="text-[15px] font-semibold mb-1 text-pm-ink">{titel}</p>
      <p className="text-[14px] leading-relaxed text-pm-muted">{text}</p>
    </div>
  );
  return (
    <div className="bg-pm-grund" data-einstieg="minimal">
      {/* Erster Teil: Gruß mit Sternen, Angebotskarte, Pflegekräfte, Rückruf und Nummer; der feste Knopf hängt am Ende dieses
          Teils und bleibt bis dorthin unten am Bildschirm stehen (sticky, ohne Skript: auch im Handyrahmen am Computer). */}
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
            <h2 id="pflegekraefte-titel" className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 text-[16px] font-semibold leading-6 text-pm-ink">
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

        <div className="grid gap-2.5 pt-4 pb-2" data-aktionen-minimal>
          <RueckrufKnopf onRueckruf={onRueckruf} />
          <p className="pt-0.5 text-center text-[12.5px] leading-[1.5] text-pm-muted">
            oder anrufen, auch per{' '}
            <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="font-semibold text-pm-taupe-ink">WhatsApp</a>:<br />
            <a href={TELEFON_HREF} className="font-semibold text-pm-taupe-ink">{TELEFON}</a> ({ERREICHBAR})
          </p>
        </div>

        {/* Fester schmaler Knopf (Martin 08.11.: „den wir festmachen unten“). Sticky am Ende des ersten Teils: steht beim
            Laden unten am Bildschirm, scrollt man bis hierher, bleibt er hier liegen und das Formular darunter ist frei. */}
        <div
          className="sticky bottom-0 z-20 -mx-3 max-[374px]:-mx-2 mt-2 bg-pm-grund/95 px-3 max-[374px]:px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_18px_-14px_rgba(28,28,28,.35)] backdrop-blur"
          data-fester-knopf
        >
          <button
            type="button"
            onClick={onVervollstaendigen}
            className={`${FOKUS} block w-full rounded-[12px] bg-pm-coral px-4 py-2 text-center text-[15px] font-bold leading-5 text-white transition-colors hover:bg-pm-coral-deep active:scale-[0.99]`}
          >
            {/* Zwei feste Zeilen statt automatischem Umbruch: sonst stünde „und“ am Ende der ersten Zeile. */}
            <span className="block">{FEST_KNOPF[0]}</span>
            <span className="block">{FEST_KNOPF[1]}</span>
          </button>
        </div>
      </div>

      {/* Darunter wie in „Pflegekräfte zuerst“ (#145): Pflegesituation mit offenem Formular. */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2 pb-4 space-y-4">
        {bereitsBearbeitet && <div className="pt-6">{bereitsBearbeitet}</div>}
        <AbschnittPflegesituation vorgemerkte={vorgemerkte} formular={formular} />
      </div>

      {/* Die Kostenkarte entfällt hier: ihre Aufstellung steht unter „Details“ in der Angebotskarte (Martin 08.11.). */}
      <div className="max-w-3xl mx-auto px-3 max-[374px]:px-2 pt-2 pb-6 space-y-4">
        <AblaufMinimal />
        <div className="pt-6">
          <FaqListe ruhig karte onFrageGeoeffnet={onFaqGeoeffnet} />
        </div>
        <div className="pt-4">
          <MartaBox sterne={sterne} />
        </div>
      </div>
    </div>
  );
}
