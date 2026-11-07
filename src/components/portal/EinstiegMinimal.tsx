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
// „Rückruf vereinbaren“ ist vorerst ein Anruf-Link: Die Rückruf-Route des Chats (`project 3/app/api/pria/rueckruf`) hat
// kein CORS für das Portal, keinen Token und schreibt „im Chat“ in die Team-Mail (Bericht Registry #147).
//
// Rückweg: `?einstieg=zuerst` zeigt „Pflegekräfte zuerst“ (#145) unverändert, `?einstieg=alt` den Stand 75b8df8.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Nurse } from '../../types';
import { formatEuro, type Lead } from '../../lib/supabase';
import type { SterneStand } from '../../lib/sterne';
import { ERREICHBAR, TELEFON, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';
import { initials } from './shared';
import { angebotFuer } from './KompaktEinstieg';
import { SoGehtEsWeiterVorSpeichern } from './EinstiegVorSpeichern';
import { AbschnittPflegesituation, KostenkarteKompakt, type VorgemerkteKraft } from './EinstiegPflegekraefteZuerst';
import { FaqListe } from './FaqListe';
import { MartaBox } from './MartaBox';

// Wortlaut aus dem freigegebenen Mockup (07.11.2026, OpenAI-geprüft). Tests prüfen genau diese Texte.
export const HAUPTKNOPF = 'Angaben vervollständigen und Bewerbungen erhalten';
export const HAUPTKNOPF_ZEILE = 'dauert etwa 2 Minuten · kostenlos und unverbindlich';
export const ANGEBOT_PUNKTE = 'Täglich kündbar · Keine Vermittlungsgebühr · Bestpreisgarantie';
export const RUECKRUF = 'Rückruf vereinbaren';

// Wie in der Navigationsleiste: Tippfläche ≥ 44 px über ein unsichtbares ::before, die sichtbare Pille bleibt kleiner.
const TIPPFLAECHE = "relative before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-['']";
const FOKUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe';

// ── Kopf rechts: „6× Testsieger / DIE WELT“ mit Siegel (statt „Hilfe“ in der Navigationsleiste) ──────────────────────────
export function TestsiegerKopf() {
  return (
    <div className="flex items-center gap-2" data-testsieger-kopf>
      <p className="text-right text-[11.5px] leading-[1.3] text-pm-muted">
        <b className="block text-[12.5px] text-pm-ink">6× Testsieger</b>
        DIE&nbsp;WELT
      </p>
      <img src="/badge-testsieger.webp" alt="Testsieger Die Welt" className="h-12 w-auto flex-none object-contain" />
    </div>
  );
}

// ── Kompakte Angebotskarte ───────────────────────────────────────────────────────────────────────────────────────────────
// „Ihr Angebot · für eine Person mit Pflegegrad 3“ (angebotFuer, klein wie im Mockup), Preis, „Details ›“, drei Punkte.
// Preis wie in der Kostenkarte darunter (`bruttopreis`, dort derselbe Ersatzwert).
export function AngebotKarteMinimal({ lead, onDetails }: { lead: Lead | null; onDetails: () => void }) {
  const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
  const fuer = angebotFuer((lead?.kalkulation as Record<string, unknown> | null | undefined)?.formularDaten as Record<string, unknown> | undefined);
  return (
    <div className="rounded-[16px] bg-pm-paper px-4 py-3.5" data-angebot-minimal>
      <p className="text-[13px] leading-snug text-pm-muted">{fuer ? `Ihr Angebot · ${fuer}` : 'Ihr Angebot'}</p>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <p className="whitespace-nowrap text-[24px] font-bold leading-tight tracking-[-0.01em] tabular-nums text-pm-ink">
          {formatEuro(brutto)} <span className="text-[14px] font-medium tracking-normal text-pm-muted">/ Monat</span>
        </p>
        <button type="button" onClick={onDetails} className={`${TIPPFLAECHE} ${FOKUS} flex-none rounded-md text-[14px] font-semibold text-pm-taupe-ink`}>
          Details ›
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-pm-muted">{ANGEBOT_PUNKTE}</p>
    </div>
  );
}

// ── Eine Pflegekraft als kompakte Zeile ───────────────────────────────────────────────────────────────────────────────────
/** Teile von „7 Jahre Erfahrung · Deutsch gut“ — wie `kraftZeile` im Kostenrechner (lib/kraefte-vorschau.ts), Reihenfolge
 *  wie im Mockup; fehlende Angaben entfallen. */
export function zeilenFakten(nurse: Pick<Nurse, 'experienceYears' | 'language'>): string[] {
  const teile: string[] = [];
  const jahre = nurse.experienceYears ?? 0;
  if (jahre > 0) teile.push(jahre === 1 ? '1 Jahr Erfahrung' : `${jahre} Jahre Erfahrung`);
  const stufe = nurse.language?.level;
  if (stufe && stufe !== '—') teile.push(`Deutsch ${stufe.toLowerCase()}`);
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
    <li className="flex items-center gap-2.5 border-b border-pm-line-soft py-[7px] last:border-b-0" data-pflegekraft-zeile={nurse.caregiverId}>
      <button type="button" onClick={onNurseClick} className={`${FOKUS} flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] text-left`}>
        {nurse.image ? (
          <img src={nurse.image} alt="" className="h-[42px] w-[42px] flex-none rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ backgroundColor: nurse.color }}>
            {initials(nurse.name).slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[15.5px] font-bold leading-[1.3] text-pm-ink">{vorname}{nurse.age ? `, ${nurse.age}` : ''}</span>
          {/* Unter 390 px (und im Handyrahmen am Computer, 374 px innen) 12 px, damit „4 Jahre Erfahrung · Deutsch mittel“
              auch auf 375 px in eine Zeile passt; reicht die Breite trotzdem nicht, bricht die Zeile nur hinter „·“, nie in
              einer Angabe (gemessen 07.11.: 320/360/375/390/430 px, bau/portal/lage.json). */}
          {fakten.length > 0 && (
            <span className="block text-[12px] min-[390px]:text-[12.5px] md:text-[12px] leading-[1.35] text-pm-muted">
              {fakten.map((teil, i) => (
                <span key={teil}>{i > 0 && '\u00A0· '}<span className="whitespace-nowrap">{teil}</span></span>
              ))}
            </span>
          )}
        </span>
      </button>
      {gesperrt ? (
        <button type="button" disabled aria-disabled="true" className="flex-none cursor-not-allowed rounded-full bg-pm-paper px-3 py-[7px] text-[13.5px] font-bold text-pm-taupe-ink">
          Bitte warten…
        </button>
      ) : vorgemerkt ? (
        <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} flex-none rounded-full bg-pm-mint px-3 py-[7px] text-[13.5px] font-bold whitespace-nowrap text-pm-green-deep`}>
          Vorgemerkt ✓
        </button>
      ) : (
        <button type="button" onClick={einladen} className={`${TIPPFLAECHE} ${FOKUS} flex-none rounded-full bg-pm-shell px-3 py-[7px] text-[13.5px] font-bold whitespace-nowrap text-pm-taupe-ink hover:bg-pm-chip`}>
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
    <li className="flex items-center gap-2.5 border-b border-pm-line-soft py-[7px] last:border-b-0" data-platzhalter>
      <span className="h-[42px] w-[42px] flex-none animate-pulse rounded-full bg-pm-shell" />
      <span className="min-w-0 flex-1">
        <span className="block h-[14px] w-24 animate-pulse rounded bg-pm-shell" />
        <span className="mt-2 block h-[11px] w-40 max-w-full animate-pulse rounded bg-pm-line-soft" />
      </span>
      <span className="h-[34px] w-[82px] flex-none animate-pulse rounded-full bg-pm-line-soft" />
    </li>
  );
}
const PLATZHALTER = 5;

// ── Die Seite vor dem Speichern: Minimal ──────────────────────────────────────────────────────────────────────────────
export function EinstiegMinimal({
  anrede, lead, onBestpreis, heimEigenanteil, heimQuelle,
  laedt, zeilen, gehalteneEinladungen, vorschlaegeVorhanden, bereitsBearbeitet, formular, sterne, vorgemerkte,
  onVervollstaendigen, onKostenAufgeklappt, onFaqGeoeffnet,
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
          <h1 className="px-[18px] pt-3 pb-2 text-[19px] font-bold leading-[1.25] tracking-[-0.01em] text-pm-ink">
            Guten Tag{anrede ? `, ${anrede}` : ''}
          </h1>
          <div className="px-3.5">
            <AngebotKarteMinimal lead={lead} onDetails={zuDenKosten} />
          </div>

          {/* id = Sprungziel des Mail-Deeplinks `goto=matches`. Ohne Vorschläge (und ohne Hinweis) entfällt der Abschnitt. */}
          {!(leer && gehalteneEinladungen === 0 && !vorschlaegeVorhanden) && (
            <section id="pflegekraefte" style={{ scrollMarginTop: 96 }} aria-labelledby="pflegekraefte-titel">
              <h2 id="pflegekraefte-titel" className="flex items-center gap-2 px-[18px] pt-3.5 pb-1 text-[12px] font-bold uppercase tracking-[.08em] text-pm-muted">
                Passende Pflegekräfte
                {!laedt && anzahl > 0 && (
                  <span className="rounded-full bg-pm-paper px-2 py-px text-[12px] tracking-normal tabular-nums text-pm-ink">{anzahl}</span>
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
                    Die Pflegekräfte melden sich meist innerhalb von 1&ndash;2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier &mdash; meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.
                  </p>
                </div>
              ) : (
                <div className="mx-3.5 mt-2 rounded-card border border-pm-line-soft bg-white px-5 py-5 text-center">
                  <p className="text-[15px] font-semibold mb-1 text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
                  <p className="text-[14px] leading-relaxed text-pm-muted">
                    Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Direkt unter der Liste, nicht fest am Rand (Mockup). */}
          <div className="grid gap-2 px-3.5 pt-2 pb-3.5" data-aktionen-minimal>
            <button
              type="button"
              onClick={onVervollstaendigen}
              className={`${FOKUS} block w-full rounded-[14px] bg-pm-coral px-4 py-3.5 text-center text-[16px] font-bold leading-[1.3] text-white transition-colors hover:bg-pm-coral-deep active:scale-[0.99]`}
            >
              {HAUPTKNOPF}
              <span className="mt-0.5 block text-[12.5px] font-medium opacity-90">{HAUPTKNOPF_ZEILE}</span>
            </button>
            <a
              href={TELEFON_HREF}
              className={`${FOKUS} flex min-h-[44px] items-center justify-center rounded-[14px] border-[1.5px] border-pm-line bg-white px-4 text-[15px] font-semibold text-pm-ink transition-colors hover:border-pm-taupe-light`}
            >
              {RUECKRUF}
            </a>
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
