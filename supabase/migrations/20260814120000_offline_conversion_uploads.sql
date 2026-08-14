/*
  # offline_conversion_uploads — Status des Google-Ads-Offline-Uploads

  Eine Zeile je Lead, dessen „Qualifizierter Lead"-Conversion (erstes
  patient_data_saved, Klick-ID vorhanden) an Google Ads hochgeladen wurde
  (status='uploaded') oder permanent gescheitert ist
  (status='permanent_failure', z. B. CLICK_NOT_FOUND). Leads OHNE Zeile
  sind offen und werden vom täglichen Cron-Lauf (upload-offline-conversions
  Edge Function) erneut versucht.

  Backward-compatible: neue Tabelle, kein bestehender Code liest/schreibt
  sie (Święta zasada nr 3). Zugriff nur service_role (Edge Function) —
  RLS an, keine anon-Policies.
*/

create table if not exists offline_conversion_uploads (
  lead_id uuid primary key references leads(id) on delete cascade,
  conversion_action text not null,
  click_id text not null,
  click_id_type text not null check (click_id_type in ('gclid', 'wbraid', 'gbraid')),
  conversion_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  status text not null default 'uploaded' check (status in ('uploaded', 'permanent_failure')),
  detail text
);

alter table offline_conversion_uploads enable row level security;
