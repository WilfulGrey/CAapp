-- Add a metadata JSONB column to scheduled_emails so reminder-style rows
-- (interest_reminder, application_reminder) can carry the caregiver info
-- they're built around without us needing a separate lookup table.
--
-- Existing rows (eingangsbestaetigung, nachfass_1/_2) leave metadata empty
-- and don't need it — they fetch lead data fresh at send time.

ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
