-- Persistent storage for caregivers a customer has declined ("Nein danke")
-- via the customer portal modal. Without this, declined caregivers
-- reappear after F5 / on a new device, undoing the customer's choice.
--
-- Mamamia exposes an `is_rejected` filter on JobOfferMatchings server-side
-- but no obvious public mutation to set it, so we keep the rejection
-- ledger in our own leads row. Single source of truth = our DB.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS declined_caregiver_ids integer[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN leads.declined_caregiver_ids IS
  'Mamamia caregiver_ids the customer rejected via "Nein danke" in the portal modal.
   Seeded into nurseStatuses on portal mount so the rejection survives page refresh
   and cross-device sessions.';

-- RPC that the customer portal calls with anon key + their lead token.
-- SECURITY DEFINER + WHERE token = p_token = the token itself acts as the
-- per-customer secret. Function does the array_append/array_remove
-- atomically so two parallel decline clicks can't lose an id.
--
-- We deliberately don't return the row (avoids leaking other lead fields
-- to the anon caller); frontend just refetches the lead after a successful
-- update if it needs the latest state.
CREATE OR REPLACE FUNCTION public.set_declined_caregiver(
  p_token        text,
  p_caregiver_id integer,
  p_declined     boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_declined THEN
    UPDATE leads
       SET declined_caregiver_ids =
             CASE WHEN p_caregiver_id = ANY(declined_caregiver_ids)
                  THEN declined_caregiver_ids
                  ELSE array_append(declined_caregiver_ids, p_caregiver_id)
             END,
           updated_at = now()
     WHERE token = p_token;
  ELSE
    UPDATE leads
       SET declined_caregiver_ids = array_remove(declined_caregiver_ids, p_caregiver_id),
           updated_at = now()
     WHERE token = p_token;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_declined_caregiver(text, integer, boolean) TO anon, authenticated;
