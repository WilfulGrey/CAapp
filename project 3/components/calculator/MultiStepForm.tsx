"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCalculator, formatEuro } from "@/lib/calculator-context";
import { CircleCheck as CheckCircle2, Phone } from "lucide-react";
import Image from "next/image";
import { analytics } from "@/lib/analytics";
import { useFormTracking } from "@/hooks/use-form-tracking";

export function MultiStepForm() {
  const { state, updateState, calculate } = useCalculator();
  const [currentStep, setCurrentStep] = useState(1);
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
    acceptPrivacy: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const totalSteps = 10; // 9 Fragen + Kontaktformular (Getriebe lebt im CA-app patient form, nicht hier)
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

  // Step-Reihenfolge (PR #108): die Timing-Frage wurde aus Step 1 entfernt
  // und ans Ende des Funnels (vor das Kontaktformular) verschoben — Step 1
  // ist jetzt die konkrete Sachfrage "Wie viele Personen benötigen Pflege?",
  // damit der Einstieg ohne planerisches Commitment funktioniert. Daten-Feld
  // care_start_timing bleibt erhalten (Lead-Pipeline + Mamamia-Mapping
  // unverändert).
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
      case 9: return 'care_start_timing';
      case 10: return 'contact_form';
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
      case 9: return state.careStartTiming;
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

  const handleNext = async (overrideAnswer?: string | null) => {
    const timeOnStep = Math.round((Date.now() - stepStartRef.current) / 1000);
    // overrideAnswer wird bei Auto-Advance gesetzt (selectAndAdvance), weil
    // getCurrentAnswer in dem Render-Zyklus eine stale closure-Version von
    // state sieht (setState wurde gerade erst geschedulet). Beim Klick auf
    // den manuellen "Weiter"-Button bleibt overrideAnswer undefined und wir
    // fallen auf den getCurrentAnswer-Lookup zurück.
    analytics.trackEvent('wizard', 'step_complete', {
      step: currentStep,
      step_name: getStepId(currentStep),
      answer: overrideAnswer !== undefined ? overrideAnswer : getCurrentAnswer(currentStep),
      time_on_step_seconds: timeOnStep,
    });

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      setTimeout(() => {
        const el = formRef.current;
        if (!el) return;
        // Same jump target as the CTA buttons (HowItWorks / FinalCTA /
        // RequirementsSection) — `-90` lands the form cleanly below the
        // sticky header. formRef instead of getElementById so the desktop
        // layout's instance is targeted too (both share id="calculator-form").
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.pageYOffset - 90,
          behavior: 'smooth',
        });
      }, 50);
    } else if (currentStep === totalSteps) {
      await handleSubmit();
    }
  };

  // Auto-Advance Helper für Single-Choice-Steps 1-9: aktualisiert den State
  // und triggert handleNext nach 300ms (kurze Pause, damit die Auswahl-
  // Animation gesehen wird). Der "Weiter"-Button wurde auf diesen Steps
  // entfernt — die Pause entlastet User, die ihre Wahl noch ändern wollen
  // (eine andere Option zu klicken startet den Timer neu).
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
      case 9: return Boolean(state.careStartTiming);
      case 10: return Boolean(formData.name && formData.email);
      default: return false;
    }
  };

  const validateForm = () => {
    const newErrors = {
      name: '',
      email: '',
      acceptPrivacy: '',
    };

    if (!formData.name.trim()) {
      newErrors.name = 'Bitte geben Sie Ihren Namen ein';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Bitte geben Sie Ihre E-Mail-Adresse ein';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein';
    }

    // Datenschutz-Einwilligung wurde durch Soft-Consent ersetzt (Hinweistext
    // unter dem CTA, das Absenden gilt als Zustimmung) — kein explizites
    // Checkbox-Validation mehr nötig.

    setErrors(newErrors);
    return !newErrors.name && !newErrors.email;
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
        analytics.trackConversion('angebot_angefordert', data.leadId, kalkulation.bruttopreis, {
          pflegegrad: state.pflegegrad,
          care_start_timing: state.careStartTiming,
          patient_count: state.patientCount,
        });
        if (typeof window !== 'undefined') {
          (window as any).dataLayer = (window as any).dataLayer || [];
          (window as any).dataLayer.push({
            event: 'angebot_erfolgreich',
            lead_id: data.leadId,
            pflegegrad: state.pflegegrad,
            care_start_timing: state.careStartTiming,
            conversion_value: kalkulation.bruttopreis,
          });
        }
        // Direct redirect into the CA app — no thank-you interstitial, no
        // countdown, no MatchingAnimation. User already filled name/email/
        // phone on step 10 and clicked submit. Anything between submit and
        // CA app is friction.
        if (typeof data.portalUrl === 'string' && data.portalUrl.length > 0) {
          window.location.assign(data.portalUrl);
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
    switch (currentStep) {
      case 1: return "Wie viele Personen benötigen Pflege?";
      case 2: return "Weitere Personen im Haushalt?";
      case 3: return "Vorhandener Pflegegrad?";
      case 4: return "Mobilität der zu betreuenden Person";
      case 5: return "Nachteinsätze erforderlich?";
      case 6: return "Deutschkenntnisse der Pflegekraft";
      case 7: return "Führerschein gewünscht?";
      case 8: return "Geschlecht der Pflegekraft";
      case 9: return "Wann soll die Betreuung starten?";
      case 10: return "Fast geschafft — Ihr Angebot wartet schon";
      default: return "";
    }
  };

  const getStepSubtext = () => {
    if (showResults) return "";
    switch (currentStep) {
      case 1: return "Andere im Haushalt erfassen wir im nächsten Schritt.";
      case 2: return "Personen im Haushalt, die nicht pflegebedürftig sind";
      case 3: return "Falls unbekannt, bitte schätzen";
      case 4: return "Wie mobil ist die zu betreuende Person?";
      case 5: return "Wird nachts Unterstützung benötigt?";
      case 6: return "Welches Sprachniveau sollte die Betreuungskraft haben?";
      case 7: return "Sind Autofahren notwendig und nicht anders zu organisieren?";
      case 8: return "Haben Sie eine Präferenz bezüglich des Geschlechts?";
      case 9: return "Egal ob konkret geplant oder noch in der Recherche — wir richten alles danach aus.";
      case 10: return "Sie sehen es gleich am Bildschirm. Eine Kopie kommt zusätzlich per E-Mail — damit Sie es jederzeit nachlesen können.";
      default: return "";
    }
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

  const btnClass = (isSelected: boolean) =>
    `w-full relative rounded-full px-6 py-4 border-2 transition-all duration-300 text-left shadow-sm hover:shadow-md ${
      isSelected
        ? 'border-[#8B7355] bg-[#8B7355]/5 ring-1 ring-[#8B7355]/20 shadow-md'
        : 'border-[#B8B0A6] bg-white hover:border-[#8B7355] hover:bg-gray-50'
    }`;

  return (
    <div ref={formRef} id="calculator-form" className="pt-6 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-4 max-w-md sm:max-w-[95%] xl:max-w-[1800px] 2xl:max-w-[2000px] mx-auto px-0 sm:px-4">
      <div className="relative">
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
          <div className="inline-flex items-center gap-1.5 bg-white border border-[#D4C4B0] text-[#8B7355] text-[11px] font-semibold uppercase tracking-wide px-4 py-1.5 rounded-full shadow-sm">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            100% sorgenfrei
          </div>
        </div>
      <div data-calculator-card className="bg-white rounded-2xl border-[1.5px] border-[#C0C0C0] overflow-hidden shadow-md">
        <div className="px-4 sm:px-8 py-5 border-b-2 border-[#E5E3DF]/50 bg-[#E76F63]">
          <p className="text-base font-bold uppercase tracking-wide text-white/95 mb-1.5">
            Angebot & Pflegekräfte sofort erhalten
          </p>
          <p className="text-sm text-white/90">
            Ihr persönlicher Preis + passende Pflegekräfte in <span className="font-bold">2 Minuten</span>
          </p>
        </div>

        <div className="px-3 sm:px-4 py-2 bg-[#F8F7F5]/50 border-b border-[#E5E3DF]/30">
          <div className="h-1.5 bg-[#E5E3DF] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#708A95] rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>

        {currentStep >= 1 && currentStep <= 9 && (
          <div className="flex justify-center pt-3 pb-0">
            <div className="inline-flex items-center gap-1.5 bg-[#F0F7F1] border border-[#A8D5B0] rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50] animate-pulse flex-shrink-0"></span>
              <span className="text-[12px] text-[#3A6B42]">
                <span className="font-bold tabular-nums">{displayCount}</span>
                {currentStep === 1 ? ' direkt verfügbare Pflegekräfte' : ' Pflegekräfte passen zu Ihrer Suche'}
              </span>
            </div>
          </div>
        )}

        {currentStep === 10 && (
          <div className="flex justify-center pt-3 pb-0">
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5 shadow-sm">
              <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[12px] text-green-700 font-semibold tracking-wide">Angebot & Pflegekräfte vorbereitet</span>
            </div>
          </div>
        )}

        <div className="px-3 sm:px-6 lg:px-8 pt-5 pb-6">
          <div className="w-full">
            <h3 className="text-[21px] font-bold text-[#3D3D3D] mb-5 leading-tight">
              {getStepTitle()}
            </h3>
            {getStepSubtext() && (
              <p className="text-sm text-[#8B8B8B] mb-5 italic">{getStepSubtext()}</p>
            )}

            <div className="space-y-3">
              {/* Step 9 (was 1) — Timing nach hinten verschoben (PR #108) */}
              {currentStep === 9 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'sofort', label: 'Sofort (4-7 Tage)' },
                    { value: '2-4-wochen', label: 'In 2-4 Wochen' },
                    { value: '1-2-monate', label: 'In 1-2 Monaten' },
                    { value: 'unklar', label: 'Ich informiere mich nur' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ careStartTiming: value as any }))}
                      className={btnClass(state.careStartTiming === value)}
                    >
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.careStartTiming === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.careStartTiming === value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 1 (was 2) — Patientenzahl ist jetzt die Einstiegsfrage */}
              {currentStep === 1 && (
                <div className="grid grid-cols-1 gap-3">
                  {[{ value: '1-person', label: '1 Pflegebedürftige/r' }, { value: 'ehepaar', label: '2 Pflegebedürftige (Ehepaar)' }].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ patientCount: value as any }))}
                      className={btnClass(state.patientCount === value)}
                    >
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.patientCount === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.patientCount === value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2 (was 3) — Haushalt */}
              {currentStep === 2 && (
                <div className="grid grid-cols-1 gap-3">
                  {[{ value: 'ja', label: 'Ja' }, { value: 'nein', label: 'Nein' }].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ householdOthers: value as any }))}
                      className={btnClass(state.householdOthers === value)}
                    >
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.householdOthers === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.householdOthers === value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
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
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'mobil', label: 'Mobil – geht selbstständig' },
                    { value: 'rollator', label: 'Eingeschränkt – nur mit Rollator' },
                    { value: 'rollstuhl', label: 'Auf Rollstuhl angewiesen' },
                    { value: 'bettlaegerig', label: 'Bettlägerig' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ mobility: value as any, lifting: 'nein' }))}
                      className={btnClass(state.mobility === value)}
                    >
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.mobility === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.mobility === value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 5 (was 6) — Nachteinsätze */}
              {currentStep === 5 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'nein', label: 'Nein' },
                    { value: 'gelegentlich', label: 'Gelegentlich' },
                    { value: 'taeglich', label: 'Täglich (1×)' },
                    { value: 'mehrmals', label: 'Mehrmals nachts' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => selectAndAdvance(value, () => updateState({ nightCare: value as any }))}
                      className={btnClass(state.nightCare === value)}
                    >
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.nightCare === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.nightCare === value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 6 (was 7) — Deutschkenntnisse */}
              {currentStep === 6 && (
                <div className="grid grid-cols-1 gap-3">
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
                        <div className="flex items-center justify-start gap-3.5">
                          <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                            state.germanLevel === value
                              ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                              : 'border-gray-300 bg-white border-2'
                          }`}>
                            {state.germanLevel === value && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                            )}
                          </div>
                          <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
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
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'ja', label: 'Ja, unbedingt', description: 'Weniger Auswahl & etwas höhere Kosten. Lässt sich manchmal auch anders lösen (z.B. Taxi, Fahrdienst).' },
                    { value: 'nein', label: 'Nein / nicht unbedingt', description: 'Mehr Pflegekräfte zur Auswahl & günstigere Optionen möglich.' }
                  ].map(({ value, label, description }) => (
                    <div key={value} className="relative flex items-center gap-2">
                      <button
                        onClick={() => selectAndAdvance(value, () => updateState({ driving: value as any }))}
                        className={`flex-1 ${btnClass(state.driving === value)}`}
                      >
                        <div className="flex items-center justify-start gap-3.5">
                          <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                            state.driving === value
                              ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                              : 'border-gray-300 bg-white border-2'
                          }`}>
                            {state.driving === value && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                            )}
                          </div>
                          <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
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
                <div className="grid grid-cols-1 gap-3">
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
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.gender === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.gender === value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-base font-medium text-[#3D3D3D]">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 10 - Kontaktformular */}
              {currentStep === 10 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3">
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
                        className={`w-full px-4 py-2.5 text-base border-2 rounded-full focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355] ${
                          errors.name ? 'border-red-500' : 'border-[#B8B0A6]'
                        }`}
                        placeholder="Ihr Name"
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
                        className={`w-full px-4 py-2.5 text-base border-2 rounded-full focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355] ${
                          errors.email ? 'border-red-500' : 'border-[#B8B0A6]'
                        }`}
                        placeholder="Ihre E-Mail-Adresse"
                      />
                      {errors.email && <p className="text-[11px] text-red-500 mt-1 px-3">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        onFocus={() => trackFieldFocus('telefon')}
                        onBlur={(e) => trackFieldBlur('telefon', e.target.value)}
                        className="w-full px-4 py-2.5 text-base border-2 border-[#B8B0A6] rounded-full focus:outline-none focus:ring-1 focus:ring-[#8B7355]/40 focus:border-[#8B7355]"
                        placeholder="Telefon (optional) — nur falls Sie eine persönliche Rückfrage möchten"
                      />
                    </div>
                  </div>

                  {/* Trust-Bar direkt am Entscheidungspunkt — adressiert die 3
                      häufigsten Spam-Ängste in einer Zeile (PR #107). */}
                  <div className="pt-1">
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[#6B6B6B]">
                      <span className="inline-flex items-center gap-1">🔒 DSGVO</span>
                      <span className="text-[#D0CCC4]">·</span>
                      <span className="inline-flex items-center gap-1">✉️ Kein Newsletter</span>
                      <span className="text-[#D0CCC4]">·</span>
                      <span className="inline-flex items-center gap-1">📞 Nur auf Wunsch</span>
                    </div>
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
                  className={`w-full py-4 font-bold text-base rounded-full transition-all duration-200 ${
                    canProceed() && !isSubmitting
                      ? 'bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-lg hover:shadow-xl cursor-pointer'
                      : 'bg-[#E5E3DF] text-[#8B8B8B] cursor-not-allowed opacity-60'
                  }`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <span>Wird gesendet...</span>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <span>Angebot & Pflegekräfte jetzt sehen →</span>
                  )}
                </button>
                <p className="text-center text-xs text-[#8B8B8B] leading-snug">
                  100% kostenfrei &amp; unverbindlich · Mit dem Absenden stimmen Sie unserer{' '}
                  <a href="/datenschutz" target="_blank" className="text-[#8B7355] underline hover:text-[#A68968]">
                    Datenschutzerklärung
                  </a>{' '}zu.
                </p>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  onClick={handleBack}
                  className="px-7 py-3.5 font-semibold text-base rounded-full transition-all duration-200 border-2 border-[#E5E3DF] text-[#708A95] hover:bg-gray-50"
                >
                  Zurück
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Security Badges - außerhalb des Formulars */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs mt-4">
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
          <span className="text-[#3D3D3D] font-medium">Kostenfrei & unverbindlich</span>
        </div>
      </div>

      {/* Mobile Contact - Below Form */}
      <div className="md:hidden mt-8">
        <div className="bg-[#8B7355] rounded-t-xl px-5 py-3">
          <p className="text-base font-semibold text-white text-left">Benötigen Sie Hilfe?</p>
        </div>
        <div className="bg-[#F8F7F5] rounded-b-xl shadow-md overflow-hidden">
          <div className="flex items-center gap-4 px-5 pt-5 pb-4">
            <Image
              src="/images/ilka-wysocki_pm-mallorca.webp"
              alt="Ilka Wysocki"
              width={60}
              height={60}
              className="rounded-full w-[60px] h-[60px] object-cover flex-shrink-0"
              style={{ objectPosition: '50% 20%' }}
            />
            <p className="text-base font-bold text-[#3D2B1F]">Ilka Wysocki</p>
          </div>
          <div className="flex flex-col gap-2.5 px-5 pb-5">
            <a
              href="tel:+4989200000830"
              className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-full border border-[#D4C4B0] bg-white hover:bg-[#F0EBE3] transition-colors"
            >
              <Phone className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
              <span className="text-[15px] font-semibold text-[#8B7355]">089 200 000 830</span>
            </a>
            <a
              href={`https://wa.me/4989200000830?text=${encodeURIComponent("Hallo Frau Wysocki, ich habe eine Rückfrage:")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-full bg-[#25D366] hover:bg-[#20C05A] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 text-white" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span className="text-[15px] font-semibold text-white">WhatsApp schreiben</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
