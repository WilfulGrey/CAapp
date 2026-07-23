/*
  # application_intros

  Customer-safe, PII-free "Hinweis der Agentur" per caregiver application,
  derived by LLM from Mamamia's raw application.message. That raw field is a
  MIXED bag: recruiter notes worth showing the family ("reist mit Hund an",
  "erst ab 15. verfügbar", Besonderheiten) sit in the same free text as hard
  PII — caregiver full name, phone, salary breakdown (DLV/PK-Netto/RK), ID
  stubs (pr-XXXX-N). Verified live 2026-05-19 on Customer 8546 application
  7997. The raw field stays blocked at the customer boundary (LIST_APPLICATIONS
  drops it); this table caches only the redacted, reworded result.

  Written server-side by mamamia-proxy.listApplications (service-role) on the
  first portal load per application, keyed by the Mamamia application_id.
  source_hash = SHA-256 of the raw message → regenerate when a recruiter edits
  it. intro_text NULL = generated but no customer-usable info found (nothing to
  show) — distinct from "not yet generated" (no row at all → next load tries).

  RLS: enabled, no public policy. Access via mamamia-proxy service-role only —
  same pattern as caregiver_invite_attempts / lead_application_acceptances.

  Manual apply (no CI for migrations):
    npx supabase db push --linked --project-ref taggpiwpwthgpcmaiqjw  # staging
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi  # prod
*/

CREATE TABLE IF NOT EXISTS application_intros (
  application_id integer PRIMARY KEY,
  job_offer_id  integer,
  intro_text    text,
  source_hash   text NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_intros ENABLE ROW LEVEL SECURITY;
