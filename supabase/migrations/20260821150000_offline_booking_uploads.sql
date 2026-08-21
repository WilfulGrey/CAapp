/*
  # offline_booking_uploads — Status des Google-Ads-Offline-Uploads für BUCHUNGEN

  Eine Zeile je Lead, dessen „Kunde gebucht"-Conversion (ERSTE Zeile in
  lead_application_acceptances, Klick-ID vorhanden) an Google Ads hochgeladen
  wurde (status='uploaded') oder permanent gescheitert ist
  (status='permanent_failure'). Leads OHNE Zeile sind offen und werden vom
  täglichen Cron-Lauf (upload-offline-conversions Edge Function, Phase 2)
  erneut versucht.

  BEWUSST eigene Tabelle statt Erweiterung von offline_conversion_uploads:
  deren PRIMARY KEY ist lead_id und der laufende Code upsertet mit
  onConflict('lead_id') — ein Umbau auf zusammengesetzten Schlüssel wäre NICHT
  rückwärtskompatibel mit dem laufenden Code (Święta zasada nr 3). Neue
  Tabelle = additiv, kein bestehender Code liest/schreibt sie.

  Fachlich: EINE Buchungs-Conversion je Lead (Neukunden-Signal fürs Bidding).
  Folge-Einsätze desselben Leads (Multi-Job, Bug #25) sind KEINE neuen
  Werbe-Conversions. Wert: fix 400 € (Monats-Bruttomarge), Conversion-Aktion
  „Kunde gebucht (Buchung)" = conversionActions/7728914324, secondary.

  Zugriff nur service_role (Edge Function) — RLS an, keine anon-Policies.
*/

create table if not exists offline_booking_uploads (
  lead_id uuid primary key references leads(id) on delete cascade,
  conversion_action text not null,
  click_id text not null,
  click_id_type text not null check (click_id_type in ('gclid', 'wbraid', 'gbraid')),
  conversion_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  status text not null default 'uploaded' check (status in ('uploaded', 'permanent_failure')),
  detail text
);

alter table offline_booking_uploads enable row level security;
