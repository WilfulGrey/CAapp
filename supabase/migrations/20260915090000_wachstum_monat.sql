-- Ergebnisrechnung auf der Admin-Seite „Wachstum“ (Registry #73, 15.09.2026).
-- Martin: „Wir wissen pro Kunde … die Provision (meist 550 Euro). Davon gehen
-- ca. 50 Euro an variablen Kosten an die CG-Kosten und dann die Möglichkeit der
-- manuellen Eingabe von Gemeinkosten pro Monat (Personal, Steuerberater,
-- Marketing etc.), damit wir dann sehen, wo wir stehen."
--
-- Eine Zeile je Monat, die Martin im Admin gespeichert hat. Ein Monat ohne
-- Zeile übernimmt die letzte frühere Zeile (Gemeinkosten laufen meist weiter);
-- das rechnet lib/wachstum.ts, nicht die Datenbank.
--   provision_je_kunde / variabel_je_kunde: Euro je Kunde und vollem Monat
--     (30 Einsatztage), gerechnet wird je Einsatztag = Wert / 30.
--   gemeinkosten: [{"posten": "Personal", "betrag": 1234.5}, …] in Euro netto
--     je Monat.
-- Neue Tabelle, vom laufenden Code nicht gelesen: rückwärtskompatibel.
create table if not exists public.wachstum_monat (
  monat              date          primary key check (extract(day from monat) = 1),
  provision_je_kunde numeric(10,2) not null default 550 check (provision_je_kunde >= 0),
  variabel_je_kunde  numeric(10,2) not null default 50  check (variabel_je_kunde >= 0),
  gemeinkosten       jsonb         not null default '[]'::jsonb check (jsonb_typeof(gemeinkosten) = 'array'),
  aktualisiert_at    timestamptz   not null default now()
);
alter table public.wachstum_monat enable row level security;
-- Keine Policies: nur service_role (Route /api/admin/wachstum hinter dem Admin-Cookie).
revoke all on table public.wachstum_monat from anon, authenticated;
