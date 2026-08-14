/*
  # get_google_ads_secrets() — Vault-Accessor für upload-offline-conversions

  Das CLI-/CI-Token darf auf diesem Projekt KEINE Function-Env-Secrets
  setzen (403 auf /v1/projects/:ref/secrets, festgestellt 14.08.2026).
  Deshalb liegen die Google-Ads-Zugänge im Supabase Vault (Namen:
  google_ads_developer_token, google_oauth_client_id,
  google_oauth_client_secret, google_oauth_refresh_token — Werte werden
  operativ eingespielt, NIE über Migrationen) und die Edge Function liest
  sie über diese RPC — gleiches Muster wie get_smtp_config beim
  daily-analytics-report.

  SECURITY DEFINER + Grant NUR für service_role: anon/authenticated können
  die RPC nicht aufrufen; PostgREST exponiert das vault-Schema ohnehin
  nicht. Fehlen die Vault-Einträge (z. B. Staging), liefert die RPC
  leere Strings → die Function skippt (inert).
*/

create or replace function get_google_ads_secrets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'developerToken', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'google_ads_developer_token' limit 1), ''),
    'clientId', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'google_oauth_client_id' limit 1), ''),
    'clientSecret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'google_oauth_client_secret' limit 1), ''),
    'refreshToken', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'google_oauth_refresh_token' limit 1), '')
  ) into result;
  return result;
end;
$$;

revoke all on function get_google_ads_secrets() from public;
revoke all on function get_google_ads_secrets() from anon;
revoke all on function get_google_ads_secrets() from authenticated;
grant execute on function get_google_ads_secrets() to service_role;
