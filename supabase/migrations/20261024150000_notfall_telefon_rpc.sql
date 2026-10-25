/*
  # notfall_telefon(p_token) — Primundus-Notfallnummer nur für gebuchte Kunden

  Gebucht-Seite neu (Martin 24.10.2026: „Die Notfallnummer ist wichtiger als der andere Kontakt“). Die Nummer steht
  NIE im Code: Repo und Portal-Bundle sind öffentlich, und sie soll nur bei Kunden mit Buchung erscheinen. Sie liegt im
  Supabase Vault unter dem Namen `notfall_telefon` (Wert wird operativ eingespielt, NIE über Migrationen; Staging hat
  bewusst keinen Eintrag → die Funktion liefert dort null und die Seite zeigt kein Notfallfeld).

  Gibt die Nummer nur zurück, wenn
    - der Token zu einem Lead gehört und noch gültig ist (gleiche Regel wie onboard-to-mamamia; mit abgelaufenem Link
      sieht der Kunde ohnehin „Ihr Link ist abgelaufen“), UND
    - der Lead gebucht ist: ein `lead_jobs`-Eintrag mit Status `gebucht`, dessen Abreise fehlt oder heute (Berliner
      Kalendertag) oder später ist, ODER eine Annahme-Zeile jünger als 14 Tage (Vertrag frisch unterschrieben, der
      Spiegel `lead_jobs` hat die Buchung noch nicht).
  Sonst null. Kein Fehler, keine Unterscheidung „kein Lead“ / „nicht gebucht“ (verrät nichts über fremde Tokens).

  SECURITY DEFINER liest den Vault; anon/authenticated dürfen nur diese Funktion aufrufen (wie lead_by_token), nicht
  den Vault selbst. Additiv: alter Code ruft sie nicht auf (Święta zasada 3).
*/

create or replace function public.notfall_telefon(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.leads l
  join vault.decrypted_secrets s on s.name = 'notfall_telefon'
  where l.token = p_token
    and l.token_expires_at > now()
    and (
      exists (
        select 1 from public.lead_jobs j
        where j.lead_id = l.id
          and j.status = 'gebucht'
          and (j.abreise is null or j.abreise >= (now() at time zone 'Europe/Berlin')::date)
      )
      or exists (
        select 1 from public.lead_application_acceptances a
        where a.lead_id = l.id
          and a.accepted_at > now() - interval '14 days'
      )
    )
  limit 1
$$;

revoke all on function public.notfall_telefon(text) from public;
grant execute on function public.notfall_telefon(text) to anon, authenticated;
