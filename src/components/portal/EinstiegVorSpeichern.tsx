// Einstieg VOR dem ersten Speichern der Pflegesituation — Stand 75b8df8 (25.09.2026 15:56), Rückbau Registry #122.
//
// Befund (Auswertung 10.10.2026, seo-reports/analysen/profil-ursache-2026-10-10/ERGEBNIS.md): Seit dem Merge #748
// (25.09. 16:35) speichern Kunden aus Google-Anzeigen ihre Pflegesituation in der ersten Stunde kaum noch — vorher
// 42 von 151, danach 2 von 48. Wer das Formular beginnt, wird nur noch zu 25 % statt 82 % fertig. Die Teil-Rücknahmen
// (#761 Einstieg, #770 Wortlaut) und der Kompakt-Einstieg (#780) brachten nichts zurück. Martin 10.10.: „wir wollen
// ändern dass wieder mehr patientenprofil machen. das war doch schon besser“.
//
// Deshalb sehen Kunden ohne gespeicherte Pflegesituation (`kompakt` in CustomerPortalPage) die Seite wieder genau wie im
// Stand 75b8df8: Kopf „Ihr persönliches Angebot“, Kostenkarte „Ihre Betreuungskosten“, „Passende Pflegekräfte“ mit dem
// Kasten „Noch 2 Minuten bis zu Ihren Bewerbungen“ und den damaligen Karten (MatchCardVorSpeichern), Abschnittskopf
// „Pflegesituation“ mit dem OFFENEN Formular, „So geht es weiter“, Häufige Fragen, Marta. Alle sichtbaren Texte und
// Klassen 1:1 aus 75b8df8:src/pages/CustomerPortalPage.tsx bzw. den damaligen Komponenten — keine neuen Formulierungen.
// Die schwebende Frage „Was sagen Sie zum Angebot?“ erscheint hier nicht: Im Stand 75b8df8 war sie wegen eines Fehlers
// bei echten Kunden nie sichtbar (Registry #114).
//
// Was NICHT zurückgebaut ist (Sicherheits-/Datenfixes, unsichtbar): Laden über lead_by_token (#107), Speichern nach
// mamamia, Telefon- und Startdatum-Logik (#91/#92), Ladezustand bis zur Einladungs-Zählung (#749). Alles NACH dem ersten
// Speichern bleibt wie heute im Trunk.
//
// Rückweg: `?einstieg=kompakt` zeigt den Kompakt-Einstieg (#780) zum Vergleich; dauerhaft zurück = `rueckbau` in
// CustomerPortalPage auf false. Bereinigung nach der Entscheidung: diese Datei, MatchCardVorSpeichern.tsx,
// FAQ_STAND_75B8DF8 und die Props `stand75b8df8` (AngebotCard, FormNav) entfernen.
import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ShieldCheck } from 'lucide-react';
import { formatEuro, type Lead } from '../../lib/supabase';
import type { SterneStand } from '../../lib/sterne';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Sheet } from '../ui/Sheet';
import { SectionHeader, EYEBROW } from '../ui/SectionHeader';
import { StatusBadge } from '../ui/StatusBadge';
import { zeigtSommerzuschlag } from './konditionen';
import { FaqListe, FAQ_STAND_75B8DF8 } from './FaqListe';
import { MartaBox } from './MartaBox';

// ── Kopf (Stand 75b8df8: Ausgangszustand ohne Unterzeile und ohne Status-Zeile) ──────────────────────────────────────
// Look wie primundus.de (Teil 3 des Redesigns): Fläche „shell", Begrüßung in Taupe, Titel in 800. Im Ausgangszustand
// liegt die Kostenkarte leicht über der Unterkante (pb-10 + -mt-6 an der Karte).
export function KopfVorSpeichern({ anrede }: { anrede: string | null }) {
  return (
    <div className="bg-pm-shell">
      <div className="max-w-3xl mx-auto px-[18px] pt-6 pb-10">
        <p className="text-[16px] text-pm-taupe-ink">
          Guten Tag{anrede ? `, ${anrede}` : ''}.
        </p>
        <h1 className="mt-1 text-[31px] font-extrabold leading-[1.08] tracking-[-0.035em] text-pm-ink">
          Ihr persönliches Angebot
        </h1>
      </div>
    </div>
  );
}

// ── Kostenkarte (Stand 75b8df8, `angebotSection` vor dem Speichern) ────────────────────────────────────────────────────
// Der Kopf-Chevron klappt die ganze Karte zu, „Alle Kosten im Überblick" klappt die Aufstellung IN der Karte auf. Vor dem
// Speichern ist die Karte offen (damals: `offerExpandedManual ?? (!hasPending && (offerFirstVisit || !patientSaved))`).
export function KostenkarteVorSpeichern({ lead, onBestpreis, heimEigenanteil, heimQuelle }: {
  lead: Lead | null;
  onBestpreis: () => void;
  /** Heim-Eigenanteil im 1. Jahr und Quelle (eine Konstante in CustomerPortalPage). */
  heimEigenanteil: number;
  heimQuelle: string;
}) {
  const [offerExpandedManual, setOfferExpandedManual] = useState<boolean | null>(null);
  const [costsExpanded, setCostsExpanded] = useState(false);
  const offerExpanded = offerExpandedManual ?? true;
  const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
  const tagessatz = Math.round(brutto / 30);
  const items = [
    { text: 'Täglich kündbar' },
    { text: 'Tagesgenaue Abrechnung' },
    { text: 'Erst auswählen, dann buchen' },
    { text: 'Keine Vermittlungsgebühr' },
  ];
  // Heimvergleich: Eigenanteil aus dem ANGEZEIGTEN Brutto minus Posten mit `in_kalkulation`. Nur zeigen, wenn wir
  // wirklich günstiger sind.
  const zuschussPosten = (lead?.kalkulation?.['zuschüsse']?.items ?? [])
    .filter(z => z.in_kalkulation && z.betrag_monatlich > 0);
  const eigenanteil = zuschussPosten.length > 0
    ? Math.max(0, brutto - zuschussPosten.reduce((a, z) => a + z.betrag_monatlich, 0))
    : null;
  const heimErsparnis = eigenanteil !== null ? heimEigenanteil - eigenanteil : 0;
  return (
    <div className="max-w-3xl mx-auto px-3.5 -mt-6">
      <Card className="relative px-5 pt-3 pb-4 shadow-lift">
        <button
          type="button"
          onClick={() => setOfferExpandedManual(!offerExpanded)}
          aria-expanded={offerExpanded}
          className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
        >
          <span className={EYEBROW}>Ihre Betreuungskosten</span>
          <ChevronDown className={`w-5 h-5 flex-shrink-0 text-pm-taupe transition-transform duration-200 ${offerExpanded ? 'rotate-180' : ''}`} />
        </button>

        {offerExpanded && (
          <>
            <p className="mt-1 text-[46px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-pm-ink">{formatEuro(brutto)}</p>
            <p className="text-[14.5px] mt-2 leading-[1.5] text-pm-muted">
              Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).
            </p>
            <button
              type="button"
              onClick={onBestpreis}
              className="mt-3.5 w-full min-h-[48px] flex items-center gap-2.5 rounded-[14px] bg-pm-mint px-3 py-2 text-left"
            >
              <span className="w-[30px] h-[30px] rounded-full bg-pm-green text-white flex items-center justify-center flex-none" aria-hidden="true">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <span className="flex-1 text-[15px] font-bold text-pm-green-deep">Bestpreisgarantie</span>
              <span className="text-[14px] font-semibold text-pm-green-deep underline underline-offset-2">Mehr Infos</span>
            </button>

            <ul className="mt-3.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-center gap-2.5 py-[5px] text-[15.5px] text-pm-ink">
                  <span className="w-[22px] h-[22px] rounded-[7px] bg-pm-shell text-pm-taupe flex items-center justify-center flex-none" aria-hidden="true">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[14.5px] leading-[1.5] text-pm-muted">
              Kosten erst, wenn die Pflegekraft da ist.
            </p>

            {eigenanteil !== null && heimErsparnis > 0 && (
              <div className="mt-3 pt-3 border-t border-pm-line-soft">
                <p className="text-[14.5px] leading-[1.5] text-pm-ink">
                  Zuhause statt Pflegeheim: rund <b className="text-pm-green-deep">{formatEuro(heimErsparnis)} weniger</b> im Monat.
                </p>
                <p className="mt-1 text-[13px] leading-snug text-pm-muted">
                  Heim-Eigenanteil im 1. Jahr {formatEuro(heimEigenanteil)}, bei Ihnen nach Zuschüssen etwa {formatEuro(eigenanteil)}. Quelle: {heimQuelle}.
                </p>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-pm-line-soft flex items-center gap-3">
              <img src="/badge-testsieger.webp" alt="Testsieger Die Welt" className="h-11 w-auto flex-shrink-0 object-contain" />
              <p className="text-[13.5px] leading-snug text-pm-muted">
                <b className="text-[15px] text-pm-ink">6× Testsieger DIE&nbsp;WELT</b><br/>20&nbsp;Jahre Erfahrung · 60.000+ Einsätze
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCostsExpanded(!costsExpanded)}
              aria-expanded={costsExpanded}
              className="mt-3 w-full min-h-[48px] flex items-center justify-between gap-2 border-t border-pm-line-soft pt-2 text-[15px] font-semibold text-pm-taupe-ink"
            >
              {costsExpanded ? 'Weniger anzeigen' : 'Alle Kosten im Überblick'}
              <ChevronDown className={`w-5 h-5 text-pm-taupe transition-transform duration-200 ${costsExpanded ? 'rotate-180' : ''}`} />
            </button>

            {costsExpanded && (<>
              <div className="mt-1 rounded-[16px] bg-pm-paper px-4 py-3.5 space-y-3">
                {[
                  { label: 'Betreuung', value: `${formatEuro(brutto)} / Monat`, note: '' },
                  { label: 'Entspricht', value: `${formatEuro(tagessatz)} / Tag`, note: 'tagesgenau abgerechnet' },
                  { label: 'Reisekosten', value: '125 € pro Strecke', note: '' },
                  { label: 'Kost & Logis', value: 'stellt der Haushalt', note: '' },
                  ...(zeigtSommerzuschlag()
                    ? [{ label: 'Sommerzuschlag', value: '6,67 € / Tag', note: 'Juli + August' }]
                    : []),
                ].map((row, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4">
                    <span className="text-[15px] flex-shrink-0 text-pm-muted">{row.label}</span>
                    <span className="text-right">
                      <span className="block text-[15px] tabular-nums text-pm-ink">{row.value}</span>
                      {row.note && <span className="block text-[13px] mt-0.5 text-pm-muted">{row.note}</span>}
                    </span>
                  </div>
                ))}
              </div>

              {eigenanteil !== null && (
                <div className="mt-2.5 rounded-[16px] bg-pm-paper px-4 py-3.5">
                  <p className={`${EYEBROW} mb-3`}>Was bleibt für Sie übrig</p>
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[15px] flex-shrink-0 text-pm-muted">Betreuung</span>
                      <span className="text-[15px] tabular-nums text-pm-ink">{formatEuro(brutto)}</span>
                    </div>
                    {zuschussPosten.map((z, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-4">
                        <span className="text-[15px] min-w-0 text-pm-muted">
                          {z.label.replace(/\s*\([^)]*\)\s*$/, '')}
                          {(z.hinweis || z.name === 'steuervorteil') && (
                            <span className="block text-[13px] mt-0.5 leading-snug">
                              {z.hinweis ?? 'Setzt voraus, dass entsprechend Steuern anfallen.'}
                            </span>
                          )}
                        </span>
                        <span className="text-[15px] tabular-nums whitespace-nowrap flex-shrink-0 text-pm-ink">
                          − {formatEuro(z.betrag_monatlich)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between gap-4 pt-3 border-t border-pm-line">
                      <span className="text-[15px] font-semibold flex-shrink-0 text-pm-ink">Ihr Eigenanteil</span>
                      <span className="text-[17px] font-bold tabular-nums text-pm-ink">{formatEuro(eigenanteil)}</span>
                    </div>
                  </div>
                  <p className="text-[13px] leading-snug mt-3 text-pm-muted">
                    Pflegegeld, Entlastungsbudget und Steuervorteil sind Leistungen
                    Dritter mit eigenen Voraussetzungen — die Beträge sind eine
                    Orientierung, keine Zusage. Jahresbeträge sind auf den Monat umgelegt.
                  </p>
                </div>
              )}

              <a
                href="/primundus-mustervertrag.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 text-[14px] text-pm-ink underline underline-offset-2"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/>
                </svg>
                Mustervertrag als PDF herunterladen
              </a>
            </>)}
          </>
        )}
      </Card>
    </div>
  );
}

// ── „So geht es weiter" (Stand 75b8df8: Liste ohne Knopf, das Formular steht direkt darüber) ──────────────────────────
export const SCHRITTE_STAND_75B8DF8 = [
  { titel: 'Pflegesituation vervollständigen', text: '2 Minuten. Vieles ist schon ausgefüllt.' },
  { titel: 'Bewerbungen erhalten', text: 'Passende Pflegekräfte bewerben sich bei Ihnen. Gerne können Sie Ihre Favoriten einladen, sich zu bewerben.' },
  { titel: 'Auswählen und starten', text: 'Wir übernehmen den Rest. Anreise schon ab 3 Tagen möglich.' },
] as const;

export function SoGehtEsWeiterVorSpeichern() {
  // Vor dem Speichern ist nichts erledigt: Schritt 1 ist der aktuelle (damals `erledigt={[patientSaved, hasPending, false]}`).
  const erledigt: readonly boolean[] = [false, false, false];
  const aktiv = SCHRITTE_STAND_75B8DF8.findIndex((_, i) => !erledigt[i]);
  return (
    <section>
      <SectionHeader eyebrow="In drei Schritten" titel="So geht es weiter" />
      <ol className="mt-3.5 border-b border-pm-line">
        {SCHRITTE_STAND_75B8DF8.map((s, i) => {
          const fertig = !!erledigt[i];
          const jetzt = i === aktiv;
          return (
            <li key={s.titel} className="flex gap-3.5 py-4 border-t border-pm-line" aria-current={jetzt ? 'step' : undefined}>
              <span
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center flex-none text-[14px] font-bold ${
                  fertig ? 'bg-pm-mint text-pm-green-deep' : jetzt ? 'bg-pm-taupe text-white' : 'bg-pm-shell text-pm-taupe'
                }`}
              >
                {fertig ? <Check className="w-4 h-4" strokeWidth={3} aria-label="erledigt" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`mt-[3px] text-[16px] font-bold ${fertig ? 'text-pm-mute' : 'text-pm-ink'}`}>{s.titel}</p>
                <p className={`mt-1 text-[14.5px] leading-[1.5] ${fertig ? 'text-pm-mute' : 'text-pm-muted'}`}>{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Pop-up „Warum erst die Pflegesituation?" (Stand 75b8df8, PortalSheets.tsx; dort seit Registry #109 gelöscht) ────────
// Hinter „Warum? Mehr" und hinter dem Einladen-Knopf mit Schloss, solange die Pflegesituation fehlt.
function Punkt({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-[15px] leading-[1.45]">
      <Check className="w-4 h-4 mt-[3px] flex-none text-pm-green" strokeWidth={3} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function WarumSheetVorSpeichern({ offen, onClose, onVervollstaendigen }: {
  offen: boolean;
  onClose: () => void;
  onVervollstaendigen: () => void;
}) {
  return (
    <Sheet
      offen={offen}
      titel="Warum erst die Pflegesituation?"
      onClose={onClose}
      fuss={(
        <>
          <Button breit onClick={() => { onClose(); onVervollstaendigen(); }} className="px-3">
            Pflegesituation vervollständigen
          </Button>
          <Button variante="link" breit onClick={onClose} className="mt-2">Schließen</Button>
        </>
      )}
    >
      <p>Die Pflegekräfte entscheiden anhand Ihrer Angaben, ob sie zu Ihnen passen und wann sie anreisen können. Zum Beispiel:</p>
      <ul className="mt-1">
        <Punkt>Pflegegrad, Mobilität und Demenz</Punkt>
        <Punkt>Einsätze in der Nacht</Punkt>
        <Punkt>Wohnort, Unterbringung und Startdatum</Punkt>
      </ul>
      <p className="mt-2">Ohne diese Angaben kann sich niemand bewerben. Das Ausfüllen dauert etwa 2 Minuten.</p>
    </Sheet>
  );
}

// ── Die Seite vor dem Speichern (Stand 75b8df8) ────────────────────────────────────────────────────────────────────────
// Reihenfolge: Kopf → Kostenkarte → Passende Pflegekräfte (Kasten, Karten, Bereits bearbeitet) → Pflegesituation mit
// offenem Formular → So geht es weiter → Häufige Fragen → Marta. Die Karten, „Bereits bearbeitet" und das Formular baut
// CustomerPortalPage (Handler, Daten), die Seite hier nur Anordnung und Wortlaut.
export function EinstiegVorSpeichern({
  anrede, lead, onBestpreis, heimEigenanteil, heimQuelle, onWarum, onVervollstaendigen,
  laedt, karten, gehalteneEinladungen, vorschlaegeVorhanden, bereitsBearbeitet, formular, sterne,
}: {
  /** Anrede für „Guten Tag, …." (customerSalutation), ohne Anrede nur „Guten Tag." */
  anrede: string | null;
  lead: Lead | null;
  onBestpreis: () => void;
  heimEigenanteil: number;
  heimQuelle: string;
  /** „Warum? Mehr" unter „Passende Pflegekräfte" → Pop-up „Warum erst die Pflegesituation?" */
  onWarum: () => void;
  /** Knopf „Pflegesituation vervollständigen" im Kasten → zum Formular (`zurPflegesituation`). */
  onVervollstaendigen: () => void;
  /** Vorschläge laden noch (oder mamamia hakt) → ruhiger Ladezustand statt Karten. */
  laedt: boolean;
  /** Die sichtbaren Karten (MatchCardVorSpeichern, Empfehlung zuerst). */
  karten: ReactNode[];
  /** Einladungen der letzten 24 h, die Plätze halten (Batch-Reveal). */
  gehalteneEinladungen: number;
  /** Es gibt Vorschläge, auch bearbeitete. Ohne frische Karte und ohne gehaltene Einladung heißt das: alle bearbeitet. */
  vorschlaegeVorhanden: boolean;
  bereitsBearbeitet: ReactNode;
  /** Das offene Formular (AngebotCard mit `stand75b8df8`). */
  formular: ReactNode;
  sterne: SterneStand | null;
}) {
  const hasAnyCard = karten.length > 0;
  return (
    <div className="bg-pm-paper">
      <KopfVorSpeichern anrede={anrede} />

      <KostenkarteVorSpeichern lead={lead} onBestpreis={onBestpreis} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} />

      <div className="max-w-3xl mx-auto px-3.5 pt-1 pb-6 space-y-4">
        {/* id = Sprungziel des Mail-Deeplinks `goto=matches`. */}
        <div className="px-1 pt-6" id="pflegekraefte" style={{scrollMarginTop:96}}>
          <SectionHeader
            eyebrow="Für Sie ausgewählt"
            titel="Passende Pflegekräfte"
            zeile={(
              <>
                Laden Sie ein, wer Ihnen gefällt. Wir bereiten die Bewerbungen vor. Das geht, sobald Ihre Pflegesituation vollständig ist.{' '}
                <button
                  type="button"
                  onClick={onWarum}
                  className="inline-flex min-h-[44px] -my-3 items-center whitespace-nowrap font-bold text-pm-taupe-ink underline underline-offset-2"
                >
                  Warum? Mehr
                </button>
              </>
            )}
          />
        </div>

        {laedt && (
          <div className="rounded-card px-5 py-8 border border-[#EFEBE4] bg-white text-center">
            <div className="inline-block w-6 h-6 rounded-full border-2 animate-spin mb-3" style={{ borderColor: '#C4B49A', borderTopColor: 'transparent' }} />
            <p className="text-[15px] font-semibold mb-1" style={{ color: '#18181B' }}>Wir laden Ihre Pflegekräfte …</p>
            <p className="text-[14px] leading-relaxed" style={{ color: '#71717A' }}>Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
          </div>
        )}

        {!laedt && (
          <>
            {hasAnyCard && (
              <>
                <Card ton="hinweis" className="p-5 mb-5">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-pm-amber-ink">
                    <span className="w-2 h-2 rounded-full bg-pm-amber" aria-hidden="true" />
                    Pflegesituation unvollständig
                  </p>
                  <p className="mt-2 text-[17.5px] font-extrabold leading-[1.25] text-pm-ink">Noch 2 Minuten bis zu Ihren Bewerbungen</p>
                  <p className="mt-2 mb-4 text-[14.5px] leading-[1.5] text-pm-muted">Vieles ist schon aus Ihrem Kostenrechner übernommen.</p>
                  <Button breit onClick={onVervollstaendigen} className="px-2 whitespace-nowrap">
                    Pflegesituation vervollständigen
                  </Button>
                </Card>
                <div>
                  <div className="space-y-3">
                    {karten}
                  </div>
                </div>
              </>
            )}

            {!hasAnyCard && gehalteneEinladungen > 0 && (
              <div className="rounded-card px-5 py-5 border border-[#EFEBE4] bg-white text-center">
                <p className="text-[15px] font-semibold mb-1" style={{color:'#18181B'}}>Ihre Auswahl ist eingeladen</p>
                <p className="text-[14px] leading-relaxed" style={{color:'#71717A'}}>
                  Die Pflegekräfte melden sich meist innerhalb von 1&ndash;2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier &mdash; meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.
                </p>
              </div>
            )}

            {!hasAnyCard && gehalteneEinladungen === 0 && vorschlaegeVorhanden && (
              <div className="rounded-card px-5 py-5 border border-[#EFEBE4] bg-white text-center">
                <p className="text-[15px] font-semibold mb-1" style={{color:'#18181B'}}>Alle aktuellen Vorschläge bearbeitet</p>
                <p className="text-[14px] leading-relaxed" style={{color:'#71717A'}}>
                  Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
                </p>
              </div>
            )}
          </>
        )}

        {bereitsBearbeitet}
      </div>

      <div>
        <div className="max-w-3xl mx-auto px-3.5 pt-1 pb-4 space-y-4">
          <div>
            {/* id = Sprungziel aller Knöpfe ins Formular und des Mail-Deeplinks `goto=anfragen`. */}
            <div id="patientendaten" className="px-1 pt-6 scroll-mt-24">
              <SectionHeader
                eyebrow="Für Ihre Bewerbungen"
                titel="Pflegesituation"
                rechts={<StatusBadge ton="warnung">Unvollständig</StatusBadge>}
                zeile="Damit sich Pflegekräfte bewerben können. Vieles ist schon ausgefüllt."
              />
            </div>
            <div>
              {formular}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3.5 pt-1 pb-6 space-y-4">
        <div className="pt-6">
          <SoGehtEsWeiterVorSpeichern />
        </div>
        <div className="pt-6">
          <FaqListe fragen={FAQ_STAND_75B8DF8} />
        </div>
        <div className="pt-4">
          <MartaBox sterne={sterne} />
        </div>
      </div>
    </div>
  );
}
