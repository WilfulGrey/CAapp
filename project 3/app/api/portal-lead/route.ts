/* ─── Eingang fuer eingekaufte Leads ─────────────────────────────────────
 *
 * Zweiter Weg in dieselbe Strecke: nicht der Kunde fuellt den Rechner aus,
 * sondern wir kaufen seine Anfrage bei einem Portal (Pflegehilfe.org,
 * Pflegebund.eu). Ab hier laeuft alles wie immer — Lead, Token,
 * Kundenportal, Mail 1 — nur mit source="portal:<domain>", woran die Mail
 * ihren eigenen Kopf erkennt (send-scheduled-emails/herkunft.ts).
 *
 * Bewusst NICHT oeffentlich: dieser Endpunkt legt Leads an und loest
 * Kundenmails aus. Ohne PORTAL_LEAD_KEY in der Env ist er aus.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findOrCreateLead, logEvent } from '@/lib/lead-management';
import { berechnePreis, parseCustomerName } from '@/lib/calculation';
import { ergaenzeAngaben, PORTALE, PortalAngaben, PreisZeile } from '@/lib/portal-lead';
import { scheduleEmail, flushScheduledEmails } from '@/lib/lead-mails';
import { darfAngeschriebenWerden } from '@/lib/portal-schutz';
import { sendEmail, getTeamNotificationTemplate } from '@/lib/email';

/* Muss zur Allowlist in send-scheduled-emails/herkunft.ts passen: Edge
 * Function (Deno) und Next-App koennen keinen Code teilen, deshalb steht
 * die Liste dort ein zweites Mal. Ein Portal, das nur hier steht, bekaeme
 * die normale Mail statt der Portal-Fassung. Beide zusammen pflegen. */
const ERLAUBTE_PORTALE: readonly string[] = PORTALE.map((p) => p.domain);

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = (serviceKey && serviceKey.length > 10 ? serviceKey : null)
    || (anonKey && anonKey.length > 10 ? anonKey : null);
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest) {
  const erwarteterKey = process.env.PORTAL_LEAD_KEY;
  if (!erwarteterKey || erwarteterKey.length < 16) {
    // Nicht konfiguriert ⇒ Feature aus. Lieber tot als offen.
    return NextResponse.json({ error: 'nicht konfiguriert' }, { status: 503 });
  }
  if (request.headers.get('x-portal-key') !== erwarteterKey) {
    return NextResponse.json({ error: 'nicht berechtigt' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ungültiges JSON' }, { status: 400 });
  }

  const portal = String(body?.portal ?? '').trim().toLowerCase();
  if (!ERLAUBTE_PORTALE.includes(portal)) {
    return NextResponse.json(
      { error: `unbekanntes Portal: ${portal || '(leer)'}` },
      { status: 400 },
    );
  }

  const email = String(body?.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'ungültige E-Mail-Adresse' }, { status: 400 });
  }

  const name = String(body?.name ?? '').trim();
  const telefon = String(body?.telefon ?? '').trim();

  /* Einwilligungsnachweis. Der Kunde hat BEIM PORTAL eingewilligt, nicht
   * bei uns — unser eigener Checkbox-Text waere hier eine Faelschung des
   * Nachweises. Deshalb Pflichtfeld: wer den Nachweis nicht mitliefert,
   * bekommt keinen Lead angelegt. */
  const einwilligung = body?.einwilligung ?? {};
  const einwilligungText = String(einwilligung?.text ?? '').trim();
  const einwilligungAm = String(einwilligung?.zeitpunkt ?? '').trim();
  if (!einwilligungText || !einwilligungAm) {
    return NextResponse.json(
      { error: 'Einwilligungsnachweis (text + zeitpunkt) erforderlich' },
      { status: 400 },
    );
  }

  /* Schutzregeln VOR allem anderen: kein Lead, kein Preis, keine Mail.
   * Ein "Keine Interesse" oder eine halbjahresalte Anfrage darf nicht
   * einmal als Datensatz entstehen — sonst faellt sie beim naechsten Lauf
   * wieder jemandem in die Haende. */
  const schutz = darfAngeschriebenWerden(
    { status: body?.status, erstellt_am: body?.erstellt_am },
    new Date(),
  );
  if (!schutz.ok) {
    console.log(`Portal-Lead abgelehnt (${portal}): ${schutz.grund}`);
    return NextResponse.json({ ok: false, uebersprungen: true, grund: schutz.grund }, { status: 200 });
  }

  try {
    const supabase = supabaseClient();

    // Preistabelle EINMAL laden — die Wahl des teuersten Werts je fehlender
    // Kategorie gehoert in die Daten, nicht in den Code.
    const { data: preisZeilen } = await supabase
      .from('pricing_config')
      .select('kategorie, antwort_key, aufschlag_euro')
      .eq('aktiv', true);

    const { daten, angenommen } = ergaenzeAngaben(
      (body?.angaben ?? {}) as PortalAngaben,
      (preisZeilen ?? []) as PreisZeile[],
    );

    const kalkulation = await berechnePreis(daten);
    /* Welche Felder WIR gesetzt haben, reist mit der Kalkulation: die Mail
       entscheidet daran, ob sie den Annahme-Hinweis zeigt. Leere Liste =
       das Portal hat alles geliefert. */
    (kalkulation as any).angenommene_felder = angenommen;

    const { vorname, nachname, anrede } = parseCustomerName(name);

    const { lead, isNew } = await findOrCreateLead(email, 'angebot_requested', {
      vorname: vorname || (nachname ? '' : name),
      nachname: nachname || undefined,
      anrede: anrede || undefined,
      telefon: telefon || undefined,
      care_start_timing: body?.care_start_timing || undefined,
      kalkulation,
      quelle: `portal:${portal}`,
    });

    /* Zwei getrennte Nachweise, beide append-only:
     *  - woher der Lead kam und was er gekostet hat
     *  - WELCHE Angaben wir angenommen haben (der Kunde sieht sie in der
     *    Mail und koennte sie zu Recht hinterfragen) */
    await logEvent(lead.id, 'portal_lead_eingekauft', {
      portal,
      einkaufspreis: body?.einkaufspreis ?? null,
      portal_lead_id: body?.portal_lead_id ?? null,
      angenommene_felder: angenommen,
      at: new Date().toISOString(),
    }).catch((e) => console.error('portal_lead_eingekauft log failed:', e));

    await logEvent(lead.id, 'privacy_consent', {
      accepted: true,
      source: `portal:${portal}`,
      text: einwilligungText,
      at: einwilligungAm,
      // Kein eigener Versionsstempel: der Text stammt vom Portal, nicht von
      // uns — wir bezeugen, was uns geliefert wurde.
      version: null,
    }).catch((e) => console.error('privacy_consent log failed:', e));

    // Mail 1 sofort (delay 0) — identischer Weg wie beim Kostenrechner.
    scheduleEmail(lead.id, email, 'eingangsbestaetigung', 0)
      .then(async (r) => {
        if (r.success) {
          await logEvent(lead.id, 'email_eingangsbestaetigung_scheduled', { to: email, token: lead.token });
          flushScheduledEmails();
        } else {
          console.error('Portal-Lead: Mail nicht geplant:', r.error);
          await logEvent(lead.id, 'email_eingangsbestaetigung_schedule_failed', { to: email, error: r.error });
        }
      })
      .catch((e) => console.error('schedule threw:', e));

    const teamEmail = getTeamNotificationTemplate(lead, 'angebot_requested', { quelle: `portal:${portal}` });
    sendEmail('info@primundus.de', teamEmail).catch((e) => console.error('Team-Mail:', e));

    return NextResponse.json({
      ok: true,
      lead_id: lead.id,
      neu: isNew,
      angenommene_felder: angenommen,
      eigenanteil: kalkulation.eigenanteil,
    });
  } catch (error) {
    console.error('Portal-Lead fehlgeschlagen:', error);
    return NextResponse.json({ error: 'Lead konnte nicht angelegt werden' }, { status: 500 });
  }
}
