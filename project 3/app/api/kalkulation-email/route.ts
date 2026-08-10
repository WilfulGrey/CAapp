import { NextRequest, NextResponse } from 'next/server';
import { findOrCreateLead, logEvent } from '@/lib/lead-management';
import { Kalkulation, berechnePreis, FormularDaten, generateAnrede } from '@/lib/calculation';
import { sendEmail, getKalkulationEmailTemplate, getTeamNotificationTemplate } from '@/lib/email';

async function handlePost(request: NextRequest) {
  const envCheck = {
    SMTP_HOST: !!process.env.SMTP_HOST,
    SMTP_PORT: !!process.env.SMTP_PORT,
    SMTP_USER: !!process.env.SMTP_USER,
    SMTP_PASS: !!process.env.SMTP_PASS,
    SMTP_FROM: !!process.env.SMTP_FROM,
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  console.log('🔧 Env-Check:', JSON.stringify(envCheck));

  try {
    console.log('📧 Kalkulation-Email API aufgerufen');
    const body = await request.json();
    console.log('Body empfangen:', { email: body.email, hasKalkulation: !!body.kalkulation });

    const { email, kalkulation, formularDaten, vorname, nachname }: {
      email: string;
      kalkulation: Kalkulation;
      formularDaten?: any;
      vorname?: string;
      nachname?: string;
    } = body;

    if (!email || !kalkulation) {
      console.error('Fehlende Daten:', { email: !!email, kalkulation: !!kalkulation });
      return NextResponse.json(
        { error: 'E-Mail und Kalkulation erforderlich' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Ungültige E-Mail-Adresse' },
        { status: 400 }
      );
    }

    let vollstaendigeKalkulation = kalkulation;

    if (formularDaten) {
      const mappedFormularDaten: FormularDaten = {
        betreuung_fuer: formularDaten.patientCount || '1-person',
        pflegegrad: parseInt(formularDaten.pflegegrad || '0'),
        weitere_personen: formularDaten.householdOthers || 'nein',
        mobilitaet: formularDaten.mobility || 'mobil',
        nachteinsaetze: formularDaten.nightCare || 'nein',
        deutschkenntnisse: formularDaten.germanLevel || 'grundlegend',
        erfahrung: formularDaten.experience || 'einsteiger',
        fuehrerschein: formularDaten.driving || 'egal',
        geschlecht: formularDaten.gender || 'egal',
      };

      vollstaendigeKalkulation = await berechnePreis(mappedFormularDaten);
      vollstaendigeKalkulation = {
        ...vollstaendigeKalkulation,
        formularDaten: mappedFormularDaten
      } as any;
    }

    let leadId = 'unknown';
    let isNew = false;
    let leadError: string | undefined;
    let lead: any = null;

    // Generate anrede if not provided
    const generatedAnrede = (vorname && nachname ? generateAnrede(vorname, nachname) : undefined) ?? undefined;

    try {
      console.log('Erstelle/Finde Lead für:', email);
      const result = await findOrCreateLead(email, 'info_requested', {
        care_start_timing: formularDaten?.careStartTiming,
        kalkulation: vollstaendigeKalkulation,
        vorname,
        nachname,
        anrede: generatedAnrede,
      });
      leadId = result.lead.id;
      isNew = result.isNew;
      lead = result.lead;
      console.log('✅ Lead erstellt/gefunden:', { id: leadId, isNew, email });
    } catch (err) {
      leadError = err instanceof Error ? err.message : String(err);
      console.error('⚠️ Lead-Fehler (Mail wird trotzdem gesendet):', leadError);
    }

    const siteUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const anredeToUse = lead?.anrede || generatedAnrede;
    const vornameToUse = lead?.vorname || vorname;
    const nachnameToUse = lead?.nachname || nachname;

    const emailTemplate = getKalkulationEmailTemplate(
      email,
      vollstaendigeKalkulation,
      leadId,
      siteUrl,
      anredeToUse,
      vornameToUse,
      nachnameToUse
    );
    const emailResult = await sendEmail(email, emailTemplate);
    console.log('📧 E-Mail-Versand:', emailResult.success ? 'Erfolgreich' : `Fehler: ${emailResult.error}`);

    if (leadId !== 'unknown') {
      if (emailResult.success) {
        await logEvent(leadId, 'email_kalkulation_sent', { to: email });
      } else {
        await logEvent(leadId, 'email_kalkulation_failed', { to: email, error: emailResult.error });
      }

      const result = await findOrCreateLead(email, 'info_requested', {
        kalkulation: vollstaendigeKalkulation,
      });
      const teamEmail = getTeamNotificationTemplate(result.lead, 'info_requested');
      const teamEmailResult = await sendEmail('info@primundus.de', teamEmail);
      if (teamEmailResult.success) {
        await logEvent(leadId, 'team_notified', { status: 'info_requested', type: 'kalkulation' });
      } else {
        console.error('Team-Benachrichtigung fehlgeschlagen:', teamEmailResult.error);
      }
    }

    return NextResponse.json({
      success: emailResult.success,
      leadId,
      isNew,
      emailSent: emailResult.success,
      emailError: emailResult.error,
      leadError,
      envCheck,
      message: emailResult.success
        ? 'Lead gespeichert und E-Mail versendet'
        : `E-Mail fehlgeschlagen: ${emailResult.error}`,
    });
  } catch (error) {
    console.error('❌ Kritischer Fehler in kalkulation-email API:', error);
    return NextResponse.json(
      {
        error: 'Interner Serverfehler',
        details: error instanceof Error ? error.message : String(error),
        envCheck,
      },
      { status: 500 }
    );
  }
}

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const POST = withMem('kalkulation-email', handlePost);
