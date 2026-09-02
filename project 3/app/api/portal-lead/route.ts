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

    /* Details ohne Preisbezug → formularDaten (additiv; der Rechner sendet
       diese Schlüssel nie). Von dort aus: Formular-Prefill
       (prefillPatientFromLead), Mamamia-Onboarding (weight/dementia/
       internet, Locations-Lookup über fd.plz) und JobOffer-Beschreibung
       (fd.portal_details). Whitelist + String-Zwang: der Body kommt von
       aussen. */
    const d = (body?.details && typeof body.details === 'object' ? body.details : {}) as Record<string, unknown>;
    const fdExtras: Record<string, string> = {};
    const nimm = (ziel: string, wert: unknown, max = 2000) => {
      if (typeof wert === 'string' && wert.trim()) fdExtras[ziel] = wert.trim().slice(0, max);
    };
    nimm('plz', body?.plz, 5);
    nimm('ort', body?.ort, 80);
    nimm('gewicht', d.gewicht, 10);
    nimm('internet', d.internet, 4);
    nimm('demenz', d.demenz, 2);
    nimm('diagnosen', d.diagnosen, 500);
    nimm('portal_details', d.block);
    if (Object.keys(fdExtras).length) {
      (kalkulation as any).formularDaten = { ...(kalkulation as any).formularDaten, ...fdExtras };
    }

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
    /* Der volle Portal-Datensatz (CSV-Spalten ohne Zuhause bei uns:
       Krankheiten, Gewicht, Beziehung, Zimmer, Internet …) — append-only
       archiviert, damit nichts verloren geht. Groessen-Kappe, weil der
       Wert von aussen kommt. */
    const zusatzRoh = body?.zusatz;
    const zusatz = zusatzRoh && typeof zusatzRoh === 'object'
      && JSON.stringify(zusatzRoh).length <= 6000 ? zusatzRoh : undefined;

    await logEvent(lead.id, 'portal_lead_eingekauft', {
      portal,
      einkaufspreis: body?.einkaufspreis ?? null,
      portal_lead_id: body?.portal_lead_id ?? null,
      angenommene_felder: angenommen,
      ...(zusatz ? { zusatz } : {}),
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

    /* Geschlecht/Name des SENIORS (Registry #45): aus SeniorSex bzw. dem
       eindeutig gegenderten Beziehungswort ("Schwiegervater" IST ein Mann).
       Auf die patient_*-Spalten des Leads — davon lebt resolvePatientSalutation
       im Onboarding (patient.gender) und patientGenderKnown im Formular.
       VOR dem Onboarding-Aufruf, damit der frisch geladene Lead sie traegt. */
    const patientPatch: Record<string, string> = {};
    if (typeof d.patient_anrede === 'string' && /^(Herr|Frau)$/.test(d.patient_anrede)) {
      patientPatch.patient_anrede = d.patient_anrede;
    }
    if (typeof d.patient_vorname === 'string' && d.patient_vorname.trim()) {
      patientPatch.patient_vorname = d.patient_vorname.trim().slice(0, 80);
    }
    if (typeof d.patient_nachname === 'string' && d.patient_nachname.trim()) {
      patientPatch.patient_nachname = d.patient_nachname.trim().slice(0, 80);
    }
    if (Object.keys(patientPatch).length) {
      const { error: patchErr } = await supabase.from('leads').update(patientPatch).eq('id', lead.id);
      if (patchErr) console.error('Portal-Lead: patient_* Update fehlgeschlagen:', patchErr.message);
    }

    /* Mamamia SOFORT, nicht erst beim Portal-Besuch (Entscheidung Michał
       01.09., Registry #44): ein eingekaufter Lead ist bezahlt und traegt
       ab #614/#615 vollstaendige Daten — Kunde + Job entstehen in MM in
       derselben Minute, mit weight/dementia/internet und dem Kontextblock
       in der JobOffer-Beschreibung. Der Aufruf ist der GLEICHE Edge-Fn-Weg
       wie aus dem Browser (idempotent per Cache-Hit); Fehler brechen den
       Eingang NICHT ab — dann greift der bisherige Lazy-Onboard beim
       ersten Portal-Besuch als Fallback. VOR Mail 1, damit der
       Empfehlungs-Pfad der Mail (Registry #39) einen bestehenden Kunden
       vorfindet statt selbst zu onboarden. */
    try {
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supaUrl && anon && lead.token) {
        const r = await fetch(`${supaUrl}/functions/v1/onboard-to-mamamia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
          body: JSON.stringify({ token: lead.token }),
          signal: AbortSignal.timeout(25_000),
        });
        const daten = await r.json().catch(() => ({}));
        if (r.ok && daten?.customer_id) {
          await logEvent(lead.id, 'mamamia_onboarded_at_ingest', {
            customer_id: daten.customer_id,
            job_offer_id: daten.job_offer_id ?? null,
          }).catch(() => {});
        } else {
          console.error(`Portal-Lead: Sofort-Onboarding fehlgeschlagen (HTTP ${r.status}) — Lazy-Fallback bleibt`, daten?.error ?? '');
        }
      }
    } catch (e) {
      console.error('Portal-Lead: Sofort-Onboarding threw — Lazy-Fallback bleibt:', e instanceof Error ? e.message : String(e));
    }

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
