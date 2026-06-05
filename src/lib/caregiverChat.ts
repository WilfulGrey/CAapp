// Frontend-Client für die caregiver-chat Edge-Function (übersetzter Chat mit
// der beworbenen Pflegekraft). Token-Auth: der Lead-Token identifiziert den
// Kunden (wie bei der kostenrechner-Bridge) — kein Session-Cookie nötig.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ChatMessageDTO {
  id: number;
  from: 'customer' | 'caregiver' | 'system';
  text: string;
  at: string; // ISO-Timestamp
  translated?: boolean;
}

export type SendResult =
  | { ok: true; message: ChatMessageDTO }
  | { ok: false; blocked: 'kontakt' | 'geld'; message: string };

async function post(body: object): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/caregiver-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Supabase-Gateway verlangt apikey UND Authorization: Bearer.
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export async function listChat(token: string, applicationId?: number): Promise<ChatMessageDTO[]> {
  const res = await post({ action: 'list', token, application_id: applicationId ?? null });
  if (!res.ok) throw new Error(`listChat HTTP ${res.status}`);
  const json = (await res.json()) as { messages?: ChatMessageDTO[] };
  return json.messages ?? [];
}

export async function sendChat(
  token: string,
  text: string,
  applicationId?: number,
  caregiverId?: number,
): Promise<SendResult> {
  const res = await post({
    action: 'send',
    token,
    text,
    application_id: applicationId ?? null,
    caregiver_id: caregiverId ?? null,
  });
  if (res.status === 422) {
    const json = (await res.json()) as { reason?: 'kontakt' | 'geld'; message?: string };
    return { ok: false, blocked: json.reason ?? 'kontakt', message: json.message ?? 'Nachricht konnte nicht gesendet werden.' };
  }
  if (!res.ok) throw new Error(`sendChat HTTP ${res.status}`);
  const json = (await res.json()) as { message: ChatMessageDTO };
  return { ok: true, message: json.message };
}
