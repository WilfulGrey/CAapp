import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findOrCreateLead, logEvent } from '@/lib/lead-management';
import { Kalkulation } from '@/lib/calculation';
import {
  sendEmail,
  getTeamNotificationTemplate,
  getAngebotsEmailTemplate,
} from '@/lib/email';
import { testphaseUmleitung } from '@/lib/portal-schutz';
import { parseCustomerName } from '@/lib/calculation';
import { scheduleEmail, flushScheduledEmails } from '@/lib/lead-mails';
import { quelleBereinigen } from '@/lib/lead-quelle';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = (serviceKey && serviceKey.length > 10 ? serviceKey : null)
    || (anonKey && anonKey.length > 10 ? anonKey : null);

  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const supabase = getSupabaseClient();

// DSGVO-Einwilligung — exakter Checkbox-Text + Version, die der Kunde im
// Result-Formular akzeptiert (result/page.tsx). Bei Textänderung Version
// hochzählen, damit der Nachweis sagt, WELCHEM Text zugestimmt wurde.
const PRIVACY_CONSENT_VERSION = '2026-02';
const PRIVACY_CONSENT_TEXT =
  'Ich akzeptiere die Datenschutzerklärung und bin damit einverstanden, dass Primundus meine Daten zur Bearbeitung meiner Anfrage verarbeitet.';

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.leadId && body.sendEmailOnly) {
      return handleSendAngebotsEmailOnly(body.leadId);
    }

    const {
      vorname,
      email,
      telefon,
      careStartTiming,
      kalkulation,
      acceptPrivacy,
      adParams,
      quelle,
      websitePfad,
    }: {
      vorname?: string;
      email: string;
      telefon?: string;
      careStartTiming?: string;
      kalkulation: Kalkulation;
      acceptPrivacy?: boolean;
      adParams?: Record<string, unknown>;
      /* Welche Seite hat die Anfrage geschickt. Das Formular sendet nichts
         (⇒ 'rechner'), der Pria-Chat sendet 'pria-chat'. Landet auf dem Lead
         und in der Team-Mail — sonst sieht niemand, welche Variante gewinnt. */
      quelle?: string;
      /* Pfad der verweisenden Website-Seite (nur bei quelle website:…). */
      websitePfad?: string | null;
    } = body;
    /* Der Client schickt die Quelle, der Server entscheidet, was gültig ist —
       sonst landet beliebiger Text in leads.source (Martin, 04.09.2026). */
    const quelleSicher = quelleBereinigen(quelle) ?? 'rechner';
    const websitePfadSicher = typeof websitePfad === 'string' && /^\/[a-z0-9\-\/]{0,80}$/i.test(websitePfad) ? websitePfad : null;

    // Google-Klick-IDs für den späteren Offline-Conversion-Import
    // (docs/google-ads-tracking.md). Strikt allowlisted + gekappt — der
    // Client schickt sessionStorage-Inhalt, hier entscheidet der Server,
    // was den Lead erreicht.
    const clickIds: { gclid?: string; wbraid?: string; gbraid?: string } = {};
    if (adParams && typeof adParams === 'object') {
      for (const key of ['gclid', 'wbraid', 'gbraid'] as const) {
        const value = adParams[key];
        if (typeof value === 'string' && value.trim() && value.length <= 200) {
          clickIds[key] = value.trim();
        }
      }
    }

    // Name + E-Mail + Telefon + Kalkulation alle Pflicht (Rückrollung
    // 14.06.2026 der Änderung vom 06.06.2026). Begründung: Tel-Quote war
    // seit 06.06. von 67 % auf 34 % gefallen, ohne Conversion-Vorteil. Ohne
    // Telefon kann das Team nicht nachhaken + die Daten nicht zu Mamamia
    // weiterleiten → Pflegekräfte sehen den Lead nicht.
    if (!email || !kalkulation) {
      return NextResponse.json(
        { error: 'E-Mail und Kalkulation erforderlich' },
        { status: 400 }
      );
    }
    if (!vorname || !vorname.trim()) {
      return NextResponse.json(
        { error: 'Name erforderlich' },
        { status: 400 }
      );
    }
    // Mild geprüft (≥6 Ziffern), siehe MultiStepForm.validateForm()-Kommentar.
    const phoneDigits = (telefon ?? '').replace(/\D/g, '');
    if (!telefon || phoneDigits.length < 6) {
      return NextResponse.json(
        { error: 'Telefonnummer erforderlich' },
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

    // The "vorname" field is a single free-text input — customers often type
    // a full name incl. title and notes ("Herr Steffen Krumbholz (Sohn)").
    // Parse it robustly into vorname / nachname / anrede. Leerer Input →
    // parseCustomerName liefert leere Felder, customerGreeting fällt später
    // auf „Guten Tag" zurück.
    const rawName = (vorname ?? '').trim();
    const { vorname: parsedVorname, nachname: parsedNachname, anrede: detectedAnrede } =
      parseCustomerName(rawName);

    const { lead, isNew, isUpgrade, kalkulationChanged } = await findOrCreateLead(
      email,
      'angebot_requested',
      {
        // Keep parsed vorname (may be empty for "Familie Müller", where the
        // name lives in nachname). Only fall back to the raw input when the
        // parse produced no name at all.
        vorname: parsedVorname || (parsedNachname ? '' : rawName),
        nachname: parsedNachname || undefined,
        anrede: detectedAnrede || undefined,
        telefon,
        care_start_timing: careStartTiming,
        kalkulation,
        quelle: quelleSicher,
      }
    );

    // Klick-IDs als SEPARATES best-effort Update (nicht im Insert/Update von
    // findOrCreateLead): Lead-Erstellung darf NIE an fehlenden Spalten
    // scheitern, falls Migration 20260814090000 noch nicht appliziert ist.
    // Re-Submit mit neuer Klick-ID überschreibt — letzter Klick gewinnt.
    if (Object.keys(clickIds).length > 0) {
      try {
        const { error: clickIdError } = await supabase
          .from('leads')
          .update(clickIds)
          .eq('id', lead.id);
        if (clickIdError) {
          console.error('Klick-IDs nicht gespeichert (Lead existiert trotzdem):', clickIdError.message);
        }
      } catch (e) {
        console.error('Klick-IDs nicht gespeichert (Lead existiert trotzdem):', e instanceof Error ? e.message : String(e));
      }
    }

    // DSGVO Art. 7 Abs. 1 — Einwilligung nachweisbar protokollieren. Als
    // append-only lead_event (Zeitpunkt = created_at, Text + Version + Quelle
    // in den Metadaten). Best-effort: ein Fehler hier darf die Lead-Erstellung
    // NIE blockieren. Die Checkbox ist im Formular Pflicht (Submit sonst
    // gesperrt), daher ist acceptPrivacy beim regulären Flow immer true.
    if (acceptPrivacy) {
      try {
        await logEvent(lead.id, 'privacy_consent', {
          accepted: true,
          version: PRIVACY_CONSENT_VERSION,
          text: PRIVACY_CONSENT_TEXT,
          source: 'kostenrechner-result',
          at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('privacy_consent log failed (lead created anyway):', e instanceof Error ? e.message : String(e));
      }
    } else {
      console.warn(`angebot-anfordern: Lead ${lead.id} ohne acceptPrivacy=true angelegt (sollte durch Formular-Pflichtfeld nicht vorkommen).`);
    }

    // Re-Submit-Dedupe: wenn der Kunde dasselbe Formular nochmal schickt UND
    // die letzte Eingangsbestätigung <24h alt ist, schlucken wir die zweite
    // Mail komplett (kein Customer-Mail, kein Team-Mail). Bei Änderungen am
    // Formular ODER >24h Abstand geht die Mail raus — send-scheduled-emails
    // erkennt dann anhand der lead_events, dass es ein Re-Submit ist, und
    // wählt automatisch den "Ihr aktualisiertes Angebot"-Wording-Zweig.
    let shouldSendMails = true;
    if (!isNew && !isUpgrade && !kalkulationChanged) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSent } = await supabase
        .from('lead_events')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('event_type', 'email_eingangsbestaetigung_sent')
        .gte('created_at', cutoff)
        .limit(1);
      if (Array.isArray(recentSent) && recentSent.length > 0) {
        shouldSendMails = false;
        await logEvent(lead.id, 'eingangsbestaetigung_skipped_identical_resubmit', {
          to: email,
          reason: 'identical formularDaten + last sent <24h ago',
        });
        console.log(`angebot-anfordern: identischer Re-Submit innerhalb 24h für ${email} — Mails geskipped.`);
      }
    }

    // Fire-and-forget all email/scheduling side-effects — the customer's
    // hand-off into CA app should NOT wait on Ionos SMTP. The Eingangs-
    // bestätigung used to be a direct sendEmail() call here, but Render →
    // Ionos was timing out, so it's now scheduled via the same edge-
    // function pipeline that handles Angebot/Nachfass (delay=0 + an
    // immediate flushScheduledEmails so we don't wait for the next 5-min
    // pg_cron tick). Render Web Services don't tear down on response, so
    // the orphan promises continue running until the runtime decides
    // they're done.
    if (shouldSendMails) {
      scheduleEmail(lead.id, email, 'eingangsbestaetigung', 0)
        .then(async (r) => {
          if (r.success) {
            await logEvent(lead.id, 'email_eingangsbestaetigung_scheduled', { to: email, token: lead.token });
            flushScheduledEmails();
          } else {
            console.error('Eingangsbestaetigung schedule fehlgeschlagen:', r.error);
            await logEvent(lead.id, 'email_eingangsbestaetigung_schedule_failed', { to: email, error: r.error });
          }
        })
        .catch((e) => console.error('schedule eingangs threw:', e instanceof Error ? e.message : String(e)));
    }

    // Separate Angebots-Mail (delay 15) entfällt — Eingangsbestätigung ist
    // jetzt die gemergte Mail 1 (Empfangsbestätigung + Angebot + Preis +
    // Portal-CTA, delay 0). Die Nachfass-Kette wird in der Edge Function
    // nach Versand der Eingangsbestätigung gestartet.

    if (shouldSendMails) {
      const teamEmail = getTeamNotificationTemplate(lead, 'angebot_requested', { quelle: quelleSicher, websitePfad: websitePfadSicher });
      sendEmail('info@primundus.de', teamEmail)
        .then(async (r) => {
          if (r.success) {
            await logEvent(lead.id, 'team_notified', { status: 'angebot_requested' });
          } else {
            console.error('Team-Benachrichtigung fehlgeschlagen:', r.error);
          }
        })
        .catch((e) => console.error('team send threw:', e instanceof Error ? e.message : String(e)));
    }

    // Response contract — used by the result page to drive the seamless
    // hand-off into the CA app (kundenportal). `token` is the persistent
    // 14-day magic-link token already generated by findOrCreateLead;
    // `portalUrl` is the pre-built ${NEXT_PUBLIC_PORTAL_URL}/?token=...
    // URL the result page redirects to (and that the Eingangsbestätigung
    // email also embeds). Both are non-secret — token is single-customer
    // scoped and gated by token_expires_at on the receiving side.
    const portalBase = PORTAL_BASIS;
    const portalUrl = portalBase && lead.token
      ? `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`
      : null;

    if (portalUrl) {
      // Funnel signal — the customer gets a portal-ready handoff URL.
      // The `portal_handoff_redirect` event (fired client-side once the
      // browser actually navigates) is the closer half of the pair.
      await logEvent(lead.id, 'portal_handoff_link_built', { portalUrl });
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      isNew,
      isUpgrade,
      // emailSent / angebotsEmailScheduled are now best-effort — fired in
      // the background, so the response can't reflect their outcome. The
      // result page treats portalUrl as the only thing it actually needs.
      emailDispatched: true,
      token: lead.token ?? null,
      portalUrl,
      message: 'Angebot angefordert',
    });
  } catch (error) {
    console.error('Fehler bei Angebotsanforderung:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Full error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Fehler bei Angebotsanforderung', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function handleSendAngebotsEmailOnly(leadId: string) {
  try {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead nicht gefunden', details: leadError?.message },
        { status: 404 }
      );
    }

    const angebotsEmail = getAngebotsEmailTemplate(lead, lead.kalkulation);
    // Testphase: Portal-Leads ans Team (Umleitung nur beim Versand).
    const umlA = testphaseUmleitung(lead, process.env.PORTAL_TESTPHASE);
    const emailResult = await sendEmail(
      umlA?.empfaenger ?? lead.email,
      umlA ? { ...angebotsEmail, subject: umlA.betreffPraefix + angebotsEmail.subject } : angebotsEmail,
      undefined,
      umlA ? undefined : { cc: kundenEmpfaenger(lead).cc },
    );

    if (emailResult.success) {
      await logEvent(lead.id, 'email_angebot_sent', {
        to: lead.email,
        triggered_by: 'scheduled_email',
      });
    } else {
      await logEvent(lead.id, 'email_angebot_failed', {
        to: lead.email,
        error: emailResult.error,
        triggered_by: 'scheduled_email',
      });
    }

    return NextResponse.json({
      success: emailResult.success,
      emailSent: emailResult.success,
      emailError: emailResult.error,
    });
  } catch (error) {
    console.error('Fehler beim Senden der Angebotsmail:', error);
    return NextResponse.json(
      { error: 'Fehler beim Senden der Angebotsmail', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
import { PORTAL_BASIS } from '@/lib/portal-url';
import { kundenEmpfaenger } from '@/lib/empfaenger';
export const POST = withMem('angebot-anfordern', handlePost);
