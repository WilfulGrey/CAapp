// Kompakter Einstieg ins Portal: der Zustand VOR dem ersten Absenden der Pflegesituation
// (Vorschlag 03.10.2026 für Martin: „ganz kompakt auf Angebot und passende Pflegekräfte … das ist
// erledigt, das ist das Angebot, das ist der nächste Schritt, hier sind die Pflegekräfte").
//
// Reihenfolge auf der Seite (CustomerPortalPage, `kompakt`), Runde 13 (Geschäftsführung: „überall
// nur Tags, Überschrift, Tags …" — ruhig; betont sind nur Kostenkarte und Hinweis, sonst Text mit Luft):
//   Kopf: Begrüßung, „Ihr Angebot zur 24-Stunden-Betreuung", Einleitung (KompaktEinleitung)
//   → Kostenkarte (Runde 14 schlanker): Preis, kleine Schrift, der Textlink „Alle Kosten im Überblick ›"
//     (öffnet die Aufstellung samt Eigenanteil), Linie, die vier Punkte der Startseite, Linie, Siegel mit
//     Testsieger/Erfahrung und Sternen (KompaktVertrauen)
//   → „Ihre passenden Pflegekräfte" (KompaktPflegekraefteBereich) mit dem Hinweis „Ihre Pflegesituation
//     ist noch nicht vollständig" (dunkles Kopfband, weißer Körper; das 4-Schritte-Formular klappt
//     darin auf), darunter die echten Profile als schlichte Zeilen (KompaktePflegekraefte).
// Keine Versalien-Zeilen, keine weiteren Kästen oder Tönungen. Alle anderen Zustände (abgesendet,
// Bewerbung, gebucht …) bleiben unverändert.
//
// Schrift: Fließtext 16 px, kleine Schrift 14 px. Ausnahme 13 px für die dritte Zeile der
// Pflegekräfte — so bleibt sie bei 390 px einzeilig.
import { useEffect, useRef, type ReactNode } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import { BewertungsZeile } from './BewertungsZeile';
import { DeutschPunkte } from './PflegekraftProfil';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { SectionHeader } from '../ui/SectionHeader';

/**
 * Runde 16 (Vorschlag 04.10., Martin: „Findest du das geil? Wollen wir nicht was Besseres wagen?"): der Einstieg als
 * Weg. Eine feine Linie verbindet vier Stationen: ✓ Angebot erstellt (Preiskarte) → ● Pflegesituation vervollständigen
 * (Hinweis mit Knopf, das Formular klappt darin auf) → ○ Ihre passenden Pflegekräfte → ○ Bewerbungen erhalten.
 * Bis zur Entscheidung nur per Adresse: `?look=weg`, dazu `&kopf=dunkel` für den Kopf im dunklen Band der
 * Partnerseite (#191715). Ohne Parameter bleibt Fassung 11 (`ruhig`).
 */
export type KompaktLook = 'ruhig' | 'weg';
const SUCHE = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
export const KOMPAKT_LOOK: KompaktLook = SUCHE?.get('look') === 'weg' ? 'weg' : 'ruhig';
export const KOMPAKT_KOPF_DUNKEL = KOMPAKT_LOOK === 'weg' && SUCHE?.get('kopf') === 'dunkel';
/** Runde 16, Hinweis in Station 2: Standard = Status + positiver Nachsatz (OpenAI-Gegencheck), `&hinweis=lang` =
 *  Wortlaut der Geschäftsführung vom 04.10. (zur Abnahme nebeneinander). */
const HINWEIS_LANG = KOMPAKT_LOOK === 'weg' && SUCHE?.get('hinweis') === 'lang';

type WegZustand = 'erledigt' | 'jetzt' | 'offen';

/** Punkt einer Station: erledigt = grün mit Haken, jetzt = Koralle-Ring mit Kern, offen = leerer Ring. */
function WegPunkt({ zustand }: { zustand: WegZustand }) {
  if (zustand === 'erledigt') {
    return (
      <span className="absolute left-0 top-[3px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-pm-green" aria-hidden="true">
        <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />
      </span>
    );
  }
  if (zustand === 'jetzt') {
    return (
      <span className="absolute left-0 top-[3px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-pm-coral bg-white ring-4 ring-pm-coral/15" aria-hidden="true">
        <span className="h-[8px] w-[8px] rounded-full bg-pm-coral" />
      </span>
    );
  }
  return <span className="absolute left-0 top-[3px] h-[22px] w-[22px] rounded-full border-[1.5px] border-pm-chip bg-pm-paper" aria-hidden="true" />;
}

/**
 * Eine Station des Wegs. Die Linie läuft vom Punkt bis zum Punkt der nächsten Station (3 px in deren Kopf hinein),
 * deshalb darf zwischen zwei Stationen kein Außenabstand stehen — der Abstand ist das `pb-10` der Station.
 * `linie`: grün = Strecke schon gegangen, grau = noch offen, keine = letzte Station.
 */
export function WegStation({ zustand, titel, zeile, linie, children, titelId }: {
  zustand: WegZustand;
  titel: ReactNode;
  zeile?: ReactNode;
  linie?: 'gruen' | 'grau';
  children?: ReactNode;
  titelId?: string;
}) {
  return (
    <section aria-labelledby={titelId} className={`relative pl-9 ${linie ? 'pb-9' : ''}`}>
      {linie && (
        <span
          aria-hidden="true"
          className={`absolute left-[10.25px] top-[29px] bottom-[-3px] w-[1.5px] ${linie === 'gruen' ? 'bg-pm-green/55' : 'bg-pm-line'}`}
        />
      )}
      <WegPunkt zustand={zustand} />
      <h2 id={titelId} className="text-[18px] font-semibold leading-[28px] tracking-[-0.01em] text-pm-ink">
        {zustand === 'erledigt' && <span className="sr-only">Erledigt: </span>}
        {zustand === 'jetzt' && <span className="sr-only">Jetzt: </span>}
        {titel}
      </h2>
      {zeile && <p className="mt-1 text-[15px] leading-[1.5] text-pm-muted">{zeile}</p>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/**
 * Einleitung unter dem Titel (Runde 14, Wortlaut der Geschäftsführung): was das Angebot umfasst, was wir
 * organisieren und wann die Ansprechpartnerin erreichbar ist. Fließtext, kein Kasten; seit Runde 15
 * (Designdurchgang) 17 px mit Zeilenhöhe 1,55.
 */
export function KompaktEinleitung({ dunkel = false }: { dunkel?: boolean }) {
  return (
    <p className={`mt-4 text-[17px] leading-[1.55] ${dunkel ? 'text-white/80' : 'text-pm-muted'}`}>
      {/* Die Uhrzeit und das Satzende bleiben zusammen — kein „da." allein in der letzten Zeile. */}
      Ihr Angebot umfasst eine Rund-um-Betreuung zu Hause durch bei uns angestellte Betreuungskräfte.
      Anreise, Wechsel und Vertretung organisieren wir, und Ihre Ansprechpartnerin ist täglich von{' '}
      <span className="whitespace-nowrap">8 bis 20 Uhr</span> <span className="whitespace-nowrap">für Sie da.</span>
    </p>
  );
}

/** Die erste Zeile neben dem Siegel unten in der Kostenkarte (Runde 13, Wortlaut der Geschäftsführung). */
export const VERTRAUEN = ['6× in Folge Testsieger DIE WELT', 'über 20 Jahre Erfahrung'] as const;

/**
 * Unten in der Kostenkarte (Runde 13; Runde 15 neu gesetzt): Testsieger-Siegel (40 px), daneben
 * „6× in Folge Testsieger DIE WELT · über 20 Jahre Erfahrung" in 14 px. Die Teile bleiben ganz, umbrochen
 * wird nur zwischen ihnen; der Trenner „·" sitzt vor dem Teil und wird am Zeilenanfang abgeschnitten (nie
 * ein Punkt am Zeilenende). Die Sterne stehen darunter über die volle Breite: Neben dem Siegel bleiben
 * bei 24 px Innenabstand nur 250 px (390 px), die Sternzeile braucht rund 280. Ihre Höhe ist reserviert,
 * damit nichts springt, wenn der Stand nachlädt (ohne Stand keine Sterne).
 */
export function KompaktVertrauen({ sterne, eng = false }: { sterne: SterneStand | null; eng?: boolean }) {
  return (
    <div className="mt-5 border-t border-pm-line pt-5">
      <div className="flex items-center gap-3">
        <img src="/badge-testsieger.webp" alt="" className="h-10 w-auto flex-none object-contain" />
        <div className="min-w-0 overflow-hidden">
          <ul className={`-ml-4 flex flex-wrap ${eng ? 'text-[13px] min-[390px]:text-[14px]' : 'text-[14px]'} leading-5`}>
            {VERTRAUEN.map((teil, k) => (
              <li
                key={teil}
                className={`relative whitespace-nowrap pl-4 before:absolute before:left-[5px] before:font-normal before:text-pm-mute before:content-['·'] ${k === 0 ? 'font-medium text-pm-ink' : 'text-pm-muted'}`}
              >
                {teil}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex h-6 items-center">
        <BewertungsZeile stand={sterne} klein eng={eng} className="-my-2.5" />
      </div>
    </div>
  );
}

/**
 * Pflegekräfte-Bereich (Runde 8; seit Runde 13 ohne Versalien-Zeile): Kopf „Ihre passenden Pflegekräfte", darunter
 * der Status-Hinweis „Ihre Pflegesituation ist noch nicht vollständig" (Runde 12; ruhig, kein
 * Fehler-Rot) — im Kompakt-Einstieg ist die Pflegesituation per Definition noch nicht abgeschickt,
 * also steht er hier immer — dann die echten Profile (`liste`).
 * Der Knopf öffnet das bestehende 4-Schritte-Formular IM Hinweis (`children` = eingebettete
 * AngebotCard; px-6, die mitlaufende Knopfleiste reicht mit `ruhig` von Rand zu Rand). id des Hinweises =
 * Sprungziel aller Wege ins Formular (`zurPflegesituation`, Mail-Link `goto=anfragen`, „Einladen" im
 * Profil). `aktiv=false` (alle anderen Zustände): nur ein neutraler Rahmen um das Formular wie bisher.
 * `onImBlick`: Hinweis im Bild ja/nein — die schwebende Frage legt sich nicht über das Formular.
 */
export function KompaktPflegekraefteBereich({ aktiv, offen, onOeffnen, onImBlick, liste, children, look = 'ruhig' }: {
  aktiv: boolean;
  offen: boolean;
  onOeffnen: () => void;
  onImBlick?: (imBlick: boolean) => void;
  liste: ReactNode;
  children: ReactNode;
  look?: KompaktLook;
}) {
  const hinweis = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = hinweis.current;
    if (!aktiv || !el || !onImBlick || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => onImBlick(e.some((x) => x.isIntersecting)));
    io.observe(el);
    return () => { io.disconnect(); onImBlick(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);
  if (!aktiv) return <div>{children}</div>;
  if (look === 'weg') {
    // Runde 16: Stationen 2–4 des Wegs (Station 1 „Angebot erstellt" trägt die Preiskarte, CustomerPortalPage).
    // Der Hinweis ist hier heller gestaltet: weiße Karte statt dunklem Kopfbalken, der Wortlaut bleibt. Offen
    // greift die Karte über die Linie hinweg auf volle Breite — das Formular braucht den Platz, und wer
    // ausfüllt, braucht die Linie nicht.
    return (
      <>
        <WegStation zustand="jetzt" titel="Pflegesituation vervollständigen" linie="grau" titelId="patientendaten-titel">
          <div
            ref={hinweis}
            id="patientendaten"
            // relative: Die Karte liegt über der Linie der Station (offen greift sie über die Linie).
            className={`relative scroll-mt-16 rounded-card bg-white shadow-lift ${offen ? '-ml-9 px-6 pb-5 pt-5' : 'px-[22px] pb-6 pt-5'}`}
          >
            {/* Erster Satz = Status im Wortlaut der Geschäftsführung (Runde 12). Zweiter Satz positiv statt „noch nicht
                … noch keine" (OpenAI 04.10.); `hinweis=lang` zeigt den Wortlaut vom 04.10. („diese" → „die passenden",
                die Profile stehen erst in der nächsten Station). */}
            <p className="text-[16px] leading-[1.5] text-pm-body">
              {HINWEIS_LANG ? (
                <>Ihre Pflegesituation ist noch nicht vollständig. Deshalb können Sie die passenden Pflegekräfte noch
                nicht einladen und noch keine <span className="whitespace-nowrap">Bewerbungen erhalten.</span></>
              ) : (
                <>Ihre Pflegesituation ist noch nicht vollständig. Sobald Sie die Angaben ergänzen, können Sie passende
                Pflegekräfte einladen und <span className="whitespace-nowrap">Bewerbungen erhalten.</span></>
              )}
            </p>
            {offen ? (
              <div className="mt-5 border-t border-pm-line">{children}</div>
            ) : (
              <>
                <Button breit onClick={onOeffnen} className="mt-5 !px-2 !font-semibold">
                  Jetzt vervollständigen →
                </Button>
                <p className="mt-3 text-[13.5px] leading-[1.45] text-pm-muted">
                  Vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot{' '}
                  <span className="whitespace-nowrap">ausdrücklich annehmen.</span>
                </p>
              </>
            )}
          </div>
        </WegStation>
        {/* id = Sprungziel des Mail-Links `goto=matches` (wie in Fassung 11). */}
        <div id="pflegekraefte" style={{ scrollMarginTop: 72 }}>
          <WegStation
            zustand="offen"
            titel="Ihre passenden Pflegekräfte"
            titelId="pflegekraefte-titel"
            zeile={<>Echte Profile, ausgewählt nach <span className="whitespace-nowrap">Ihren Angaben.</span></>}
            linie="grau"
          >
            {liste}
          </WegStation>
        </div>
        <WegStation
          zustand="offen"
          titel="Bewerbungen erhalten"
          zeile={<>
            Sie erhalten Bewerbungen mit Foto, Erfahrung, möglichem Anreisedatum und Preis. Eine Anreise ist schon ab
            3 Tagen <span className="whitespace-nowrap">möglich.</span>
          </>}
        />
      </>
    );
  }
  return (
    <section aria-labelledby="pflegekraefte-titel">
      {/* id = Sprungziel des Mail-Links `goto=matches` (scrollt, sobald die Liste steht). */}
      <div id="pflegekraefte" style={{ scrollMarginTop: 72 }}>
        <SectionHeader
          id="pflegekraefte-titel"
          ruhig
          titel="Ihre passenden Pflegekräfte"
          // Bei 360 px zweizeilig: „Ihren Angaben." bleibt zusammen.
          zeile={<>Echte Profile, ausgewählt nach <span className="whitespace-nowrap">Ihren Angaben.</span></>}
        />
      </div>
      {/* Hülle trägt id und Ref. Look B (Runde 13), Runde 15 verfeinert: dunkles Kopfband (taupe-ink) mit dem
          Titel in Weiß, weißer Körper, weicher Schatten statt Rand. Band und Körper runden ihre Ecken selbst —
          kein overflow-hidden, das eingebettete Formular soll nichts abgeschnitten bekommen. */}
      <div ref={hinweis} id="patientendaten" className="mt-6 scroll-mt-16">
        <div className="rounded-card shadow-lift">
          {/* Letzte Wortpaare bleiben zusammen (kein Wort allein in der letzten Zeile). */}
          <p className="rounded-t-card bg-pm-taupe-ink px-6 py-4 text-[18px] font-semibold leading-[1.35] text-white">
            Ihre Pflegesituation ist noch <span className="whitespace-nowrap">nicht vollständig</span>
          </p>
          <div className={`rounded-b-card bg-white px-6 pt-4 ${offen ? 'pb-5' : 'pb-6'}`}>
            <p className="text-[16px] leading-[1.5] text-pm-body">
              Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine{' '}
              <span className="whitespace-nowrap">Bewerbungen erhalten.</span>
            </p>
            {offen ? (
              // Das Formular im weißen Körper, durch eine Haarlinie vom Text getrennt.
              <div className="mt-5 border-t border-pm-line">{children}</div>
            ) : (
              <>
                {/* Gestaffelte Schrift (600), gemessen in WebKit: 17 px → 285 px Text bei 286 frei (390 px),
                    16 px → 269 bei 271 (375 px), 15 px → 252 bei 256 (360 px); 24 px Innenabstand, 8 px im Knopf. */}
                <Button breit onClick={onOeffnen} className="mt-5 !px-2 !font-semibold">
                  <span className="whitespace-nowrap text-[15px] min-[375px]:text-[16px] min-[390px]:text-[17px]">
                    Pflegesituation vervollständigen →
                  </span>
                </Button>
                <p className="mt-3 text-[13.5px] leading-[1.45] text-pm-muted">
                  Vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot{' '}
                  <span className="whitespace-nowrap">ausdrücklich annehmen.</span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6">{liste}</div>
    </section>
  );
}

/**
 * Die echten Profile als Zeilen: Foto, Name und Alter, Deutsch mit Punkten, Erfahrung und Einsätze
 * bei uns. Keine Knöpfe — die ganze Zeile öffnet das Profil (wie „Profil ansehen"). Ohne eigene
 * Überschrift: Der Kopf „Ihre passenden Pflegekräfte" steht im Bereich darüber (Runde 8). Seit
 * Runde 15 (Designdurchgang) EINE weiße Karte mit Haarlinien zwischen den Zeilen; Laden und leere
 * Zustände in derselben Karte, linksbündig.
 */
const LISTEN_KARTE = 'rounded-card bg-white shadow-lift';

export function KompaktePflegekraefte({ eintraege, laedt, alleBearbeitet, keineVorschlaege, onProfil, telefonHref, gross = false }: {
  /** Sichtbare Vorschläge in Anzeige-Reihenfolge (Empfehlung zuerst); `i` = Index für `openNurseFromMatch`. */
  eintraege: { nurse: Nurse; i: number }[];
  laedt: boolean;
  /** Alle Vorschläge abgelehnt, nichts Frisches mehr im Pool. */
  alleBearbeitet: boolean;
  /** Matchings geladen, aber keine passende Pflegekraft (z. B. strenger Deutsch-Filter). */
  keineVorschlaege: boolean;
  onProfil: (nurse: Nurse, i: number) => void;
  telefonHref: string;
  /** Runde 16 (Weg): größere Fotos und Schrift, mehr Luft — die Profile sollen wie Menschen wirken, nicht wie Zeilen. */
  gross?: boolean;
}) {
  const n = laedt ? 0 : eintraege.length;
  return (
    <>
      {laedt ? (
        <div className={`${LISTEN_KARTE} px-6 py-6`}>
          <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-pm-chip border-t-transparent" />
          <p className="text-[16px] font-semibold text-pm-ink">Wir laden Ihre Pflegekräfte …</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
        </div>
      ) : n > 0 ? (
        <div className={`${LISTEN_KARTE} divide-y divide-pm-line overflow-hidden`}>
          {eintraege.map(({ nurse, i }, pos) => (
            <PflegekraftZeile key={nurse.caregiverId ?? i} nurse={nurse} empfohlen={pos === 0} gross={gross} onClick={() => onProfil(nurse, i)} />
          ))}
        </div>
      ) : alleBearbeitet ? (
        <div className={`${LISTEN_KARTE} px-6 py-6`}>
          <p className="text-[16px] font-semibold text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">
            Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
          </p>
        </div>
      ) : keineVorschlaege ? (
        <div className={`${LISTEN_KARTE} px-6 py-6`}>
          <p className="text-[16px] font-semibold text-pm-ink">Gerade keine weiteren Vorschläge</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Neue passende Pflegekräfte erscheinen hier.</p>
          {/* Knöpfe im Kompakt-Einstieg einheitlich: 52 px, rund, 16 px in 600 (Runde 15). */}
          <Button variante="sekundaer" href={telefonHref} className="mt-4 !text-[16px] !font-semibold">
            Mit Marta sprechen
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Eine Zeile: dieselben Daten wie das Profil (PflegekraftProfil), fehlende Teile entfallen.
 * Keine Sterne: Wir haben keine Bewertungen je Pflegekraft.
 */
export function PflegekraftZeile({ nurse, empfohlen, onClick, gross = false }: { nurse: Nurse; empfohlen: boolean; onClick: () => void; gross?: boolean }) {
  const name = displayName(nurse.name);
  const einsaetze = nurse.history?.assignments ?? 0;
  const jahre = nurse.experienceYears ?? 0;
  const deutsch = nurse.language?.level && nurse.language.level !== '—' ? nurse.language.level : null;
  const punkte = nurse.language?.bars ?? 0;
  const erfahrung = [
    jahre > 0 ? `${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'} Erfahrung` : null,
    einsaetze > 0 ? `${einsaetze} ${einsaetze === 1 ? 'Einsatz' : 'Einsätze'} bei uns` : null,
  ].filter((t): t is string => t !== null);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Profil von ${name} ansehen`}
      className={`flex w-full items-center ${gross ? 'gap-3 px-4 py-5 min-[390px]:gap-4 min-[390px]:px-5' : 'gap-4 px-5 py-4'} text-left transition-colors hover:bg-pm-paper active:bg-pm-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe`}
    >
      {nurse.image ? (
        <img src={nurse.image} alt="" className={`${gross ? 'h-14 w-14 rounded-xl min-[390px]:h-[68px] min-[390px]:w-[68px] min-[390px]:rounded-2xl' : 'h-14 w-14 rounded-xl'} flex-none object-cover`} />
      ) : (
        <span className={`flex ${gross ? 'h-14 w-14 rounded-xl min-[390px]:h-[68px] min-[390px]:w-[68px] min-[390px]:rounded-2xl' : 'h-14 w-14 rounded-xl'} flex-none items-center justify-center text-[18px] font-semibold text-white`} style={{ backgroundColor: nurse.color }} aria-hidden="true">
          {initials(nurse.name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        {/* Runde 13: Empfehlung als leiser Text, keine Pille. */}
        {empfohlen && (
          <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium leading-none text-pm-taupe-ink">
            <Sparkles className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
            Unsere Empfehlung
          </span>
        )}
        <span className={`block ${gross ? 'text-[17px] min-[390px]:text-[18px]' : 'text-[17px]'} font-semibold leading-snug text-pm-ink`}>
          {name}
          {/* Alter in muted (5,3:1) statt mute (3,5:1) — AA. */}
          {nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
        </span>
        {deutsch && (
          <span className={`mt-1 flex items-center gap-1.5 ${gross ? 'text-[14px] min-[390px]:text-[15px]' : 'text-[14.5px]'} leading-snug text-pm-muted`}>
            {punkte > 0 && <DeutschPunkte punkte={punkte} />}
            Deutsch {deutsch.toLowerCase()}
          </span>
        )}
        {erfahrung.length > 0 && (
          // Teile bleiben ganz, umbrochen wird nur zwischen ihnen; der Trenner „·" sitzt vor dem Teil und
          // wird am Zeilenanfang abgeschnitten (bei 14,5 px stehen die beiden Teile untereinander).
          <span className="mt-0.5 block overflow-hidden">
            <span className={`-ml-4 flex flex-wrap ${gross ? 'text-[14px] min-[390px]:text-[15px]' : 'text-[14.5px]'} leading-snug text-pm-muted`}>
              {erfahrung.map((teil) => (
                <span key={teil} className="relative whitespace-nowrap pl-4 before:absolute before:left-[5px] before:content-['·']">
                  {teil}
                </span>
              ))}
            </span>
          </span>
        )}
      </span>
      <ChevronRight className="h-5 w-5 flex-none text-pm-mute" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
