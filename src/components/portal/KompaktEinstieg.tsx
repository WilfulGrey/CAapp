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
import { BadgeEuro, CalendarCheck, Check, ChevronRight, ShieldCheck, Sparkles, UserCheck, UserRound } from 'lucide-react';
import { GARANTIE_PORTAL } from '../../lib/garantie';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import { BewertungsZeile } from './BewertungsZeile';
import { DeutschPunkte } from './PflegekraftProfil';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { SectionHeader } from '../ui/SectionHeader';

/**
 * Runde 17 (Vorschlag 04.10. abends). Martin zu „Ihr Weg" (Runde 16): „sieht nicht aus wie ein echtes Angebot …
 * professioneller … Inklusive passt nicht … als Nächstes muss stehen: passende Pflegekräfte einladen und Bewerbungen
 * erhalten … da das Patientenprofil nicht da ist, eine Achtung: Es fehlen noch Informationen, damit Pflegekräfte sich
 * bewerben können. Jetzt vervollständigen." Deshalb: die Preiskarte als Angebot (Datum, Grundlage aus der Anfrage,
 * Preis, Zeilen „Enthalten"/„Zusätzlich" wie im Angebots-PDF), danach „Passende Pflegekräfte einladen und Bewerbungen
 * erhalten" mit dem Achtung-Hinweis über den Profilen. Bis zur Entscheidung nur per Adresse `?look=angebot`;
 * ohne Parameter bleibt Fassung 11 (`ruhig`).
 */
export type KompaktLook = 'ruhig' | 'angebot';
const SUCHE = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
export const KOMPAKT_LOOK: KompaktLook = SUCHE?.get('look') === 'angebot' ? 'angebot' : 'ruhig';

/** „05.10.2026" (Berliner Kalendertag) aus dem Anlagezeitpunkt der Anfrage; ohne gültiges Datum nichts. Der Preis wird
 *  in derselben Sekunde berechnet und als „Ihr Angebot" verschickt, darum „Ihr Angebot vom …" (OpenAI 05.10.). */
export function angebotDatum(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
}

/**
 * Runde 18 (Martin 04.10. spät): „wir fragen keinen Start ab" — der Rechner sendet care_start_timing seit dem Umbau als
 * null; nie aus diesem Feld etwas anzeigen. Grundlage im Satz der Einleitung: „für zwei Personen mit Pflegegrad 4".
 * Fehlende Angaben entfallen (kein Ersatzwert).
 */
export function angebotFuer(fd: Record<string, unknown> | null | undefined): string | null {
  const wer = fd?.betreuung_fuer === '1-person' ? 'eine Person' : fd?.betreuung_fuer === 'ehepaar' ? 'zwei Personen' : null;
  const pg = fd?.pflegegrad;
  const grad = typeof pg === 'number' || (typeof pg === 'string' && /^\d$/.test(pg))
    ? (Number(pg) === 0 ? 'ohne Pflegegrad' : `mit Pflegegrad ${pg}`)
    : null;
  if (!wer) return null;
  return grad ? `für ${wer} ${grad}` : `für ${wer}`;
}

/**
 * Kopf der Preiskarte (Runde 21): eine kleine Zeile im Stil der Website-Etiketten, „IHR ANGEBOT VOM 05.10.2026".
 * Ohne Linie und ohne zweite Spalte (Martin zu Fassung 15: „überladen"); sie hält, dass die Karte ein Angebot ist
 * und kein Rechenergebnis (Martin zur Weg-Fassung: „sieht nicht aus wie ein echtes Angebot"; OpenAI 05.10.).
 */
export function AngebotKopf({ datum }: { datum: string | null }) {
  return (
    <p className="text-[12.5px] font-semibold uppercase tabular-nums tracking-[0.08em] text-pm-taupe-ink">
      {datum ? `Ihr Angebot vom ${datum}` : 'Ihr Angebot'}
    </p>
  );
}

/**
 * Runde 19 (Martin: „die Situation nicht oben, das kann man unten machen"): was das Angebot umfasst, steht in der
 * Preiskarte über dem Preis — mit der Grundlage aus der Anfrage, falls vorhanden.
 */
export function AngebotLeistung({ fuer }: { fuer: string | null }) {
  // Runde 22 (Martin 05.10.: „wenig erklärend"): was der Preis kauft, als Zeile mit Gewicht, darunter die Grundlage
  // aus der Anfrage („für zwei Personen mit Pflegegrad 4"). Ohne Angaben steht nur die Leistung.
  return (
    <div>
      <p className="text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] text-pm-ink">Rund-um-Betreuung zu Hause</p>
      {fuer && <p className="mt-0.5 text-[15px] leading-[1.4] text-pm-muted">{fuer}</p>}
    </div>
  );
}

/**
 * Runde 22 (Martin 05.10.: „soll sich anfühlen wie ein persönlicher Bereich für den Kunden … mehr Apple-like"): der Kopf
 * wie ein Konto — Kreis mit den Initialen, Begrüßung, „Ihr persönlicher Bereich". Ohne Namen ein neutrales Zeichen.
 */
export function AngebotPerson({ name, kuerzel }: { name: string | null; kuerzel: string | null }) {
  return (
    <div className="flex items-center gap-3.5">
      <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-pm-taupe text-[17px] font-semibold tracking-[0.03em] text-white">
        {kuerzel || <UserRound className="h-6 w-6" strokeWidth={2} />}
      </span>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold leading-[1.3] text-pm-ink">Guten Tag{name ? `, ${name}` : ''}</p>
        <p className="text-[15px] leading-[1.35] text-pm-muted">Ihr persönlicher Bereich</p>
      </div>
    </div>
  );
}

/**
 * Runde 19 (Martin: „eher unsere Vorteile rein, Testsieger, sechsfach und sowas … das Siegel und die Sterne sind noch
 * nicht sichtbar … vorne mit reinbekommen"): Siegel mit Testsieger, Erfahrung und Sternen direkt unter dem Titel, ohne
 * Kasten. Die Sterne stehen ohne Stand nicht da (kein Ersatzwert), die Höhe bleibt reserviert.
 */
export function AngebotVertrauen({ sterne }: { sterne: SterneStand | null }) {
  // Runde 20 (Martin: „überladen, nicht clean, unprofessionell"): zwei Zeilen statt drei, Siegel 48 px.
  return (
    <div className="mt-5 flex items-center gap-3">
      {/* Siegel antippbar: Quelle und Einordnung stehen auf der Testsieger-Seite. */}
      <a href="https://primundus.de/testsieger-24-stunden-pflege" target="_blank" rel="noreferrer" className="flex-none" aria-label="Testsieger DIE WELT: Quelle ansehen">
        <img src="/badge-testsieger.webp" alt="" className="h-12 w-auto object-contain" />
      </a>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-[1.35] text-pm-ink">
          6× in Folge Testsieger <span className="whitespace-nowrap">DIE WELT</span>
        </p>
        <div className="flex h-6 items-center">
          <BewertungsZeile stand={sterne} klein className="-my-2.5" />
        </div>
      </div>
    </div>
  );
}

/**
 * Runde 18 (Martin: „wichtiger ist, oben die Vorteile zu sagen: es ist alles drin, bei uns angestellt und täglich
 * kündbar; der Preis kann weiter unten sein"). Vier Zeilen, ohne Kasten. Erster Punkt seit Runde 21 „Lohn, Steuern,
 * Gebühren: alles drin" (Martins Worte; OpenAI 05.10.: „alles" gilt so nur für diese drei Posten und stößt sich nicht
 * mit „Dazu kommen …" am Preis). Sommerzuschlag nur in der Saison in der Aufstellung (Martin 09.09.).
 */
export function AngebotVorteile({ onBestpreis }: { onBestpreis: () => void }) {
  // Runde 22 (Martin 05.10. mit dem Bild „Willkommen bei Erinnerungen": „das wirkt übersichtlich, ich will das mehr
  // apple-like"): je Vorteil ein Zeichen, ein kurzer Titel und ein erklärender Satz. Fakten: Vertrag § 3 (kündbar ohne
  // Kündigungsfrist, anteilige Abrechnung), Garantie-Wortlaut aus GARANTIE_PORTAL, „Keine Vermittlungsgebühr" wie auf
  // der Startseite. „Alles drin" gilt für die genannten Posten; was dazukommt, steht am Preis.
  const zeilen = [
    { Zeichen: BadgeEuro, titel: 'Alles drin', text: 'Lohn, Steuern und Gebühren sind im Preis. Keine Vermittlungsgebühr.' },
    { Zeichen: UserCheck, titel: 'Bei uns angestellt', text: 'Ihre Betreuungskraft ist sozialversichert. Wir organisieren Anreise, Wechsel und Vertretung.' },
    { Zeichen: CalendarCheck, titel: 'Täglich kündbar', text: 'Ohne Kündigungsfrist und taggenau abgerechnet.' },
  ];
  const kachel = 'flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-pm-coral-tint text-pm-coral';
  return (
    <ul className="mt-8 grid gap-6">
      {zeilen.map(({ Zeichen, titel, text }) => (
        <li key={titel} className="flex gap-4">
          <span className={kachel} aria-hidden="true"><Zeichen className="h-[22px] w-[22px]" strokeWidth={2} /></span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] text-pm-ink">{titel}</p>
            <p className="mt-0.5 text-[15.5px] leading-[1.45] text-pm-muted">{text}</p>
          </div>
        </li>
      ))}
      <li className="flex gap-4">
        <span className={kachel} aria-hidden="true"><ShieldCheck className="h-[22px] w-[22px]" strokeWidth={2} /></span>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] text-pm-ink">{GARANTIE_PORTAL.titel}</p>
          <p className="mt-0.5 text-[15.5px] leading-[1.45] text-pm-muted">
            {GARANTIE_PORTAL.zusage}{' '}
            <button
              type="button"
              onClick={onBestpreis}
              className="inline-flex min-h-[44px] -my-3 items-center font-medium text-pm-taupe-ink underline underline-offset-4 decoration-pm-taupe/40 hover:decoration-pm-taupe-ink"
            >
              Mehr Infos
            </button>
          </p>
        </div>
      </li>
    </ul>
  );
}

/**
 * Einleitung unter dem Titel (Runde 14, Wortlaut der Geschäftsführung): was das Angebot umfasst, was wir
 * organisieren und wann die Ansprechpartnerin erreichbar ist. Fließtext, kein Kasten; seit Runde 15
 * (Designdurchgang) 17 px mit Zeilenhöhe 1,55.
 */
export function KompaktEinleitung() {
  return (
    <p className="mt-4 text-[17px] leading-[1.55] text-pm-muted">
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
export function KompaktVertrauen({ sterne }: { sterne: SterneStand | null }) {
  return (
    <div className="mt-5 border-t border-pm-line pt-5">
      <div className="flex items-center gap-3">
        <img src="/badge-testsieger.webp" alt="" className="h-10 w-auto flex-none object-contain" />
        <div className="min-w-0 overflow-hidden">
          <ul className="-ml-4 flex flex-wrap text-[14px] leading-5">
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
        <BewertungsZeile stand={sterne} klein className="-my-2.5" />
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
  if (look === 'angebot') {
    // Runde 22 (Martin 05.10.: „Angebot, dann nur die Punkte, Preis, dann plötzlich die passenden Pflegekräfte … man
    // weiß nicht, was man nun machen soll"): zwischen Preis und Pflegekräften der Stand als Liste wie eine
    // Bestellübersicht. Schritt 1 ist erledigt (das Angebot steht darüber), Schritt 2 trägt den einen Knopf; sein Satz
    // ist Martins Achtung („damit sich Pflegekräfte bewerben können"). Texte der Schritte 3 und 4 wie
    // `SoGehtEsWeiter` (Registry #109). Offen: Schritte 1–2, darunter das Formular über die volle Kartenbreite.
    const schritte = [
      { titel: 'Angebot erstellt', text: 'Ihren Preis sehen Sie oben.' },
      { titel: 'Pflegesituation vervollständigen', text: 'Damit sich Pflegekräfte bei Ihnen bewerben können. Dauert etwa 2\u00a0Minuten, vieles ist schon ausgefüllt.' },
      { titel: 'Pflegekräfte einladen und Bewerbungen erhalten', text: 'Mit Foto, Erfahrung, Anreisedatum und Preis.' },
      { titel: 'Auswählen und starten', text: 'Ein Vertrag entsteht erst, wenn Sie eine Bewerbung annehmen. Anreise schon ab 3 Tagen möglich.' },
    ];
    const sichtbar = offen ? schritte.slice(0, 2) : schritte;
    return (
      <section aria-labelledby="weiter-titel">
        <h2 id="weiter-titel" className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] text-pm-ink">So geht es weiter</h2>
        <div ref={hinweis} id="patientendaten" className="mt-4 scroll-mt-16 rounded-card bg-white px-5 pb-6 pt-6 shadow-lift">
          <ol>
            {sichtbar.map((s, i) => {
              const fertig = i === 0;
              const jetzt = i === 1;
              const letzte = i === sichtbar.length - 1;
              return (
                <li key={s.titel} className={`relative flex gap-4 ${letzte ? '' : 'pb-6'}`} aria-current={jetzt ? 'step' : undefined}>
                  {/* Linie zum nächsten Schritt: erledigt grün, sonst die feine Linie. */}
                  {!letzte && (
                    <span aria-hidden="true" className={`absolute bottom-0 left-[13px] top-8 w-[2px] rounded-full ${fertig ? 'bg-pm-green' : 'bg-pm-line'}`} />
                  )}
                  <span
                    className={`relative flex h-7 w-7 flex-none items-center justify-center rounded-full text-[14px] font-semibold tabular-nums ${
                      fertig ? 'bg-pm-green text-white' : jetzt ? 'bg-pm-coral text-white' : 'border-2 border-pm-line bg-white text-pm-muted'
                    }`}
                  >
                    {fertig ? <Check className="h-4 w-4" strokeWidth={3} aria-label="erledigt" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1 pt-[3px]">
                    <p className={`text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] ${fertig ? 'text-pm-muted' : 'text-pm-ink'}`}>{s.titel}</p>
                    <p className="mt-1 text-[15px] leading-[1.45] text-pm-muted">{s.text}</p>
                    {jetzt && !offen && (
                      <Button breit onClick={onOeffnen} className="mt-4 !font-semibold">
                        Jetzt vervollständigen
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {offen && <div className="mt-5 border-t border-pm-line">{children}</div>}
        </div>
        <div id="pflegekraefte" style={{ scrollMarginTop: 72 }} className="mt-12">
          <h2 id="pflegekraefte-titel" className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] text-pm-ink">Ihre passenden Pflegekräfte</h2>
          <p className="mt-1.5 text-pretty text-[16px] leading-[1.45] text-pm-muted">Echte Profile, ausgewählt nach Ihren Angaben.</p>
        </div>
        <div className="mt-4">{liste}</div>
      </section>
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
  /** Runde 16/17: größere Fotos und Schrift ab 390 px — die Profile sollen wie Menschen wirken, nicht wie Zeilen. */
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
