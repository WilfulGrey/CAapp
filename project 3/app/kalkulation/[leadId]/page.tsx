'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { format, addDays } from 'date-fns';
import { Download, Loader as Loader2, Phone, ArrowRight, Shield, Clock, FileText, CircleCheck as CheckCircle2, Bed, Utensils, Chrome as Home, Handshake, Users, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

export default function KalkulationPage() {
  const params = useParams();
  const router = useRouter();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data: leadData } = await supabase.from('leads').select('*').eq('id', params.leadId).maybeSingle();
      if (leadData) setLead(leadData);
      setLoading(false);
    }
    loadData();
  }, [params.leadId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B5A184]" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Keine Daten gefunden</p>
      </div>
    );
  }

  const kalk = lead.kalkulation || {};
  const formData = kalk.formData || kalk.formularDaten || {};
  const zuschuesseItems = kalk.zuschüsse?.items || [];
  const pflegegeld = zuschuesseItems.find((z: any) => z.name === 'pflegegeld')?.betrag_monatlich || 0;
  const entlastungsbudget = zuschuesseItems.find((z: any) => z.name === 'entlastungsbudget_neu')?.betrag_monatlich || 0;
  const steuervorteil = zuschuesseItems.find((z: any) => z.name === 'steuervorteil')?.betrag_monatlich || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const bruttopreis = kalk.bruttopreis || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);

  const createdDate = format(new Date(), 'dd.MM.yyyy');
  const validUntilDate = format(addDays(new Date(), 30), 'dd.MM.yyyy');

  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const anredeText = (lead as any).anrede_text || lead.anrede || '';
  const nachname = lead.nachname || '';
  const vorname = lead.vorname || '';

  let greeting = 'Sehr geehrte Damen und Herren';
  if (anredeText === 'Frau' && nachname) greeting = `Sehr geehrte Frau ${cap(nachname)}`;
  else if (anredeText === 'Frau' && vorname) greeting = `Sehr geehrte Frau ${cap(vorname)}`;
  else if (anredeText === 'Herr' && nachname) greeting = `Sehr geehrter Herr ${cap(nachname)}`;
  else if (anredeText === 'Herr' && vorname) greeting = `Sehr geehrter Herr ${cap(vorname)}`;
  else if (anredeText === 'Familie' && nachname) greeting = `Sehr geehrte Familie ${cap(nachname)}`;
  else if (anredeText === 'Familie' && vorname) greeting = `Sehr geehrte Familie ${cap(vorname)}`;
  else if (vorname && nachname) greeting = `Guten Tag ${cap(vorname)} ${cap(nachname)}`;
  else if (vorname) greeting = `Guten Tag ${cap(vorname)}`;

  const mobilityText = formData.mobilitaet === 'mobil' ? 'Mobil' : formData.mobilitaet === 'eingeschraenkt' ? 'Eingeschränkt mobil' : formData.mobilitaet === 'bettlaegerig' ? 'Bettlägerig' : '–';
  const nachteinsaetzeText = formData.nachteinsaetze === 'regelmaessig' ? 'Regelmäßig' : formData.nachteinsaetze === 'gelegentlich' ? 'Gelegentlich' : formData.nachteinsaetze === 'mehrmals' ? 'Mehrmals wöchentlich' : formData.nachteinsaetze === 'nie' ? 'Nein' : '–';
  const deutschText = formData.deutschkenntnisse === 'grundlegend' ? 'Grundlegend' : formData.deutschkenntnisse === 'gut' ? 'Gut' : formData.deutschkenntnisse === 'fliessend' ? 'Fließend' : '–';
  const fuehrerscheinText = formData.fuehrerschein === 'ja' ? 'Ja' : formData.fuehrerschein === 'nein' ? 'Nein' : formData.fuehrerschein === 'egal' ? 'Egal' : '–';
  const geschlechtText = formData.geschlecht === 'weiblich' ? 'Weiblich' : formData.geschlecht === 'maennlich' ? 'Männlich' : formData.geschlecht === 'egal' ? 'Egal' : '–';
  const personenText = formData.anzahlPersonen === '2' ? '2 Personen' : '1 Person';

  // Hand off to the CA app (kundenportal) via the lead's magic-link token.
  // Falls back to a friendly inline message when NEXT_PUBLIC_PORTAL_URL
  // isn't configured (dev safety net) or the lead has no token (very early
  // info_requested stage). Token may be missing only if the customer
  // somehow opens this page before the angebot-anfordern flow ran — in
  // practice every kalkulation/[leadId] visit comes after that step.
  const handleStartBetreuung = () => {
    const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL ?? '';
    const token = (lead as { token?: string | null } | null)?.token ?? null;
    if (!portalBase || !token) {
      console.warn('Portal handoff unavailable — missing NEXT_PUBLIC_PORTAL_URL or lead.token');
      alert('Der Portal-Link ist gerade nicht verfügbar. Bitte kontaktieren Sie uns telefonisch unter +49 89 200 000 830.');
      return;
    }
    const portalUrl = `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(token)}`;
    window.location.assign(portalUrl);
  };
  const handlePrint = () => window.open(`/api/pdf/kalkulation/${params.leadId}`, '_blank');

  const sec = "bg-white rounded-2xl shadow-sm border border-gray-200 mb-3 overflow-hidden";
  const secHd = "flex items-center gap-3 px-6 py-4 border-b border-gray-100";
  const secNum = "w-7 h-7 rounded-full bg-[#B5A184] text-white text-xs font-semibold flex items-center justify-content center flex-shrink-0 flex items-center justify-center";

  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 pb-20">

        {/* LETTERHEAD */}
        <div className={sec}>
          <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[#B5A184]">
            <Image src="/images/primundus_logo_header.webp" alt="Primundus" width={160} height={45} className="h-8 w-auto object-contain" />
            <div className="flex items-center gap-3">
              <Image src="/images/ilka-wysocki_pm-mallorca.webp" alt="Ilka Wysocki" width={34} height={34} className="w-9 h-9 rounded-full object-cover object-top border border-[#F0997B] hidden sm:block flex-shrink-0" />
              <div className="flex flex-col items-end">
                <a href="tel:08920000830" className="flex items-center gap-1 text-[#8B6914] text-sm font-semibold">
                  <Phone className="w-3 h-3" /> 089 200 000 830
                </a>
                <span className="text-xs text-[#B5A184]">Ilka Wysocki · Mo–So 8–18 Uhr</span>
              </div>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="flex justify-between items-start mb-5">
              <div className="text-sm text-gray-600 leading-relaxed">
                <div className="font-semibold text-gray-900">{[anredeText, cap(vorname), cap(nachname)].filter(Boolean).join(' ')}</div>
                {lead.email && <div>{lead.email}</div>}
              </div>
              <div className="text-right text-xs text-gray-500">
                <div>Angebotsdatum: {createdDate}</div>
                <div className="text-[#B5A184] font-semibold">Gültig bis: {validUntilDate}</div>
              </div>
            </div>
            <h1 className="text-base font-semibold text-[#2D1F0F] border-b border-gray-100 pb-4 mb-4">
              Ihr persönliches Angebot – 24-Stunden-Betreuung zu Hause
            </h1>
            <div className="text-sm text-gray-600 leading-relaxed space-y-2">
              <p>{greeting},</p>
              <p>vielen Dank für Ihre Anfrage. Gerne können wir die Betreuung übernehmen. Da unsere Betreuungskräfte direkt angestellt sind, kann die Betreuung bereits <strong className="text-gray-900">innerhalb von 4–7 Werktagen</strong> beginnen.</p>
              <p>Unser nachfolgendes Angebot ist auf Ihre individuelle Situation zugeschnitten.</p>
              <p className="pt-1">Ihre Ilka Wysocki</p>
            </div>
          </div>
        </div>

        {/* MEDIA LOGOS */}
        <div className={sec}>
          <div className="px-6 py-3 flex flex-wrap gap-3 items-center justify-center">
            <Image src="/images/media/die-welt.webp" alt="Die Welt" width={55} height={22} className="h-5 w-auto object-contain opacity-60" />
            <Image src="/images/media/bild-der-frau.webp" alt="Bild" width={40} height={22} className="h-5 w-auto object-contain opacity-60" />
            <Image src="/images/media/frankfurter-allgemeine.webp" alt="FAZ" width={80} height={22} className="h-5 w-auto object-contain opacity-60" />
            <Image src="/images/media/ard.webp" alt="ARD" width={40} height={22} className="h-5 w-auto object-contain opacity-60" />
            <Image src="/images/media/ndr.webp" alt="NDR" width={40} height={22} className="h-5 w-auto object-contain opacity-60" />
            <Image src="/images/media/sat1.webp" alt="SAT.1" width={40} height={22} className="h-5 w-auto object-contain opacity-60" />
          </div>
        </div>

        {/* 1. KOSTEN */}
        <div className={sec}>
          <div className={secHd}>
            <div className="w-[22px] h-[22px] rounded-full bg-[#B5A184] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">1</div>
            <h2 className="text-sm font-semibold text-[#2D1F0F]">Kosten</h2>
          </div>
          <div className="px-6 py-5">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Monatssatz für die 24-Stunden-Betreuung</div>
            <div className="text-2xl font-semibold text-[#2D1F0F] mb-1">{formatEuro(bruttopreis)}</div>
            <div className="text-sm text-gray-500 mb-5">Inkl. aller Steuern, Gebühren und Sozialabgaben</div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Zzgl. Anreisepauschale</div>
                <div className="text-sm font-semibold text-[#2D1F0F]">125 € pro Strecke</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Zzgl. Kost & Logis</div>
                <div className="text-sm font-semibold text-[#2D1F0F]">Eigenes Zimmer + Verpflegung</div>
              </div>
            </div>
            {gesamteZuschuesse > 0 && (
              <div className="bg-[#EEF6F0] border border-[#B8DEC8] rounded-lg p-4 mb-4">
                <div className="text-xs font-semibold text-[#2D6A4F] uppercase tracking-wide mb-3">Mögliche Zuschüsse der Pflegekasse</div>
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Pflegegeld (Pflegegrad {formData.pflegegrad || 0})</span>
                    <span className="font-semibold text-[#1E5C3A]">– {formatEuro(pflegegeld)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Entlastungsbudget (anteilig mtl.)</span>
                    <span className="font-semibold text-[#1E5C3A]">– {formatEuro(entlastungsbudget)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Steuervorteil § 35a EStG</span>
                    <span className="font-semibold text-[#1E5C3A]">– {formatEuro(steuervorteil)}</span>
                  </div>
                </div>
                <div className="border-t border-[#B8DEC8] pt-2 flex justify-between font-semibold text-sm">
                  <span className="text-gray-700">Möglicher Eigenanteil</span>
                  <span className="text-[#1E5C3A]">ab {formatEuro(eigenanteil)}/Monat</span>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 leading-relaxed">Der Bruttopreis ist die vertraglich maßgebliche Vergütung. Zuschüsse sind individuell nutzbar und abhängig von Ihrer persönlichen Situation.</p>
          </div>
          {/* Stats */}
          <div className="px-6 py-3 border-t border-gray-100 bg-[#F9F7F4] flex items-center justify-center gap-5 flex-wrap">
            {[
              [Users, '20+ Jahre Erfahrung'],
              [Award, '60.000+ Einsätze'],
              [Shield, 'Bestpreis-Garantie'],
            ].map(([Icon, label]: any) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-[#7A5C2E] font-semibold">
                <Icon className="w-3.5 h-3.5 text-[#B5A184]" />{label}
              </div>
            ))}
          </div>
        </div>

        {/* 2. KONDITIONEN */}
        <div className={sec}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-[22px] h-[22px] rounded-full bg-[#B5A184] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">2</div>
            <h2 className="text-sm font-semibold text-[#2D1F0F]">Unsere Konditionen</h2>
            <span className="ml-auto text-xs font-semibold text-[#2D6A4F] bg-[#E8F5E9] px-2 py-1 rounded-full whitespace-nowrap hidden sm:inline">100% Sorgenfrei und ohne Risiko</span>
            <span className="ml-auto text-xs font-semibold text-[#2D6A4F] bg-[#E8F5E9] px-2 py-1 rounded-full whitespace-nowrap sm:hidden">100% Sorgenfrei</span>
          </div>
          <div className="px-6 py-4 space-y-4">
            {[
              [Shield, 'Keine Vertragsbindung', 'Täglich kündbar – maximale Flexibilität für Sie'],
              [FileText, 'Tagesgenaue Abrechnung', 'Kosten entstehen erst mit Anreise der Betreuungskraft'],
              [Clock, 'Kosten erst bei Start – keine Vorauszahlung', 'Sie zahlen nur, wenn die Betreuungskraft vor Ort arbeitet'],
              [Users, 'Persönlicher Ansprechpartner', '7 Tage die Woche für Sie da'],
            ].map(([Icon, title, sub]: any) => (
              <div key={title} className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#B5A184]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#2D1F0F]">{title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>
          {/* Testsieger */}
          <div className="flex gap-4 items-start px-6 py-4 border-t border-gray-100">
            <Image src="/images/primundus_testsieger-2021.webp" alt="Testsieger" width={60} height={72} className="h-16 w-auto object-contain border border-[#e8d9a0] rounded flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-[#2D1F0F] mb-1">Testsieger bei DIE WELT</div>
              <div className="text-xs text-gray-500 italic leading-relaxed">„Primundus überzeugte mit der besten Kombination aus Preis, Qualität und Kundenservice."</div>
            </div>
          </div>
        </div>

        {/* 3. WIE GEHT ES WEITER */}
        <div className={sec}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-[22px] h-[22px] rounded-full bg-[#B5A184] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">3</div>
            <h2 className="text-sm font-semibold text-[#2D1F0F]">Wie geht es weiter?</h2>
          </div>
          <div className="px-6 py-5 space-y-5">
            {[
              ['1', 'Beauftragung', 'Ihre Bestätigung genügt – wir klären offene Fragen und bereiten alles vor.'],
              ['2', 'Auswahl Ihrer Pflegekraft', 'Sie erhalten passende Profile mit Foto, Erfahrung und Verfügbarkeit. Sie entscheiden.'],
              ['3', 'Anreise & Betreuungsbeginn', 'Wir organisieren Vertrag und Anreisetermin. Start in 4–7 Werktagen möglich.'],
              ['✓', 'Laufende Betreuung', 'Nach ca. 60 Tagen Wechsel der Betreuungskraft. Ihr Ansprechpartner begleitet Sie dauerhaft.'],
            ].map(([num, title, desc], i) => (
              <div key={title} className="flex gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${num === '✓' ? 'bg-[#2D6A4F] text-white' : 'border-2 border-[#B5A184] text-[#8B6914]'}`}>{num}</div>
                <div>
                  <div className="text-sm font-semibold text-[#2D1F0F]">{title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 pb-5">
            <Button onClick={handleStartBetreuung} className="w-full bg-[#2A9D5C] hover:bg-[#239050] text-white font-semibold text-base py-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[.97]">
              Pflegekraft jetzt finden <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
          <div className="px-6 pb-4 flex items-center justify-center gap-2 flex-wrap">
            {[
              [CheckCircle2, '100% Sorgenfrei'],
              [Shield, 'Täglich kündbar'],
              [FileText, 'Tagesgenaue Abrechnung'],
            ].map(([Icon, label]: any) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-[#2D6A4F] font-semibold">
                <Icon className="w-3 h-3" />{label}
              </div>
            ))}
          </div>
        </div>

        {/* ILKA BOX */}
        <div className="bg-[#FFF8F6] rounded-2xl border border-[#F0C4B4] overflow-hidden shadow-sm mb-3">
          <div className="flex gap-4 p-5 items-start">
            <Image src="/images/ilka-wysocki_pm-mallorca.webp" alt="Ilka Wysocki" width={56} height={56} className="w-14 h-14 rounded-full object-cover object-top border-2 border-[#F0997B] flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-[#2D1F0F]">Ilka Wysocki</div>
              <div className="text-xs text-gray-400 mb-2">Ihre persönliche Beraterin · Mo–So, 8:00–20:00 Uhr</div>
              <div className="text-sm font-semibold text-[#2D1F0F] mb-1">Noch offene Fragen?</div>
              <div className="text-xs text-gray-600 leading-relaxed mb-3">Ich begleite Sie persönlich durch den gesamten Prozess – von der Auswahl der passenden Pflegekraft bis zum Start der Betreuung.</div>
              <div className="flex gap-2 flex-wrap">
                <a href="tel:08920000830" className="inline-flex items-center gap-1.5 h-10 px-4 bg-white text-[#2D1F0F] border border-gray-200 rounded-lg text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[.97]">
                  <Phone className="w-3.5 h-3.5" />
                  <span className="sm:hidden">Jetzt anrufen</span>
                  <span className="hidden sm:inline">089 200 000 830</span>
                </a>
                <Button onClick={handleStartBetreuung} className="h-10 px-4 bg-[#2A9D5C] hover:bg-[#239050] text-white text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[.97]">
                  Zum Portal <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
          <div className="border-t border-[#F0C4B4] px-5 py-3 bg-[#FFF3EE] flex items-center justify-center gap-3 flex-wrap">
            <Image src="/images/primundus_testsieger-2021.webp" alt="Testsieger" width={30} height={30} className="h-8 w-auto" />
            <div className="w-px h-4 bg-[#F0C4B4]" />
            {[
              [Users, '20+ Jahre Erfahrung'],
              [Award, '60.000+ Einsätze'],
              [Shield, 'Bestpreis-Garantie'],
            ].map(([Icon, label]: any, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#7A4030] font-semibold">
                  <Icon className="w-3 h-3 text-[#E76F63]" />{label}
                </div>
                {i < 2 && <div className="w-px h-4 bg-[#F0C4B4]" />}
              </div>
            ))}
          </div>
        </div>

        {/* VORAUSSETZUNGEN */}
        <div className={sec}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-[22px] h-[22px] rounded-full bg-[#C8BFB0] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">i</div>
            <h2 className="text-sm font-semibold text-[#2D1F0F]">Voraussetzungen für die Betreuung zu Hause</h2>
          </div>
          <div className="px-6 py-4 grid grid-cols-2 gap-3">
            {[
              [Bed, 'Eigenes Zimmer für die Betreuungskraft'],
              [Utensils, 'Freie Kost und Logis'],
              [Home, 'Mitnutzung von Bad und Küche'],
              [Handshake, 'Offenheit für das vertrauensvolle Zusammenleben'],
            ].map(([Icon, label]: any) => (
              <div key={label} className="flex items-center gap-2 text-sm text-gray-600">
                <Icon className="w-4 h-4 text-[#B5A184] flex-shrink-0" />{label}
              </div>
            ))}
          </div>
        </div>

        {/* LEISTUNGSDETAILS – dezent */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-300 mb-2">Angebot basiert auf Ihren Angaben</div>
          <div className="flex flex-wrap gap-1.5">
            {[
              `Pflegegrad ${formData.pflegegrad || '–'}`,
              personenText,
              mobilityText !== '–' ? mobilityText : null,
              nachteinsaetzeText !== '–' ? (nachteinsaetzeText === 'Nein' ? 'Keine Nachteinsätze' : nachteinsaetzeText) : null,
              deutschText !== '–' ? deutschText + ' Deutsch' : null,
              fuehrerscheinText === 'Nein' ? 'Kein Führerschein' : fuehrerscheinText === 'Ja' ? 'Führerschein' : null,
              geschlechtText !== '–' ? 'Geschlecht ' + geschlechtText : null,
            ].filter(Boolean).map((tag: any) => (
              <span key={tag} className="text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-gray-400">{tag}</span>
            ))}
          </div>
        </div>

        {/* PDF */}
        <div className="text-center pt-1 pb-4 hidden sm:block">
          <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 text-gray-400">
            <Download className="w-4 h-4" /> Als PDF herunterladen
          </Button>
        </div>

        {/* STICKY PDF on mobile */}
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur border-t border-gray-200 sm:hidden z-10">
          <button onClick={handlePrint} className="w-full h-11 bg-[#2D1F0F] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Als PDF herunterladen
          </button>
        </div>

      </div>
    </div>
  );
}