-- Registry #107, Schritt 2 von 2 — zieht den offenen Anon-Zugriff ab.
--
-- Voraussetzung: Schritt 1 (20261002100000) und der neue Code sind live —
-- Admin-Seiten mit dem Supabase-Auth-Konto des Panels, Portal über lead_by_token,
-- Server-Code (Lead-Anlage, PDF, analytics/collect, /api/kalkulation) mit dem
-- Service-Key. Danach sieht der öffentliche Anon-Schlüssel nur noch Preise und
-- Zuschüsse (aktiv) und knowledge (is_active) und schreibt nur neue Analytik-Zeilen.
--
-- EINE Regel statt einer Namensliste: eine falsch abgetippte Policy (Umlaute!)
-- bliebe sonst still stehen, und eine inzwischen dazugeschriebene fällt mit.
-- Rollback = die vorher gesicherten CREATE POLICY-Zeilen (pg_policies-Snapshot).
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles && array['anon', 'authenticated', 'public']::name[]
      and policyname <> 'Admin: alles'
      and (
        tablename = any (array[
          'leads', 'lead_events', 'vertraege', 'scheduled_emails', 'lead_jobs',
          'portal_mail_log', 'portal_api_log', 'chat_conversations', 'chat_messages'
        ])
        or (tablename = any (array['pricing_config', 'subsidies_config', 'subsidies_values'])
            and cmd <> 'SELECT')
        or (tablename = 'analytics_sessions'
            and cmd in ('SELECT', 'UPDATE')
            and roles && array['anon']::name[])
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'Policy entfernt: %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- update_lead_contact ändert Name/Anrede eines Leads per UUID (SECURITY DEFINER).
-- Für anon war das ein offenes Ändern beliebiger Leads; der Admin ruft sie weiter
-- als `authenticated` (Konto des Panels — Registrierung ist aus).
revoke execute on function public.update_lead_contact(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_lead_contact(uuid, text, text, text, text) to authenticated;
