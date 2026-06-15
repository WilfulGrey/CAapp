/*
  lead_jobs: Karten-Anreicherung fuer die "Alle meine Einsaetze"-Uebersicht
  (Multi-Job UI-Paritaet mit dem Design-Mock ?preview=jobs).

  Bisher spiegelt der lead_jobs-Sync (mamamia-proxy listLeadJobs + der
  detect-caregiver-events Cron) nur status/anreise/abreise aus Mamamias
  Customer.job_offers. Die Design-Karten zeigen zusaetzlich:
    - pflegekraft: Name der gebuchten Pflegekraft (aus JobOffer.final_confirmation.caregiver)
    - bewerbungen: Anzahl Bewerbungen (aus JobOffer.applications_count)
  Beide werden vom selben Sync mitgespiegelt, damit das Frontend AUSSCHLIESSLICH
  aus lead_jobs (Supabase) liest — kein Mamamia-Call pro Render.

  Beide nullable (eine geplante Stelle hat keine Pflegekraft; eine gebuchte
  keine relevante Bewerbungs-Anzeige). Re-runnable; shell-safe fuer run_query.
*/
ALTER TABLE lead_jobs
  ADD COLUMN IF NOT EXISTS pflegekraft text;

ALTER TABLE lead_jobs
  ADD COLUMN IF NOT EXISTS bewerbungen integer;
