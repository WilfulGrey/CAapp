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

export function useInviteCaregiver() {
  return useMamamiaMutation<
    { caregiver_id: number },
    { SendInvitationCaregiver: boolean }
  >('inviteCaregiver');
}

export function useUpdateCustomer() {
  return useMamamiaMutation<
    Record<string, unknown>,
    { UpdateCustomer: { id: number; customer_id: string } }
  >('updateCustomer');
}
