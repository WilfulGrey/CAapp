/*
  # get_meta_leads_secrets() — Vault-Accessor für die Facebook-Formular-Leads

  Die Render-Env des Prod-Kostenrechners (srv-d7phc1n7f7vs739kaa5g) liegt nicht
  in Martins Render-Arbeitsbereich. Deshalb liegt der Meta-Zugang im Supabase
  Vault (Namen: meta_page_id, meta_page_token — Werte werden operativ
  eingespielt, NIE über Migrationen) und POST /api/cron/meta-leads liest ihn
  über diese RPC, wenn META_PAGE_ID/META_PAGE_TOKEN in der Env fehlen — gleiches
  Muster wie get_google_ads_secrets / get_smtp_config.

  SECURITY DEFINER + Grant NUR für service_role: anon/authenticated können die
  RPC nicht aufrufen. Fehlen die Vault-Einträge (Staging), liefert die RPC
  leere Strings ⇒ die Route bleibt inert ({"configured":false}).

  Backward-kompatibel (Święta zasada 3): neue Funktion, alter Code ruft sie nicht.
*/

create or replace function get_meta_leads_secrets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'pageId', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'meta_page_id' limit 1), ''),
    'pageToken', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'meta_page_token' limit 1), '')
  ) into result;
  return result;
end;
$$;

revoke all on function get_meta_leads_secrets() from public;
revoke all on function get_meta_leads_secrets() from anon;
revoke all on function get_meta_leads_secrets() from authenticated;
grant execute on function get_meta_leads_secrets() to service_role;
