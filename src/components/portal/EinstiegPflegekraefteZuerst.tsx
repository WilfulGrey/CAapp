// Einstieg VOR dem ersten Speichern der Pflegesituation: „Pflegekräfte zuerst“ — Registry #145.
//
// Martin 03.11.2026: „Preis oben, kurze Hemmnisnehmer, von mir aus Bestpreisgarantie oder Sterne oder sowas. Und dann
// sofort Pflegekräfte, so wie er [ChatGPT] das vorgeschlagen hat. Und dann geht's weiter.“ Umsetzung genau danach:
//   Kopf (wie bisher) → Kostenkarte kompakt (Preis mit Testsieger-Siegel, Satz, Bestpreisgarantie, die vier Punkte in
//   zwei Spalten; „Kosten erst …“, Heimvergleich und Testsieger-Zeile wandern in „Alle Kosten im Überblick“) → sofort die
//   Pflegekräfte (ohne den Kasten „Noch 2 Minuten bis zu Ihren Bewerbungen“, „Einladen“ als aktiver Knopf) → Pflegesituation
//   mit offenem Formular → So geht es weiter → Häufige Fragen → Marta.
// „Einladen“ vor dem Speichern öffnet das Fenster „{Name} einladen“ (EinladenSheetVorSpeichern) und merkt die Pflegekraft
// vor (lib/vormerkungen.ts); nach dem ersten erfolgreichen Speichern lädt CustomerPortalPage alle Vorgemerkten über den
// bisherigen Einladen-Weg ein.
//
// Rückweg: `?einstieg=alt` zeigt die bisherige Seite (EinstiegVorSpeichern.tsx, Stand 75b8df8) unverändert;
// `?einstieg=kompakt` den Kompakt-Einstieg (#780). Alles nach dem ersten Speichern bleibt wie bisher.
// Seit Registry #147 (Entwurf 07.11.2026) steht diese Seite hinter `?einstieg=zuerst`; ohne Schalter zeigt das Portal den
// Minimal-Einstieg (EinstiegMinimal.tsx), der Kostenkarte, Abschnitt Pflegesituation, Fenster und Zeile von hier nutzt.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ShieldCheck } from 'lucide-react';
import { formatEuro, type Lead } from '../../lib/supabase';
import type { SterneStand } from '../../lib/sterne';
import { namenListe } from '../../lib/vormerkungen';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Sheet } from '../ui/Sheet';
import { SectionHeader, EYEBROW } from '../ui/SectionHeader';
import { StatusBadge } from '../ui/StatusBadge';
import { zeigtSommerzuschlag } from './konditionen';
import { FaqListe } from './FaqListe';
import { MartaBox } from './MartaBox';
import { KopfVorSpeichern, SoGehtEsWeiterVorSpeichern } from './EinstiegVorSpeichern';

// Die vier Punkte der Kostenkarte (Martin 03.11.2026: „Es soll Hemmungen nehmen und zum Weitermachen animieren, um das
// Profil auszufüllen“; Auswahl OpenAI-geprüft). Reihenfolge links oben → rechts unten. „Erste Rückmeldungen …“ ist Martins
// Satz „Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.“, gekürzt auf die Zeile; gesetzt, nicht nachprüfen.
export const VIER_PUNKTE = ['Einladen kostenlos und unverbindlich', 'Erste Rückmeldungen häufig in 60 Minuten', 'Täglich kündbar', 'Keine Vermittlungsgebühr'] as const;

// Weiche Trennzeichen (U+00AD) für Wörter, die breiter sein können als eine Spalte (sichtbar nur beim Umbruch).
const TRENNSTELLEN: Record<string, string> = {
  Vermittlungsgebühr: 'Vermittlungs\u00ADgebühr',
  Rückmeldungen: 'Rück\u00ADmeldungen',
  unverbindlich: 'unver\u00ADbindlich',
};
// „60 Minuten“ bricht nie zwischen Zahl und Einheit (geschütztes Leerzeichen; auf 375 px stand „60“ sonst allein).
const mitTrennstellen = (text: string) => text
  .replace(/Vermittlungsgebühr|Rückmeldungen|unverbindlich/g, (w) => TRENNSTELLEN[w])
  .replace('60 Minuten', '60\u00A0Minuten');

// ── Kostenkarte kompakt ──────────────────────────────────────────────────────────────────────────────────────────────────
// Dieselbe Karte wie bisher (Klassen, Chevron am Eyebrow klappt die ganze Karte), nur weniger hoch und mit neuen Punkten:
// Siegel klein rechts neben dem Preis, die vier Punkte als 2×2, „Kosten erst …“, Heimvergleich und Testsieger-Zeile im
// Aufklapper oben (Heimvergleich bleibt dort, Martin 03.11.).
export function KostenkarteKompakt({ lead, onBestpreis, heimEigenanteil, heimQuelle, onKostenAufgeklappt, aufklappen }: {
  lead: Lead | null;
  onBestpreis: () => void;
  /** Heim-Eigenanteil im 1. Jahr und Quelle (eine Konstante in CustomerPortalPage). */
  heimEigenanteil: number;
  heimQuelle: string;
  /** Messpunkt (Registry #123): „Alle Kosten im Überblick" aufgeklappt. Unsichtbar. */
  onKostenAufgeklappt?: () => void;
  /** Registry #147 (Minimal-Einstieg): jede Erhöhung klappt Karte und „Alle Kosten im Überblick" auf („Details ›" oben). */
  aufklappen?: number;
}) {
  const [offerExpandedManual, setOfferExpandedManual] = useState<boolean | null>(null);
  const [costsExpanded, setCostsExpanded] = useState(false);
  useEffect(() => {
    if (!aufklappen) return;
    setOfferExpandedManual(true);
    setCostsExpanded(true);
  }, [aufklappen]);
  const offerExpanded = offerExpandedManual ?? true;
  const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
  return (
    <div className="max-w-3xl mx-auto px-3.5 pt-7">
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
            {/* Preis und Siegel+Etikett brauchen zusammen ca. 300 px (Preis 160 + Abstand 12 + Etikett 128), die Karte hat
                innen auf 375 px 307 px, auf 360 px 292 px, auf 320 px 252 px (gemessen 03.11.). Darum unter 375 px Preis
                40 px (ca. 139 px breit, passt auf 360 px in eine Zeile) und flex-wrap: Reicht die Breite trotzdem nicht
                (320 px, z. B. iPhone mit Anzeigezoom), rutscht Siegel+Etikett unter den Preis, statt aus der Karte zu ragen. */}
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              {/* whitespace-nowrap: auf 375 px brach „€“ sonst neben dem Etikett in eine zweite Zeile (gemessen 03.11.). */}
              <p className="whitespace-nowrap text-[40px] min-[375px]:text-[46px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-pm-ink">{formatEuro(brutto)}</p>
              {/* Nachbesserung 2 (Martin 03.11.): unter dem kleinen Siegel einzeilig das freigegebene Etikett, kein weiterer
                  Text; „DIE WELT“ bricht nie um (geschütztes Leerzeichen, ganze Zeile ohne Umbruch). */}
              <div className="flex flex-none flex-col items-center gap-1" data-testsieger-etikett>
                <img src="/badge-testsieger.webp" alt="Testsieger Die Welt" className="h-12 w-auto flex-none object-contain" />
                <span className="whitespace-nowrap text-[11px] font-bold leading-none text-pm-ink">6× Testsieger DIE&nbsp;WELT</span>
              </div>
            </div>
            <p className="text-[14.5px] mt-2 leading-[1.5] text-pm-muted">
              Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).
            </p>
            <button
              type="button"
              onClick={onBestpreis}
              className="mt-3 w-full min-h-[48px] flex items-center gap-2.5 rounded-[14px] bg-pm-mint px-3 py-2 text-left"
            >
              <span className="w-[30px] h-[30px] rounded-full bg-pm-green text-white flex items-center justify-center flex-none" aria-hidden="true">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <span className="flex-1 text-[15px] font-bold text-pm-green-deep">Bestpreisgarantie</span>
              <span className="text-[14px] font-semibold text-pm-green-deep underline underline-offset-2">Mehr Infos</span>
            </button>

            {/* 2×2 auch am Handy; lange Punkte brechen in ihrer Spalte um. „Vermittlungsgebühr“ ist breiter als eine
                Spalte auf 375–390 px (ca. 128 px gegen 114–121 px) und ragte über den Kartenrand: weiche Trennzeichen
                nur an festen Stellen (TRENNSTELLEN, sichtbar nur beim Umbruch). Keine automatische Silbentrennung: Sie
                trennte auch Wörter, bei denen der Umbruch am Leerzeichen reicht. */}
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {VIER_PUNKTE.map((text) => (
                <li key={text} className="flex items-start gap-2 text-[14.5px] leading-[1.35] text-pm-ink">
                  <span className="mt-[1px] w-[18px] h-[18px] rounded-[6px] bg-pm-shell text-pm-taupe flex items-center justify-center flex-none" aria-hidden="true">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="min-w-0">{mitTrennstellen(text)}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => { if (!costsExpanded) onKostenAufgeklappt?.(); setCostsExpanded(!costsExpanded); }}
              aria-expanded={costsExpanded}
              // Registry #147: Sprungziel von „Details ›“ (Minimal-Einstieg); scroll-mt = Höhe der Navigationsleiste + Luft.
              data-kostenaufstellung
              className="mt-3 w-full min-h-[48px] flex items-center justify-between gap-2 border-t border-pm-line-soft pt-2 text-[15px] font-semibold text-pm-taupe-ink scroll-mt-20"
            >
              {costsExpanded ? 'Weniger anzeigen' : 'Alle Kosten im Überblick'}
              <ChevronDown className={`w-5 h-5 text-pm-taupe transition-transform duration-200 ${costsExpanded ? 'rotate-180' : ''}`} />
            </button>

            {costsExpanded && <KostenAufstellung lead={lead} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} />}
          </>
        )}
      </Card>
    </div>
  );
}

// ── Aufstellung hinter „Alle Kosten im Überblick“ ───────────────────────────────────────────────────────────────────────
// Eine Quelle für die Kostenkarte hier und für „Details“ in der Angebotskarte des Minimal-Einstiegs (Registry #147, Martin
// 08.11.: „Ihre Betreuungskosten finde ich blöd. Das müssten doch die Details da oben sein, wenn ich sie öffne.“).
// `siegel={false}`: ohne die Testsieger-Zeile (der Minimal-Einstieg zeigt sie schon im Kopf und in der Karte).
export function KostenAufstellung({ lead, heimEigenanteil, heimQuelle, siegel = true }: {
  lead: Lead | null;
  heimEigenanteil: number;
  heimQuelle: string;
  siegel?: boolean;
}) {
  const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
  const tagessatz = Math.round(brutto / 30);
  const zuschussPosten = (lead?.kalkulation?.['zuschüsse']?.items ?? [])
    .filter(z => z.in_kalkulation && z.betrag_monatlich > 0);
  const eigenanteil = zuschussPosten.length > 0
    ? Math.max(0, brutto - zuschussPosten.reduce((a, z) => a + z.betrag_monatlich, 0))
    : null;
  // Heimvergleich: Eigenanteil aus dem ANGEZEIGTEN Brutto minus Posten mit `in_kalkulation`; nur zeigen, wenn wir
  // wirklich günstiger sind.
  const heimErsparnis = eigenanteil !== null ? heimEigenanteil - eigenanteil : 0;
  return (<>
      {/* Oben im Aufklapper (Martin 03.11.): was bisher unter den vier Punkten stand, Wortlaut unverändert. */}
      <p className="mt-1 text-[14.5px] leading-[1.5] text-pm-muted">
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

      {siegel && (
        <div className="mt-3 pt-3 border-t border-pm-line-soft flex items-center gap-3">
          <img src="/badge-testsieger.webp" alt="Testsieger Die Welt" className="h-11 w-auto flex-shrink-0 object-contain" />
          <p className="text-[13.5px] leading-snug text-pm-muted">
            <b className="text-[15px] text-pm-ink">6× Testsieger DIE&nbsp;WELT</b><br/>20&nbsp;Jahre Erfahrung · 60.000+ Einsätze
          </p>
        </div>
      )}

      <div className="mt-3 rounded-[16px] bg-pm-paper px-4 py-3.5 space-y-3">
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
</>);
}

// ── Fenster „{Name} einladen“ (Tipp auf „Einladen“ vor dem Speichern) ────────────────────────────────────────────────────
// Ersetzt dort „Warum erst die Pflegesituation?“. Der Knopf führt wie bisher zum offenen Formular; „Später“ schließt nur.
// Die Pflegekraft ist beim Öffnen schon vorgemerkt (CustomerPortalPage).
function Punkt({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-[15px] leading-[1.45]">
      <Check className="w-4 h-4 mt-[3px] flex-none text-pm-green" strokeWidth={3} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function EinladenSheetVorSpeichern({ offen, name, onClose, onVervollstaendigen }: {
  offen: boolean;
  /** Der auf der Karte angezeigte Name (displayName), z. B. „Emilia W.“. */
  name: string;
  onClose: () => void;
  onVervollstaendigen: () => void;
}) {
  return (
    <Sheet
      offen={offen}
      titel={`${name} einladen`}
      onClose={onClose}
      fuss={(
        <>
          <Button breit onClick={() => { onClose(); onVervollstaendigen(); }} className="px-3">
            Pflegesituation vervollständigen
          </Button>
          <Button variante="link" breit onClick={onClose} className="mt-2">Später</Button>
        </>
      )}
    >
      <p>Damit {name} sieht, ob der Einsatz passt, braucht es ein paar Angaben zur Pflegesituation, zum Beispiel:</p>
      <ul className="mt-1">
        <Punkt>Pflegegrad, Mobilität und Demenz</Punkt>
        <Punkt>Einsätze in der Nacht</Punkt>
        <Punkt>Wohnort, Unterbringung und Startdatum</Punkt>
      </ul>
      {/* Zweiter Satz: Martins Wortlaut (03.11.2026, Nachbesserung 2), Zeitangabe von ihm gesetzt. */}
      <p className="mt-2">Das dauert etwa 2 Minuten. Danach laden wir {name} für Sie ein. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.</p>
    </Sheet>
  );
}

// ── Zeile über dem Formular: wer nach dem Speichern eingeladen wird ──────────────────────────────────────────────────────
export type VorgemerkteKraft = { caregiverId: number; name: string; image?: string; color: string; initialen: string };

export function VormerkZeile({ kraefte }: { kraefte: VorgemerkteKraft[] }) {
  if (kraefte.length === 0) return null;
  return (
    <div data-vormerk-zeile className="flex items-center gap-2.5 px-1 pt-3 pb-3">
      <span className="flex flex-none -space-x-2" aria-hidden="true">
        {kraefte.slice(0, 3).map((k) => k.image ? (
          <img key={k.caregiverId} src={k.image} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-pm-paper" />
        ) : (
          <span key={k.caregiverId} className="w-8 h-8 rounded-full ring-2 ring-pm-paper flex items-center justify-center text-[12px] font-bold text-white" style={{ backgroundColor: k.color }}>
            {k.initialen}
          </span>
        ))}
      </span>
      <p className="min-w-0 text-[14.5px] leading-snug text-pm-ink">
        Nach dem Speichern laden wir {namenListe(kraefte.map((k) => k.name))} für Sie ein.
      </p>
    </div>
  );
}

// ── Abschnitt „Pflegesituation“ mit offenem Formular (auch im Minimal-Einstieg, Registry #147) ───────────────────────────
export function AbschnittPflegesituation({ vorgemerkte, formular }: { vorgemerkte: VorgemerkteKraft[]; formular: ReactNode }) {
  return (
    <div>
      {/* id = Sprungziel aller Knöpfe ins Formular und des Mail-Deeplinks `goto=anfragen`. */}
      <div id="patientendaten" className="px-1 pt-6 scroll-mt-24">
        <SectionHeader
          eyebrow="Für Ihre Bewerbungen"
          titel="Pflegesituation"
          rechts={<StatusBadge ton="warnung">Unvollständig</StatusBadge>}
          zeile="Danach können Sie Pflegekräfte einladen und bekommen Bewerbungen. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten."
        />
      </div>
      <VormerkZeile kraefte={vorgemerkte} />
      <div>
        {formular}
      </div>
    </div>
  );
}

// ── Die Seite vor dem Speichern: Pflegekräfte zuerst ─────────────────────────────────────────────────────────────────────
export function EinstiegPflegekraefteZuerst({
  anrede, kuerzel, lead, onBestpreis, heimEigenanteil, heimQuelle,
  laedt, karten, gehalteneEinladungen, vorschlaegeVorhanden, bereitsBearbeitet, formular, sterne, vorgemerkte,
  onKostenAufgeklappt, onFaqGeoeffnet,
}: {
  /** Anrede für „Guten Tag, …" (customerSalutation), ohne Anrede nur „Guten Tag". */
  anrede: string | null;
  /** Initialen im Kreis des Kopfs; ohne Namen ein neutrales Zeichen. */
  kuerzel: string | null;
  lead: Lead | null;
  onBestpreis: () => void;
  heimEigenanteil: number;
  heimQuelle: string;
  /** Vorschläge laden noch (oder mamamia hakt) → ruhiger Ladezustand statt Karten. */
  laedt: boolean;
  /** Die sichtbaren Karten (MatchCardVorSpeichern mit `einladenAktiv`, Empfehlung zuerst). */
  karten: ReactNode[];
  /** Einladungen der letzten 24 h, die Plätze halten (Batch-Reveal). */
  gehalteneEinladungen: number;
  /** Es gibt Vorschläge, auch bearbeitete. Ohne frische Karte und ohne gehaltene Einladung heißt das: alle bearbeitet. */
  vorschlaegeVorhanden: boolean;
  bereitsBearbeitet: ReactNode;
  /** Das offene Formular (AngebotCard mit `stand75b8df8`). */
  formular: ReactNode;
  sterne: SterneStand | null;
  /** Vorgemerkte Pflegekräfte (in der Liste gefunden, noch offen) für die Zeile über dem Formular. */
  vorgemerkte: VorgemerkteKraft[];
  /** Unsichtbare Messpunkte (Registry #123): Kostenaufstellung aufgeklappt, eine Häufige Frage aufgeklappt. */
  onKostenAufgeklappt?: () => void;
  onFaqGeoeffnet?: (schluessel: string) => void;
}) {
  const hasAnyCard = karten.length > 0;
  return (
    <div className="bg-pm-paper" data-einstieg="pflegekraefte-zuerst">
      <KopfVorSpeichern anrede={anrede} kuerzel={kuerzel} sterne={sterne} />

      <KostenkarteKompakt lead={lead} onBestpreis={onBestpreis} heimEigenanteil={heimEigenanteil} heimQuelle={heimQuelle} onKostenAufgeklappt={onKostenAufgeklappt} />

      <div className="max-w-3xl mx-auto px-3.5 pt-1 pb-6 space-y-4">
        {/* id = Sprungziel des Mail-Deeplinks `goto=matches`. */}
        <div className="px-1 pt-6" id="pflegekraefte" style={{scrollMarginTop:96}}>
          <SectionHeader
            eyebrow="Für Sie ausgewählt"
            titel="Passende Pflegekräfte"
            zeile="Laden Sie ein, wer Ihnen gefällt. Dafür beschreiben Sie kurz die Pflegesituation."
          />
        </div>

        {laedt && (
          <div className="rounded-card px-5 py-8 border border-pm-line-soft bg-white text-center">
            <div className="inline-block w-6 h-6 rounded-full border-2 border-pm-taupe-light/70 border-t-transparent animate-spin mb-3" />
            <p className="text-[15px] font-semibold mb-1 text-pm-ink">Wir laden Ihre Pflegekräfte …</p>
            <p className="text-[14px] leading-relaxed text-pm-muted">Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
          </div>
        )}

        {!laedt && (
          <>
            {hasAnyCard && (
              <div className="space-y-3">
                {karten}
              </div>
            )}

            {!hasAnyCard && gehalteneEinladungen > 0 && (
              <div className="rounded-card px-5 py-5 border border-pm-line-soft bg-white text-center">
                <p className="text-[15px] font-semibold mb-1 text-pm-ink">Ihre Auswahl ist eingeladen</p>
                <p className="text-[14px] leading-relaxed text-pm-muted">
                  Die Pflegekräfte melden sich meist innerhalb von 1&ndash;2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier &mdash; meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.
                </p>
              </div>
            )}

            {!hasAnyCard && gehalteneEinladungen === 0 && vorschlaegeVorhanden && (
              <div className="rounded-card px-5 py-5 border border-pm-line-soft bg-white text-center">
                <p className="text-[15px] font-semibold mb-1 text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
                <p className="text-[14px] leading-relaxed text-pm-muted">
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
          <AbschnittPflegesituation vorgemerkte={vorgemerkte} formular={formular} />
        </div>
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
