-- Facebook-Formular-Leads: Kontaktdaten im Kostenrechner vorausfüllen (Martin 28.11.2026, Registry #172).
--
-- Der Knopf in der Bestätigungsmail trägt einen Zufallsschlüssel (rechner_token) im
-- Adress-Fragment (#fb=…). Der Kostenrechner holt damit über POST /api/fb-kontakt Name,
-- E-Mail und Telefon und füllt den letzten Schritt vor. Die Daten selbst stehen nie im Link.
-- Schickt der Kunde den Rechner ab, verknüpft /api/angebot-anfordern die Zeile mit dem
-- neuen Lead (lead_id, rechner_at) — so sieht man, welche Formular-Leads bis zum Profil kommen.
--
--   rechner_token  Zufallsschlüssel (base64url, 32 Zeichen), eindeutig, nur service_role liest ihn
--   lead_id        Lead im Kostenrechner, der aus diesem Formular-Lead entstand
--   rechner_at     Zeitpunkt, zu dem der Kunde den Rechner mit diesem Schlüssel abgeschickt hat
--
-- Rückwärtskompatibel (Święta zasada 3): nur nullable Spalten; der laufende Code schreibt
-- sie nicht und liest sie nicht. Neue Zeilen alter Läufe bleiben ohne Schlüssel (Mail ohne #fb=).

alter table public.fb_leads add column if not exists rechner_token text;
alter table public.fb_leads add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.fb_leads add column if not exists rechner_at timestamptz;

create unique index if not exists fb_leads_rechner_token on public.fb_leads (rechner_token) where rechner_token is not null;
