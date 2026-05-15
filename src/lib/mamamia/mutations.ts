// Mutation hooks for mamamia-proxy write actions.
// Shape: { mutate(vars): Promise<T>, loading, error, data }.

import { useCallback, useState } from 'react';
import { callMamamia, type ProxyAction } from './client';

export interface MutationState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useMamamiaMutation<TVars extends Record<string, unknown>, TResult>(
  action: ProxyAction,
) {
  const [state, setState] = useState<MutationState<TResult>>({
    data: null,
    loading: false,
    error: null,
  });

  const mutate = useCallback(
    async (variables: TVars): Promise<TResult> => {
      setState({ data: null, loading: true, error: null });
      try {
        const data = await callMamamia<TResult>(action, variables);
        setState({ data, loading: false, error: null });
        return data;
      } catch (e) {
        setState({ data: null, loading: false, error: e as Error });
        throw e;
      }
    },
    [action],
  );

  return { ...state, mutate };
}

// ─── Typed wrappers ──────────────────────────────────────────────────────

export function useRejectApplication() {
  return useMamamiaMutation<
    { application_id: number; reject_message?: string },
    { RejectApplication: { id: number; rejected_at: string; reject_message: string | null } }
  >('rejectApplication');
}

export interface ContractPatientInput {
  salutation?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  street_number?: string;
  zip_code?: string;
  city?: string;
  location_id?: number;
  location_custom_text?: string;
  is_same_as_first_patient?: boolean;
  is_same_as_contact?: boolean;
  contact_type?: string;
}

export interface ContractContactInput {
  salutation?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  is_same_as_first_patient?: boolean;
}

export function useStoreConfirmation() {
  return useMamamiaMutation<
    {
      application_id: number;
      contract_patient?: ContractPatientInput;
      contract_contact?: ContractContactInput;
      message?: string;
      is_confirm_binding?: boolean;
      update_customer?: boolean;
    },
    { StoreConfirmation: { id: number; application_id: number; is_confirm_binding: boolean } }
  >('storeConfirmation');
}

// inviteCaregiver maps to mamamia-proxy → StoreRequest (panel-flow,
// agency-only session). Optional `message` is forwarded to the
// caregiver in the request notification. Backend returns the persisted
// Request row so the UI can show "wysłano X" / track per-id.
export interface RequestRow {
  id: number;
  caregiver_id: number;
  job_offer_id: number;
  message: string | null;
  created_at: string;
}

export function useInviteCaregiver() {
  return useMamamiaMutation<
    { caregiver_id: number; message?: string },
    { StoreRequest: RequestRow }
  >('inviteCaregiver');
}

export function useUpdateCustomer() {
  return useMamamiaMutation<
    Record<string, unknown>,
    { UpdateCustomer: { id: number; customer_id: string } }
  >('updateCustomer');
}

// Narrow write — replaces only customer.job_description, never touching
// patients / wish / equipments / contract. The proxy action `updateJobDescription`
// re-fetches current associations as id-stubs before the write, so Mamamia's
// "omitted = wipe" rule can't damage them. Used for the AI overlay that fires
// after the main patient-form save in CustomerPortalPage.onSaveToMamamia.
export function useUpdateJobDescription() {
  return useMamamiaMutation<
    { text: string },
    { UpdateCustomer: { id: number; customer_id: string } }
  >('updateJobDescription');
}
