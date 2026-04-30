"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCalculator, formatEuro } from "@/lib/calculator-context";
import { CircleCheck as CheckCircle2, Phone, Mail } from "lucide-react";
import Image from "next/image";
import { analytics } from "@/lib/analytics";

export function MultiStepForm() {
  const router = useRouter();
  const { state, updateState, calculate } = useCalculator();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    postalCode: '',
    acceptPrivacy: false,
  });
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    acceptPrivacy: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // Captured from /api/angebot-anfordern response — drives the auto-
  // redirect into the CA app (kundenportal) on the success screen.
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const totalSteps = 11; // 10 Fragen + Kontaktformular
  const stepStartRef = useRef<number>(Date.now());

  useEffect(() => {
    analytics.trackEvent('wizard', 'step_view', {
      step: currentStep,
      step_name: getStepId(currentStep),
    });
    stepStartRef.current = Date.now();
  }, [currentStep]);

  function getStepId(step: number): string {
    switch (step) {
      case 1: return 'care_start_timing';
      case 2: return 'patient_count';
      case 3: return 'household_others';
      case 4: return 'pflegegrad';
      case 5: return 'mobility';
      case 6: return 'night_care';
      case 7: return 'german_level';
      case 8: return 'experience';
      case 9: return 'driving';
      case 10: return 'gender';
      case 11: return 'contact_form';
      default: return `step_${step}`;
    }
  }

  function getCurrentAnswer(step: number): string | null {
    switch (step) {
      case 1: return state.careStartTiming;
      case 2: return state.patientCount;
      case 3: return state.householdOthers;
      case 4: return state.pflegegrad;
      case 5: return state.mobility;
      case 6: return state.nightCare;
      case 7: return state.germanLevel;
      case 8: return state.experience;
      case 9: return state.driving;
      case 10: return state.gender;
      default: return null;
    }
  }

  const handleNext = async () => {
    const timeOnStep = Math.round((Date.now() - stepStartRef.current) / 1000);
    analytics.trackEvent('wizard', 'step_complete', {
      step: currentStep,
      step_name: getStepId(currentStep),
      answer: getCurrentAnswer(currentStep),
      time_on_step_seconds: timeOnStep,
    });

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === 11) {
      await handleSubmit();
    }
  };

  const handleBack = () => {
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
      case 1: return Boolean(state.careStartTiming);
      case 2: return Boolean(state.patientCount);
      case 3: return Boolean(state.householdOthers);
      case 4: return Boolean(state.pflegegrad !== null);
      case 5: return Boolean(state.mobility);
      case 6: return Boolean(state.nightCare);
      case 7: return Boolean(state.germanLevel);
      case 8: return Boolean(state.experience);
      case 9: return Boolean(state.driving);
      case 10: return Boolean(state.gender);
      case 11: return Boolean(formData.name && formData.email && formData.acceptPrivacy);
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

    if (!formData.acceptPrivacy) {
      newErrors.acceptPrivacy = 'Bitte akzeptieren Sie die Datenschutzerklärung';
    }

    setErrors(newErrors);
    return !newErrors.name && !newErrors.email && !newErrors.acceptPrivacy;
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
        erfahrung: state.experience || '',
        fuehrerschein: state.driving || '',
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
        // Capture handoff URL so the success screen can auto-redirect into
        // the CA app. Falls back to the old static success UI when the
        // server didn't ship NEXT_PUBLIC_PORTAL_URL (dev safety net).
        if (typeof data.portalUrl === 'string' && data.portalUrl.length > 0) {
          setPortalUrl(data.portalUrl);
        }
        setShowSuccess(true);
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
    if (showResults) return "Ihre individuelle Kalkulation";
    switch (currentStep) {
      case 1: return "Ab wann wird Betreuung benötigt?";
      case 2: return "Anzahl Patienten?";
      case 3: return "Weitere Person im Haushalt?";
      case 4: return "Vorhandener Pflegegrad?";
      case 5: return "Mobilität der zu betreuenden Person";
      case 6: return "Nachteinsätze erforderlich?";
      case 7: return "Deutschkenntnisse der Pflegekraft";
      case 8: return "Erfahrung der Pflegekraft";
      case 9: return "Führerschein gewünscht?";
      case 10: return "Geschlecht der Pflegekraft";
      case 11: return "Angebot senden an:";
      default: return "";
    }
  };

  const getStepSubtext = () => {
    if (showResults) return "";
    switch (currentStep) {
      case 1: return "Damit wir Ihre Anfrage optimal einordnen können";
      case 2: return "Wie viele Personen werden gleichzeitig betreut?";
      case 3: return "Person im Haushalt, die nicht betreut werden muss";
      case 4: return "Falls unbekannt, bitte schätzen";
      case 5: return "Wie mobil ist die zu betreuende Person?";
      case 6: return "Wird nachts Unterstützung benötigt?";
      case 7: return "Welches Sprachniveau sollte die Betreuungskraft haben?";
      case 8: return "Benötigen Sie eine Pflegekraft mit besonderer Erfahrung?";
      case 9: return "Sind Autofahren notwendig und nicht anders zu organisieren?";
      case 10: return "Haben Sie eine Präferenz bezüglich des Geschlechts?";
      case 11: return "Ihre persönliches Angebot wird umgehend per E-Mail versendet";
      default: return "";
    }
  };

  // Auto-redirect into the CA app once the success screen has rendered.
  // Visible 3-2-1 countdown so the page jump doesn't surprise the user;
  // manual click on the button (rendered below) skips the wait. Effect
  // is no-op when portalUrl is null (dev / NEXT_PUBLIC_PORTAL_URL unset).
  useEffect(() => {
    if (!showSuccess || !portalUrl) return;
    setRedirectCountdown(3);
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev == null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          window.location.assign(portalUrl);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showSuccess, portalUrl]);

  // Success-Ansicht nach erfolgreichem Submit
  if (showSuccess) {
    return (
      <div id="calculator-form" className="pt-2 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-0 max-w-md sm:max-w-[95%] xl:max-w-[1800px] 2xl:max-w-[2000px] mx-auto px-0 sm:px-4">
        <div className="bg-white rounded-2xl border-[1.5px] border-[#C0C0C0] overflow-hidden shadow-md">
          <div className="px-4 sm:px-8 py-6 border-b-2 border-[#E5E3DF]/50 bg-gradient-to-br from-[#E8F5E9] to-white text-center">
            <div className="w-16 h-16 rounded-full bg-[#4CAF50] flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-[#3D3D3D] mb-2">
              Vielen Dank!
            </h2>
            <p className="text-sm text-[#5A5A5A]">
              {portalUrl
                ? <>Sie werden gleich zu Ihrer persönlichen Pflegekraft-Auswahl weitergeleitet
                  {redirectCountdown != null && redirectCountdown > 0 && (
                    <> in <span className="font-bold text-[#2D5C2F]">{redirectCountdown}</span>…</>
                  )}</>
                : "Ihre Anfrage wurde erfolgreich übermittelt"}
            </p>
          </div>

          <div className="px-4 sm:px-8 py-8">
            {portalUrl && (
              <div className="mb-6 text-center">
                <a
                  href={portalUrl}
                  className="inline-block w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-[#2D5C2F] to-[#1F4421] text-white rounded-xl text-base font-bold hover:shadow-lg transition-all"
                >
                  Pflegekraft jetzt finden →
                </a>
                <p className="text-xs text-[#8B8B8B] mt-3">
                  Eine Bestätigungs-E-Mail mit Ihrem persönlichen Portal-Link ist unterwegs — der Link bleibt 14 Tage aktiv.
                </p>
              </div>
            )}
            <div className="bg-[#F8F7F5] rounded-xl p-6 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle2 className="w-5 h-5 text-[#4CAF50] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#3D3D3D] mb-1">
                    E-Mail versendet
                  </p>
                  <p className="text-sm text-[#5A5A5A]">
                    Sie erhalten in Kürze eine E-Mail mit Ihrem persönlichen Angebot und allen Details zu Ihrer Kalkulation an <strong>{formData.email}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#4CAF50] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#3D3D3D] mb-1">
                    Ihr persönliches Angebot folgt umgehend
                  </p>
                  <p className="text-sm text-[#5A5A5A]">
                    Wir senden Ihnen schnellstmöglich ihr persönliches Angebot per E-Mail!
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-[#E5E3DF] rounded-xl p-5">
              <p className="text-xs text-[#8B8B8B] mb-3 text-center">
                Dringender Beratungsbedarf?
              </p>
              <div className="flex items-center gap-4">
                <img
                  src="/images/ilka-wysocki_pm-mallorca.webp"
                  alt="Ilka Wysocki"
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#3D3D3D] mb-0.5">
                    Ilka Wysocki
                  </p>
                  <p className="text-xs text-[#8B8B8B] mb-2">
                    Kundenberatung
                  </p>
                  <a
                    href="tel:+4989200000830"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#E76F63] hover:text-[#D65E52] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    +49 89 200 000 830
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <p className="text-xs text-[#8B8B8B]">Ihre Kalkulation wurde erfolgreich erstellt</p>
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
                  <strong>E-Mail gesendet:</strong> Ihre detaillierte Kalkulation wurde an <strong>{formData.email}</strong> gesendet
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
    `w-full relative rounded-full px-6 py-4 border-[1.5px] transition-all duration-300 text-left shadow-sm hover:shadow-md ${
      isSelected
        ? 'border-[#8B7355] bg-[#8B7355]/5 ring-1 ring-[#8B7355]/20 shadow-md'
        : 'border-[#ADADAD] bg-white hover:border-[#8B7355] hover:bg-gray-50'
    }`;

  return (
    <div id="calculator-form" className="pt-2 pb-6 scroll-mt-24 lg:scroll-mt-32 lg:pt-0 max-w-md sm:max-w-[95%] xl:max-w-[1800px] 2xl:max-w-[2000px] mx-auto px-0 sm:px-4">
      <div className="bg-white rounded-2xl border-[1.5px] border-[#C0C0C0] overflow-hidden shadow-md">
        <div className="px-4 sm:px-8 py-5 border-b-2 border-[#E5E3DF]/50 bg-[#E76F63]">
          <p className="text-base font-bold uppercase tracking-wide text-white/95 mb-1.5">
            Betreuung unverbindlich anfragen!
          </p>
          <p className="text-sm text-white/90">
            Ihr kostenfreies Angebot in nur <span className="font-bold">2 Minuten</span>
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

        <div className="px-3 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="w-full">
            <h3 className="text-[21px] font-bold text-[#3D3D3D] mb-5 leading-tight">
              {getStepTitle()}
            </h3>
            {getStepSubtext() && (
              <p className="text-sm text-[#8B8B8B] mb-5 italic">{getStepSubtext()}</p>
            )}

            <div className="space-y-3">
              {/* Step 1 */}
              {currentStep === 1 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'sofort', label: 'Sofort (4-7 Tage)' },
                    { value: '2-4-wochen', label: 'In 2-4 Wochen' },
                    { value: '1-2-monate', label: 'In 1-2 Monaten' },
                    { value: 'unklar', label: 'Noch unklar' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ careStartTiming: value as any })}
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

              {/* Step 2 */}
              {currentStep === 2 && (
                <div className="grid grid-cols-1 gap-3">
                  {[{ value: '1-person', label: '1 Person' }, { value: 'ehepaar', label: '2 Personen' }].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ patientCount: value as any })}
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

              {/* Step 3 */}
              {currentStep === 3 && (
                <div className="grid grid-cols-1 gap-3">
                  {[{ value: 'ja', label: 'Ja' }, { value: 'nein', label: 'Nein' }].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ householdOthers: value as any })}
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

              {/* Step 4 */}
              {currentStep === 4 && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {['0', '1', '2', '3', '4', '5'].map((grad) => (
                    <button
                      key={grad}
                      onClick={() => updateState({ pflegegrad: grad as any })}
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

              {/* Step 5 */}
              {currentStep === 5 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'mobil', label: 'Mobil – geht selbstständig' },
                    { value: 'rollator', label: 'Eingeschränkt – nur mit Rollator' },
                    { value: 'rollstuhl', label: 'Auf Rollstuhl angewiesen' },
                    { value: 'bettlaegerig', label: 'Bettlägerig' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ mobility: value as any, lifting: 'nein' })}
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

              {/* Step 6 */}
              {currentStep === 6 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'nein', label: 'Nein' },
                    { value: 'gelegentlich', label: 'Gelegentlich' },
                    { value: 'taeglich', label: 'Täglich (1×)' },
                    { value: 'mehrmals', label: 'Mehrmals nachts' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ nightCare: value as any })}
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

              {/* Step 7 */}
              {currentStep === 7 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'grundlegend', label: 'Grundlegend' },
                    { value: 'kommunikativ', label: 'Kommunikativ' },
                    { value: 'sehr-gut', label: 'Sehr gut' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ germanLevel: value as any })}
                      className={btnClass(state.germanLevel === value)}
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
                  ))}
                </div>
              )}

              {/* Step 8 */}
              {currentStep === 8 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'einsteiger', label: 'Einsteiger (bis 2 Jahre)' },
                    { value: 'erfahren', label: 'Erfahren (2-5 Jahre)' },
                    { value: 'sehr-erfahren', label: 'Sehr erfahren (ab 5 Jahren)' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ experience: value as any })}
                      className={btnClass(state.experience === value)}
                    >
                      <div className="flex items-center justify-start gap-3.5">
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 transition-all duration-200 ${
                          state.experience === value
                            ? 'border-[#8B7355] bg-[#8B7355] border-[3px]'
                            : 'border-gray-300 bg-white border-2'
                        }`}>
                          {state.experience === value && (
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

              {/* Step 9 */}
              {currentStep === 9 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'egal', label: 'Egal' },
                    { value: 'ja', label: 'Ja' },
                    { value: 'nein', label: 'Nein' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ driving: value as any })}
                      className={btnClass(state.driving === value)}
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
                  ))}
                </div>
              )}

              {/* Step 10 */}
              {currentStep === 10 && (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { value: 'egal', label: 'Egal' },
                    { value: 'weiblich', label: 'Weiblich' },
                    { value: 'maennlich', label: 'Männlich' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateState({ gender: value as any })}
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

              {/* Step 11 - Kontaktformular */}
              {currentStep === 11 && (
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
                        className={`w-full px-4 py-2.5 text-base border-2 rounded-full focus:outline-none focus:ring-2 focus:ring-[#8B7355]/30 ${
                          errors.name ? 'border-red-500' : 'border-[#E5E3DF]'
                        }`}
                        placeholder="Vollständiger Name"
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
                        className={`w-full px-4 py-2.5 text-base border-2 rounded-full focus:outline-none focus:ring-2 focus:ring-[#8B7355]/30 ${
                          errors.email ? 'border-red-500' : 'border-[#E5E3DF]'
                        }`}
                        placeholder="E-Mail-Adresse"
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
                        className="w-full px-4 py-2.5 text-base border-2 border-[#E5E3DF] rounded-full focus:outline-none focus:ring-2 focus:ring-[#8B7355]/30"
                        placeholder="Telefonnummer (optional)"
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.acceptPrivacy}
                        onChange={(e) => {
                          setFormData({ ...formData, acceptPrivacy: e.target.checked });
                          setErrors({ ...errors, acceptPrivacy: '' });
                        }}
                        className="mt-0.5 w-4 h-4 text-[#8B7355] border-2 border-[#E5E3DF] rounded focus:ring-2 focus:ring-[#8B7355]/30"
                      />
                      <span className="text-[13px] text-[#3D3D3D] leading-snug">
                        Ich akzeptiere die{' '}
                        <a href="/datenschutz" target="_blank" className="text-[#8B7355] underline hover:text-[#A68968]">
                          Datenschutzerklärung
                        </a>
                      </span>
                    </label>
                    {errors.acceptPrivacy && <p className="text-[11px] text-red-500 mt-1 px-3">{errors.acceptPrivacy}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-6 lg:px-8 pt-4 pb-5 bg-white">
          <div className="flex items-center justify-between gap-5">
            <button
              onClick={handleBack}
              className="px-7 py-3.5 font-semibold text-base rounded-full transition-all duration-200 border-2 border-[#E5E3DF] text-[#708A95] hover:bg-gray-50"
            >
              Zurück
            </button>

            <button
              onClick={handleNext}
              disabled={!canProceed() || isSubmitting}
              className={`px-9 py-3.5 font-bold text-base rounded-full transition-all duration-200 ${
                canProceed() && !isSubmitting
                  ? 'bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-lg hover:shadow-xl cursor-pointer'
                  : 'bg-[#E5E3DF] text-[#8B8B8B] cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <span>Wird gesendet...</span>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <span>{currentStep === totalSteps ? 'Angebot anfordern' : 'Weiter'}</span>
              )}
            </button>
          </div>
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
        <a
          href="tel:+4989200000830"
          className="flex items-center gap-4 p-5 bg-[#F8F7F5] hover:bg-[#E5E3DF] rounded-b-xl transition-all duration-200 shadow-md"
        >
          <Image
            src="/images/ilka-wysocki_pm-mallorca.webp"
            alt="Ilka Wysocki"
            width={60}
            height={60}
            className="rounded-full w-[60px] h-[60px] object-cover flex-shrink-0"
            style={{ objectPosition: '50% 20%' }}
          />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-base font-bold text-[#3D2B1F] mb-1">
              Ilka Wysocki
            </p>
            <div className="flex items-center gap-2 text-[#8B7355]">
              <Phone className="w-5 h-5 flex-shrink-0" />
              <span className="text-base font-semibold">089 200 000 830</span>
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
