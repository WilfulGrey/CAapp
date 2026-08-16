"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCalculator, formatEuro } from "@/lib/calculator-context";
import { CircleCheck as CheckCircle2, Phone } from "lucide-react";
import Image from "next/image";
import { analytics } from "@/lib/analytics";
import { cookieConsent } from "@/lib/cookie-consent";
import { useFormTracking } from "@/hooks/use-form-tracking";

// ─── Matching Animation Component ────────────────────────────────────────────
// Läuft zwischen letzter Frage (Step 8) und Kontaktformular (Step 9). 3 Schritte
// mit Pflegekraft-Match-Zähler — baut Wertaufbau auf, bevor der Nutzer Name/
// E-Mail eingibt. Wurde im Mai 2026 versehentlich entfernt (Commit 281e4ef
// argumentierte mit „Friction nach Submit", aber die Animation lief VOR dem
// Submit) — hier 1:1 wiederbelebt.
function MatchingAnimation({ onComplete, initialCount }: { onComplete: (finalCount: number) => void; initialCount: number }) {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [nurseCount, setNurseCount] = useState(initialCount);
  const [done, setDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const ANIM_STEPS = [
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
    const target = 5;
    const iv = setInterval(() => {
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
        <p className="text-base font-bold uppercase tracking-wide text-white mb-1.5">Einen Moment bitte</p>
        <p className="text-sm text-white" style={{ opacity: 0.85 }}>Wir bereiten Ihr persönliches Angebot vor</p>
      </div>

      <div className="px-3 sm:px-4 py-2 bg-[#F8F7F5]/50 border-b border-[#E5E3DF]/30">
        <div className="h-1.5 bg-[#E5E3DF] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#708A95] rounded-full transition-all duration-700 ease-out"
            style={{ width: done ? '100%' : activeStep === 0 ? '75%' : activeStep === 1 ? '85%' : '95%' }}
          />
        </div>
      </div>

      <div className="px-5 sm:px-8 pt-8 pb-6">
        <div className="space-y-6">
          {ANIM_STEPS.map((s, i) => {
            const isDone = completedSteps.includes(i);
            const isActive = activeStep === i && !isDone;
            const isPending = activeStep < i;
            return (
              <div key={i} className={`flex items-start gap-4 transition-all duration-500 ${isPending ? 'opacity-25' : 'opacity-100'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 mt-0.5
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
                    {s.label}
                    {isDone && <span className="ml-2 text-xs font-normal text-[#22A06B]">✓ Fertig</span>}
                  </p>
                  <p className="text-sm text-[#8B8B8B] mt-1">
                    {i === 1 && isActive ? (
                      <><span className="font-bold text-[#22A06B] tabular-nums">{nurseCount}</span> Pflegekräfte werden geprüft…</>
                    ) : i === 1 && isDone ? (
                      <><span className="font-bold text-[#22A06B]">{nurseCount}</span> passende Pflegekräfte gefunden</>
                    ) : (isActive || isDone) ? s.sub : null}
                  </p>
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

export function MultiStepForm() {
  const { state, updateState, calculate } = useCalculator();
  const [currentStep, setCurrentStep] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  // Matching-Animation zwischen Step 8 (letzte Frage) und Step 9 (Kontakt).
  // Wenn aktiv, blendet das Step-Rendering aus und zeigt nur die Animation.
  const [showMatching, setShowMatching] = useState(false);
  // Field-level tracking for the contact step (step 10) — populates
  // analytics_form_interactions so the dashboard can show where in the
  // contact form users engage / drop off.
  const { trackFieldFocus, trackFieldBlur, trackFormSubmit } = useFormTracking('kontaktformular');

  const dailyBase = useMemo(() => 71 + (new Date().getDate() % 8), []);

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

  const displayCountRef = useRef(dailyBase);
  const [displayCount, setDisplayCount] = useState(dailyBase);

  useEffect(() => {
    const target = getMatchingCount();
    const start = displayCountRef.current;
    if (target === start) return;
    let rafId: number;
    const duration = 600;
    const startTime = performance.now();
    const frame = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const current = Math.round(start + (target - start) * t);
      displayCountRef.current = current;
      setDisplayCount(current);
      if (t < 1) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [currentStep, state.patientCount, state.householdOthers, state.pflegegrad, state.mobility, state.nightCare, state.germanLevel, state.driving, state.gender]);
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

  useEffect(() => {
    analytics.trackEvent('wizard', 'step_view', {
      step: currentStep,
      step_name: getStepId(currentStep),
    });
    stepStartRef.current = Date.now();
  }, [currentStep]);

  // CRO 15.08.: Das Cookie-Banner lädt die Seite nicht mehr neu. Der
  // step_view des aktuellen Steps ist vor der Einwilligung am Consent-Gate
  // abgeprallt — hier einmalig nachfeuern, sobald Analytics erlaubt wird,
  // sonst fehlen diese Sessions im Funnel (vorher erledigte das der Reload).
  const consentReplayedRef = useRef(false);
  useEffect(() => {
    const unsubscribe = cookieConsent.subscribe((consent) => {
      if (consent.analytics && !consentReplayedRef.current) {
        consentReplayedRef.current = true;
        analytics.trackEvent('wizard', 'step_view', {
          step: currentStep,
          step_name: getStepId(currentStep),
          replayed_after_consent: true,
        });
      }
    });
    return unsubscribe;
    // currentStep bewusst als Dep: der Replay soll den Step melden, der beim
    // Klick auf „Akzeptieren" wirklich sichtbar ist.
  }, [currentStep]);

  // CRO 15.08.: „Wizard wirklich gesehen" messbar machen. step_view feuert
  // beim Mounten — auch wenn die Antwort-Buttons unter der Falz liegen
  // (Funnel-Befund: 62 % beantworten die Warm-up-Frage nie, Clarity zeigt
  // exakt an dieser Stelle den Scroll-Cliff 92 %→42 %). wizard_visible
  // feuert erst, wenn das Formular zur Hälfte im Viewport war — einmal pro
  // Session (sessionStorage-Guard, weil Mobile- und Desktop-Layout je eine
  // Instanz rendern; die unsichtbare intersected nie).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = formRef.current;
    if (!el) return;
    const KEY = '_prim_wizard_visible';
    if (sessionStorage.getItem(KEY)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, '1');
          analytics.trackEvent('wizard', 'wizard_visible', {});
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
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

  // CRO 15.08. (Martin: "vor dieser Frage springt der Bildschirm"): Der
  // Scroll bei jedem Step-Wechsel stammt aus der Zeit, als das Formular
  // tief auf der Seite lag. Seit dem Ueber-der-Falz-Umbau steht es beim
  // Step-Wechsel fast immer schon richtig — dann erzeugte das smooth-
  // Scrollen nur noch ein sichtbares Zucken. Jetzt wird NUR gescrollt,
  // wenn der Formular-Kopf wirklich aus dem sichtbaren Bereich raus ist.
  const scrollFormIntoViewIfNeeded = () => {
    const el = formRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top >= -10 && top <= 160) return; // Kopf ist sichtbar — nicht springen
    window.scrollTo({
      top: top + window.pageYOffset - 90,
      behavior: 'smooth',
    });
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
      });
    }

    if (currentStep < totalSteps) {
      // Letzte Frage (Step 8) → Kontaktformular (Step 9): vorher die Matching-
      // Animation einblenden. Step-Wechsel erst nach onComplete der Animation.
      if (currentStep === totalSteps - 1) {
        setShowMatching(true);
        setTimeout(scrollFormIntoViewIfNeeded, 50);
        return;
      }
      setCurrentStep(currentStep + 1);
      // -90-Ziel wie die CTA-Buttons (HowItWorks / FinalCTA) — aber nur
      // noch, wenn der Kopf nicht ohnehin sichtbar ist (kein Zucken).
      setTimeout(scrollFormIntoViewIfNeeded, 50);
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
      // Telefon-Plausibilität wird in validateForm() detailliert geprüft;
      // hier reicht "nicht leer" für die Weiter-Button-Aktivierung.
      // Telefon ist Pflicht (Rückrufe durch die Beratung; Server verlangt es ebenso).
      case 9: return Boolean(formData.name.trim() && formData.email.trim() && formData.phone.trim());
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
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein';
    }
    // Telefon mild geprüft — alles mit ≥6 Ziffern akzeptieren. Lässt
    // gängige DACH-Formate zu (+49 30 123456, 030/12345, 015123…) und
    // lehnt klare Fehleingaben ("abc", "1") ab. Strengere Formate hätten
    // False-Negatives produziert.
    const phoneDigits = (formData.phone ?? '').replace(/\D/g, '');
    if (!formData.phone.trim()) {
      newErrors.phone = 'Bitte geben Sie Ihre Telefonnummer ein';
    } else if (phoneDigits.length < 6) {
      newErrors.phone = 'Bitte geben Sie eine gültige Telefonnummer ein';
    }

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
        // step_complete(contact_form) + Conversion in EINEM Beacon — überlebt
        // den Redirect garantiert (Bug #33). Ersetzt die früheren racy
        // supabase-js-Inserts (analytics.trackConversion + step_complete aus
        // handleNext), von denen ~die Hälfte beim window.location.assign starb.
        analytics.trackCriticalSubmit({
          step: totalSteps,
          stepName: getStepId(totalSteps),
          timeOnStepSeconds: Math.round((Date.now() - stepStartRef.current) / 1000),
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
          (window as any).dataLayer = (window as any).dataLayer || [];
          (window as any).dataLayer.push({
            event: 'angebot_erfolgreich',
            lead_id: data.leadId,
            pflegegrad: state.pflegegrad,
            care_start_timing: state.careStartTiming,
            conversion_value: kalkulation.bruttopreis,
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
  const btnClass = (isSelected: boolean) =>
    `w-full relative rounded-xl px-4 py-3.5 border-[1.5px] shadow-[0_2px_6px_rgba(61,61,61,0.10)] transition-all duration-200 text-left ${
      isSelected
        ? 'border-[#8B7355] bg-[#8B7355]/5 ring-1 ring-[#8B7355]/20'
        : 'border-[#CFC6B8] bg-white hover:border-[#E76F63] hover:shadow-[0_3px_10px_rgba(231,111,99,0.22)] hover:bg-[#FFFDFB]'
    }`;

  // Fokus-Modus nach der ersten Frage: der Rest wird abgedunkelt, das
  // Formular bleibt exakt an seiner Stelle (kein Sprung) und liegt vorne.
  const outerClass = fullscreen
    ? "pt-6 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-4 max-w-md sm:max-w-[95%] xl:max-w-[1800px] 2xl:max-w-[2000px] mx-auto px-0 sm:px-4 relative z-[90]"
    : "pt-6 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-4 max-w-md sm:max-w-[95%] xl:max-w-[1800px] 2xl:max-w-[2000px] mx-auto px-0 sm:px-4";

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
          onComplete={() => {
            setShowMatching(false);
            setCurrentStep(totalSteps); // = Step 9 (Kontaktformular)
            setTimeout(scrollFormIntoViewIfNeeded, 50);
          }}
        />
      </div>
      </>
    );
  }

  return (
    <>
    {fullscreen && <div className="fixed inset-0 bg-black/60 z-[80]" aria-hidden="true" onClick={() => { setFullscreen(false); setWarmupAudience(null); setCurrentStep(1); }} />}
    <div ref={formRef} id="calculator-form" className={outerClass}>
      <div className="relative">
      <div data-calculator-card className="bg-white rounded-2xl border-[1.5px] border-[#C0C0C0] overflow-hidden shadow-md">
        <div className={`relative px-4 sm:px-8 py-3 border-b-2 border-[#E5E3DF]/50 ${currentStep === totalSteps ? 'bg-[#22A06B]' : 'bg-[#E76F63]'}`}>
          {fullscreen && currentStep !== totalSteps && (
            <button
              type="button"
              onClick={() => { setFullscreen(false); setWarmupAudience(null); setCurrentStep(1); }}
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
              <p className="text-center text-base font-bold uppercase tracking-wide text-white mb-1.5">
                ✓ Ihr Angebot ist fertig
              </p>
              <p className="text-center text-sm text-white/90">
                Persönlich auf Ihre Angaben abgestimmt
              </p>
            </>
          ) : (
            <p className="text-center text-[15px] font-bold text-white">
              In 2 Minuten zu Ihrem Angebot
            </p>
          )}
        </div>

        {currentStep > 1 && (
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
              {currentStep === 1 ? (
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
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50] animate-pulse flex-shrink-0"></span>
              )}
              <span className="text-[12px] text-[#3A6B42]">
                <span className="font-bold tabular-nums">{displayCount}</span>
                {currentStep === 1 ? ' Pflegekräfte sofort verfügbar' : ' Pflegekräfte passen zu Ihrer Suche'}
              </span>
            </div>
          </div>
        )}

        {/* Step 9 zeigt die Headline „✅ Ihr Angebot ist fertig" jetzt direkt
            im Titel-Block (getStepTitle); separate Pill ist redundant. */}

        <div id="calc-step-content" className="px-3 sm:px-6 lg:px-8 pt-3 pb-5">
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
                      }}
                      className={btnClass(false)}
                    >
                      <div className="flex items-center justify-between gap-3.5">
                        <span className="text-base font-semibold text-[#3D3D3D]">{label}</span>
                        <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                        <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                        <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                      className={`px-4 py-3 border rounded-lg transition-all duration-300 shadow-sm hover:shadow-md ${
                        state.pflegegrad === grad
                          ? 'border-[#8B7355] bg-[#8B7355]/5 ring-1 ring-[#8B7355]/20 shadow-md'
                          : 'border-[#E5E3DF] bg-white hover:bg-gray-50'
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
                        <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                        <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                          <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                          <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                        <svg className="w-5 h-5 flex-shrink-0 text-[#E76F63]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                    <p className="text-[16px] font-bold text-[#3D3D3D]">Wohin dürfen wir Ihr Angebot senden?</p>
                    <p className="text-[12.5px] text-[#8B8B8B] mt-0.5">Ihr genauer Preis &amp; 5 passende Pflegekräfte werden sofort sichtbar.</p>
                  </div>
                  <div>
                    <input
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
                      onBlur={(e) => trackFieldBlur('email', e.target.value)}
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
                      onChange={(e) => {
                        setFormData({ ...formData, phone: e.target.value });
                        setErrors({ ...errors, phone: '' });
                      }}
                      onFocus={() => trackFieldFocus('phone')}
                      onBlur={(e) => trackFieldBlur('phone', e.target.value)}
                      className={`w-full px-4 py-3 text-base border-[1.5px] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355] ${
                        errors.phone ? 'border-red-500' : 'border-[#CFC6B8]'
                      }`}
                      placeholder="Telefonnummer"
                      autoComplete="tel"
                    />
                    {errors.phone && <p className="text-[11px] text-red-500 mt-1 px-3">{errors.phone}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom-Button-Block: auf Step 1 komplett ausgeblendet (kein
            Zurück, Auto-Advance kümmert sich um Weiter), Steps 2-9 zeigen
            nur Zurück, Step 10 zeigt den Submit-Button mit Hinweis. */}
        {(currentStep === totalSteps || currentStep > 1) && (
          <div className="px-3 sm:px-6 lg:px-8 pt-4 pb-5 bg-white">
            {currentStep === totalSteps ? (
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
                  className={`w-full py-4 font-bold text-base rounded-full transition-all duration-200 ${
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
                    <span>Angebot & Pflegekräfte anzeigen →</span>
                  )}
                </button>
                <p className="text-center text-xs text-[#8B8B8B] leading-snug">
                  Öffnet sofort · unverbindlich · keine Werbeanrufe<br />Mit dem Absenden stimmen Sie unserer{' '}
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
            <span className="text-[#3D3D3D] font-medium">Keine Werbeanrufe</span>
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
              src="/images/ilka-wysocki_pm-mallorca.webp"
              alt="Ilka Wysocki"
              width={84}
              height={104}
              className="rounded-xl w-[84px] h-[104px] object-cover flex-shrink-0"
              style={{ objectPosition: '50% 20%' }}
            />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[17px] font-bold text-[#3D2B1F] mb-2.5">Ilka Wysocki</p>
              <div className="flex gap-2">
            <a
              href="tel:+4989200000830"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-full border border-[#D4C4B0] bg-white hover:bg-[#F0EBE3] transition-colors"
            >
              <Phone className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
              <span className="text-[14px] font-semibold text-[#8B7355]">Anrufen</span>
            </a>
            <a
              href={`https://wa.me/4989200000830?text=${encodeURIComponent("Hallo Frau Wysocki, ich habe eine Rückfrage:")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-full bg-[#25D366] hover:bg-[#20C05A] transition-colors"
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
