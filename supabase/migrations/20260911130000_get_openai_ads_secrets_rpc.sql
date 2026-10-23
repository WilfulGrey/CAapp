/*
  # get_openai_ads_secrets() — Vault-Accessor für openai-conversions

  Wie bei get_google_ads_secrets (Migration 20260814122000): das CLI-/CI-Token
  darf auf diesem Projekt KEINE Function-Env-Secrets setzen (403 auf
  /v1/projects/:ref/secrets, erneut festgestellt 11.09.2026). Deshalb liegt
  der Conversion-Schlüssel der OpenAI Ads Conversions API im Supabase Vault
  (Name: openai_ads_capi_key — Wert wird operativ eingespielt, NIE über
  Migrationen) und die Edge Function liest ihn über diese RPC. Env
  OPENAI_ADS_CAPI_KEY hat Vorrang, falls sie doch einmal gesetzt ist.

  SECURITY DEFINER + Grant NUR für service_role. Fehlt der Vault-Eintrag
  (Staging), liefert die RPC einen leeren String → die Function skippt.
*/

create or replace function get_openai_ads_secrets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'capiKey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'openai_ads_capi_key' limit 1), '')
  ) into result;
  return result;
end;
$$;

revoke all on function get_openai_ads_secrets() from public;
revoke all on function get_openai_ads_secrets() from anon;
revoke all on function get_openai_ads_secrets() from authenticated;
grant execute on function get_openai_ads_secrets() to service_role;
