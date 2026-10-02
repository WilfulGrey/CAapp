-- Registry #107, Schritt 1 von 2 — legt nur an, der laufende Code arbeitet weiter.
--
-- Bis hierher waren leads, lead_events, vertraege, scheduled_emails, lead_jobs,
-- portal_*_log, Preise/Zuschüsse, chat_* und analytics_sessions für den öffentlichen
-- Anon-Schlüssel offen (Policies USING (true)): wer den Schlüssel aus dem Bundle
-- nahm, konnte alle Leads lesen, ändern und löschen. Diese Migration schafft den
-- neuen Zugang; die offenen Policies nimmt erst die nächste Migration weg, NACHDEM
-- der neue Code (Admin-Konto, lead_by_token, Service-Key im Server) live ist.

-- 1) ist_admin(): true nur für das Supabase-Auth-Konto des Admin-Panels.
--    app_metadata setzt nur der Server (SQL / service_role), ein Nutzer kann es
--    nicht selbst setzen — anders als user_metadata. Die Rolle `authenticated`
--    allein reicht NICHT: die bekommt jeder, der sich registrieren kann.
create or replace function public.ist_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'primundus_admin') = 'true', false)
$$;

-- 2) Das Admin-Panel (Browser, Konto mit Flag) darf auf seinen Tabellen alles.
--    Auch Realtime (admin/leads: leads, portal_mail_log, portal_api_log) prüft
--    diese Policy pro Abonnent.
do $$
declare t text;
begin
  foreach t in array array[
    'leads', 'lead_events', 'vertraege', 'scheduled_emails', 'lead_jobs',
    'portal_mail_log', 'portal_api_log',
    'pricing_config', 'subsidies_config', 'subsidies_values'
  ] loop
    execute format('drop policy if exists "Admin: alles" on public.%I', t);
    execute format(
      'create policy "Admin: alles" on public.%I for all to authenticated '
      'using ((select public.ist_admin())) with check ((select public.ist_admin()))',
      t
    );
  end loop;
end $$;

-- 3) Portal: der Kunde liest seine eigene Zeile über den Magic-Link-Token.
--    Kein Filter auf token_expires_at — das Portal lädt heute auch einen
--    abgelaufenen Lead (das 401 kommt aus dem Onboard, dann „Neuen Link senden").
--    Interne Spalten bleiben draußen; eine neue interne Spalte gehört in die Liste,
--    neue Spalten fürs Portal kommen ohne Migration mit. leads.token ist unique.
create or replace function public.lead_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(l) - array['admin_notes', 'notizen', 'mamamia_user_token']
  from public.leads l
  where l.token = p_token
$$;

revoke all on function public.lead_by_token(text) from public;
grant execute on function public.lead_by_token(text) to anon, authenticated;
