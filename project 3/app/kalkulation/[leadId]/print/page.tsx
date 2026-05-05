'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { format, addDays } from 'date-fns';
import { Loader as Loader2 } from 'lucide-react';
import Image from 'next/image';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

export default function KalkulationPrintPage() {
  const params = useParams();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data } = await supabase.from('leads').select('*').eq('id', params.leadId).maybeSingle();
      if (data) setLead(data);
      setLoading(false);
    }
    loadData();
  }, [params.leadId]);

  useEffect(() => {
    if (!loading && lead) setTimeout(() => window.print(), 600);
  }, [loading, lead]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Loader2 style={{ width: 32, height: 32, color: '#B5A184' }} /></div>;
  if (!lead) return null;

  const kalk = lead.kalkulation || {};
  const formData = kalk.formData || kalk.formularDaten || {};
  const zuschuesseItems = kalk.zuschüsse?.items || [];
  const pflegegeld = zuschuesseItems.find((z: any) => z.name === 'pflegegeld')?.betrag_monatlich || 0;
  const entlastungsbudget = zuschuesseItems.find((z: any) => z.name === 'entlastungsbudget_neu')?.betrag_monatlich || 0;
  const steuervorteil = zuschuesseItems.find((z: any) => z.name === 'steuervorteil')?.betrag_monatlich || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const bruttopreis = kalk.bruttopreis || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);

  const today = new Date();
  const validUntil = addDays(today, 30);

  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const anredeText = lead.anrede_text || lead.anrede || '';
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
  const nachteinsaetzeText = formData.nachteinsaetze === 'nie' ? 'Nein' : formData.nachteinsaetze === 'gelegentlich' ? 'Gelegentlich' : formData.nachteinsaetze === 'regelmaessig' ? 'Regelmäßig' : '–';
  const deutschText = formData.deutschkenntnisse === 'grundlegend' ? 'Grundlegend' : formData.deutschkenntnisse === 'gut' ? 'Gut' : formData.deutschkenntnisse === 'fliessend' ? 'Fließend' : '–';
  const fuehrerscheinText = formData.fuehrerschein === 'ja' ? 'Ja' : formData.fuehrerschein === 'nein' ? 'Nein' : 'Egal';
  const geschlechtText = formData.geschlecht === 'weiblich' ? 'Weiblich' : formData.geschlecht === 'maennlich' ? 'Männlich' : 'Egal';

  const s: any = {
    page: { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', maxWidth: '170mm', margin: '0 auto', padding: '0', background: '#fff', fontSize: '10pt', color: '#1a1a1a', lineHeight: 1.5 },
    lh: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8pt', borderBottom: '2pt solid #B5A184', marginBottom: '14pt' },
    addrRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '12pt', fontSize: '9pt' },
    h1: { fontSize: '13pt', fontWeight: 700, color: '#2D1F0F', borderBottom: '1pt solid #eee', paddingBottom: '8pt', marginBottom: '10pt' },
    letter: { fontSize: '9.5pt', color: '#444', lineHeight: 1.7, marginBottom: '14pt' },
    section: { border: '1pt solid #e5e0d8', borderRadius: '4pt', overflow: 'hidden', marginBottom: '8pt', pageBreakInside: 'avoid' as const },
    secHd: { display: 'flex', alignItems: 'center', gap: '6pt', padding: '6pt 12pt', background: '#fdfcfa', borderBottom: '1pt solid #f0ece5' },
    secNum: { width: '16pt', height: '16pt', borderRadius: '50%', background: '#B5A184', color: '#fff', fontSize: '8pt', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    secTitle: { fontSize: '10pt', fontWeight: 700, color: '#2D1F0F' },
    secBadge: { marginLeft: 'auto', fontSize: '7.5pt', fontWeight: 700, color: '#2D6A4F', background: '#E8F5E9', padding: '2pt 6pt', borderRadius: '8pt', whiteSpace: 'nowrap' as const },
    body: { padding: '8pt 12pt' },
    kGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6pt', marginBottom: '8pt' },
    kItem: { background: '#F7F5F0', borderRadius: '3pt', padding: '6pt 8pt', border: '1pt solid #EDE9E1' },
    zBox: { background: '#EEF6F0', border: '1pt solid #B8DEC8', borderRadius: '3pt', padding: '7pt 9pt', marginBottom: '6pt' },
    zRow: { display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt', color: '#555', padding: '1.5pt 0' },
    statsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10pt', padding: '6pt 12pt', borderTop: '1pt solid #f0ece5', background: '#F9F7F4' },
    vtItem: { display: 'flex', gap: '7pt', alignItems: 'flex-start', marginBottom: '7pt' },
    vtIcon: { width: '18pt', height: '18pt', borderRadius: '3pt', background: '#F7F5F0', border: '1pt solid #EDE9E1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    step: { display: 'flex', gap: '8pt', marginBottom: '8pt' },
    sNum: { width: '18pt', height: '18pt', borderRadius: '50%', border: '1.5pt solid #B5A184', color: '#8B6914', fontSize: '8pt', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1pt' },
    sNumDone: { width: '18pt', height: '18pt', borderRadius: '50%', background: '#2D6A4F', border: '1.5pt solid #2D6A4F', color: '#fff', fontSize: '9pt', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1pt' },
    hemm: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8pt', padding: '5pt 12pt', borderTop: '1pt solid #f0ece5', flexWrap: 'wrap' as const },
    ilkaBox: { border: '1pt solid #F0C4B4', borderRadius: '4pt', overflow: 'hidden', marginBottom: '8pt', pageBreakInside: 'avoid' as const },
    ilkaInner: { display: 'flex', gap: '10pt', padding: '10pt 12pt', background: '#FFF8F6', alignItems: 'flex-start' },
    ilkaFooter: { display: 'flex', gap: '8pt', flexWrap: 'wrap' as const, alignItems: 'center', justifyContent: 'center', padding: '6pt 12pt', borderTop: '1pt solid #F0C4B4', background: '#FFF3EE' },
    vGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6pt', padding: '8pt 12pt' },
    tagsBox: { border: '1pt solid #e5e0d8', borderRadius: '4pt', padding: '7pt 10pt', marginBottom: '8pt' },
    tag: { display: 'inline-block', fontSize: '7.5pt', background: '#F7F5F0', border: '1pt solid #EDE9E1', borderRadius: '8pt', padding: '1.5pt 6pt', color: '#888', margin: '2pt 2pt 0 0' },
    footer: { display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#bbb', borderTop: '1pt solid #eee', paddingTop: '6pt', marginTop: '10pt' },
  };

  const icon = (path: string) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5A184" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
  const iconGreen = (path: string) => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );

  return (
    <>
      <style>{`
        @page { size: A4; margin: 15mm 14mm; }
        * { print-color-adjust: exact; -webkit-print-color-adjust: exact; box-sizing: border-box; }
        body { margin: 0; background: white; }
        @media print { body { background: white !important; } }
        /* Hide cookie banner in print/PDF */
        .fixed.bottom-0, [class*="CookieConsent"], [id*="cookie"] { display: none !important; }
      `}</style>

      <div style={s.page}>

        {/* LETTERHEAD */}
        <div style={s.lh}>
          <Image src="/images/primundus_logo_header.webp" alt="Primundus" width={140} height={40} style={{ height: '22pt', width: 'auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10pt' }}>
            {/* Testsieger Seal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5pt', paddingRight: '10pt', borderRight: '1pt solid #f0ebe4' }}>
              <Image src="/images/primundus_testsieger-2021.webp" alt="Testsieger" width={28} height={28} style={{ height: '22pt', width: 'auto' }} />
              <div style={{ fontSize: '7pt', lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700, color: '#3D2B1F' }}>Testsieger</div>
                <div style={{ color: '#B5A184', fontWeight: 600 }}>DIE WELT</div>
                <div style={{ color: '#aaa' }}>Preis &amp; Qualität</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '8pt', color: '#888', lineHeight: 1.6 }}>
              <div style={{ color: '#8B6914', fontWeight: 700, fontSize: '9pt' }}>089 200 000 830</div>
              <div>Ilka Wysocki · Mo–So 8–18 Uhr</div>
            </div>
          </div>
        </div>

        {/* ADRESSE */}
        <div style={s.addrRow}>
          <div style={{ color: '#444', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: '#222' }}>{[anredeText, cap(vorname), cap(nachname)].filter(Boolean).join(' ')}</div>
            {lead.email && <div>{lead.email}</div>}
          </div>
          <div style={{ textAlign: 'right', color: '#888', lineHeight: 1.8 }}>
            <div>Angebotsdatum: {format(today, 'dd.MM.yyyy')}</div>
            <div style={{ color: '#B5A184', fontWeight: 600 }}>Gültig bis: {format(validUntil, 'dd.MM.yyyy')}</div>
          </div>
        </div>

        <div style={{ ...s.h1, marginTop: '32pt' }}>Ihr persönliches Angebot – 24-Stunden-Betreuung zu Hause</div>

        <div style={s.letter}>
          <p style={{ marginBottom: '6pt' }}>{greeting},</p>
          <p style={{ marginBottom: '6pt' }}>vielen Dank für Ihre Anfrage. Gerne können wir die Betreuung übernehmen. Da unsere Betreuungskräfte direkt angestellt sind, kann die Betreuung bereits <strong>innerhalb von 4–7 Werktagen</strong> beginnen.</p>
          <p style={{ marginBottom: '6pt' }}>Unser nachfolgendes Angebot ist auf Ihre individuelle Situation zugeschnitten.</p>
          <p>Ihre Ilka Wysocki</p>
        </div>

        {/* MEDIA LOGOS */}
        <div style={{ border: '1pt solid #e5e0d8', borderRadius: '4pt', padding: '8pt 12pt', marginBottom: '8pt', display: 'flex', flexWrap: 'wrap' as const, gap: '10pt', alignItems: 'center', justifyContent: 'center' }}>
          <Image src="/images/media/die-welt.webp" alt="Die Welt" width={55} height={20} style={{ height: '13pt', width: 'auto', opacity: 0.65 }} />
          <Image src="/images/media/bild-der-frau.webp" alt="Bild" width={40} height={20} style={{ height: '13pt', width: 'auto', opacity: 0.65 }} />
          <Image src="/images/media/frankfurter-allgemeine.webp" alt="FAZ" width={80} height={20} style={{ height: '13pt', width: 'auto', opacity: 0.65 }} />
          <Image src="/images/media/ard.webp" alt="ARD" width={40} height={20} style={{ height: '13pt', width: 'auto', opacity: 0.65 }} />
          <Image src="/images/media/ndr.webp" alt="NDR" width={40} height={20} style={{ height: '13pt', width: 'auto', opacity: 0.65 }} />
          <Image src="/images/media/sat1.webp" alt="SAT.1" width={40} height={20} style={{ height: '13pt', width: 'auto', opacity: 0.65 }} />
        </div>

        {/* 1. KOSTEN */}
        <div style={s.section}>
          <div style={s.secHd}><div style={s.secNum}>1</div><div style={s.secTitle}>Kosten</div></div>
          <div style={s.body}>
            <div style={{ fontSize: '8pt', textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: '#999', marginBottom: '3pt' }}>Tagessatz für die 24-Stunden-Betreuung</div>
            <div style={{ fontSize: '20pt', fontWeight: 700, color: '#2D1F0F', marginBottom: '2pt' }}>{formatEuro(Math.round(bruttopreis / 30))}<span style={{ fontSize: '11pt', fontWeight: 400, color: '#888' }}>/Tag</span></div>
            <div style={{ fontSize: '8.5pt', color: '#888', marginBottom: '4pt' }}>Inkl. aller Steuern, Gebühren und Sozialabgaben</div>
            <div style={{ fontSize: '8.5pt', color: '#666', marginBottom: '10pt' }}>Monatssatz gesamt: <strong>{formatEuro(bruttopreis)}</strong></div>
            <div style={s.kGrid}>
              <div style={s.kItem}>
                <div style={{ fontSize: '7.5pt', textTransform: 'uppercase' as const, color: '#999', marginBottom: '2pt' }}>Zzgl. Anreisepauschale</div>
                <div style={{ fontSize: '9.5pt', fontWeight: 600, color: '#2D1F0F' }}>125 € pro Strecke</div>
              </div>
              <div style={s.kItem}>
                <div style={{ fontSize: '7.5pt', textTransform: 'uppercase' as const, color: '#999', marginBottom: '2pt' }}>Zzgl. Kost & Logis</div>
                <div style={{ fontSize: '9.5pt', fontWeight: 600, color: '#2D1F0F' }}>Eigenes Zimmer + Verpflegung</div>
              </div>
            </div>
            <div style={s.zBox}>
              <div style={{ fontSize: '8pt', color: '#2D6A4F', fontWeight: 700, marginBottom: '5pt' }}>Mögliche Zuschüsse der Pflegekasse</div>
              <div style={s.zRow}><span>Pflegegeld (Pflegegrad {formData.pflegegrad || 0})</span><span style={{ color: '#1E5C3A', fontWeight: 600 }}>– {formatEuro(pflegegeld)}</span></div>
              <div style={s.zRow}><span>Entlastungsbudget (anteilig mtl.)</span><span style={{ color: '#1E5C3A', fontWeight: 600 }}>– {formatEuro(entlastungsbudget)}</span></div>
              <div style={s.zRow}><span>Steuervorteil § 35a EStG</span><span style={{ color: '#1E5C3A', fontWeight: 600 }}>– {formatEuro(steuervorteil)}</span></div>
              <div style={{ borderTop: '1pt solid #B8DEC8', margin: '5pt 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5pt', fontWeight: 700 }}>
                <span>Möglicher Eigenanteil</span><span style={{ color: '#1E5C3A' }}>ab {formatEuro(eigenanteil)}/Monat</span>
              </div>
            </div>
            <div style={{ fontSize: '8pt', color: '#aaa', lineHeight: 1.5 }}>Der Bruttopreis ist die vertraglich maßgebliche Vergütung. Zuschüsse sind individuell nutzbar und abhängig von Ihrer persönlichen Situation.</div>
          </div>
          <div style={s.statsRow}>
            {[['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M13 7a4 4 0 11-8 0 4 4 0 018 0z', '20+ Jahre Erfahrung'], ['M12 2a6 6 0 100 12A6 6 0 0012 2zM15.477 12.89L17 22l-5-3-5 3 1.523-9.11', '60.000+ Einsätze'], ['M20 6L9 17l-5-5', 'Täglich kündbar']].map(([path, label], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4pt', fontSize: '8pt', color: '#7A5C2E', fontWeight: 600 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B5A184" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                {label}
                {i < 2 && <span style={{ width: '1pt', height: '10pt', background: '#ddd', display: 'inline-block', marginLeft: '10pt' }} />}
              </div>
            ))}
          </div>
        </div>

        {/* 2. KONDITIONEN */}
        <div style={s.section}>
          <div style={s.secHd}><div style={s.secNum}>2</div><div style={s.secTitle}>Unsere Konditionen</div><div style={s.secBadge}>100% Sorgenfrei und ohne Risiko</div></div>
          <div style={s.body}>
            {[
              ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Keine Vertragsbindung', 'Täglich kündbar – maximale Flexibilität'],
              ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8', 'Tagesgenaue Abrechnung', 'Kosten entstehen erst mit Anreise der Betreuungskraft'],
              ['M12 22c0 0 8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Kosten erst bei Start – keine Vorauszahlung', 'Sie zahlen nur, wenn die Betreuungskraft vor Ort arbeitet'],
              ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8z', 'Persönlicher Ansprechpartner', '7 Tage die Woche für Sie da'],
            ].map(([path, title, sub], i) => (
              <div key={i} style={{ ...s.vtItem, marginBottom: i < 3 ? '7pt' : '0' }}>
                <div style={s.vtIcon}>{icon(path)}</div>
                <div><div style={{ fontSize: '9.5pt', fontWeight: 600, color: '#2D1F0F', marginBottom: '1pt' }}>{title}</div><div style={{ fontSize: '8.5pt', color: '#777' }}>{sub}</div></div>
              </div>
            ))}
          </div>
          {/* Testsieger */}
          <div style={{ display: 'flex', gap: '10pt', alignItems: 'flex-start', padding: '8pt 12pt', borderTop: '1pt solid #f0ece5', background: '#fff' }}>
            <Image src="/images/primundus_testsieger-2021.webp" alt="Testsieger" width={52} height={52} style={{ height: '40pt', width: 'auto', border: '1pt solid #e8d9a0', borderRadius: '3pt', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '10pt', fontWeight: 700, color: '#2D1F0F', marginBottom: '3pt' }}>Testsieger bei DIE WELT</div>
              <div style={{ fontSize: '8.5pt', color: '#555', fontStyle: 'italic', lineHeight: 1.5 }}>„Primundus überzeugte mit der besten Kombination aus Preis, Qualität und Kundenservice."</div>
            </div>
          </div>
        </div>

        {/* 3. ABLAUF */}
        <div style={s.section}>
          <div style={s.secHd}><div style={s.secNum}>3</div><div style={s.secTitle}>Wie geht es weiter?</div></div>
          <div style={s.body}>
            {[
              ['1', 'Beauftragung', 'Ihre Bestätigung genügt – wir klären offene Fragen und bereiten alles vor.'],
              ['2', 'Auswahl Ihrer Pflegekraft', 'Sie erhalten passende Profile mit Foto, Erfahrung und Verfügbarkeit. Sie entscheiden.'],
              ['3', 'Anreise & Betreuungsbeginn', 'Wir organisieren Vertrag und Anreisetermin. Start in 4–7 Werktagen möglich.'],
              ['✓', 'Laufende Betreuung', 'Nach ca. 60 Tagen Wechsel der Betreuungskraft. Ihr Ansprechpartner begleitet Sie dauerhaft.'],
            ].map(([num, title, desc], i) => (
              <div key={i} style={{ ...s.step, marginBottom: i < 3 ? '8pt' : '0' }}>
                <div style={num === '✓' ? s.sNumDone : s.sNum}>{num}</div>
                <div><div style={{ fontSize: '9.5pt', fontWeight: 600, color: '#2D1F0F', marginBottom: '1pt' }}>{title}</div><div style={{ fontSize: '8.5pt', color: '#777', lineHeight: 1.4 }}>{desc}</div></div>
              </div>
            ))}
          </div>
          <div style={s.hemm}>
            {[['M20 6L9 17l-5-5', '100% Sorgenfrei'], ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Täglich kündbar'], ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'Tagesgenaue Abrechnung']].map(([path, label], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12pt' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3pt', fontSize: '8pt', color: '#2D6A4F', fontWeight: 600 }}>
                  {iconGreen(path)}{label}
                </div>
                {i < 2 && <span style={{ color: '#ccc', fontSize: '9pt' }}>·</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ILKA */}
        <div style={s.ilkaBox}>
          <div style={s.ilkaInner}>
            <Image src="/images/ilka-wysocki_pm-mallorca.webp" alt="Ilka Wysocki" width={44} height={44} style={{ width: '34pt', height: '34pt', borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', border: '1.5pt solid #F0997B', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '10pt', fontWeight: 700, color: '#2D1F0F', marginBottom: '1pt' }}>Ilka Wysocki</div>
              <div style={{ fontSize: '8pt', color: '#aaa', marginBottom: '5pt' }}>Ihre persönliche Beraterin · Mo–So, 8:00–20:00 Uhr</div>
              <div style={{ fontSize: '9pt', fontWeight: 600, color: '#2D1F0F', marginBottom: '3pt' }}>Noch offene Fragen?</div>
              <div style={{ fontSize: '8.5pt', color: '#666', lineHeight: 1.5, marginBottom: '5pt' }}>Ich begleite Sie persönlich durch den gesamten Prozess – von der Auswahl der passenden Pflegekraft bis zum Start der Betreuung.</div>
              <div style={{ fontSize: '10pt', fontWeight: 700, color: '#E76F63' }}>089 200 000 830</div>
            </div>
          </div>
          <div style={s.ilkaFooter}>
            <Image src="/images/primundus_testsieger-2021.webp" alt="Testsieger" width={28} height={28} style={{ height: '22pt', width: 'auto' }} />
            <span style={{ width: '1pt', height: '14pt', background: '#F0C4B4', display: 'inline-block' }} />
            {[['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8z', '20+ Jahre Erfahrung'], ['M12 2a6 6 0 100 12A6 6 0 0012 2z', '60.000+ Einsätze'], ['M20 6L9 17l-5-5', 'Täglich kündbar']].map(([path, label], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10pt' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3pt', fontSize: '8pt', color: '#7A4030', fontWeight: 600 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#E76F63" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                  {label}
                </div>
                {i < 2 && <span style={{ width: '1pt', height: '12pt', background: '#F0C4B4', display: 'inline-block' }} />}
              </div>
            ))}
          </div>
        </div>

        {/* VORAUSSETZUNGEN */}
        <div style={s.section}>
          <div style={s.secHd}><div style={{ ...s.secNum, background: '#C8BFB0' }}>i</div><div style={s.secTitle}>Voraussetzungen für die Betreuung zu Hause</div></div>
          <div style={s.vGrid}>
            {[['M2 7h20a2 2 0 012 2v10a2 2 0 01-2 2H2a2 2 0 01-2-2V9a2 2 0 012-2z', 'Eigenes Zimmer für die Betreuungskraft'], ['M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z', 'Freie Kost und Logis'], ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'Mitnutzung von Bad und Küche'], ['M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', 'Offenheit für das vertrauensvolle Zusammenleben']].map(([path, label], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5pt', fontSize: '8.5pt', color: '#555' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5A184" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div style={s.footer}>
          <span>PRIMUNDUS Deutschland · www.primundus.de</span>
          <span>Angebot gültig bis {format(validUntil, 'dd.MM.yyyy')}</span>
        </div>

      </div>
    </>
  );
}
