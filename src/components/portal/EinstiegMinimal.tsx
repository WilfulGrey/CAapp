// Einstieg VOR dem ersten Speichern der Pflegesituation: „Minimal“ — Registry #147 (Entwurf, nicht live).
//
// Martin 07.11.2026 zum Mockup (seo-reports/analysen/vorschlag-minimal-2026-11-07/mockup/portal.html): „Ja, alle drei“.
// Vorher (Abnahme 07.11.): auf dem iPhone 13 kam die erste Pflegekraft bei 1.426 px, das Formular bei 2.603 px. Jetzt
// steht im ersten Bild: Kopf mit Logo und Testsieger (Navigationsleiste, `TestsiegerKopf`) → Gruß → kompakte
// Angebotskarte („Details ›“ springt zur Kostenkarte unten und klappt „Alle Kosten im Überblick“ auf) → „Passende
// Pflegekräfte“ als kompakte Zeilen mit „Einladen“ → direkt darunter der Hauptknopf ins Formular, „Rückruf vereinbaren“
// und die Nummer. Darunter wie in „Pflegekräfte zuerst“ (#145): Pflegesituation mit offenem Formular, Kostenkarte, So
// geht es weiter, Häufige Fragen, Marta.
// „Einladen“ ist die Logik aus #145 unverändert (CustomerPortalPage: Fenster „{Name} einladen“, Vormerken, nach dem
// ersten Speichern automatisch einladen). Alle sichtbaren Texte stammen aus dem Mockup oder stehen schon im Portal.
//
// Maße „kompakt“ (Variantenvergleich 07.11., bau/portal/varianten/kompakt_lage.json; gebaut und gemessen in
// bau/portal/gebaut2_lage.json): alle Zeilen bleiben über dem Hauptknopf, der Platz kommt aus dichteren Abständen, damit
// der Hauptknopf auch auf dem iPhone SE (375×553) im ersten Bild steht. Die Pille rechts hat in allen Zuständen dieselbe
// Breite (`PILLE`): „Vorgemerkt ✓“ war ca. 35 px breiter als „Einladen“, die Fakten brachen daneben um und schoben den
// Hauptknopf mit jeder Vormerkung nach unten.
//
// „Rückruf vereinbaren“ schickt mit `onRueckruf` die Bitte über `/api/rueckmeldung` (Aktion `rueckruf`, Quelle
// `portal_einstieg`, Team-Mail an info@, src/lib/rueckruf.ts). Ohne `onRueckruf` (Vorschau, Lead ohne Rückrufnummer)
// bleibt es ein Anruf-Link. Wortlaut von Erfolg und Fehler aus der Rückmeldeseite (project 3/app/rueckmeldung/page.tsx).
//
// Rückweg: `?einstieg=zuerst` zeigt „Pflegekräfte zuerst“ (#145) unverändert, `?einstieg=alt` den Stand 75b8df8.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Nurse } from '../../types';
import { formatEuro, type Lead } from '../../lib/supabase';
import type { SterneStand } from '../../lib/sterne';
import { ERREICHBAR, TELEFON, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';
import { initials } from './shared';
import { SoGehtEsWeiterVorSpeichern } from './EinstiegVorSpeichern';
import { AbschnittPflegesituation, KostenkarteKompakt, type VorgemerkteKraft } from './EinstiegPflegekraefteZuerst';
import { FaqListe } from './FaqListe';
import { MartaBox } from './MartaBox';

// Wortlaut aus dem freigegebenen Mockup (07.11.2026, OpenAI-geprüft). Tests prüfen genau diese Texte.
export const HAUPTKNOPF = 'Angaben vervollständigen und Bewerbungen erhalten';
export const HAUPTKNOPF_ZEILE = 'dauert etwa 2 Minuten · kostenlos und unverbindlich';
export const ANGEBOT_PUNKTE = 'Täglich kündbar · Keine Vermittlungsgebühr · Bestpreisgarantie';
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
// Pille rechts in der Zeile: in allen Zuständen gleich breit und hoch (88 × 32 px), damit die Fakten links davon in jedem
// Zustand dieselbe Breite haben und die Zeile ihre Höhe hält. 88 px: „Vorgemerkt ✓“ (12 px fett) passt hinein, und
// „12 Jahre Erfahrung · Deutsch Mittel“ bleibt auf 375 px daneben einzeilig (gemessen 07.11., gebaut2_lage.json).
const PILLE = 'flex h-8 w-[88px] flex-none items-center justify-center rounded-full font-bold whitespace-nowrap';
const FOTO = 'h-10 w-10 max-[374px]:h-9 max-[374px]:w-9';

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

// ── Kompakte Angebotskarte ───────────────────────────────────────────────────────────────────────────────────────────────
/** „eine Person, Pflegegrad 3“: die Angaben der Zeile über dem Preis in der Form des Mockups („Ihr Angebot · eine Person,
 *  Pflegegrad 3“). Dieselben Angaben und Wörter wie `angebotFuer` (KompaktEinstieg, „für eine Person mit Pflegegrad 3“),
 *  nur ohne „für“ und „mit“: „eine Person“ / „zwei Personen“, „Pflegegrad N“, Pflegegrad 0 „ohne Pflegegrad“. Ohne
 *  Personenzahl `null` (wie `angebotFuer`; dann steht nur „Ihr Angebot“), ohne Pflegegrad nur die Personenzahl.
 *  Der Satz „Ihr Angebot für …“ steht weder im Mockup noch sonst im Portal (Prüfung 07.11.). */
export function angebotKurz(fd: Record<string, unknown> | null | undefined): string | null {
  const wer = fd?.betreuung_fuer === '1-person' ? 'eine Person' : fd?.betreuung_fuer === 'ehepaar' ? 'zwei Personen' : null;
  if (!wer) return null;
  const pg = fd?.pflegegrad;
  const grad = typeof pg === 'number' || (typeof pg === 'string' && /^\d$/.test(pg))
    ? (Number(pg) === 0 ? 'ohne Pflegegrad' : `Pflegegrad ${pg}`)
    : null;
  return grad ? `${wer}, ${grad}` : wer;
}

// „Ihr Angebot · eine Person, Pflegegrad 3“ (Mockup wörtlich, klein; ohne Angaben nur „Ihr Angebot“), Preis, „Details ›“,
// drei Punkte. Preis wie in der Kostenkarte darunter (`bruttopreis`, dort derselbe Ersatzwert).
export function AngebotKarteMinimal({ lead, onDetails }: { lead: Lead | null; onDetails: () => void }) {
  const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
  const angaben = angebotKurz((lead?.kalkulation as Record<string, unknown> | null | undefined)?.formularDaten as Record<string, unknown> | undefined);
  return (
    <div className="rounded-[16px] bg-pm-paper px-3 pb-2.5 pt-[11px]" data-angebot-minimal>
      <p className="text-[13px] leading-[1.3] text-pm-muted">{angaben ? `Ihr Angebot · ${angaben}` : 'Ihr Angebot'}</p>
      <div className="mt-px flex items-baseline justify-between gap-3">
        <p className="whitespace-nowrap text-[24px] font-bold leading-[1.15] tracking-[-0.01em] tabular-nums text-pm-ink">
          {formatEuro(brutto)} <span className="text-[14px] font-medium tracking-normal text-pm-muted">/ Monat</span>
        </p>
        <button type="button" onClick={onDetails} className={`${TIPPFLAECHE} ${FOKUS} flex-none rounded-md text-[14px] font-semibold text-pm-taupe-ink`}>
          Details ›
        </button>
      </div>
      {/* Wie im Mockup: 12,5 px, normale Laufweite; wo die Breite nicht reicht (unter ca. 400 px), zweizeilig. */}
      <p className="mt-[3px] text-[12.5px] leading-[1.3] text-pm-muted">{ANGEBOT_PUNKTE}</p>
    </div>
  );
}

// ── Eine Pflegekraft als kompakte Zeile ───────────────────────────────────────────────────────────────────────────────────
/** Teile von „7 Jahre Erfahrung · Deutsch Gut“ — wie `kraftZeile` im Kostenrechner (lib/kraefte-vorschau.ts), Reihenfolge
 *  wie im Mockup; fehlende Angaben entfallen. Die Deutsch-Stufe steht wie auf der Pflegekraft-Karte vor dem Speichern
 *  („Deutsch ●●○ Gut“, `DeutschZeile` in MatchCardVorSpeichern.tsx, 1:1 aus der Karte im Stand 75b8df8) und im Profil
 *  (CustomerNurseModal: „Deutsch“ … „Grund“): der Wert aus `nurse.language.level` unverändert (Grund / Mittel / Gut).
 *  Ohne Balken als „Deutsch Grund / Mittel / Gut“ steht derselbe Wortlaut schon in den Nachfassmails an Kunden
 *  (project 3/supabase/functions/send-scheduled-emails/index.ts, `Deutsch ${deutschWort}` aus deutschStufe.ts; Martin
 *  19.08.2026: „Deutsch Mittel“). Das Mockup hatte nur „Deutsch gut“ (klein), für Mittel/Grund keinen Wortlaut. */
export function zeilenFakten(nurse: Pick<Nurse, 'experienceYears' | 'language'>): string[] {
  const teile: string[] = [];
  const jahre = nurse.experienceYears ?? 0;
  if (jahre > 0) teile.push(jahre === 1 ? '1 Jahr Erfahrung' : `${jahre} Jahre Erfahrung`);
  const stufe = nurse.language?.level;
  if (stufe && stufe !== '—') teile.push(`Deutsch ${stufe}`);
  return teile;
}

export function PflegekraftZeile({ nurse, vorgemerkt, gesperrt, onNurseClick, onInvite, onInviteConfirm }: {
  nurse: Nurse;
  /** Registry #145: vorgemerkt → „Vorgemerkt ✓“, bleibt tippbar und öffnet das Fenster erneut. */
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
  return (
    <li className="flex items-center gap-1.5 border-b border-pm-line-soft py-1 last:border-b-0" data-pflegekraft-zeile={nurse.caregiverId} data-vorgemerkt={vorgemerkt || undefined}>
      {/* Unter 375 px (Android 360) Foto 36 px und 6 px Abstand: 6 px mehr für die Fakten neben der Pille. */}
      <button type="button" onClick={onNurseClick} className={`${FOKUS} flex min-w-0 flex-1 items-center gap-[7px] max-[374px]:gap-1.5 rounded-[12px] text-left`}>
        {nurse.image ? (
          <img src={nurse.image} alt="" className={`${FOTO} flex-none rounded-full object-cover`} />
        ) : (
          <span aria-hidden="true" className={`flex ${FOTO} flex-none items-center justify-center rounded-full text-[14px] font-bold text-white`} style={{ backgroundColor: nurse.color }}>
            {initials(nurse.name).slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-[1.25] text-pm-ink">{vorname}{nurse.age ? `, ${nurse.age}` : ''}</span>
          {/* 12 px unter 390 px (und im Handyrahmen am Computer, 374 px innen), 11,5 px unter 375 px: so bleibt „12 Jahre
              Erfahrung · Deutsch Mittel“ auf 375/390 px neben der Pille einzeilig. Reicht die Breite trotzdem nicht (360 px),
              bricht die Zeile nur hinter „·“, nie in einer Angabe — in jedem Zustand der Pille gleich. */}
          {fakten.length > 0 && (
            <span className="block text-[12px] max-[374px]:text-[11.5px] min-[390px]:text-[12.5px] md:text-[12px] leading-[1.3] text-pm-muted">
              {fakten.map((teil, i) => (
                <span key={teil}>{i > 0 && ' · '}<span className="whitespace-nowrap">{teil}</span></span>
              ))}
            </span>
          )}
        </span>
      </button>
      {gesperrt ? (
        <button type="button" disabled aria-disabled="true" className={`${PILLE} cursor-not-allowed bg-pm-paper text-[12px] text-pm-taupe-ink`}>
          Bitte warten…
        </button>
      ) : vorgemerkt ? (
        <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} bg-pm-mint text-[12px] text-pm-green-deep`}>
          Vorgemerkt ✓
        </button>
      ) : (
        <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} ${PILLE} bg-pm-shell text-[13.5px] text-pm-taupe-ink hover:bg-pm-chip`}>
          Einladen
        </button>
      )}
    </li>
  );
}

// Platzhalter, solange die Liste lädt (beim Erstbesuch real 8–29 s, Abnahme 07.11.): gleiche Höhe wie eine Zeile, kein
// Text, damit der Hauptknopf nicht springt und der erste Bildschirm nie leer ist.
function Platzhalterzeile() {
  return (
    <li className="flex items-center gap-1.5 border-b border-pm-line-soft py-1 last:border-b-0" data-platzhalter>
      <span className="flex min-w-0 flex-1 items-center gap-[7px] max-[374px]:gap-1.5">
        <span className={`${FOTO} flex-none animate-pulse rounded-full bg-pm-shell`} />
        <span className="min-w-0 flex-1">
          <span className="block h-[13px] w-24 animate-pulse rounded bg-pm-shell" />
          <span className="mt-[7px] block h-[11px] w-40 max-w-full animate-pulse rounded bg-pm-line-soft" />
        </span>
      </span>
      <span className="h-8 w-[88px] flex-none animate-pulse rounded-full bg-pm-line-soft" />
    </li>
  );
}
const PLATZHALTER = 5;

// ── „Rückruf vereinbaren“ ─────────────────────────────────────────────────────────────────────────────────────────────
type RueckrufStand = 'bereit' | 'laeuft' | 'ok' | 'fehler';
const RUECKRUF_KNOPF = `${FOKUS} flex min-h-[44px] w-full items-center justify-center rounded-[14px] border-[1.5px] border-pm-line bg-white px-4 text-[15px] font-semibold text-pm-ink transition-colors hover:border-pm-taupe-light`;

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
          <p ref={dank} tabIndex={-1} className={`${FOKUS} flex min-h-[44px] items-center justify-center rounded-[14px] bg-pm-mint px-4 text-center text-[15px] font-semibold text-pm-green-deep`}>
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
  /** Hauptknopf: ins Formular (CustomerPortalPage, Messpunkt `zur_pflegesituation` mit Quelle `hauptknopf`). */
  onVervollstaendigen: () => void;
  /** „Rückruf vereinbaren“: Bitte ans Team senden; `true` = angekommen. Ohne (Vorschau, Lead ohne Rückrufnummer) bleibt
   *  der Knopf ein Anruf-Link. */
  onRueckruf?: () => Promise<boolean>;
  onKostenAufgeklappt?: () => void;
  onFaqGeoeffnet?: (schluessel: string) => void;
}) {
  // „Details ›“: Kostenkarte aufklappen (Karte und „Alle Kosten im Überblick“), dann ohne Animation an den Anfang der
  // Aufstellung — weich gescrollt bricht WebKit ab, sobald oberhalb Inhalt dazukommt (Registry #102).
  const [kostenSignal, setKostenSignal] = useState(0);
  const kosten = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!kostenSignal) return;
    const t = setTimeout(() => {
      const ziel = kosten.current?.querySelector('[data-kostenaufstellung]') ?? kosten.current;
      ziel?.scrollIntoView({ block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [kostenSignal]);
  const zuDenKosten = () => {
    onKostenAufgeklappt?.();
    setKostenSignal((n) => n + 1);
  };

  const anzahl = zeilen.length;
  const leer = !laedt && anzahl === 0;
  return (
    <div className="bg-pm-paper" data-einstieg="minimal">
      {/* Erster Bildschirm: weiß wie im Mockup, darunter der Seitengrund. */}
      <div className="bg-white pb-1">
        <div className="max-w-3xl mx-auto">
          <h1 className="px-[18px] pt-2 pb-1.5 text-[19px] font-bold leading-[1.2] tracking-[-0.01em] text-pm-ink">
            Guten Tag{anrede ? `, ${anrede}` : ''}
          </h1>
          <div className="px-3.5">
            <AngebotKarteMinimal lead={lead} onDetails={zuDenKosten} />
          </div>

          {/* id = Sprungziel des Mail-Deeplinks `goto=matches`. Ohne Vorschläge (und ohne Hinweis) entfällt der Abschnitt. */}
          {!(leer && gehalteneEinladungen === 0 && !vorschlaegeVorhanden) && (
            <section id="pflegekraefte" style={{ scrollMarginTop: 96 }} aria-labelledby="pflegekraefte-titel">
              <h2 id="pflegekraefte-titel" className="flex items-center gap-2 px-[18px] pt-1 pb-0.5 text-[12px] font-bold uppercase leading-4 tracking-[.08em] text-pm-muted">
                Passende Pflegekräfte
                {!laedt && anzahl > 0 && (
                  <span className="rounded-full bg-pm-paper px-2 py-px text-[12px] leading-4 tracking-normal tabular-nums text-pm-ink">{anzahl}</span>
                )}
              </h2>
              {laedt ? (
                <ul className="px-4" aria-busy="true" aria-label="Wir laden Ihre Pflegekräfte …">
                  {Array.from({ length: PLATZHALTER }, (_, i) => <Platzhalterzeile key={i} />)}
                </ul>
              ) : anzahl > 0 ? (
                <ul className="px-4">{zeilen}</ul>
              ) : gehalteneEinladungen > 0 ? (
                <div className="mx-3.5 mt-2 rounded-card border border-pm-line-soft bg-white px-5 py-5 text-center">
                  <p className="text-[15px] font-semibold mb-1 text-pm-ink">Ihre Auswahl ist eingeladen</p>
                  <p className="text-[14px] leading-relaxed text-pm-muted">
                    Die Pflegekräfte melden sich meist innerhalb von 1&ndash;2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier. Meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.
                  </p>
                </div>
              ) : (
                <div className="mx-3.5 mt-2 rounded-card border border-pm-line-soft bg-white px-5 py-5 text-center">
                  <p className="text-[15px] font-semibold mb-1 text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
                  <p className="text-[14px] leading-relaxed text-pm-muted">
                    Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor. Sie hören von uns.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Direkt unter der Liste, nicht fest am Rand (Mockup). */}
          <div className="grid gap-2 px-3.5 pt-1.5 pb-3.5" data-aktionen-minimal>
            {/* `text-balance`: kein einzelnes „erhalten“ in Zeile 2 (430 px). Unter 390 px Unterzeile 12 px, unter 375 px
                innen 12 px: „dauert etwa 2 Minuten · kostenlos und unverbindlich“ bleibt einzeilig (Android 360). */}
            <button
              type="button"
              onClick={onVervollstaendigen}
              className={`${FOKUS} block w-full rounded-[14px] bg-pm-coral px-4 max-[374px]:px-3 py-[11px] text-center text-[16px] font-bold leading-[1.25] text-balance text-white transition-colors hover:bg-pm-coral-deep active:scale-[0.99]`}
            >
              {HAUPTKNOPF}
              <span className="mt-0.5 block text-[12.5px] max-[389px]:text-[12px] md:text-[12px] font-medium leading-[1.3] opacity-90">{HAUPTKNOPF_ZEILE}</span>
            </button>
            {/* 2 px mehr Abstand: auf dem iPhone SE liegt der Rahmen von „Rückruf vereinbaren“ ganz unter der Falz, statt mit
                einem Strich ins erste Bild zu ragen. */}
            <div className="mt-0.5 grid gap-2">
              <RueckrufKnopf onRueckruf={onRueckruf} />
            </div>
            <p className="text-center text-[12.5px] leading-[1.5] text-pm-muted">
              oder anrufen, auch per{' '}
              <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="font-semibold text-pm-taupe-ink">WhatsApp</a>:<br />
              <a href={TELEFON_HREF} className="font-semibold text-pm-taupe-ink">{TELEFON}</a> ({ERREICHBAR})
            </p>
          </div>
        </div>
      </div>

      {/* Darunter wie in „Pflegekräfte zuerst“ (#145). */}
      <div className="max-w-3xl mx-auto px-3.5 pb-4 space-y-4">
        {bereitsBearbeitet && <div className="pt-6">{bereitsBearbeitet}</div>}
        <AbschnittPflegesituation vorgemerkte={vorgemerkte} formular={formular} />
      </div>

      <div ref={kosten}>
        <KostenkarteKompakt
          lead={lead}
          onBestpreis={onBestpreis}
          heimEigenanteil={heimEigenanteil}
          heimQuelle={heimQuelle}
          onKostenAufgeklappt={onKostenAufgeklappt}
          aufklappen={kostenSignal}
        />
      </div>

      <div className="max-w-3xl mx-auto px-3.5 pt-1 pb-6 space-y-4">
        <div className="pt-6">
          <SoGehtEsWeiterVorSpeichern />
        </div>
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
