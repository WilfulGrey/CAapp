import { createClient } from '@supabase/supabase-js';
import { Kalkulation, generateToken, getTokenExpiry } from './calculation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
  status: 'info_requested' | 'angebot_requested' | 'vertrag_abgeschlossen';
  token: string | null;
  token_expires_at: string | null;
  token_used: boolean;
  care_start_timing: string | null;
  kalkulation: any;
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
  const { data: existingLeads } = await supabase
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

      const { data: updatedLead } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', latestLead.id)
        .select()
        .maybeSingle();

      await logEvent(latestLead.id, `${targetStatus}_duplicate`, {
        message: 'Lead bereits vorhanden, Kalkulation aktualisiert',
        kalkulation_changed: kalkulationChanged,
      });
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

      const { data: updatedLead, error: updateError } = await supabase
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

      const { data: newLead, error: insertError } = await supabase
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

  const { data: newLead, error: insertError } = await supabase
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
  await supabase.from('lead_events').insert({
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
  const { data: lead } = await supabase
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
