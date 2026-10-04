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
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import { BewertungsZeile } from './BewertungsZeile';
import { DeutschPunkte } from './PflegekraftProfil';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { SectionHeader } from '../ui/SectionHeader';

/**
 * Einleitung unter dem Titel (Runde 14, Wortlaut der Geschäftsführung): was das Angebot umfasst, was wir
 * organisieren und wann die Ansprechpartnerin erreichbar ist. Fließtext wie die Unterzeilen der anderen
 * Zustände — kein Kasten.
 */
export function KompaktEinleitung() {
  return (
    <p className="mt-3 text-[16px] leading-[1.55] text-pm-muted">
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
 * Unten in der Kostenkarte (Runde 13): EINE ruhige Zeile — kleines Testsieger-Siegel, daneben
 * „6× in Folge Testsieger DIE WELT · über 20 Jahre Erfahrung" und die Sterne wie auf der Startseite.
 * Die Teile bleiben ganz, umbrochen wird nur zwischen ihnen; der Trenner „·" sitzt vor dem Teil und
 * wird am Zeilenanfang abgeschnitten (nie ein Punkt am Zeilenende). In der schmalen Spalte stehen
 * die beiden Teile untereinander. Höhe der Sterne reserviert (ohne Stand keine Sterne).
 */
export function KompaktVertrauen({ sterne }: { sterne: SterneStand | null }) {
  return (
    <div className="mt-4 flex items-center gap-2.5 border-t border-pm-line-soft pt-4">
      <img src="/badge-testsieger.webp" alt="" className="h-11 w-auto flex-none object-contain" />
      <div className="min-w-0">
        <div className="overflow-hidden">
          <ul className="-ml-4 flex flex-wrap text-[13.5px] leading-snug">
            {VERTRAUEN.map((teil, k) => (
              <li
                key={teil}
                className={`relative whitespace-nowrap pl-4 before:absolute before:left-[5px] before:font-normal before:text-pm-mute before:content-['·'] ${k === 0 ? 'font-semibold text-pm-ink' : 'text-pm-muted'}`}
              >
                {teil}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex h-6 items-center">
          <BewertungsZeile stand={sterne} klein className="-my-2.5" />
        </div>
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
 * AngebotCard; px-5, weil die mitlaufende Knopfleiste von Rand zu Rand reicht). id des Hinweises =
 * Sprungziel aller Wege ins Formular (`zurPflegesituation`, Mail-Link `goto=anfragen`, „Einladen" im
 * Profil). `aktiv=false` (alle anderen Zustände): nur ein neutraler Rahmen um das Formular wie bisher.
 * `onImBlick`: Hinweis im Bild ja/nein — die schwebende Frage legt sich nicht über das Formular.
 */
export function KompaktPflegekraefteBereich({ aktiv, offen, onOeffnen, onImBlick, liste, children }: {
  aktiv: boolean;
  offen: boolean;
  onOeffnen: () => void;
  onImBlick?: (imBlick: boolean) => void;
  liste: ReactNode;
  children: ReactNode;
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
  return (
    <section aria-labelledby="pflegekraefte-titel">
      {/* id = Sprungziel des Mail-Links `goto=matches` (scrollt, sobald die Liste steht). */}
      <div id="pflegekraefte" className="px-1" style={{ scrollMarginTop: 72 }}>
        <SectionHeader
          id="pflegekraefte-titel"
          titel="Ihre passenden Pflegekräfte"
          // Bei 360 px zweizeilig: „Ihren Angaben." bleibt zusammen.
          zeile={<>Echte Profile, ausgewählt nach <span className="whitespace-nowrap">Ihren Angaben.</span></>}
        />
      </div>
      {/* Hülle trägt id und Ref. Look B (Runde 13, Wahl der Geschäftsführung): dunkles Kopfband mit dem
          Titel in Weiß, weißer Körper, kräftiger Rand — hebt sich klar vom Seitentext ab, auch offen.
          Der Kasten selbst ist dunkel, nur der Körper weiß: So entsteht an den runden Ecken keine helle
          Haarlinie zwischen Rand und Band (Kantenglättung). */}
      <div ref={hinweis} id="patientendaten" className="mt-5 scroll-mt-16">
      <div className="rounded-card border-2 border-pm-taupe-ink bg-pm-taupe-ink shadow-lift">
        {/* Letzte Wortpaare bleiben zusammen (kein Wort allein in der letzten Zeile). */}
        <p className="px-5 py-3.5 text-[17.5px] font-extrabold leading-[1.25] text-white">
          Ihre Pflegesituation ist noch <span className="whitespace-nowrap">nicht vollständig</span>
        </p>
        <div className="rounded-b-[18px] bg-white px-5 pb-4 pt-3.5">
          <p className="text-[14.5px] leading-[1.5] text-pm-muted">
            Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine{' '}
            <span className="whitespace-nowrap">Bewerbungen erhalten.</span>
          </p>
          {offen ? (
            // Das Formular im weißen Körper, durch eine Linie vom Text getrennt (px-5 → Knopfleiste bündig).
            <div className="mt-4 border-t border-pm-line-soft">{children}</div>
          ) : (
            <>
              {/* Gestaffelte Schrift: Der Knopftext braucht bei 17 px 291 px, bei 360 px sind 272 frei. */}
              <Button breit onClick={onOeffnen} className="mt-3.5 !px-2">
                <span className="whitespace-nowrap text-[15.5px] min-[375px]:text-[16px] min-[390px]:text-[17px]">
                  Pflegesituation vervollständigen →
                </span>
              </Button>
              <p className="mt-2.5 text-[13px] leading-snug text-pm-muted">
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
 * Runde 13 ohne Karte: schlichte Zeilen mit dünnen Linien auf dem Seitengrund.
 */
export function KompaktePflegekraefte({ eintraege, laedt, alleBearbeitet, keineVorschlaege, onProfil, telefonHref }: {
  /** Sichtbare Vorschläge in Anzeige-Reihenfolge (Empfehlung zuerst); `i` = Index für `openNurseFromMatch`. */
  eintraege: { nurse: Nurse; i: number }[];
  laedt: boolean;
  /** Alle Vorschläge abgelehnt, nichts Frisches mehr im Pool. */
  alleBearbeitet: boolean;
  /** Matchings geladen, aber keine passende Pflegekraft (z. B. strenger Deutsch-Filter). */
  keineVorschlaege: boolean;
  onProfil: (nurse: Nurse, i: number) => void;
  telefonHref: string;
}) {
  const n = laedt ? 0 : eintraege.length;
  return (
    <>
      {laedt ? (
        <div className="px-5 py-8 text-center">
          <div className="mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-pm-chip border-t-transparent" />
          <p className="text-[16px] font-semibold text-pm-ink">Wir laden Ihre Pflegekräfte …</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
        </div>
      ) : n > 0 ? (
        <div className="divide-y divide-pm-line">
          {eintraege.map(({ nurse, i }, pos) => (
            <PflegekraftZeile key={nurse.caregiverId ?? i} nurse={nurse} empfohlen={pos === 0} onClick={() => onProfil(nurse, i)} />
          ))}
        </div>
      ) : alleBearbeitet ? (
        <div className="px-5 py-5 text-center">
          <p className="text-[16px] font-bold text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">
            Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
          </p>
        </div>
      ) : keineVorschlaege ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[16px] font-bold text-pm-ink">Gerade keine weiteren Vorschläge</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Neue passende Pflegekräfte erscheinen hier.</p>
          <a
            href={telefonHref}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border-[1.5px] border-pm-chip px-5 text-[15px] font-bold text-pm-taupe-ink hover:border-pm-taupe"
          >
            Mit Marta sprechen
          </a>
        </div>
      ) : null}
    </>
  );
}

/**
 * Eine Zeile: dieselben Daten wie das Profil (PflegekraftProfil), fehlende Teile entfallen.
 * Keine Sterne: Wir haben keine Bewertungen je Pflegekraft.
 */
export function PflegekraftZeile({ nurse, empfohlen, onClick }: { nurse: Nurse; empfohlen: boolean; onClick: () => void }) {
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
      className="flex w-full items-center gap-2.5 px-1 py-3.5 text-left transition-colors hover:bg-white/60 active:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe"
    >
      {nurse.image ? (
        <img src={nurse.image} alt="" className="h-14 w-14 flex-none rounded-[12px] object-cover" />
      ) : (
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[12px] text-[18px] font-bold text-white" style={{ backgroundColor: nurse.color }} aria-hidden="true">
          {initials(nurse.name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        {/* Runde 13: Empfehlung als leiser Text, keine Pille. */}
        {empfohlen && (
          <span className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold leading-none text-pm-taupe-ink">
            <Sparkles className="h-3 w-3 flex-none" aria-hidden="true" />
            Unsere Empfehlung
          </span>
        )}
        <span className="block text-[17px] font-bold leading-snug text-pm-ink">
          {name}
          {nurse.age ? <span className="font-normal text-pm-mute">, {nurse.age}</span> : null}
        </span>
        {deutsch && (
          <span className="mt-0.5 flex items-center gap-1.5 text-[14px] leading-snug text-pm-muted">
            {punkte > 0 && <DeutschPunkte punkte={punkte} />}
            Deutsch {deutsch.toLowerCase()}
          </span>
        )}
        {erfahrung.length > 0 && (
          // Bricht es um (unter 390 px), dann am „·", das beim ersten Teil bleibt.
          <span className="mt-0.5 block text-[13px] leading-snug text-pm-muted">
            {erfahrung.map((teil, k) => (
              <Fragment key={teil}>
                {k > 0 && ' · '}
                <span className="whitespace-nowrap">{teil}</span>
              </Fragment>
            ))}
          </span>
        )}
      </span>
      {/* Schmal gehalten (16 px, eng am Text): Zeile 3 braucht bei 390 px bis zu 246 von 252 px. */}
      <ChevronRight className="-ml-2 h-4 w-4 flex-none text-pm-mute" aria-hidden="true" />
    </button>
  );
}
