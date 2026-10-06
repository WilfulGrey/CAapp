import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Kalkulation, generateToken, getTokenExpiry } from './calculation';
import { abgleichNachAnfrage, anfrageNotiz, pendingNachAbgleich, resyncAufrufen, type MamamiaStatus } from './mamamia-abgleich';

/* Service-Key: leads und lead_events sind für den Anon-Schlüssel per RLS zu.
   Bis 10/2026 lief die Lead-Anlage hier auf dem Anon-Schlüssel und brauchte
   dafür offene Policies (USING true) — jeder mit dem öffentlichen Schlüssel
   konnte alle Leads lesen und ändern. Lazy, damit ein fehlender Schlüssel nicht
   schon `next build` sprengt, sondern erst der Aufruf laut scheitert. */
let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('lead-management: SUPABASE_SERVICE_ROLE_KEY fehlt');
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export interface Lead {
  id: string;
  email: string;
  /** Zweite Empfängeradresse (CC) für alle Kundenmails — lib/empfaenger.ts. */
  email_cc?: string | null;
  vorname: string | null;
  nachname: string | null;
  anrede: string | null;
  anrede_text: string | null;
  telefon: string | null;
  /** Zweite Nummer (Portal-Leads: Festnetz + Mobil) — nur bei uns, Registry #56. */
  telefon_2?: string | null;
  status: 'info_requested' | 'angebot_requested' | 'vertrag_abgeschlossen';
  token: string | null;
  token_expires_at: string | null;
  token_used: boolean;
  care_start_timing: string | null;
  kalkulation: any;
  /** Gesetzt, sobald das Kundenportal den Kunden in Mamamia angelegt hat. */
  mamamia_customer_id?: number | null;
  mamamia_job_offer_id?: number | null;
  created_at: string;
  updated_at: string;
}

// Vergleicht User-Inputs (formularDaten) zweier Kalkulationen. Used für
// Re-Submit-Erkennung: wenn der Kunde das Wizard erneut abschickt, ohne
// irgendwas zu ändern, sollen wir die Eingangsbestätigung nicht nochmal
// schicken (siehe angebot-anfordern). Vergleicht bewusst nur formularDaten,
// nicht das gesamte kalkulation-JSON — da können computed-Felder
// (bruttopreis, Rundungen) sich theoretisch verschieben ohne dass der
// Kunde was geändert hat.
function isSameFormularInput(prev: Kalkulation | undefined | null, next: Kalkulation | undefined | null): boolean {
  if (!prev || !next) return false;
  try {
    const a = JSON.stringify((prev as any).formularDaten ?? {});
    const b = JSON.stringify((next as any).formularDaten ?? {});
    return a === b;
  } catch {
    return false;
  }
}

export async function findOrCreateLead(
  email: string,
  targetStatus: 'info_requested' | 'angebot_requested' | 'vertrag_abgeschlossen',
  data?: {
    vorname?: string;
    nachname?: string;
    anrede?: string;
    telefon?: string;
    care_start_timing?: string;
    kalkulation?: Kalkulation;
    /* Über welche Seite kam die Anfrage ('rechner' = Kostenrechner-Formular,
       'pria-chat' = Voll-Chat auf /sofortangebot). Steht nur beim ERSTEN
       Anlegen; ein wiederkehrender Lead behält seine ursprüngliche Quelle. */
    quelle?: string;
  }
): Promise<{ lead: Lead; isNew: boolean; isUpgrade: boolean; kalkulationChanged: boolean }> {
  const { data: existingLeads } = await db()
    .from('leads')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: false });

  const statusOrder = {
    info_requested: 1,
    // Shell-Lead des Portal-Abholers (Registry #47): eine Mail, die kein
    // echter Lead wurde (abgelehnt/uebersprungen), sichtbar im Admin.
    // Level 1: ein echter Submit derselben Adresse STUFT HOCH statt zu
    // duplizieren — ohne Eintrag hier fiele der Lead durch alle Zweige
    // (siehe folge_einsatz unten).
    manuell_pruefen: 1,
    angebot_requested: 2,
    // Follow-up-Einsatz (Bug #25): detect-Discovery setzt diesen Status, wenn
    // Mamamia einen NEUEN geplanten Job für den Kunden eröffnet hat. Level 2
    // wie angebot_requested: ein erneuter Kalkulator-Submit desselben Kunden
    // landet im Duplicate-Zweig (Kalkulation-Update, Token/Status bleiben) —
    // OHNE diesen Eintrag fiele der Lead durch alle Zweige und es entstünde
    // ein zweiter Lead-Wiersz für dieselbe E-Mail.
    folge_einsatz: 2,
    vertrag_abgeschlossen: 3,
  };

  if (existingLeads && existingLeads.length > 0) {
    const latestLead = existingLeads[0];
    const currentStatusLevel = statusOrder[latestLead.status as keyof typeof statusOrder];
    const targetStatusLevel = statusOrder[targetStatus];

    if (currentStatusLevel >= targetStatusLevel && latestLead.status !== 'vertrag_abgeschlossen') {
      // Vergleiche vor dem Update — sonst überschreiben wir die Referenz.
      const kalkulationChanged = data?.kalkulation
        ? !isSameFormularInput(latestLead.kalkulation as Kalkulation | null, data.kalkulation)
        : false;

      const updates: any = { updated_at: new Date().toISOString() };
      if (data?.kalkulation) updates.kalkulation = data.kalkulation;
      if (data?.vorname) updates.vorname = data.vorname;
      if (data?.nachname) updates.nachname = data.nachname;
      if (data?.anrede) { updates.anrede = data.anrede; updates.anrede_text = data.anrede; }
      if (data?.telefon) updates.telefon = data.telefon;
      if (data?.care_start_timing) updates.care_start_timing = data.care_start_timing;

      const { data: updatedLead } = await db()
        .from('leads')
        .update(updates)
        .eq('id', latestLead.id)
        .select()
        .maybeSingle();

      await logEvent(latestLead.id, `${targetStatus}_duplicate`, {
        message: 'Lead bereits vorhanden, Kalkulation aktualisiert',
        kalkulation_changed: kalkulationChanged,
      });
      // Registry #113: der Kunde sieht ab jetzt das neue Angebot — Mamamia zieht nach.
      if (data?.kalkulation) mamamiaImHintergrund(latestLead, data.kalkulation);
      return { lead: updatedLead || latestLead, isNew: false, isUpgrade: false, kalkulationChanged };
    }

    if (currentStatusLevel < targetStatusLevel) {
      const updates: any = {
        status: targetStatus,
        updated_at: new Date().toISOString(),
      };

      if (data?.vorname) updates.vorname = data.vorname;
      if (data?.nachname) updates.nachname = data.nachname;
      if (data?.anrede) { updates.anrede = data.anrede; updates.anrede_text = data.anrede; }
      if (data?.telefon) updates.telefon = data.telefon;
      if (data?.care_start_timing) updates.care_start_timing = data.care_start_timing;
      if (data?.kalkulation) updates.kalkulation = data.kalkulation;
      /* Ein eingekaufter Lead IST ab jetzt eingekauft (Registry #50): ohne
         source-Wechsel bekaeme ein hochgestufter info_requested-Lead die
         Mail 1 ohne Portal-Kopf und stuende unter keinem Portal-Reiter.
         Rechner-Submits ('rechner'/'pria-chat') aendern die Herkunft nicht. */
      if (typeof data?.quelle === 'string' && data.quelle.startsWith('portal:')) {
        updates.source = data.quelle;
      }

      if (targetStatus === 'angebot_requested') {
        updates.token = generateToken();
        updates.token_expires_at = getTokenExpiry().toISOString();
        updates.token_used = false;
      }

      const { data: updatedLead, error: updateError } = await db()
        .from('leads')
        .update(updates)
        .eq('id', latestLead.id)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('❌ Fehler beim Lead-Update:', updateError);
        throw new Error(`Lead konnte nicht aktualisiert werden: ${updateError.message}`);
      }

      if (!updatedLead) {
        console.error('❌ Lead wurde nicht aktualisiert (null zurückgegeben)');
        throw new Error('Lead konnte nicht aktualisiert werden: Keine Daten zurückgegeben');
      }

      await logEvent(latestLead.id, `status_upgrade_to_${targetStatus}`, {
        from: latestLead.status,
        to: targetStatus,
      });
      if (data?.kalkulation) mamamiaImHintergrund(latestLead, data.kalkulation);

      return { lead: updatedLead, isNew: false, isUpgrade: true, kalkulationChanged: false };
    }

    if (latestLead.status === 'vertrag_abgeschlossen') {
      const newLeadData: any = {
        email,
        status: targetStatus,
        source: data?.quelle || 'rechner',
      };

      if (data?.vorname) newLeadData.vorname = data.vorname;
      if (data?.nachname) newLeadData.nachname = data.nachname;
      if (data?.anrede) { newLeadData.anrede = data.anrede; newLeadData.anrede_text = data.anrede; }
      if (data?.telefon) newLeadData.telefon = data.telefon;
      if (data?.care_start_timing) newLeadData.care_start_timing = data.care_start_timing;
      if (data?.kalkulation) newLeadData.kalkulation = data.kalkulation;

      if (targetStatus === 'angebot_requested') {
        newLeadData.token = generateToken();
        newLeadData.token_expires_at = getTokenExpiry().toISOString();
        newLeadData.token_used = false;
      }

      const { data: newLead, error: insertError } = await db()
        .from('leads')
        .insert(newLeadData)
        .select()
        .maybeSingle();

      if (insertError) {
        console.error('❌ Fehler beim Lead-Insert:', insertError);
        throw new Error(`Lead konnte nicht erstellt werden: ${insertError.message}`);
      }

      if (!newLead) {
        console.error('❌ Lead wurde nicht erstellt (null zurückgegeben)');
        throw new Error('Lead konnte nicht erstellt werden: Keine Daten zurückgegeben');
      }

      await logEvent(newLead.id, targetStatus, {
        message: 'Neuer Lead nach abgeschlossenem Vertrag',
      });

      return { lead: newLead, isNew: true, isUpgrade: false, kalkulationChanged: false };
    }
  }

  const newLeadData: any = {
    email,
    status: targetStatus,
    source: data?.quelle || 'rechner',
  };

  if (data?.vorname) newLeadData.vorname = data.vorname;
  if (data?.nachname) newLeadData.nachname = data.nachname;
  if (data?.anrede) { newLeadData.anrede = data.anrede; newLeadData.anrede_text = data.anrede; }
  if (data?.telefon) newLeadData.telefon = data.telefon;
  if (data?.care_start_timing) newLeadData.care_start_timing = data.care_start_timing;
  if (data?.kalkulation) newLeadData.kalkulation = data.kalkulation;

  if (targetStatus === 'angebot_requested') {
    newLeadData.token = generateToken();
    newLeadData.token_expires_at = getTokenExpiry().toISOString();
    newLeadData.token_used = false;
  }

  const { data: newLead, error: insertError } = await db()
    .from('leads')
    .insert(newLeadData)
    .select()
    .maybeSingle();

  if (insertError) {
    console.error('❌ Fehler beim Lead-Insert:', insertError);
    throw new Error(`Lead konnte nicht erstellt werden: ${insertError.message}`);
  }

  if (!newLead) {
    console.error('❌ Lead wurde nicht erstellt (null zurückgegeben)');
    throw new Error('Lead konnte nicht erstellt werden: Keine Daten zurückgegeben');
  }

  await logEvent(newLead.id, targetStatus, { message: 'Neuer Lead erstellt' });

  return { lead: newLead, isNew: true, isUpgrade: false, kalkulationChanged: false };
}

export async function logEvent(
  leadId: string,
  eventType: string,
  metadata?: any
): Promise<void> {
  await db().from('lead_events').insert({
    lead_id: leadId,
    event_type: eventType,
    metadata: metadata || {},
  });
}

export async function validateToken(token: string): Promise<{
  valid: boolean;
  lead?: Lead;
  error?: string;
}> {
  const { data: lead } = await db()
    .from('leads')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!lead) {
    return { valid: false, error: 'Token nicht gefunden' };
  }

  if (lead.token_used) {
    return { valid: false, error: 'Token bereits verwendet', lead };
  }

  if (lead.token_expires_at && new Date(lead.token_expires_at) < new Date()) {
    return { valid: false, error: 'Token abgelaufen', lead };
  }

  await logEvent(lead.id, 'vertrag_link_opened', {});

  return { valid: true, lead };
}

/* ─── Registry #113: erneute Anfrage → Mamamia ─────────────────────────────
   Martin 06.10.2026 (Kunde 11228): der Kunde fragte erneut an, bekam 2.800 €
   statt 2.600 € (Kundenportal + Mail), Job und SA-Portal blieben bei 2.600 € —
   „sonst suchen wir falsche Pflegekräfte". Ist der Lead schon in Mamamia
   angelegt, laufen die geänderten Angaben und der neue Preis über DENSELBEN
   Weg wie die Admin-Korrektur (#55): onboard-to-mamamia { resync } — Kunde
   per UpdateCustomer, Job-Preis per UpdateJobOffer wie das SA-Portal; ein
   gebuchter Job wird nicht angefasst. Dazu eine Notiz in den Kunden-Aktivitäten
   in Mamamia (Weg wie das SA-Portal) — so steht die erneute Anfrage in der
   SA-Historie, ohne Ablage neben Mamamia (Martin 06.10.2026). Im Hintergrund
   (bis 25 s), Lead, Mails und Antwort warten nicht darauf. Fehler ⇒
   mamamia_sync_pending, der Admin wiederholt mit „Mamamia erneut synchronisieren". */
function mamamiaImHintergrund(vorher: Lead, neu: Kalkulation): void {
  mamamiaNachAnfrage(vorher, neu).catch((e) =>
    console.error(`[mamamia-nach-anfrage] lead=${vorher.id} threw: ${e instanceof Error ? e.message : String(e)}`));
}

export async function mamamiaNachAnfrage(
  vorher: Lead,
  neu: Kalkulation,
  deps: { fetchFn?: typeof fetch; env?: Record<string, string | undefined>; db?: SupabaseClient } = {},
): Promise<MamamiaStatus | null> {
  if (!vorher.mamamia_customer_id || !vorher.mamamia_job_offer_id) return null;
  const plan = abgleichNachAnfrage(vorher.kalkulation as Kalkulation | null, neu, vorher.care_start_timing);
  if (!plan) return null;
  const env = deps.env ?? process.env;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const datenbank = deps.db ?? db();
  const mamamia = await resyncAufrufen({
    supabaseUrl: url, serviceKey: key, leadId: vorher.id, felder: plan.felder, budget: plan.budget,
    notiz: anfrageNotiz(vorher.kalkulation as Kalkulation | null, neu), fetchFn: deps.fetchFn,
  });

  // Pending nur schreiben, wenn die Kalkulation noch dieselbe ist — eine
  // neuere Anfrage hat sie inzwischen ersetzt und gleicht selbst ab.
  const { data: aktuell } = await datenbank.from('leads').select('kalkulation').eq('id', vorher.id).maybeSingle();
  const k = aktuell?.kalkulation as Kalkulation | null | undefined;
  const dieselbe = !!k && Number(k.bruttopreis) === Number(neu.bruttopreis)
    && JSON.stringify(k.formularDaten ?? {}) === JSON.stringify(neu.formularDaten ?? {});
  if (dieselbe && (mamamia.status !== 'ok' || k.mamamia_sync_pending)) {
    await datenbank.from('leads').update({ kalkulation: pendingNachAbgleich(k, mamamia, plan.felder, plan.budget) }).eq('id', vorher.id);
  }

  console.log(`[mamamia-nach-anfrage] lead=${vorher.id} ${mamamia.status} felder=${plan.felder.join(',') || '-'} budget=${plan.budget ?? '-'} ${mamamia.message}`);
  return mamamia;
}

