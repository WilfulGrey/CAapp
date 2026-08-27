"use client";

import { useRouter } from "next/navigation";
import { useCalculator, formatEuro } from "@/lib/calculator-context";
import { CircleCheck as CheckCircle2, ArrowRight, Info, Phone, ArrowLeft, X, Lightbulb, User, Mail } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { berechnePreis } from "@/lib/calculation";
import { analytics } from "@/lib/analytics";

export default function ResultPage() {
  const router = useRouter();
  const { calculate, state } = useCalculator();
  const result = calculate();

  const [stickyVisible, setStickyVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    acceptPrivacy: false,
  });
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    acceptPrivacy: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Captured from /api/angebot-anfordern response — used for both the
  // "Pflegekraft jetzt finden" CTA and the auto-redirect below.
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const priceBox = document.getElementById('price-box');
      const formSection = document.getElementById('kontakt');

      if (priceBox && formSection) {
        const priceRect = priceBox.getBoundingClientRect();
        const formRect = formSection.getBoundingClientRect();

        const priceVisible = priceRect.top < window.innerHeight && priceRect.bottom > 0;
        const formVisible = formRect.top < window.innerHeight && formRect.bottom > 0;

        setStickyVisible(!priceVisible && !formVisible);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToForm = (e: React.MouseEvent) => {
    e.preventDefault();
    const formSection = document.getElementById('kontakt');
    if (formSection) {
      formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleNameChange = (value: string) => {
    setFormData({ ...formData, name: value });
    if (errors.name) setErrors({ ...errors, name: '' });
    if (value.trim().length > 2) {
      setTimeout(() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  };

  const handleEmailChange = (value: string) => {
    setFormData({ ...formData, email: value });
    if (errors.email) setErrors({ ...errors, email: '' });
    if (validateEmail(value)) {
      setTimeout(() => phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  };

  const handlePhoneChange = (value: string) => {
    setFormData({ ...formData, phone: value });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

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
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein';
    }

    if (!formData.acceptPrivacy) {
      newErrors.acceptPrivacy = 'Bitte akzeptieren Sie die Datenschutzerklärung';
    }

    setErrors(newErrors);

    if (!newErrors.name && !newErrors.email && !newErrors.acceptPrivacy) {
      setIsSubmitting(true);

      try {
        const mappedFormularDaten = {
          betreuung_fuer: state.patientCount || '1-person',
          pflegegrad: parseInt(state.pflegegrad || '0'),
          weitere_personen: state.householdOthers || 'nein',
          mobilitaet: state.mobility || 'mobil',
          nachteinsaetze: state.nightCare || 'nein',
          deutschkenntnisse: state.germanLevel || 'grundlegend',
          erfahrung: state.experience || 'einsteiger',
          fuehrerschein: state.driving || 'egal',
          geschlecht: state.gender || 'egal',
        };

        const vollstaendigeKalkulation = await berechnePreis(mappedFormularDaten);
        const kalkulationMitFormular = {
          ...vollstaendigeKalkulation,
          formularDaten: mappedFormularDaten
        };

        const response = await fetch('/api/angebot-anfordern', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vorname: formData.name,
            email: formData.email,
            telefon: formData.phone,
            kalkulation: kalkulationMitFormular,
            acceptPrivacy: formData.acceptPrivacy,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "angebot_erfolgreich" });

          await analytics.trackConversion(
            'angebot_requested',
            data.leadId,
            vollstaendigeKalkulation.eigenanteil,
            {
              name: formData.name,
              email: formData.email,
              phone: formData.phone,
              ...mappedFormularDaten
            }
          );

          // Capture the portal URL the API returned so the success state
          // can both show the manual CTA and auto-redirect after a beat.
          // null when NEXT_PUBLIC_PORTAL_URL isn't configured (dev safety
          // net) — we still show "Vielen Dank!" but skip the redirect.
          if (typeof data.portalUrl === 'string' && data.portalUrl.length > 0) {
            setPortalUrl(data.portalUrl);
          }
          setIsSubmitted(true);
        } else {
          console.error('Fehler beim Senden der Anfrage');
          alert('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.');
        }
      } catch (error) {
        console.error('Fehler beim Senden der Anfrage:', error);
        alert('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Auto-redirect after the success screen renders. We give the user a
  // visible 3-2-1 countdown so the transition doesn't feel like an
  // unexpected page jump. Manual click on the button below skips the
  // wait. The effect skips entirely when portalUrl is null (e.g. local
  // dev without NEXT_PUBLIC_PORTAL_URL) — fallback "Zurück zur Startseite"
  // button stays visible.
  useEffect(() => {
    if (!isSubmitted || !portalUrl) return;
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
  }, [isSubmitted, portalUrl]);

  // Berechne Preisspanne (±10% als Beispiel)
  const priceMin = Math.round(result.eigenanteil * 0.95);
  const priceMax = Math.round(result.eigenanteil * 1.05);
  const grossMin = Math.round(result.totalGross * 0.95);
  const grossMax = Math.round(result.totalGross * 1.05);

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50/30 to-[#F8F7F5]">
        <div className="sticky top-0 z-50 bg-white border-b border-[#E8E4DE] px-5 py-3.5">
          <div className="max-w-[480px] mx-auto flex items-center justify-between">
            <div className="w-5"></div>
            <div className="flex items-center gap-2 bg-slate-50 border border-[#708A95]/20 rounded-full px-3.5 py-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700">Erfolgreich gesendet</span>
            </div>
            <button
              onClick={() => router.push('/')}
              className="text-[#5A5A5A] text-xl leading-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <main className="w-full max-w-[480px] mx-auto px-5 py-16">
          <div className="bg-white rounded-3xl shadow-lg border border-[#E5E3DF] overflow-hidden text-center p-10 md:p-12">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-green-100">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#3D3D3D] mb-3">
              Vielen Dank!
            </h2>
            {portalUrl ? (
              <>
                <p className="text-[#3D3D3D] mb-2 leading-relaxed text-sm">
                  Sie werden gleich zu Ihrer persönlichen Pflegekraft-Auswahl weitergeleitet
                  {redirectCountdown != null && redirectCountdown > 0 && (
                    <> in <span className="font-bold text-[#2D5C2F]">{redirectCountdown}</span>…</>
                  )}
                </p>
                <p className="text-xs text-[#8B8B8B] mb-7 leading-relaxed">
                  Eine Bestätigungs-E-Mail mit Ihrem persönlichen Portal-Link ist unterwegs — der Link bleibt 14 Tage aktiv.
                </p>
                <a
                  href={portalUrl}
                  className="block w-full h-12 leading-[3rem] bg-gradient-to-r from-[#2D5C2F] to-[#1F4421] text-white rounded-xl text-base font-bold hover:shadow-lg transition-all"
                >
                  Pflegekraft jetzt finden →
                </a>
                <button
                  onClick={() => router.push('/')}
                  className="mt-3 text-xs text-[#8B8B8B] hover:text-[#5A5A5A] transition-colors"
                >
                  Zurück zur Startseite
                </button>
              </>
            ) : (
              <>
                <p className="text-[#3D3D3D] mb-2 leading-relaxed text-sm">
                  Ihre Anfrage wurde erfolgreich übermittelt.
                </p>
                <p className="text-xs text-[#8B8B8B] mb-7 leading-relaxed">
                  Sie erhalten in Kürze eine E-Mail mit Ihrem persönlichen Angebot und allen Details zu Ihrer Kalkulation.
                </p>
                <button
                  onClick={() => router.push('/')}
                  className="w-full h-12 bg-gradient-to-r from-[#2D5C2F] to-[#1F4421] text-white rounded-xl text-base font-bold hover:shadow-lg transition-all"
                >
                  Zurück zur Startseite
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F3EF]">
      {/* HEADER */}
      <div className="sticky top-0 z-50 bg-white border-b border-[#E8E4DE] px-5 py-3.5">
        <div className="max-w-[480px] lg:max-w-[1200px] mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/step-2')}
            className="text-[#5A5A5A] text-xl leading-none"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 bg-slate-50 border border-[#708A95]/20 rounded-full px-3.5 py-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700">Angebot wird vorbereitet</span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="text-[#5A5A5A] text-xl leading-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-[480px] lg:max-w-[1200px] mx-auto px-4 pb-32">
        {/* HERO */}
        <div className="text-center pt-10 pb-8">
          <h1 className="text-[28px] md:text-[32px] lg:text-[42px] font-bold text-[#3D3D3D] leading-tight mb-6">
            Eine 24h-Betreuung passt zu Ihrer Situation.
          </h1>

          {/* PREIS IM HERO */}
          <p className="mt-6 text-[15px] md:text-[16px] lg:text-[18px] text-[#5A5A5A] leading-relaxed">
            Auf Basis Ihrer Angaben liegt der monatliche Eigenanteil meist zwischen{' '}
            <span className="font-bold text-[#3D3D3D]">
              {priceMin.toLocaleString('de-DE')} € – {priceMax.toLocaleString('de-DE')} €
            </span>
            . Der genaue Preis wird im persönlichen Angebot berechnet.
          </p>
        </div>

        {/* KONTAKTFORMULAR */}
        <form onSubmit={handleSubmit}>
          <div id="kontakt" className="bg-white rounded-3xl shadow-xl border border-[#E5E3DF] p-6 md:p-8 mb-5">
            {/* FORMULAR-HEADER */}
            <div className="text-center mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-[#3D3D3D]">
                Finalen Preis inkl. Zuschüsse kostenlos anfordern
              </h2>
            </div>

            {/* FORMULARFELDER */}
            <div className="space-y-4 max-w-md mx-auto">
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-[#3D3D3D] mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#8B7355]" />
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={`w-full border-2 rounded-xl px-4 py-3 text-base text-[#3D3D3D] outline-none transition-colors ${
                    errors.name
                      ? 'border-red-300 focus:border-red-400'
                      : 'border-[#E5E3DF] focus:border-[#8B7355]'
                  }`}
                  placeholder="Max Mustermann"
                />
                {errors.name && (
                  <p className="text-xs text-red-600 mt-1.5">{errors.name}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-[#3D3D3D] mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#8B7355]" />
                  E-Mail *
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className={`w-full border-2 rounded-xl px-4 py-3 text-base text-[#3D3D3D] outline-none transition-colors ${
                    errors.email
                      ? 'border-red-300 focus:border-red-400'
                      : 'border-[#E5E3DF] focus:border-[#8B7355]'
                  }`}
                  placeholder="max@beispiel.de"
                />
                {errors.email && (
                  <p className="text-xs text-red-600 mt-1.5">{errors.email}</p>
                )}
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label htmlFor="phone" className="text-sm font-semibold text-[#3D3D3D] flex items-center gap-2">
                    <Phone className="w-4 h-4 text-[#8B7355]" />
                    Telefonnummer
                  </label>
                  <span className="text-xs text-[#8B8B8B]">optional</span>
                </div>
                <input
                  ref={phoneRef}
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full border-2 border-[#E5E3DF] rounded-xl px-4 py-3 text-base text-[#3D3D3D] outline-none focus:border-[#8B7355] transition-colors"
                  placeholder="+49 123 456789"
                />
              </div>

              <div className="flex gap-3 items-start pt-2">
                <input
                  type="checkbox"
                  id="consent"
                  checked={formData.acceptPrivacy}
                  onChange={(e) => setFormData({ ...formData, acceptPrivacy: e.target.checked })}
                  className="w-5 h-5 border-2 border-[#E5E3DF] rounded flex-shrink-0 mt-0.5 cursor-pointer accent-[#2D5A27]"
                />
                <label htmlFor="consent" className="text-xs text-[#8B8B8B] leading-relaxed cursor-pointer">
                  Ich akzeptiere die <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="text-[#8B7355] underline font-medium hover:text-[#6d5940]">Datenschutzerklärung</a> und bin damit einverstanden, dass Primundus meine Daten zur Bearbeitung meiner Anfrage verarbeitet. *
                </label>
              </div>
              {errors.acceptPrivacy && (
                <p className="text-xs text-red-600">{errors.acceptPrivacy}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !formData.acceptPrivacy}
                className="w-full h-14 bg-gradient-to-r from-[#2D5C2F] to-[#1F4421] text-white rounded-xl text-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all mt-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {isSubmitting ? 'Wird gesendet...' : 'Finalen Preis anfordern'}
                {!isSubmitting && <ArrowRight className="w-5 h-5" />}
              </button>
              <p className="text-center text-sm text-[#8B8B8B] mt-3">
                Kostenlos & unverbindlich.
              </p>
            </div>
          </div>
        </form>

        {/* TRUST BOX - Bekannt aus & USPs */}
        <div className="bg-white rounded-3xl border border-[#E5E3DF] p-6 mb-5 shadow-sm">
          {/* Media Logos Carousel */}
          <div className="mb-6 pb-6 border-b border-[#E5E3DF]">
            <p className="text-[11px] font-semibold text-[#8B8B8B] uppercase tracking-[0.08em] text-center mb-5">Bekannt aus</p>
            <div className="relative overflow-hidden">
              <div className="flex animate-scroll">
                <div className="flex items-center gap-8 shrink-0">
                  <img src="/images/media/ard.webp" alt="ARD" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/ndr.webp" alt="NDR" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/sat1.webp" alt="SAT.1" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/die-welt.webp" alt="Die Welt" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                </div>
                <div className="flex items-center gap-8 shrink-0 ml-8">
                  <img src="/images/media/ard.webp" alt="ARD" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/ndr.webp" alt="NDR" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/sat1.webp" alt="SAT.1" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/die-welt.webp" alt="Die Welt" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                  <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" className="h-[20px] object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                </div>
              </div>
            </div>
          </div>

          {/* USPs with SVG Icons */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">Persönlicher Ansprechpartner 7 Tage/Woche</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">Täglich kündbar & taggenaue Abrechnung</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">Betreuung startklar in 4–7 Werktagen</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                <svg className="w-[18px] h-[18px] text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <p className="text-[15px] text-[#3D3D3D] font-semibold text-left">20+ Jahre Erfahrung & 6× Testsieger</p>
            </div>
          </div>
        </div>

        {/* PFLEGEHEIM VERGLEICH */}
        <details className="bg-slate-50 rounded-xl border border-[#E5E3DF] mb-4">
          <summary className="px-5 py-4 cursor-pointer text-base font-semibold text-[#3D3D3D] list-none flex items-center justify-between">
            Zum Vergleich: Pflegeheim
            <span className="text-[#8B8B8B]">▼</span>
          </summary>
          <div className="px-5 pb-4 border-t border-[#E5E3DF] pt-4">
            <p className="text-sm text-[#5D5D5D] leading-relaxed mb-3">
              Pflegeheim-Eigenanteile liegen häufig zwischen <strong className="text-[#3D3D3D]">3.500 € und 4.500 € monatlich</strong>.
            </p>
            <div className="bg-white border border-[#E5E3DF] rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-[#3D3D3D]">
                Kostenvorteil: mindestens {formatEuro(Math.max(0, 3500 - priceMax))} monatlich
              </span>
            </div>
          </div>
        </details>

        {/* SO GEHT ES WEITER */}
        <div className="bg-white rounded-3xl shadow-md border border-[#E5E3DF] p-6 mb-4">
          <h3 className="text-xl md:text-2xl font-bold text-[#3D3D3D] mb-5 text-center">
            So geht es jetzt weiter
          </h3>
          <div className="space-y-4">
            {[
              'Sie fordern Ihr verbindliches Angebot an.',
              'Wir prüfen verfügbares Personal und übermitteln Ihnen das konkrete Angebot.',
              'Nach Ihrer Entscheidung organisieren wir die Betreuung.'
            ].map((text, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#708A95] text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
                  {i + 1}
                </div>
                <div className="text-[15px] text-[#3D3D3D] leading-relaxed pt-1">{text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* KONTAKTPERSON */}
        <div className="bg-gradient-to-br from-[#F8F7F5] to-white rounded-xl p-6 border border-[#E5E3DF] shadow-sm hover:shadow-md transition-shadow duration-200 mb-3">
          <h3 className="text-center text-lg md:text-xl font-bold text-[#3D3D3D] mb-4">Kann ich helfen?</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#A89279]">
              <Image
                src="/images/marta-kapcio.jpg"
                alt="Marta Kapcio"
                width={96}
                height={96}
                className="object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#3D3D3D] text-lg md:text-xl mb-2">Marta Kapcio</p>
              <a
                href="tel:+4989200000830"
                className="inline-flex items-center gap-2 text-[#708A95] hover:text-[#62808A] transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-[#708A95] group-hover:bg-[#62808A] flex items-center justify-center transition-colors">
                  <Phone className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg md:text-xl">089 200 000 830</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* STICKY CTA */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E3DF] shadow-2xl z-40 transition-transform duration-300 ${
          stickyVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="max-w-[480px] mx-auto px-4 py-4 pb-6">
          <button
            onClick={scrollToForm}
            className="w-full h-12 bg-gradient-to-r from-[#2D5C2F] to-[#1F4421] text-white rounded-xl text-base font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            Finalen Preis jetzt erhalten
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-center text-sm text-[#8B8B8B] mt-2">
            100% kostenfrei & unverbindlich – täglich kündbar
          </p>
        </div>
      </div>
    </div>
  );
}
