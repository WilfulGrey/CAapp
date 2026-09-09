-- Zugang zum Postfach info@primundus.de fuer den SENDEWEG der Vermittler-
-- Mails (Ionos-SMTP). Getrennt vom Lesezugang, der als INFO_USER/INFO_PASS
-- in den Render-Env-Variablen liegt — dasselbe Passwort, zwei Speicher.
--
-- Im Supabase-SQL-Editor des JEWEILIGEN Projekts ausfuehren:
--   Staging  taggpiwpwthgpcmaiqjw
--   Prod     ycdwtrklpoqprabtwahi
--
-- Idempotent: legt an, was fehlt, und aktualisiert, was schon da ist.
-- <HIER-DAS-PASSWORT> ersetzen. Snippet danach NICHT speichern.

do $$
declare
  eintrag record;
  vorhanden uuid;
begin
  for eintrag in
    select * from (values
      ('vermittler_smtp_user', 'info@primundus.de'),
      ('vermittler_smtp_from', 'info@primundus.de'),
      ('vermittler_smtp_pass', '<HIER-DAS-PASSWORT>')
    ) as t(name, wert)
  loop
    select id into vorhanden from vault.secrets where name = eintrag.name;
    if vorhanden is null then
      perform vault.create_secret(eintrag.wert, eintrag.name, 'Vermittler-Mails: Versand ueber info@primundus.de (Ionos)');
    else
      perform vault.update_secret(vorhanden, eintrag.wert);
    end if;
  end loop;
end $$;

-- Kontrolle (zeigt KEIN Passwort, nur ob alles gesetzt ist):
select
  (select decrypted_secret from vault.decrypted_secrets where name = 'vermittler_smtp_user') as smtp_user,
  (select decrypted_secret from vault.decrypted_secrets where name = 'vermittler_smtp_from') as smtp_from,
  (select length(decrypted_secret) from vault.decrypted_secrets where name = 'vermittler_smtp_pass') as passwort_laenge;
