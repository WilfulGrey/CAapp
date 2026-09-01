/* ─── Versand-Anstoss fuer Lead-Mails ────────────────────────────────────
 *
 * Herausgeloest aus app/api/angebot-anfordern, weil es seit 31.08. einen
 * zweiten Einstieg gibt: eingekaufte Portal-Leads (app/api/portal-lead).
 * Beide muessen die Mail auf demselben Weg anstossen — zwei Kopien dieser
 * Logik wuerden garantiert auseinanderlaufen.
 *
 * Unveraendert uebernommen; nur der Ort ist neu.
 */

export async function scheduleEmail(
  leadId: string,
  email: string,
  emailType: 'angebot' | 'eingangsbestaetigung',
  delayMinutes: number,
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/schedule-email`;

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'Apikey': anonKey,
      },
      body: JSON.stringify({
        lead_id: leadId,
        email_type: emailType,
        recipient_email: email,
        delay_minutes: delayMinutes,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Edge Function Fehler: ${response.status} - ${text}` };
    }

    const result = await response.json();
    return { success: result.success === true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function flushScheduledEmails(): Promise<void> {
  // Fire-and-forget — when we schedule an Eingangsbestätigung with delay=0,
  // we want it dispatched right away rather than waiting up to 5 min for
  // the next pg_cron tick. Errors are non-fatal: cron will pick it up on
  // the next tick anyway.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const key = (serviceKey && serviceKey.length > 10) ? serviceKey : anonKey;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-scheduled-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Apikey': key,
      },
      body: '{}',
    });
  } catch (err) {
    console.warn('flushScheduledEmails failed:', err instanceof Error ? err.message : String(err));
  }
}

