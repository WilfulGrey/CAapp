"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCalculator, formatEuro } from "@/lib/calculator-context";
import { CircleCheck as CheckCircle2, Phone } from "lucide-react";
import Image from "next/image";
import { analytics, variantenSeite, websiteHerkunft } from "@/lib/analytics";
import { cookieConsent } from "@/lib/cookie-consent";
import { scrollToCalculator, isCalculatorAligned, OPEN_CALCULATOR_EVENT } from "@/lib/scroll-to-calculator";
import { useFormTracking } from "@/hooks/use-form-tracking";
import { deutschBalken, GANZ_SICHTBAR, kopfzeile, kraefteVorschauAktiv, kraftFakten, parseVorschau, PORTAL_ANZAHL, SCHRANKE, VERLAUF, WARTE, wuenscheAusAntworten, type VorschauKraft } from "@/lib/kraefte-vorschau";
import { zaehle } from "@/lib/zaehler";
import { meldeAnfrage } from "@/lib/oaiq";
import { telefonBereinigen, telefonFehler, telefonGueltig } from "@/lib/telefon";

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Matching Animation Component ────────────────────────────────────────────
// Läuft zwischen letzter Frage (Step 8) und Kontaktformular (Step 9). 3 Schritte
// mit Pflegekraft-Match-Zähler — baut Wertaufbau auf, bevor der Nutzer Name/
// E-Mail eingibt. Wurde im Mai 2026 versehentlich entfernt (Commit 281e4ef
// argumentierte mit „Friction nach Submit", aber die Animation lief VOR dem
// Submit) — hier 1:1 wiederbelebt.
// Zeichen rechts in jeder Antwort: Pfeil, bei der gewählten Antwort ein
// Haken. Farbregel (Martin 11.09.): Koralle nur für Knöpfe, Braun = „Ihre
// Auswahl“, Rot nur für Fehler. Die Klasse `ist-gewaehlt` setzt btnClass.
function AntwortZeichen() {
  return (
    <>
      <svg className="w-5 h-5 flex-shrink-0 text-[#A8977F] group-[.ist-gewaehlt]:hidden" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      <span className="hidden group-[.ist-gewaehlt]:inline-flex w-[22px] h-[22px] items-center justify-center rounded-full bg-[#8B7355] flex-shrink-0" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    </>
  );
}

function MatchingAnimation({ onComplete, initialCount, vorschau }: { onComplete: (finalCount: number) => void; initialCount: number; vorschau?: boolean }) {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [nurseCount, setNurseCount] = useState(initialCount);
  const [done, setDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Vorschau-Modus (Registry #61): drei Schritte aus WARTE („Preis
  // berechnet", Suche, „Verfügbarkeit geprüft"), dann automatisch weiter.
  // Sonst die drei Schritte des normalen Rechners.
  const ANIM_STEPS = vorschau
    ? [
        { label: WARTE.schritt1, sub: '', icon: '📋', duration: 3200 },
        { label: WARTE.schritt2Laeuft, sub: '', icon: '👩‍⚕️', duration: 4500 },
        { label: WARTE.schritt3, sub: '', icon: '✓', duration: 1800 },
      ]
    : [
        { label: 'Ihr persönliches Angebot wird erstellt', sub: 'Angebot & Pflegekräfte werden zusammengestellt', icon: '📋', duration: 3200 },
        { label: 'Passende Pflegekräfte werden gematcht', sub: '', icon: '👩‍⚕️', duration: 4500 },
        { label: 'Alles bereit', sub: 'Geben Sie Ihre Daten ein, um alles einzusehen', icon: '✓', duration: 1800 },
      ];

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = (i: number) => {
      if (i >= ANIM_STEPS.length) {
        setTimeout(() => { setDone(true); setTimeout(() => onCompleteRef.current(nurseCount), 900); }, 300);
        return;
      }
      setActiveStep(i);
      t = setTimeout(() => { setCompletedSteps(p => [...p, i]); run(i + 1); }, ANIM_STEPS[i].duration);
    };
    run(0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pflegekraft-Zähler läuft während Step 1 (Index 1) auf eine personalisierte
  // Endzahl (target=5) herunter — fühlt sich wie eine echte Filterung an.
  // 2026-07-08 (Martin): 3 → 5, passend zur gesperrten Ergebnis-Karte im
  // Kontakt-Schritt. Hinweis: Portal-Vorschau zeigt aktuell Top 3 — ggf.
  // dort nachziehen.
  useEffect(() => {
    if (activeStep !== 1) return;
    const iv = setInterval(() => {
      // Ziel 5 = die Zahl, die auch das Kundenportal zeigt (waehleFuenf).
      // Auch im Vorschau-Modus: dort stehen 3 der 5 vorab auf Schritt 9
      // (Martin, 10.09.: „im Kundenportal zeigen wir doch 5").
      const target = 5;
      setNurseCount(prev => {
        const next = prev - Math.ceil((prev - target) / 14);
        if (next <= target) { clearInterval(iv); return target; }
        return next;
      });
    }, 120);
    return () => clearInterval(iv);
  }, [activeStep]);

  return (
    <div className="bg-white rounded-2xl border-[1.5px] border-[#C0C0C0] overflow-hidden shadow-md">
      <div className="px-4 sm:px-8 py-5 border-b-2 border-[#E5E3DF]/50 bg-[#E76F63]">
        <p className="text-base font-bold uppercase tracking-wide text-white mb-1.5">{WARTE.titel}</p>
        <p className="text-sm text-white" style={{ opacity: 0.85 }}>{vorschau ? WARTE.text : 'Wir bereiten Ihr persönliches Angebot vor'}</p>
      </div>

      {/* KEIN Fortschrittsbalken hier (Martin 17.08.: "mach die
          Schrittebalken im Formular nicht auch noch fuer diesen
          Warte-Screen als Schritte — das ist ja nix, was der Kunde
          ausfuellt"). Der Balken gehoert zu den Fragen, die der Kunde
          beantwortet; hier arbeiten wir, er wartet nur. Die drei
          animierten Zeilen darunter zeigen den Fortschritt ohnehin. */}
      <div className="px-5 sm:px-8 pt-8 pb-6">
        <div className="space-y-6">
          {ANIM_STEPS.map((s, i) => {
            const isDone = completedSteps.includes(i);
            const isActive = activeStep === i && !isDone;
            const isPending = activeStep < i;
            // Zweite Zeile je Schritt — und ob es überhaupt eine gibt. Ohne
            // zweite Zeile sitzt der Text mittig zum Icon (Martin, 10.09.:
            // „Text nicht mittig zum Icon, wenn fertig"); ein leerer Absatz mit
            // Abstand hatte ihn nach oben geschoben.
            const subText: React.ReactNode = i === 1 && isActive
              ? <><span className="font-bold text-[#22A06B] tabular-nums">{nurseCount}</span> Pflegekräfte werden geprüft…</>
              : i === 1 && isDone && !vorschau
              ? <><span className="font-bold text-[#22A06B]">{nurseCount}</span> passende Pflegekräfte gefunden</>
              : vorschau && i === 2 && isDone
              ? WARTE.schritt3Fertig(nurseCount)
              : (isActive || isDone) && s.sub ? s.sub : null;
            return (
              <div key={i} className={`flex ${subText ? 'items-start' : 'items-center'} gap-4 transition-all duration-500 ${isPending ? 'opacity-25' : 'opacity-100'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${subText ? 'mt-0.5' : ''}
                  ${isDone ? 'bg-[#22A06B]' : isActive ? 'bg-white border-2 border-[#22A06B]' : 'bg-white border-2 border-[#E5E3DF]'}`}
                >
                  {isDone ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    <div className="w-4 h-4 border-2 border-[#22A06B] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#E5E3DF]" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-[15px] font-semibold leading-snug transition-colors duration-300 ${isDone ? 'text-[#3D3D3D]' : isActive ? 'text-[#3D3D3D]' : 'text-[#AFAFAF]'}`}>
                    {vorschau && i === 1 && isDone ? WARTE.schritt2Fertig(nurseCount) : s.label}
                    {isDone && <span className="ml-2 text-xs font-normal text-[#22A06B] whitespace-nowrap">✓ Fertig</span>}
                  </p>
                  {subText ? <p className="text-sm text-[#8B8B8B] mt-1">{subText}</p> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <div className="h-1.5 bg-[#E5E3DF] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#22A06B] rounded-full transition-all duration-1000 ease-out"
              style={{ width: done ? '100%' : activeStep === 0 ? '15%' : activeStep === 1 ? '55%' : '90%' }}
            />
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-6 lg:px-8 pt-4 pb-5 bg-white border-t border-[#E5E3DF]/50">
        <p className="text-xs text-[#8B8B8B] text-center">🔒 Ihre Daten werden verschlüsselt übertragen · DSGVO-konform</p>
      </div>
    </div>
  );
}

interface MultiStepFormProps {
  /**
   * 'inline' (Default): Der Wizard liegt direkt auf der Seite — bisheriges
   * Verhalten, weiter so auf Desktop.
   * 'cta': Es steht nur ein Button auf der Seite ("Betreuungskraft finden");
   * der Klick oeffnet den Wizard als Overlay und ueberspringt die
   * Warm-up-Frage (Martin 16.08., Muster von marta.de/Pflegehelden). Der
   * Buttonklick IST der kleine erste Schritt, den vorher die Warm-up-Frage
   * geliefert hat.
   */
  mode?: 'inline' | 'cta';
}

export function MultiStepForm({ mode = 'inline' }: MultiStepFormProps = {}) {
  const { state, updateState, calculate } = useCalculator();
  const [currentStep, setCurrentStep] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  // Matching-Animation zwischen Step 8 (letzte Frage) und Step 9 (Kontakt).
  // Wenn aktiv, blendet das Step-Rendering aus und zeigt nur die Animation.
  const [showMatching, setShowMatching] = useState(false);
  // Kräfte-Vorschau vor der Kontaktschranke (Registry #61, docs/kraefte-vorschau.md):
  // hinter `?kraefte=1`, bis Martin sie abgenommen hat. kraefteVorschau: null =
  // noch nicht geladen, [] = Function hatte nichts — dann bleibt der alte Kasten.
  // Der Schalter steht zusätzlich in einem Ref, damit die Tracking-Effekte ihn
  // lesen können, ohne dass er in ihren Dependency-Listen ein zweites step_view
  // auslöst.
  const [vorschauAktiv, setVorschauAktiv] = useState(false);
  const vorschauAktivRef = useRef(false);
  const [kraefteVorschau, setKraefteVorschau] = useState<VorschauKraft[] | null>(null);
  // Schritt 9 im Vorschau-Modus: die Kontaktfelder öffnen sich erst nach dem
  // Knopf „Preis & Profile freischalten" (Martin, 10.09.). Ref für Payload/Redirect.
  const [kontaktOffen, setKontaktOffen] = useState(false);
  const kontaktOffenRef = useRef(false);
  const kraefteVorschauRef = useRef<VorschauKraft[] | null>(null);
  const oeffneKontakt = () => {
    kontaktOffenRef.current = true;
    setKontaktOffen(true);
    analytics.trackEvent('wizard', 'kraefte_wahl', { aktion: 'button', kraft_id: null });
    zaehle('cta_geklickt', 'vorschau');
    setTimeout(() => {
      // Kontakt ist ein eigener Schritt (keine Karten mehr darüber): an den
      // Kartenanfang, damit Kopf und Siegel sichtbar bleiben (11.09.).
      document.querySelector('[data-calculator-card]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('kontakt-name')?.focus({ preventScroll: true });
    }, 60);
  };
  const vorschauModus = vorschauAktiv && !!kraefteVorschau && kraefteVorschau.length > 0;
  useEffect(() => {
    try {
      const an = kraefteVorschauAktiv(window.location.search, window.sessionStorage);
      vorschauAktivRef.current = an;
      setVorschauAktiv(an);
    } catch { /* sessionStorage gesperrt — Vorschau bleibt aus */ }
  }, []);
  const setzeVorschau = (liste: VorschauKraft[]) => { kraefteVorschauRef.current = liste; setKraefteVorschau(liste); };
  const ladeKraefteVorschau = () => {
    if (!vorschauAktivRef.current) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setzeVorschau([]); return; }
    fetch(`${url}/functions/v1/kraefte-vorschau`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(wuenscheAusAntworten(state)),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setzeVorschau(parseVorschau(j)))
      .catch(() => setzeVorschau([]));
  };
  // Field-level tracking for the contact step (step 10) — populates
  // analytics_form_interactions so the dashboard can show where in the
  // contact form users engage / drop off.
  const { trackFieldFocus, trackFieldBlur, trackFormSubmit } = useFormTracking('kontaktformular');

  /* Die Tagesformel darf NICHT beim Rendern laufen.

     Bis 23.08.2026 stand hier `useMemo(() => 71 + (new Date().getDate() % 8))`.
     useMemo laeuft WAEHREND des Renderns — auf dem Server wie im Browser. Die
     Startseite wird statisch vorgerendert, ihr HTML traegt also den Tag des
     letzten Deploys, waehrend der Browser mit heute rechnet. Ab dem Tag danach
     standen an derselben Stelle zwei verschiedene Zahlen.

     Die Folge war kein Schoenheitsfehler: React meldete #425 („Text content
     does not match server-rendered HTML"), daraus wurden #418 und #423 — und
     #423 heisst „the entire root will switch to client rendering". React warf
     bei JEDEM Aufruf die fertig gelieferte Seite weg und baute sie im Browser
     neu auf. Auf Prod in Safari UND Chrome nachgewiesen.

     Beim Drift weiter unten war die Falle bekannt („ERST NACH MOUNT"), bei der
     Basis darunter nicht. Also derselbe Weg: im Render ein fester Wert, den
     Server und Browser gleich berechnen, das echte Datum erst im Effekt. Der
     Nachzug faellt nicht auf.
     Seit 11.09.2026 (Strecke v2) ist die Zahl NUR noch der Startwert der
     Warte-Animation, die auf 5 herunterzaehlt. Der Zaehler im Formular, der
     mit Zufallsschwankung sprang (76 → 75 → 69 → 70 …), ist raus: eine Zahl,
     die nach eingrenzenden Antworten steigt, sah gefaelscht aus. */
  const TAGESBASIS_SSR = 75;   // Mitte von 71..78
  const [dailyBase, setDailyBase] = useState(TAGESBASIS_SSR);
  useEffect(() => {
    setDailyBase(71 + (new Date().getDate() % 8));
  }, []);

  function getMatchingCount(): number {
    let count = dailyBase;
    // Answer-specific reductions
    if (state.patientCount === 'ehepaar') count -= 9;
    if (state.householdOthers === 'ja') count -= 4;
    const grad = parseInt(state.pflegegrad || '0');
    count -= Math.max(0, grad - 1) * 2;
    // rollator & gehfähig: no extra drop. rollstuhl/bettlägerig: deutlich
    if (state.mobility === 'rollstuhl') count -= 9;
    if (state.mobility === 'bettlaegerig') count -= 14;
    if (state.nightCare === 'gelegentlich') count -= 2;
    if (state.nightCare === 'taeglich') count -= 8;
    if (state.nightCare === 'mehrmals') count -= 14;
    if (state.germanLevel === 'kommunikativ') count -= 2;
    if (state.germanLevel === 'sehr-gut') count -= 10;
    if (state.driving === 'ja') count -= 8;
    if (state.gender === 'maennlich') count -= 7;
    if (state.gender === 'weiblich') count -= 1;
    return Math.max(12, count);
  }

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    postalCode: '',
    // Soft-Consent (PR #107): die explizite Pflicht-Checkbox wurde entfernt,
    // Einwilligung ergibt sich aus dem Absenden + Hinweistext unter dem CTA.
    // Wert bleibt als `true` initialisiert, damit downstream Code (lead-record,
    // analytics) ohne Änderung weiterläuft.
    acceptPrivacy: true,
  });
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    phone: '',
    acceptPrivacy: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const totalSteps = 9; // 8 Fragen + Kontaktformular. care_start_timing wurde
                        // entfernt — das konkrete Startdatum wird jetzt im
                        // CA-App-Patientenformular abgefragt (PatientForm.startDate).
                        // Getriebe lebt auch im CA-app patient form, nicht hier.
  const stepStartRef = useRef<number>(Date.now());
  // Scroll target for step changes. page.tsx renders TWO MultiStepForm
  // instances (mobile + desktop layout), both with id="calculator-form" —
  // getElementById would return the first (often the hidden one) and scroll
  // nowhere. A per-instance ref always targets the visible form.
  const formRef = useRef<HTMLDivElement>(null);

  /* „Gesehen" heisst: der Schritt war wirklich auf dem Schirm.

     Bis 23.08.2026 feuerte step_view beim MOUNTEN der Komponente. Das war
     richtig, solange der Fragebogen inline auf der Seite stand (CRO 15.08.:
     „Wizard wirklich gesehen" messbar machen, auch wenn die Antwort-Buttons
     unter der Falz liegen). Seit dem 16.08. steckt er im CTA-Modus hinter
     einem Knopf — die Komponente mountet trotzdem bei JEDEM Seitenaufruf,
     auch wenn das Fenster nie aufgeht.

     Damit mass „Wizard gestartet" in Wahrheit „Seite geladen" (mal
     Cookie-Zustimmung), und der Trichter zeigte bei Schritt 1 einen Abbruch
     von 69,9 % — 156 gesehen, 47 abgeschlossen. Dieser Absprung existiert
     nicht: es sind die Leute, die den Wizard nie geoeffnet haben. Wer ihn
     oeffnet, geht 47 → 47 → 44 durch. An diesem Phantom laesst sich endlos
     optimieren, ohne dass sich etwas bewegt.

     Im CTA-Modus zaehlt deshalb erst das offene Fenster. Inline bleibt es
     beim Mounten — dort ist der Schritt ja tatsaechlich zu sehen. */
  const wizardSichtbar = mode !== 'cta' || fullscreen;

  useEffect(() => {
    if (!wizardSichtbar) return;
    analytics.trackEvent('wizard', 'step_view', {
      step: currentStep,
      step_name: getStepId(currentStep),
      kraefte_vorschau: vorschauAktivRef.current,
    });
    // Anonymer Zähler ohne Einwilligung (Registry #63): nur Schritt + Variante.
    if (currentStep >= 1 && currentStep <= 9) zaehle(`schritt_${currentStep}` as `schritt_${1|2|3|4|5|6|7|8|9}`, vorschauAktivRef.current ? 'vorschau' : 'alt');
    stepStartRef.current = Date.now();
  }, [currentStep, wizardSichtbar]);

  // CRO 15.08.: Das Cookie-Banner lädt die Seite nicht mehr neu. Der
  // step_view des aktuellen Steps ist vor der Einwilligung am Consent-Gate
  // abgeprallt — hier einmalig nachfeuern, sobald Analytics erlaubt wird,
  // sonst fehlen diese Sessions im Funnel (vorher erledigte das der Reload).
  const consentReplayedRef = useRef(false);
  useEffect(() => {
    const unsubscribe = cookieConsent.subscribe((consent) => {
      if (consent.analytics && !consentReplayedRef.current && wizardSichtbar) {
        consentReplayedRef.current = true;
        analytics.trackEvent('wizard', 'step_view', {
          step: currentStep,
          step_name: getStepId(currentStep),
          replayed_after_consent: true,
          kraefte_vorschau: vorschauAktivRef.current,
        });
      }
    });
    return unsubscribe;
    // currentStep bewusst als Dep: der Replay soll den Step melden, der beim
    // Klick auf „Akzeptieren" wirklich sichtbar ist.
  }, [currentStep, wizardSichtbar]);

  // CRO 15.08.: „Wizard wirklich gesehen" messbar machen. step_view feuert
  // beim Mounten — auch wenn die Antwort-Buttons unter der Falz liegen
  // (Funnel-Befund: 62 % beantworten die Warm-up-Frage nie, Clarity zeigt
  // exakt an dieser Stelle den Scroll-Cliff 92 %→42 %). wizard_visible
  // feuert erst, wenn das Formular zur Hälfte im Viewport war — einmal pro
  // Session (sessionStorage-Guard, weil Mobile- und Desktop-Layout je eine
  // Instanz rendern; die unsichtbare intersected nie).
  const wizardSeenRef = useRef(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = formRef.current;
    if (!el) return;
    const KEY = '_prim_wizard_visible';
    if (sessionStorage.getItem(KEY)) return;
    // Bug 16.08.: Vorher wurde beim ersten Sichtbarwerden sofort markiert und
    // der Observer beendet. Der Wizard steht seit dem Falz-Umbau aber schon
    // beim Laden im Bild — also BEVOR jemand eingewilligt hat. trackEvent
    // verwarf das Event still, die Markierung blieb: seit dem Deploy kam kein
    // einziges wizard_visible an. Jetzt merken wir uns nur, DASS er gesehen
    // wurde; gesendet wird, sobald die Einwilligung vorliegt.
    const sende = () => {
      if (!analytics.hasConsent() || sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
      analytics.trackEvent('wizard', 'wizard_visible', {});
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        wizardSeenRef.current = true;
        sende();
        if (sessionStorage.getItem(KEY)) observer.disconnect();
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    const unsubscribe = cookieConsent.subscribe(() => {
      if (wizardSeenRef.current) sende();
    });
    return () => { observer.disconnect(); unsubscribe(); };
  }, []);

  // Step-Reihenfolge: Step 1 ist die konkrete Sachfrage "Wie viele Personen
  // benötigen Pflege?", damit der Einstieg ohne planerisches Commitment
  // funktioniert. Die Timing-Frage (care_start_timing) wurde komplett aus dem
  // Funnel entfernt — das konkrete Startdatum holt jetzt das CA-App-
  // Patientenformular (PatientForm.startDate) ab. State-Feld + API-Payload
  // bleiben erhalten (Lead-Pipeline + Mamamia-Mapping unverändert), wird
  // jetzt aber durchgängig als null gesendet.
  function getStepId(step: number): string {
    switch (step) {
      case 1: return 'patient_count';
      case 2: return 'household_others';
      case 3: return 'pflegegrad';
      case 4: return 'mobility';
      case 5: return 'night_care';
      case 6: return 'german_level';
      case 7: return 'driving';
      case 8: return 'gender';
      case 9: return 'contact_form';
      default: return `step_${step}`;
    }
  }

  function getCurrentAnswer(step: number): string | null {
    switch (step) {
      case 1: return state.patientCount;
      case 2: return state.householdOthers;
      case 3: return state.pflegegrad;
      case 4: return state.mobility;
      case 5: return state.nightCare;
      case 6: return state.germanLevel;
      case 7: return state.driving;
      case 8: return state.gender;
      default: return null;
    }
  }

  // Pending Auto-Advance Timer (PR #108). selectAndAdvance schedules
  // handleNext nach 300ms; klickt der User vor Ablauf eine andere Option,
  // wird der alte Timer gecleart, der neue startet. handleBack räumt
  // einen pendierenden Advance auf, damit ein "Zurück"-Klick nie durch
  // einen verspäteten Vorwärts-Sprung überschrieben wird.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  // CRO 15.08., Martins Entscheid (zweistufig): (1) Beim Start des
  // Wizards — Antwort auf die Warm-up-Frage — wird EINMAL gescrollt,
  // sodass die gesamte Karte bis zum unteren Rand im Viewport steht.
  // (2) Danach bleibt die Karte fuer alle weiteren Fragen exakt an
  // dieser Stelle — bei Step-Wechseln wird grundsaetzlich NICHT mehr
  // gescrollt (die alten Spruenge stammten aus der Zeit, als das
  // Formular tief auf der Seite lag).
  // Die eine Ausrichtung beim Wizard-Start zielt auf DIESELBE zentrale
  // Marke wie alle CTA-Buttons (lib/scroll-to-calculator.ts). Wer ueber
  // einen CTA gekommen ist, steht damit schon richtig — isCalculatorAligned
  // verhindert den zweiten Scroll (Martin 15.08.: "springe gleich an die
  // richtige Stelle von allen CTA-Buttons"). 'auto' statt 'smooth': ein
  // nachlaufender weicher Scroll fuehlte sich wie ein zweiter Sprung an.
  const alignCardOnce = () => {
    if (isCalculatorAligned()) return;
    scrollToCalculator('auto');
  };

  const handleNext = async (overrideAnswer?: string | null) => {
    const timeOnStep = Math.round((Date.now() - stepStartRef.current) / 1000);
    // overrideAnswer wird bei Auto-Advance gesetzt (selectAndAdvance), weil
    // getCurrentAnswer in dem Render-Zyklus eine stale closure-Version von
    // state sieht (setState wurde gerade erst geschedulet). Beim Klick auf
    // den manuellen "Weiter"-Button bleibt overrideAnswer undefined und wir
    // fallen auf den getCurrentAnswer-Lookup zurück.
    //
    // Letzter Step (Kontaktformular): step_complete feuert NICHT hier,
    // sondern erst nach ERFOLGREICHEM Submit in handleSubmit — per Beacon
    // (Bug #33). Vorher feuerte es (a) auch bei fehlgeschlagener Validierung
    // und (b) ging in ~50 % der Fälle beim Portal-Redirect verloren.
    if (currentStep !== totalSteps) {
      analytics.trackEvent('wizard', 'step_complete', {
        step: currentStep,
        step_name: getStepId(currentStep),
        answer: overrideAnswer !== undefined ? overrideAnswer : getCurrentAnswer(currentStep),
        time_on_step_seconds: timeOnStep,
        kraefte_vorschau: vorschauAktivRef.current,
      });
    }

    if (currentStep < totalSteps) {
      // Letzte Frage (Step 8) → Kontaktformular (Step 9): vorher die Matching-
      // Animation einblenden. Step-Wechsel erst nach onComplete der Animation.
      if (currentStep === totalSteps - 1) {
        ladeKraefteVorschau();
        setShowMatching(true);
        return;
      }
      setCurrentStep(currentStep + 1);
    } else if (currentStep === totalSteps) {
      await handleSubmit();
    }
  };

  // Auto-Advance Helper für Single-Choice-Steps 1-9: aktualisiert den State
  // und triggert handleNext nach 300ms (kurze Pause, damit die Auswahl-
  // Animation gesehen wird). Der "Weiter"-Button wurde auf diesen Steps
  // entfernt — die Pause entlastet User, die ihre Wahl noch ändern wollen
  // (eine andere Option zu klicken startet den Timer neu).
  // Warm-up-Einstiegsfrage (Martin, 2026-07-08): bewusst trivial („Für wen
  // suchen Sie…?"), senkt die Hürde vor der ersten echten Frage (62 % Verlust
  // Anzeige→Frage 1). Antwort wird NICHT mitgesendet — reiner Commitment-Start.
  const [warmupAudience, setWarmupAudience] = useState<string | null>(null);

  const selectAndAdvance = (answerValue: string, update: () => void) => {
    update();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      handleNext(answerValue);
    }, 300);
  };

  const handleBack = () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (currentStep > 1) {
      analytics.trackEvent('wizard', 'step_back', {
        from_step: currentStep,
        from_step_name: getStepId(currentStep),
      });
      if (showResults) {
        setShowResults(false);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return Boolean(state.patientCount);
      case 2: return Boolean(state.householdOthers);
      case 3: return Boolean(state.pflegegrad !== null);
      case 4: return Boolean(state.mobility);
      case 5: return Boolean(state.nightCare);
      case 6: return Boolean(state.germanLevel);
      case 7: return Boolean(state.driving);
      case 8: return Boolean(state.gender);
      // Step 9 Kontaktformular: Name + E-Mail + Telefon alle drei Pflicht.
      // Knopf erst aktiv, wenn E-Mail und Telefon plausibel sind (Martin
      // 11.09.: „Buchstaben eingeben und der Button ist sofort aktiv") —
      // dieselbe Prüfung wie validateForm(), Hinweise erscheinen beim Verlassen
      // des Feldes.
      case 9: return Boolean(formData.name.trim() && EMAIL_MUSTER.test(formData.email.trim()) && telefonGueltig(formData.phone));
      default: return false;
    }
  };

  const validateForm = () => {
    const newErrors = {
      name: '',
      email: '',
      phone: '',
      acceptPrivacy: '',
    };

    // Name + E-Mail + Telefon wieder alle drei Pflicht (Rückrollung der
    // Änderung vom 06.06.2026). Begründung 14.06.2026: Tel-Quote ist seit
    // 06.06. von 67 % auf 34 % gefallen, ohne Conversion-Vorteil — der
    // Lead-Wert leidet, weil das Sales-Team ohne Telefonnummer nicht
    // nachhaken kann. Daten ohne Telefon können nicht zu Mamamia weiter,
    // d.h. Pflegekräfte sehen den Lead nicht.
    if (!formData.name.trim()) {
      newErrors.name = 'Bitte geben Sie Ihren Namen ein';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Bitte geben Sie Ihre E-Mail-Adresse ein';
    } else if (!EMAIL_MUSTER.test(formData.email.trim())) {
      newErrors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein';
    }
    // Telefon: 8–15 Ziffern, nur Ziffern/+/Trennzeichen (lib/telefon.ts,
    // Maßstab 284 echte Anfragen). Der Server prüft weiter mild (≥6), damit
    // Pria- und Portal-Wege nicht an der strengeren Regel scheitern.
    newErrors.phone = telefonFehler(formData.phone ?? '');

    // Datenschutz-Einwilligung wurde durch Soft-Consent ersetzt (Hinweistext
    // unter dem CTA, das Absenden gilt als Zustimmung) — kein explizites
    // Checkbox-Validation mehr nötig.

    setErrors(newErrors);
    return !newErrors.name && !newErrors.email && !newErrors.phone;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Erstelle formularDaten für die Berechnung
      const formularDaten = {
        betreuung_fuer: state.patientCount || '',
        pflegegrad: parseInt(state.pflegegrad || '0'),
        weitere_personen: state.householdOthers || '',
        mobilitaet: state.mobility || '',
        nachteinsaetze: state.nightCare || '',
        deutschkenntnisse: state.germanLevel || '',
        fuehrerschein: state.driving || '',
        // Getriebe (gearbox) lives on the CA-app patient form, not here —
        // user picks Automatik / Schaltung / Egal in the in-portal step 3
        // (Wünsche zur PK), and patientFormMapper writes it to
        // customer_caregiver_wish.driving_license_gearbox via UpdateCustomer.
        // Onboard sets a permissive 'automatic' default so Mamamia matching
        // works before the patient form is saved.
        geschlecht: state.gender || '',
      };

      // Berechne Kalkulation server-seitig (damit die echten Preise aus der DB verwendet werden)
      const kalkulationResponse = await fetch('/api/kalkulation-berechnen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formularDaten,
        }),
      });

      if (!kalkulationResponse.ok) {
        throw new Error('Fehler bei der Kalkulation');
      }

      const kalkulation = await kalkulationResponse.json();

      // Sende an angebot-anfordern API (erstellt Lead + versendet Angebots-E-Mails)
      // adParams: Google-Klick-IDs (gclid/wbraid/gbraid) aus der Landing-URL
      // dieser Session — die Route sanitisiert und hängt sie an den Lead,
      // damit qualifizierte Leads später als Offline-Conversions zu Google
      // importiert werden können (docs/google-ads-tracking.md).
      const response = await fetch('/api/angebot-anfordern', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vorname: formData.name,
          email: formData.email,
          telefon: formData.phone,
          careStartTiming: state.careStartTiming,
          adParams: analytics.getAdParams(),
          // Von welcher Seite kam die Anfrage (Martin, 27.08.). Die
          // Varianten-Weiche liefert alle drei unter „/" aus, deshalb zählt
          // die Variante aus dem Cookie — nicht der Pfad (analytics.ts).
          quelle: (() => {
            // Von primundus.de gekommen? Dann zählt die Website als Quelle
            // (Martin, 04.09.: Betreff „Primundus.de", Unterseite in der Mail).
            const web = websiteHerkunft();
            if (web) return `website:${web.src}`;
            const seite = variantenSeite();
            return seite === '/' ? 'rechner' : `rechner:${seite.replace(/^\//, '')}`;
          })(),
          websitePfad: websiteHerkunft()?.pfad ?? null,
          kalkulation: {
            ...kalkulation,
            formularDaten,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Senden');
      }

      const data = await response.json();

      if (data.success && data.leadId) {
        trackFormSubmit();
        zaehle('abgeschickt', vorschauAktivRef.current ? 'vorschau' : 'alt');
        // step_complete(contact_form) + Conversion in EINEM Beacon — überlebt
        // den Redirect garantiert (Bug #33). Ersetzt die früheren racy
        // supabase-js-Inserts (analytics.trackConversion + step_complete aus
        // handleNext), von denen ~die Hälfte beim window.location.assign starb.
        analytics.trackCriticalSubmit({
          step: totalSteps,
          stepName: getStepId(totalSteps),
          timeOnStepSeconds: Math.round((Date.now() - stepStartRef.current) / 1000),
          extra: {
            kraefte_vorschau: vorschauAktivRef.current,
            kraefte_aktion: kontaktOffenRef.current ? 'button' : null,
          },
          conversion: {
            leadId: data.leadId,
            conversionType: 'angebot_angefordert',
            conversionValue: kalkulation.bruttopreis,
            formData: {
              pflegegrad: state.pflegegrad,
              care_start_timing: state.careStartTiming,
              patient_count: state.patientCount,
            },
          },
        });
        // Direct redirect into the CA app — no thank-you interstitial, no
        // countdown, no MatchingAnimation. User already filled name/email/
        // phone on step 10 and clicked submit. Anything between submit and
        // CA app is friction.
        if (typeof data.portalUrl === 'string' && data.portalUrl.length > 0) {
          // GTM-Tags (Google-Ads-Conversion auf `angebot_erfolgreich`, siehe
          // docs/google-ads-tracking.md) brauchen einen Moment zum Feuern,
          // bevor die Navigation alle offenen Requests killt: eventCallback
          // meldet „alle Tags fertig", eventTimeout/setTimeout sichern den
          // Redirect ab, falls GTM geblockt ist (Adblocker) oder hängt.
          // Kostet im Normalfall ~100-300 ms, im Worst Case 900 ms.
          let redirected = false;
          const goToPortal = () => {
            if (redirected) return;
            redirected = true;
            window.location.assign(data.portalUrl);
          };
          // OpenAI Ads (ChatGPT-Werbung): lead_created an den Pixel. Bis zum
          // 10.09. stand dieser Aufruf nur auf der alten /result-Seite, die der
          // Wizard seit dem Direkt-Redirect nie erreicht — der Pixel hatte in
          // einer Woche Kampagne kein einziges Ereignis gesehen. Ohne
          // Marketing-Einwilligung existiert window.oaiq nicht, dann passiert
          // nichts. Das SDK sendet mit keepalive/sendBeacon, der Redirect
          // gleich darunter reisst den Request nicht ab.
          meldeAnfrage(window.oaiq, data.leadId);
          (window as any).dataLayer = (window as any).dataLayer || [];
          (window as any).dataLayer.push({
            event: 'angebot_erfolgreich',
            lead_id: data.leadId,
            pflegegrad: state.pflegegrad,
            care_start_timing: state.careStartTiming,
            conversion_value: kalkulation.bruttopreis,
            // Enhanced Conversions (Martin 25.08.): GTM-Variable „Nutzerdaten"
            // normalisiert + SHA256-hasht die E-Mail, bevor sie an Google geht —
            // Klartext verlässt den Browser nicht (docs/google-ads-tracking.md).
            user_email: formData.email,
            eventCallback: goToPortal,
            eventTimeout: 700,
          });
          setTimeout(goToPortal, 900);
          return;
        }
        // No portalUrl from server is a deploy/config bug — surface it so
        // the issue is visible instead of hidden behind a fallback UI.
        throw new Error('Portal-URL fehlt in Server-Antwort. Bitte Support kontaktieren.');
      } else {
        throw new Error('Fehler beim Anfordern des Angebots');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepTitle = () => {
    if (showResults) return "Ihr persönliches Angebot";
    if (currentStep === 1 && !warmupAudience) return "Für wen suchen Sie Betreuung?";
    switch (currentStep) {
      case 1: return "Wie viele Personen benötigen Pflege?";
      case 2: return "Weitere Personen im Haushalt?";
      case 3: return "Vorhandener Pflegegrad?";
      case 4: return "Mobilität der zu betreuenden Person";
      case 5: return "Ist nachts Hilfe nötig?";
      case 6: return "Deutschkenntnisse der Pflegekraft";
      case 7: return "Führerschein gewünscht?";
      case 8: return "Geschlecht der Pflegekraft";
      case 9: return ""; // V5 (Martin, 2026-07-08): gesperrte Ergebnis-Karte ersetzt Titel + Erklärtext
      default: return "";
    }
  };

  const getStepSubtext = () => {
    // Erklär-Unterzeilen entfernt (Martin): nur Frage + Antworten, kompakter Look.
    return "";
  };

  if (showResults) {
    const result = calculate();

    return (
      <div id="calculator-form" className="pt-2 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-0 max-w-[560px] mx-auto px-4">
        <div className="bg-gradient-to-br from-[#E8B4A8]/20 via-white to-white rounded-2xl shadow-xl border-2 border-[#E5E3DF] overflow-hidden">
          <div className="px-4 md:px-6 py-3.5 border-b-2 border-[#E5E3DF] text-center bg-gradient-to-br from-[#E8B4A8]/30 to-transparent">
            <CheckCircle2 className="w-12 h-12 text-[#8B7355] mx-auto mb-2" />
            <h2 className="text-lg md:text-xl font-bold text-[#3D3D3D] mb-1">
              Vielen Dank, {formData.name}!
            </h2>
            <p className="text-xs text-[#8B8B8B]">Ihr Angebot & passende Pflegekräfte sind bereit</p>
          </div>

          <div className="px-4 md:px-6 py-5">
            <div className="bg-gradient-to-br from-[#8B7355] to-[#A68968] text-white rounded-xl p-5 mb-4">
              <p className="text-xs opacity-90 mb-1">Ihre monatlichen Kosten</p>
              <p className="text-3xl font-bold">{formatEuro(result.totalGross)}</p>
              <p className="text-xs opacity-75 mt-1">pro Monat (brutto)</p>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center py-2 border-b border-[#E5E3DF]">
                <span className="text-sm text-[#8B8B8B]">Betreuungskosten</span>
                <span className="text-sm font-semibold text-[#3D3D3D]">{formatEuro(result.totalGross)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#E5E3DF]">
                <span className="text-sm text-[#8B8B8B]">Pflegegeld</span>
                <span className="text-sm font-semibold text-green-600">- {formatEuro(result.pflegegeld)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#E5E3DF]">
                <span className="text-sm text-[#8B8B8B]">Steuerersparnis</span>
                <span className="text-sm font-semibold text-green-600">- {formatEuro(result.taxBenefit)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-semibold text-[#3D3D3D]">Ihr Eigenanteil</span>
                <span className="text-lg font-bold text-[#8B7355]">{formatEuro(result.eigenanteil)}</span>
              </div>
            </div>

            <div className="bg-[#F8F7F5] rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-[#8B7355] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[#3D3D3D]">
                  <strong>E-Mail gesendet:</strong> Ihr Angebot & passende Pflegekräfte wurden an <strong>{formData.email}</strong> gesendet
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#8B7355] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[#3D3D3D]">
                  <strong>Nächste Schritte:</strong> Unser Team meldet sich innerhalb von 24h bei Ihnen
                </p>
              </div>
            </div>

            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-[#E76F63] hover:bg-[#D65E52] text-white font-semibold py-2.5 rounded-lg transition-all duration-200 text-sm"
            >
              Neue Berechnung starten
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Antwort-Buttons bewusst als BUTTONS erkennbar (Martin 13.08.: „gehen
  // noch ein bisschen unter" — Funnel: 59 % klicken die erste Frage nie an):
  // kräftigerer Rand, echter Schatten, mehr Höhe.
  // Farben (Martin 11.09.): kein Koralle-Rahmen mehr beim Darüberfahren — er
  // sah aus wie ein Fehler und blieb auf dem Handy nach dem Tippen an der
  // nächsten Antwort hängen. Darüberfahren nur noch bei echter Maus
  // (hover:hover), gewählt = Braun mit Haken (AntwortZeichen).
  const btnClass = (isSelected: boolean) =>
    `group w-full relative rounded-xl px-4 py-3.5 border-[1.5px] shadow-[0_2px_6px_rgba(61,61,61,0.10)] transition-all duration-200 text-left ${
      isSelected
        ? 'ist-gewaehlt border-[#8B7355] bg-[#8B7355]/5 ring-1 ring-[#8B7355]/20'
        : 'border-[#CFC6B8] bg-white [@media(hover:hover)]:hover:border-[#A8977F] [@media(hover:hover)]:hover:bg-[#FAF8F4]'
    }`;

  // Fokus-Modus nach der ersten Frage: der Rest wird abgedunkelt, das
  // Formular bleibt exakt an seiner Stelle (kein Sprung) und liegt vorne.
  // pt-2 statt pt-6 mobil (CRO 15.08.): der Platz ueber der Karte finanziert
  // die groesseren USP-Zeilen im Hero, ohne die Antwort-Buttons unter das
  // Cookie-Banner zu druecken. Desktop unveraendert (lg:pt-4).
  // CTAs ueber die ganze Seite oeffnen den Wizard direkt (Martin 17.08.).
  // Sie liegen in Komponenten, die den Wizard sonst nicht kennen — deshalb
  // ein Fenster-Event statt Context/Prop-Kette (lib/scroll-to-calculator.ts).
  // Der Hero rendert MultiStepForm genau EINMAL, also gibt es auch nur einen
  // Zuhoerer; `source` unterscheidet im Event, welcher Button es war.
  useEffect(() => {
    const oeffnen = (e: Event) => {
      const source = (e as CustomEvent<{ source?: string }>).detail?.source ?? 'cta';
      analytics.trackEvent('wizard', 'wizard_opened', { source });
      setWarmupAudience('direct');
      setCurrentStep(1);
      setFullscreen(true);
    };
    window.addEventListener(OPEN_CALCULATOR_EVENT, oeffnen);
    return () => window.removeEventListener(OPEN_CALCULATOR_EVENT, oeffnen);
  }, []);

  // Direkt-Start aus einem EXTERNEN CTA (Martin, 18.08.): Wer auf
  // primundus.de „Kosten berechnen" klickt, hat seine Absicht schon erklärt —
  // ihn hier noch einmal auf einen Button tippen zu lassen, ist derselbe
  // doppelte Schritt, den wir am 17.08. INNERHALB des Rechners abgeschafft
  // haben (#457). `?start=1` öffnet den Fragebogen deshalb sofort.
  //
  // `src` (z. B. `?start=1&src=apex-startseite`) landet im wizard_opened-
  // Event — damit ist getrennt messbar, was der Website-Traffic tut und was
  // der Direkteinstieg. Ohne diese Trennung würden sich die beiden
  // CTA-Änderungen in derselben Kennzahl vermischen.
  //
  // Bewusst NUR beim ersten Mount und nur in der CTA-Variante: Der Nutzer
  // soll das Overlay schließen können, ohne dass es beim nächsten Render
  // wieder aufspringt.
  const startVerarbeitet = useRef(false);
  useEffect(() => {
    if (mode !== 'cta' || startVerarbeitet.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('start') !== '1') return;
    startVerarbeitet.current = true;
    analytics.trackEvent('wizard', 'wizard_opened', {
      source: params.get('src') || 'extern',
    });
    setWarmupAudience('direct');
    setCurrentStep(1);
    setFullscreen(true);
  }, [mode]);

  // Solange das Overlay offen ist, darf die Seite dahinter nicht mitscrollen —
  // sonst scrollt der Wisch im Wizard die Landingpage weg.
  useEffect(() => {
    if (!fullscreen) return;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = vorher; };
  }, [fullscreen]);

  // Offen = ECHTES Overlay (fixed), nicht mehr `relative` im Textfluss
  // (Martin 16.08.: "warum oeffnet sich das so weit unten und nicht wie bei
  // allen CTA oben schoen, damit es auch nicht mehr springt").
  // Vorher stand die Karte an ihrer Stelle im Dokument — beim CTA-Hero also
  // weit unten hinter dem Text, und die Seite musste erst dorthin scrollen.
  // Jetzt sitzt sie unabhaengig vom Scrollstand oben im Bild, mit eigenem
  // Scrollbereich (max-h/overflow) fuer die laengeren Fragen. Damit ist
  // ueberhaupt kein Scrollen mehr noetig, weder beim Oeffnen noch beim
  // Fragenwechsel — das war der letzte verbliebene Sprung.
  const outerClass = fullscreen
    // Breite bewusst GEDECKELT: die alten `sm:max-w-[95%] xl:max-w-[1800px]`
    // stammten aus der Zeit, als der Fragebogen auf dem Desktop inline in
    // einer schmalen Spalte stand und Vollbild ihn aufziehen sollte. Seit
    // der Hero ueberall den CTA nutzt, ist das ein Modal — bei 1280px wurde
    // es sonst 1248px breit (gemessen 16.08.).
    ? "fixed inset-x-0 top-0 z-[90] mx-auto max-h-[100dvh] w-full max-w-md overflow-y-auto overscroll-contain px-3 pt-3 pb-6 sm:max-w-[520px] sm:px-4"
    : "pt-1 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-4 max-w-md sm:max-w-[95%] xl:max-w-[1800px] 2xl:max-w-[2000px] mx-auto px-0 sm:px-4";

  // Wenn die Matching-Animation läuft: nur diese rendern (eigenes Layout
  // mit Header/Progress) und nach onComplete auf Step 9 (Kontaktformular)
  // weiterleiten. Die Animation übernimmt die Card-Optik, daher kein Outer-
  // Wrapper mit Trust-Badge nötig.
  if (showMatching) {
    return (
      <>
      {fullscreen && <div className="fixed inset-0 bg-black/60 z-[80]" aria-hidden="true" />}
      <div ref={formRef} id="calculator-form" className={outerClass}>
        <MatchingAnimation
          initialCount={getMatchingCount()}
          // Warte-Screen immer mit den drei Schritten aus WARTE („Preis
          // berechnet“ …) — auch ohne Karten-Seite (Martin 11.09.: Warten bleibt).
          vorschau
          onComplete={() => {
            setShowMatching(false);
            setCurrentStep(totalSteps); // = Step 9 (Kontaktformular)
          }}
        />
      </div>
      </>
    );
  }

  // CTA-Modus: statt des Fragebogens steht nur der Button auf der Seite.
  // Erst sein Klick oeffnet das Overlay — und zwar direkt bei Frage 1, die
  // Warm-up-Frage wird uebersprungen (warmupAudience wird gesetzt, ohne dass
  // der Nutzer sie beantwortet; der Wert ging ohnehin nie irgendwohin).
  // Messung: 'wizard_opened' ersetzt 'warmup_answered' als Einstiegs-Event;
  // vergleichbar bleibt ueber beide Varianten step_complete(1).
  if (mode === 'cta' && !fullscreen) {
    return (
      <div ref={formRef} id="calculator-form" className="scroll-mt-24 lg:scroll-mt-32">
        <button
          type="button"
          onClick={() => {
            analytics.trackEvent('wizard', 'wizard_opened', { source: 'hero_cta' });
            setWarmupAudience('direct');
            setFullscreen(true);
          }}
          className="w-full rounded-xl bg-[#E76F63] px-4 py-[18px] text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)] transition-all duration-200 hover:bg-[#D65E52]"
        >
          Preis &amp; Pflegekräfte ansehen →
        </button>
        {/* Zaehler zentriert unter dem Button (Martin 16.08.) — er gehoert
            zum Button, nicht zur linksbuendigen Textspalte darueber. */}
        {/* Die Plakette ist klickbar und fuehrt dorthin, wohin der Knopf
            darueber ohnehin fuehrt. Grund (Clarity, 29.08.): Sie war reiner
            Text — und wurde trotzdem angetippt, 17 Sitzungen in drei Tagen
            endeten mit einem toten Klick. Kein Wunder: Der Knopf verspricht
            „Pflegekraefte ansehen", die Gesichter zeigen sie, also zielt der
            Finger auf die Gesichter. Im Formular steht dieselbe Plakette
            oben weiter — ab Schritt 2 als „X Pflegekraefte passen zu Ihrer
            Suche". Der Klick fuehrt also nicht weg vom Versprechen, sondern
            mitten hinein. Eigene Kennung `hero_badge`, damit wir sehen,
            wie viele diesen Weg nehmen statt den Knopf. */}
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              analytics.trackEvent('wizard', 'wizard_opened', { source: 'hero_badge' });
              setWarmupAudience('direct');
              setFullscreen(true);
            }}
            aria-label="Passende Pflegekräfte sofort verfügbar — jetzt ansehen"
            className="inline-flex items-center gap-2 rounded-full border border-[#A8D5B0] bg-[#F0F7F1] py-1 pl-1.5 pr-3 transition-all duration-200 hover:border-[#7FBF8C] hover:bg-[#E7F3E9] active:scale-[0.98] cursor-pointer">
            <div className="flex">
              {['/images/caregivers/pk-1.jpg','/images/caregivers/pk-2.jpg','/images/caregivers/pk-3.jpg','/images/caregivers/pk-4.jpg'].map((src,i)=>(
                <span key={src} className={`relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full border-2 border-white ${i>0?'-ml-2':''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                </span>
              ))}
            </div>
            <span className="text-[12px] text-[#3A6B42]">
              Passende Pflegekräfte sofort verfügbar
            </span>
            {/* Der Pfeil sagt, dass hier etwas passiert — sonst sieht die
                Plakette aus wie ein Etikett und der Klick bleibt Zufall. */}
            <span aria-hidden="true" className="text-[#3A6B42] text-[13px] leading-none">→</span>
          </button>
        </div>
        {/* Die drei Punkte, die kein Wettbewerber so setzen kann (Martin
            16.08.). "Keine Vermittlungsgebuehr" stand seit dem 16.08. in
            JEDER Google-Anzeige, aber nirgends auf der Seite — der Klick
            fuehrte auf ein Versprechen, das hier nicht wieder auftauchte.
            Belege: marta 99-999 EUR Aufnahmegebuehr, Hausengel 220 EUR/Mo
            Vermittlung, Dt. Seniorenbetreuung 280 EUR Pauschale; taeglich
            kuendbar ist bei uns vertraglich hinterlegt (vertrag-content.ts
            §3.3). Alle drei gehoeren zur selben Kategorie: nichts, worin man
            haengenbleibt — die Startzeit ist bewusst NICHT dabei, sie ist
            eine andere Aussage und steht weiter unten (Martin 16.08.).
            "Kostenlos & unverbindlich" ist entfallen, das sagt jetzt die
            Hero-Unterzeile. */}
        {/* Schriftgroesse: NIE kleiner als die Hero-Unterzeile ueber dem
            Button (16px, app/page.tsx) — Martin 16.08. Diese drei Zeilen
            sind der Message-Match zu den Anzeigen, nicht Kleingedrucktes. */}
        {/* Einrueckung erst ab lg: auf 375px schob sie "Taeglich kuendbar,
            taggenau abgerechnet" in eine zweite Zeile. */}
        <ul className="mt-5 flex flex-col gap-3 lg:pl-1.5">
          {[
            'Keine Vermittlungsgebühr',
            'Kein Vertrag vor Ihrer Auswahl',
            'Täglich kündbar, taggenau abgerechnet',
          ].map((punkt) => (
            <li key={punkt} className="flex items-center gap-2.5">
              <svg className="h-[18px] w-[18px] flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[16px] leading-snug text-[#3D3D3D]">{punkt}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
    {fullscreen && <div className="fixed inset-0 bg-black/60 z-[80]" aria-hidden="true" onClick={() => { setFullscreen(false); if (mode !== 'cta') setWarmupAudience(null); setCurrentStep(1); }} />}
    <div ref={formRef} id="calculator-form" className={outerClass}>
      <div className="relative">
      <div data-calculator-card className="bg-white rounded-2xl border-[1.5px] border-[#C0C0C0] overflow-hidden shadow-md">
        <div className={`relative px-4 sm:px-8 py-3 border-b-2 border-[#E5E3DF]/50 ${currentStep === totalSteps ? 'bg-[#22A06B]' : 'bg-[#E76F63]'}`}>
          {fullscreen && currentStep !== totalSteps && (
            <button
              type="button"
              onClick={() => { setFullscreen(false); if (mode !== 'cta') setWarmupAudience(null); setCurrentStep(1); }}
              aria-label="Schließen"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-white hover:bg-white/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {currentStep === totalSteps ? (
            // Step 9 — der Inhalt des Headers ändert sich auf einen klaren
            // CTA-Ton („jetzt ansehen →"), damit der Kunde sofort versteht,
            // dass das Angebot bereitsteht und nur noch der Klick fehlt.
            <>
              {/* Letzter Schritt: die Erfolgs-Botschaft wandert zentral in den
                  Header (Martin, 2026-07-08) — die grüne Pille darunter entfällt. */}
              {/* Vorschau-Modus (Registry #61, Runde 3): dieselbe Zahl wie am
                  Ende der Animation, und kein „Angebot ist fertig", solange der
                  Kunde noch keinen Preis sieht. */}
              {vorschauModus && !kontaktOffen ? (
                <>
                  <p className="text-center text-base font-bold uppercase tracking-wide text-white mb-1.5">{kopfzeile().titel}</p>
                  <p className="text-center text-sm text-white/90">{kopfzeile().text}</p>
                </>
              ) : (
                // Kontakt-Schritt: Haken-Symbol + Titel, darunter die Auszeichnung,
                // Siegel rechts (Martins Aufbau 11.09.). Gegen 390×664 in beiden
                // Wegen geprüft: Knopf bleibt über der Falz.
                <div className="flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="flex items-center gap-2 text-base font-bold uppercase tracking-wide text-white leading-tight">
                      <span className="inline-flex w-[22px] h-[22px] items-center justify-center rounded-full bg-white flex-shrink-0" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F8F5F" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      </span>
                      {SCHRANKE.kopf}
                    </p>
                    <p className="text-[14px] font-medium text-white/95 leading-snug mt-1 pl-[30px]">{SCHRANKE.auszeichnung}</p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT Service-Champions" className="h-[66px] w-auto rounded-[5px] shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex-shrink-0" />
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-[15px] font-bold text-white">
              In 2 Minuten zu Ihrem Preis
            </p>
          )}
        </div>

        {/* Balken ab der ersten echten Frage (Martin 11.09.: Schritt 1 ohne
            Balken wirkte eng und anders als der Rest) — im eingebetteten
            Hero-Kasten (nicht fullscreen) bleibt Schritt 1 ohne, damit die
            Antworten über der Falz bleiben. */}
        {(currentStep > 1 || (fullscreen && currentStep === 1)) && (
          <div className="px-3 sm:px-4 py-2 bg-[#F8F7F5]/50 border-b border-[#E5E3DF]/30">
            <div className="h-1.5 bg-[#E5E3DF] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#708A95] rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {currentStep >= 1 && currentStep <= 8 && (
          <div className="flex justify-center pt-2 pb-0">
            <div className="inline-flex items-center gap-2 bg-[#F0F7F1] border border-[#A8D5B0] rounded-full pl-1.5 pr-3 py-1">
              {/* Eine Pille auf allen Fragen (Martin 11.09.: Schritt 1 mit
                  Bildern, Schritt 2 ohne — wirkte wie zwei Hinweise). */}
              <div className="flex">
                {[
                  '/images/caregivers/pk-1.jpg',
                  '/images/caregivers/pk-2.jpg',
                  '/images/caregivers/pk-3.jpg',
                  '/images/caregivers/pk-4.jpg',
                ].map((src, i) => (
                  <span key={src} className={`relative w-6 h-6 rounded-full overflow-hidden border-2 border-white flex-shrink-0 ${i > 0 ? '-ml-2' : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  </span>
                ))}
              </div>
              <span className="text-[12px] text-[#3A6B42]">Passende Pflegekräfte sofort verfügbar</span>
            </div>
          </div>
        )}

        {/* Step 9 zeigt die Headline „✅ Ihr Angebot ist fertig" jetzt direkt
            im Titel-Block (getStepTitle); separate Pill ist redundant. */}

        <div id="calc-step-content" className={`px-3 sm:px-6 lg:px-8 pt-3 ${fullscreen && currentStep === 1 ? 'pb-8' : 'pb-5'}`}>
          <div className="w-full">
            {/* Step 9: kleine grüne „fertig"-Pill über dem Titel, dann die
                Frage als reguläre Step-Headline + Erklärung als italic
                Subline (gleiches Muster wie die anderen Steps). */}
            {getStepTitle() && (
              <h3 className="text-[20px] font-bold text-[#3D3D3D] mb-3 leading-snug min-h-[2.75rem] flex items-center justify-center text-center">
                {getStepTitle()}
              </h3>
            )}
            {getStepSubtext() && (
              <p className="text-[13px] text-[#8B8B8B] mb-4 italic leading-relaxed">{getStepSubtext()}</p>
            )}

            <div className="space-y-3">
              {/* Step 1 (was 2) — Patientenzahl ist jetzt die Einstiegsfrage.
                  Timing-Frage (alter Step 9) wurde komplett entfernt — das
                  konkrete Startdatum wird jetzt im CA-App-Patientenformular
                  abgefragt (PatientForm.startDate). */}
              {/* Warm-up (nicht mitgesendet): trivialer Einstieg vor der ersten
                  echten Frage — Antwort setzt nur warmupAudience. */}
              {/* CRO 15.08. (Martin): nur noch ZWEI Antworten ("die beiden
                  reichen ja") — der dritte Button lag beim Erstbesuch
                  hinterm Cookie-Banner. Werte 'angehoerige'/'selbst' sind
                  die historischen (Zeitreihe kompatibel), nur 'andere'
                  entfällt; die Antwort wird nirgends hingesendet, nur als
                  warmup_answered getrackt. */}
              {currentStep === 1 && !warmupAudience && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { value: 'angehoerige', label: 'Für eine:n Angehörige:n' },
                    { value: 'selbst', label: 'Für mich' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => {
                        // Bewusst KEIN step_view/step_complete: die Warm-up-Frage
                        // zählt nicht als Schritt (Auswertung bleibt kompatibel);
                        // eigenes Event macht sie trotzdem messbar.
                        analytics.trackEvent('wizard', 'warmup_answered', { answer: value });
                        setWarmupAudience(value);
                        setFullscreen(true);
                        // Die eine Ausrichtung (siehe alignCardOnce) — nach
                        // dem Re-Render mit den Buttons von Frage 1.
                        setTimeout(alignCardOnce, 80);
                      }}
                      className={btnClass(false)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <AntwortZeichen />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {currentStep === 1 && warmupAudience && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[{ value: '1-person', label: '1 Pflegebedürftige/r' }, { value: 'ehepaar', label: '2 Pflegebedürftige (Ehepaar)' }].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ patientCount: value as any }))}
                      className={btnClass(state.patientCount === value)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <AntwortZeichen />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2 (was 3) — Haushalt */}
              {currentStep === 2 && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[{ value: 'ja', label: 'Ja' }, { value: 'nein', label: 'Nein' }].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ householdOthers: value as any }))}
                      className={btnClass(state.householdOthers === value)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <AntwortZeichen />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 3 (was 4) — Pflegegrad */}
              {currentStep === 3 && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {['0', '1', '2', '3', '4', '5'].map((grad) => (
                    <button
                      key={grad}
                      onClick={() => selectAndAdvance(grad, () => updateState({ pflegegrad: grad as any }))}
                      // Gleicher Rahmen wie die übrigen Antworten (Martin 11.09.).
                      className={`px-4 py-3 border-[1.5px] rounded-xl transition-all duration-200 shadow-[0_2px_6px_rgba(61,61,61,0.10)] ${
                        state.pflegegrad === grad
                          ? 'border-[#8B7355] bg-[#8B7355]/5 ring-1 ring-[#8B7355]/20'
                          : 'border-[#CFC6B8] bg-white [@media(hover:hover)]:hover:border-[#A8977F] [@media(hover:hover)]:hover:bg-[#FAF8F4]'
                      }`}
                    >
                      <span className={`text-lg font-bold ${state.pflegegrad === grad ? 'text-[#8B7355]' : 'text-[#3D3D3D]'}`}>
                        {grad}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 4 (was 5) — Mobilität */}
              {currentStep === 4 && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { value: 'mobil', label: 'Mobil – geht selbstständig' },
                    { value: 'rollator', label: 'Mit Rollator' },
                    { value: 'rollstuhl', label: 'Auf Rollstuhl angewiesen' },
                    { value: 'bettlaegerig', label: 'Bettlägerig' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ mobility: value as any, lifting: 'nein' }))}
                      className={btnClass(state.mobility === value)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <AntwortZeichen />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 5 (was 6) — Nachteinsätze */}
              {currentStep === 5 && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { value: 'nein', label: 'Nein, nachts keine Hilfe nötig' },
                    { value: 'gelegentlich', label: 'Gelegentlich, nicht jede Nacht' },
                    { value: 'taeglich', label: 'Jede Nacht, bis zu 1 Einsatz' },
                    { value: 'mehrmals', label: 'Jede Nacht, mehrere Einsätze' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ nightCare: value as any }))}
                      className={btnClass(state.nightCare === value)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <AntwortZeichen />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 6 (was 7) — Deutschkenntnisse */}
              {currentStep === 6 && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { value: 'grundlegend', label: 'Grundlegend', description: 'Versteht und spricht nur wenige deutsche Wörter' },
                    { value: 'kommunikativ', label: 'Kommunikativ', description: 'Kann sich auf einfache Weise auf Deutsch verständigen' },
                    { value: 'sehr-gut', label: 'Gut', description: 'Kann sich in nahezu allen Alltagssituationen auf Deutsch verständigen. Empfehlenswert bei Schwerhörigkeit, Sprachproblemen oder erhöhtem Kommunikationsbedarf.' }
                  ].map(({ value, label, description }) => (
                    <div key={value} className="relative flex items-center gap-2">
                      <button
                        onClick={() => selectAndAdvance(value, () => updateState({ germanLevel: value as any }))}
                        className={`flex-1 ${btnClass(state.germanLevel === value)}`}
                      >
                        <div className="flex items-center justify-between gap-3.5">
                          <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                          <AntwortZeichen />
                        </div>
                      </button>
                      <div className="relative group flex-shrink-0">
                        <button className="w-6 h-6 rounded-full bg-[#F0EDE8] hover:bg-[#E5E0D8] flex items-center justify-center transition-colors" type="button">
                          <span className="text-[11px] font-bold text-[#8B7355]">i</span>
                        </button>
                        <div className="absolute right-0 bottom-8 w-56 bg-[#3D3D3D] text-white text-xs leading-snug rounded-xl px-3 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-10">
                          {description}
                          <span className="absolute -bottom-1.5 right-2 w-3 h-3 bg-[#3D3D3D] rotate-45" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 7 (was 8) — Führerschein */}
              {currentStep === 7 && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { value: 'ja', label: 'Ja, unbedingt', description: 'Weniger Auswahl & etwas höhere Kosten. Lässt sich manchmal auch anders lösen (z.B. Taxi, Fahrdienst).' },
                    { value: 'nein', label: 'Nein / nicht unbedingt', description: 'Mehr Pflegekräfte zur Auswahl & günstigere Optionen möglich.' }
                  ].map(({ value, label, description }) => (
                    <div key={value} className="relative flex items-center gap-2">
                      <button
                        onClick={() => selectAndAdvance(value, () => updateState({ driving: value as any }))}
                        className={`flex-1 ${btnClass(state.driving === value)}`}
                      >
                        <div className="flex items-center justify-between gap-3.5">
                          <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                          <AntwortZeichen />
                        </div>
                      </button>
                      <div className="relative group flex-shrink-0">
                        <button className="w-6 h-6 rounded-full bg-[#F0EDE8] hover:bg-[#E5E0D8] flex items-center justify-center transition-colors" type="button">
                          <span className="text-[11px] font-bold text-[#8B7355]">i</span>
                        </button>
                        <div className="absolute right-0 bottom-8 w-56 bg-[#3D3D3D] text-white text-xs leading-snug rounded-xl px-3 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-10">
                          {description}
                          <span className="absolute -bottom-1.5 right-2 w-3 h-3 bg-[#3D3D3D] rotate-45" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 8 (was 9) — Geschlecht */}
              {currentStep === 8 && (
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { value: 'egal', label: 'Egal' },
                    { value: 'weiblich', label: 'Weiblich' },
                    { value: 'maennlich', label: 'Männlich' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ gender: value as any }))}
                      className={btnClass(state.gender === value)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <AntwortZeichen />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 9 - Kontaktformular: Name + E-Mail + Telefon alle
                  drei Pflicht (Rückrollung 14.06.2026 der Änderung vom
                  06.06.2026). Begründung im validateForm()-Kommentar. */}
              {currentStep === 9 && (
                <div className="space-y-3">
                  {vorschauModus && kraefteVorschau ? (
                    /* Kräfte-Vorschau (Registry #61), Martins Aufbau vom 10.09.:
                       Kopf „5 passende Pflegekräfte – sofort verfügbar", Profile
                       mit grossem Foto als wichtigstem Element, zwei ganz, das
                       dritte läuft in einen Verlauf aus; im Verlauf „+ 3 weitere
                       passende Pflegekräfte und Ihr persönliches Sofortangebot",
                       der Knopf und „Dafür benötigen wir nur noch Ihre
                       Kontaktdaten." Die Häkchen greifen die Angaben des Kunden
                       auf (Wortlaut der Angebotsmail). Preis bleibt verdeckt — er
                       entsteht erst serverseitig nach dem Absenden. */
                    <div className="mb-1">
                      {(() => {
                        /* Karte = Optik der Portal-Karte (MatchCard), unverändert seit
                           Runde 2 (Martin, 10.09.: „warum veränderst du die Optik, das
                           muss schon bleiben"): Foto 64 px links, Name und Alter, Chip
                           „Match", Sprachbalken, Faktenzeile, „Ab sofort verfügbar". */
                        const Karte = ({ k }: { k: VorschauKraft }) => {
                          const balken = deutschBalken(k.deutschWort);
                          return (
                            <div className="bg-white shadow-sm rounded-2xl border border-zinc-300 overflow-hidden">
                              <div className="px-3.5 pt-3 pb-3">
                                <div className="flex items-center gap-3">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={k.fotoUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" loading="lazy" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[16px] font-semibold leading-snug text-[#18181B]">
                                        {k.vorname}{k.alter ? <span className="font-normal text-[#71717A]">, {k.alter}</span> : null}
                                      </p>
                                      <span className="inline-flex items-center gap-1 flex-shrink-0 text-[11px] font-bold text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-2.5 py-0.5 rounded-full">
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        Match
                                      </span>
                                    </div>
                                    {k.deutschWort ? (
                                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] text-[#71717A]">
                                        Deutsch
                                        {balken > 0 && (
                                          <span className="inline-flex gap-0.5" aria-hidden="true">
                                            {[0, 1, 2].map((i) => <span key={i} className={`w-3 h-1.5 rounded-full ${i < balken ? 'bg-[#8B7355]' : 'bg-gray-200'}`} />)}
                                          </span>
                                        )}
                                        {k.deutschWort}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="text-[14px] mt-2 text-[#71717A]">
                                  {k.stufe ? <span className="font-semibold text-[#18181B]">{k.stufe}: </span> : null}{kraftFakten(k)}
                                </p>
                              </div>
                            </div>
                          );
                        };
                        const ganz = kraefteVorschau.slice(0, GANZ_SICHTBAR);
                        const angeschnitten = kraefteVorschau[GANZ_SICHTBAR] ?? null;
                        if (kontaktOffen) {
                          // Eigener Schritt (Martin, 10.09.): keine Karten mehr, nur die
                          // Schranke. Kein Zurück-Link (Martin: „macht keinen Sinn").
                          return (
                            <div id="kontakt-schranke">
                              {/* Strecke v2 (11.09.): kein zweites „5 Pflegekräfte" und keine
                                  Frage mehr — die Kräfte standen einen Schritt vorher. Nur der
                                  Grund, warum wir die Daten brauchen. */}
                              <p className="text-[19px] font-bold leading-snug text-[#1a1a1a]">{SCHRANKE.frage}</p>
                              <p className="text-[15px] leading-snug text-[#555] mt-1">{SCHRANKE.text}</p>
                            </div>
                          );
                        }
                        return (
                          <>
                            <div className="space-y-3">
                              {ganz.map((k) => <Karte key={k.id} k={k} />)}
                              {angeschnitten && (
                                <div className="relative">
                                  <div className="max-h-[76px] overflow-hidden rounded-2xl"><Karte k={angeschnitten} /></div>
                                  <div className="absolute inset-x-0 bottom-0 h-[76px] bg-gradient-to-b from-white/10 via-white/90 to-white" aria-hidden="true" />
                                </div>
                              )}
                            </div>
                            {(
                              <div className={`relative text-center ${angeschnitten ? '-mt-3' : 'pt-4'}`}>
                                <p className="text-[15px] font-bold text-[#3D3D3D] leading-snug">{VERLAUF.weitere()}</p>
                                <p className="text-[13px] text-[#5A5A5A] leading-snug mt-0.5">{VERLAUF.preis}</p>
                                <button
                                  type="button"
                                  onClick={oeffneKontakt}
                                  className="mt-3 w-full py-3.5 px-2 font-bold text-[15px] whitespace-nowrap rounded-xl bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-lg hover:shadow-xl transition-all duration-200"
                                >
                                  {VERLAUF.knopf}
                                </button>
                                <p className="text-[12px] text-[#5A5A5A] leading-snug mt-2">{VERLAUF.hinweis}</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <>
                      {/* V7 (Martin, 2026-07-08): Der Preiskasten ist die 1:1-Kopie
                          des GROSSEN Betreuungskosten-Kastens der Portal-Angebots-
                          seite (CustomerPortalPage ~2175): Tagespreis groß links,
                          „inkl. Steuern…" rechts daneben, Zzgl.-Zeile unten. NUR
                          die Zahl ist verpixelt (Dummy! Die echte Kalkulation
                          läuft erst nach dem Absenden serverseitig und darf hier
                          nie im Quelltext stehen). */}
                      <div className="flex items-center gap-3 rounded-2xl border border-[#C4E3CB] bg-[#F0F7F1] px-5 py-4 mb-1">
                        <div className="flex flex-shrink-0">
                          {/* Echte Pflegekräfte aus dem eigenen Bestand (leicht verpixelt
                              = gesperrte Vorschau). Plain <img>: kein next/image-Optimizer nötig. */}
                          {[
                            '/images/caregivers/pk-1.jpg',
                            '/images/caregivers/pk-2.jpg',
                            '/images/caregivers/pk-3.jpg',
                            '/images/caregivers/pk-4.jpg',
                            '/images/caregivers/pk-5.jpg',
                          ].map((src, i) => (
                            <span key={src} className={`relative w-9 h-9 rounded-full overflow-hidden border-2 border-white flex-shrink-0 ${i > 0 ? '-ml-2.5' : ''}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                            </span>
                          ))}
                        </div>
                        <p className="text-[14px] leading-snug text-[#2F5A38]"><span className="font-semibold">5 passende Pflegekräfte</span> für Sie gefunden</p>
                      </div>
                      {/* CRO 15.08.: Preisspanne steht im HERO (app/page.tsx),
                          nicht hier — auf diesem Schritt sagen wir „Ihr Angebot
                          ist fertig", eine generische Spanne daneben wirkte
                          widersprüchlich (Martins Einwand 15.08.). */}
                      <div className="pt-1">
                        <p className="text-[19px] font-bold leading-snug text-[#1a1a1a]">{SCHRANKE.frage}</p>
                              <p className="text-[15px] leading-snug text-[#555] mt-1">{SCHRANKE.text}</p>
                      </div>
                    </>
                  )}
                  {(!vorschauModus || kontaktOffen) && (<>
                  <div>
                    <input
                      id="kontakt-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        setErrors({ ...errors, name: '' });
                      }}
                      onFocus={() => trackFieldFocus('name')}
                      onBlur={(e) => trackFieldBlur('name', e.target.value)}
                      className={`w-full px-4 py-3 text-base border-[1.5px] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355] ${
                        errors.name ? 'border-red-500' : 'border-[#CFC6B8]'
                      }`}
                      placeholder="Name"
                      autoComplete="name"
                    />
                    {errors.name && <p className="text-[11px] text-red-500 mt-1 px-3">{errors.name}</p>}
                  </div>

                  <div>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => {
                        setFormData({ ...formData, email: e.target.value });
                        setErrors({ ...errors, email: '' });
                      }}
                      onFocus={() => trackFieldFocus('email')}
                      onBlur={(e) => {
                        trackFieldBlur('email', e.target.value);
                        if (e.target.value.trim() && !EMAIL_MUSTER.test(e.target.value.trim())) {
                          setErrors((alt) => ({ ...alt, email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein' }));
                        }
                      }}
                      className={`w-full px-4 py-3 text-base border-[1.5px] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355] ${
                        errors.email ? 'border-red-500' : 'border-[#CFC6B8]'
                      }`}
                      placeholder="E-Mail-Adresse"
                      autoComplete="email"
                    />
                    {errors.email && <p className="text-[11px] text-red-500 mt-1 px-3">{errors.email}</p>}
                  </div>

                  <div>
                    <input
                      type="tel"
                      value={formData.phone}
                      inputMode="tel"
                      onChange={(e) => {
                        setFormData({ ...formData, phone: telefonBereinigen(e.target.value) });
                        setErrors({ ...errors, phone: '' });
                      }}
                      onFocus={() => trackFieldFocus('phone')}
                      onBlur={(e) => {
                        trackFieldBlur('phone', e.target.value);
                        // Hinweis erst nach dem Tippen, nie auf ein leeres Feld.
                        if (e.target.value.trim()) setErrors((alt) => ({ ...alt, phone: telefonFehler(e.target.value) }));
                      }}
                      className={`w-full px-4 py-3 text-base border-[1.5px] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355] ${
                        errors.phone ? 'border-red-500' : 'border-[#CFC6B8]'
                      }`}
                      placeholder="Telefonnummer"
                      autoComplete="tel"
                    />
                    {errors.phone
                      ? <p className="text-[11px] text-red-500 mt-1 px-3">{errors.phone}</p>
                      : <p className="text-[12px] text-[#8B8B8B] mt-1 px-3">{SCHRANKE.telefonHinweis}</p>}
                  </div>
                  </>)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom-Button-Block: auf Step 1 komplett ausgeblendet (kein
            Zurück, Auto-Advance kümmert sich um Weiter), Steps 2-9 zeigen
            nur Zurück, Step 10 zeigt den Submit-Button mit Hinweis. */}
        {currentStep > 1 && !(currentStep === totalSteps && vorschauModus && !kontaktOffen) && (
          // Nur-Zurück-Zeile eng an die Antworten (Martin 11.09.: „zurück hat
          // zu viel Luft"); der Absendeblock behält seinen Abstand.
          <div className={`px-3 sm:px-6 lg:px-8 bg-white ${currentStep === totalSteps && (!vorschauModus || kontaktOffen) ? 'pt-4 pb-5' : 'pt-0 pb-3'}`}>
            {currentStep === totalSteps && (!vorschauModus || kontaktOffen) ? (
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => handleNext()}
                  disabled={!canProceed() || isSubmitting}
                  // Disabled: heller Coral-Ton mit weißer Schrift, damit die
                  // Botschaft auch ohne Eingabe lesbar bleibt (vorher
                  // #8B8B8B auf #E5E3DF war kaum lesbar). Inline-Style statt
                  // Tailwind-Slash-Alpha, weil bg-[#E76F63]/55 vom JIT nicht
                  // konsistent gerendert wird.
                  style={!canProceed() || isSubmitting ? { backgroundColor: '#F2B5AE' } : undefined}
                  className={`w-full py-4 font-bold text-base rounded-xl transition-all duration-200 ${
                    canProceed() && !isSubmitting
                      ? 'bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-lg hover:shadow-xl cursor-pointer'
                      : 'text-white shadow-md cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <span>Wird gesendet...</span>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <span className={vorschauModus ? 'whitespace-nowrap text-[15px]' : undefined}>{vorschauModus ? SCHRANKE.knopf : 'Preis & Pflegekräfte ansehen →'}</span>
                  )}
                </button>
                <p className="text-center text-xs text-[#8B8B8B] leading-snug">
                  {SCHRANKE.fussnote}<br />Mit dem Absenden stimmen Sie unserer{' '}
                  <a href="/datenschutz" target="_blank" className="text-[#8B7355] underline hover:text-[#A68968]">
                    Datenschutzerklärung
                  </a>{' '}zu.
                </p>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#708A95] hover:text-[#3D3D3D] py-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Zurück
                </button>
              </div>
            )}
          </div>
        )}
        {/* Trust-Punkte als angehängter Karten-Fuß (keine separate Box) */}
        <div className="border-t border-[#E5E3DF]/60 px-4 py-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
            <span className="text-[#3D3D3D] font-medium">SSL-Verschlüsselung</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
            <span className="text-[#3D3D3D] font-medium">DSGVO-Konform</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
            {/* War "Keine Werbeanrufe" (Martin 16.08. geaendert). Passt
                zusaetzlich zur Leitplanke des SEA-Laufs: keine Aussagen
                ueber Anrufe — das Gespraech ist Teil des Modells. */}
            <span className="text-[#3D3D3D] font-medium">100&nbsp;% kostenfrei &amp; unverbindlich</span>
          </div>
        </div>
      </div>
      </div>

      {/* Mobile Contact - Below Form */}
      {!fullscreen && (
      <div className="md:hidden mt-8">
        <div className="bg-white rounded-2xl border border-[#ECE7DF] shadow-sm p-4">
          <p className="text-[13px] text-[#8B8B8B] mb-3 text-left">Benötigen Sie Hilfe?</p>
          <div className="flex items-center gap-4">
            <Image
              src="/images/marta-kapcio.jpg"
              alt="Marta Kapcio"
              width={84}
              height={104}
              className="rounded-xl w-[84px] h-[104px] object-cover flex-shrink-0"
              style={{ objectPosition: '50% 20%' }}
            />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[17px] font-bold text-[#3D2B1F] mb-2.5">Marta Kapcio</p>
              <div className="flex gap-2">
            <a
              href="tel:+4989200000830"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border border-[#D4C4B0] bg-white hover:bg-[#F0EBE3] transition-colors"
            >
              <Phone className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
              <span className="text-[14px] font-semibold text-[#8B7355]">Anrufen</span>
            </a>
            <a
              href={`https://wa.me/4989200000830?text=${encodeURIComponent("Hallo Frau Wysocki, ich habe eine Rückfrage:")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-[#25D366] hover:bg-[#20C05A] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 text-white" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span className="text-[14px] font-semibold text-white">WhatsApp</span>
            </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
    </>
  );
}
