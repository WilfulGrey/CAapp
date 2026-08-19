/*
  # get_google_ads_secrets(): + dmRefreshToken (Data Manager API)

  Google hat ConversionUploadService.UploadClickConversions für NEUE
  Integrationen gesperrt (CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE,
  festgestellt 19.08.2026 — alle Cron-Uploads seit 15.08. scheiterten
  dadurch still). Der Ersatz events:ingest (datamanager.googleapis.com)
  braucht einen EIGENEN OAuth-Scope → eigener Refresh-Token im Vault
  unter `google_oauth_refresh_token_dm` (Wert operativ eingespielt,
  nie per Migration).

  CREATE OR REPLACE erweitert die RPC um `dmRefreshToken` — additive
  Änderung, bestehende Nutzer (upload-offline-conversions alt,
  daily-analytics-report via _shared/googleAdsAuth.ts) lesen ihre
  Felder weiter. Grants unverändert (service_role-only), defensiv
  erneut gesetzt.
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
    'refreshToken', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'google_oauth_refresh_token' limit 1), ''),
    'dmRefreshToken', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'google_oauth_refresh_token_dm' limit 1), '')
  ) into result;
  return result;
end;
$$;

revoke all on function get_google_ads_secrets() from public;
revoke all on function get_google_ads_secrets() from anon;
revoke all on function get_google_ads_secrets() from authenticated;
grant execute on function get_google_ads_secrets() to service_role;
