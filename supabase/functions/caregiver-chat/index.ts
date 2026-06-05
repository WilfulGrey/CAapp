// Supabase Edge Function: caregiver-chat
// POST /functions/v1/caregiver-chat  body: { action, ... }
//
// Übersetzter, leitplanken-geschützter Chat zwischen Kunde (Lead) und
// beworbener Pflegekraft. Drei Actions:
//   - send  : Kunde → Pflegekraft. Token-Auth. Guardrail (Kontaktdaten/Geld
//             blockiert → 422). Übersetzt DE→PL. Speichert. Team-Notify
//             (best-effort über kostenrechner-Bridge).
//   - list  : Verlauf für Token (+ optional application_id). Token-Auth.
//   - reply : Pflegekraft → Kunde. Shared-Secret-Auth (Mamamia server2server).
//             Eingabe Polnisch, übersetzt PL→DE, speichert sender='caregiver'.
//
// Die Zustellung in die Caregiver-App übernimmt Mamamia: deren System liest
// neue Kundennachrichten (list) und postet Antworten (reply).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { BLOCK_MESSAGE, checkBlocked } from "./guardrail.ts";
import { type Lang, translate as realTranslate } from "./translate.ts";

// ─── Types ───────────────────────────────────────────────────────────────

export type Sender = "customer" | "caregiver" | "system";

export interface MessageRow {
  id: number;
  lead_id: string;
  application_id: number | null;
  caregiver_id: number | null;
  sender: Sender;
  text_de: string | null;
  text_pl: string | null;
  created_at: string;
}

export interface NewMessage {
  lead_id: string;
  application_id: number | null;
  caregiver_id: number | null;
  sender: Sender;
  text_de: string | null;
  text_pl: string | null;
}

// Schmale Daten-Schnittstelle → in Tests leicht zu faken (kein Supabase-
// Chain-Mocking nötig).
export interface ChatStore {
  findLeadIdByToken(token: string): Promise<string | null>;
  findTokenByLeadId(leadId: string): Promise<string | null>;
  insertMessage(row: NewMessage): Promise<MessageRow>;
  listMessages(leadId: string, applicationId: number | null): Promise<MessageRow[]>;
}

export interface ChatSecrets {
  anthropicApiKey: string;
  kostenrechnerUrl: string;
  /** Shared-Secret, das Mamamia bei der reply-Action mitschickt. */
  replySecret: string;
}

export interface ChatDeps {
  secrets: ChatSecrets;
  store: ChatStore;
  fetchFn?: typeof fetch;
  translateFn?: typeof realTranslate;
}

// Was die Frontend-Seite zu sehen bekommt (Kunde liest Deutsch).
function mapRow(r: MessageRow) {
  return {
    id: r.id,
    from: r.sender,
    text: r.text_de ?? r.text_pl ?? "",
    at: r.created_at,
    translated: r.sender === "caregiver",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// ─── Core handler (testbar) ────────────────────────────────────────────────

export async function handleRequest(req: Request, deps: ChatDeps): Promise<Response> {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  const { store, secrets } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const translate = deps.translateFn ?? realTranslate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const action = String(body.action ?? "");

  // ─── send: Kunde → Pflegekraft ──────────────────────────────────────────
  if (action === "send") {
    const token = typeof body.token === "string" ? body.token : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!token) return json({ error: "token required" }, 401, origin);
    if (!text) return json({ error: "text required" }, 400, origin);

    const leadId = await store.findLeadIdByToken(token);
    if (!leadId) return json({ error: "invalid token" }, 401, origin);

    // Leitplanke — serverseitig autoritativ.
    const blocked = checkBlocked(text);
    if (blocked) {
      return json({ error: "blocked", reason: blocked, message: BLOCK_MESSAGE[blocked] }, 422, origin);
    }

    const applicationId = toIntOrNull(body.application_id);
    const caregiverId = toIntOrNull(body.caregiver_id);

    // DE→PL übersetzen (Fallback: Original, falls Übersetzung nicht verfügbar).
    const pl = await translate(secrets.anthropicApiKey, text, "de" as Lang, "pl" as Lang, fetchFn);

    const row = await store.insertMessage({
      lead_id: leadId,
      application_id: applicationId,
      caregiver_id: caregiverId,
      sender: "customer",
      text_de: text,
      text_pl: pl ?? text,
    });

    // Team-Benachrichtigung — best effort, blockiert die Antwort nicht.
    notifyBridge(fetchFn, secrets.kostenrechnerUrl, {
      token,
      event: "caregiver_chat_message",
      metadata: {
        application_id: applicationId,
        caregiver_id: caregiverId,
        preview: text.slice(0, 160),
      },
    });

    return json({ message: mapRow(row) }, 200, origin);
  }

  // ─── list: Verlauf ───────────────────────────────────────────────────────
  if (action === "list") {
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return json({ error: "token required" }, 401, origin);
    const leadId = await store.findLeadIdByToken(token);
    if (!leadId) return json({ error: "invalid token" }, 401, origin);
    const applicationId = toIntOrNull(body.application_id);
    const rows = await store.listMessages(leadId, applicationId);
    return json({ messages: rows.map(mapRow) }, 200, origin);
  }

  // ─── reply: Pflegekraft → Kunde (Mamamia, server-to-server) ──────────────
  if (action === "reply") {
    const secret = req.headers.get("x-reply-secret") ?? "";
    if (!secrets.replySecret || secret !== secrets.replySecret) {
      return json({ error: "unauthorized" }, 401, origin);
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "text required" }, 400, origin);

    // Lead über Token ODER lead_id auflösen.
    let leadId: string | null = null;
    if (typeof body.lead_id === "string" && body.lead_id) {
      leadId = body.lead_id;
    } else if (typeof body.token === "string" && body.token) {
      leadId = await store.findLeadIdByToken(body.token);
    }
    if (!leadId) return json({ error: "lead not found" }, 400, origin);

    // Eingabe ist Polnisch → DE übersetzen.
    const de = await translate(secrets.anthropicApiKey, text, "pl" as Lang, "de" as Lang, fetchFn);

    const row = await store.insertMessage({
      lead_id: leadId,
      application_id: toIntOrNull(body.application_id),
      caregiver_id: toIntOrNull(body.caregiver_id),
      sender: "caregiver",
      text_de: de ?? text,
      text_pl: text,
    });

    // Kunden per Mail benachrichtigen („… hat Ihnen geantwortet") — über die
    // bestehende Bridge (token-auth). Token aus Payload oder via lead_id.
    const notifyToken = (typeof body.token === "string" && body.token)
      ? body.token
      : await store.findTokenByLeadId(leadId);
    if (notifyToken) {
      notifyBridge(fetchFn, secrets.kostenrechnerUrl, {
        token: notifyToken,
        event: "caregiver_chat_reply",
        metadata: {
          caregiver_name: typeof body.caregiver_name === "string" ? body.caregiver_name : "",
          preview: de ?? text,
        },
      });
    }
    return json({ message: mapRow(row) }, 200, origin);
  }

  return json({ error: `unknown action: ${action}` }, 400, origin);
}

function toIntOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== "" && v !== undefined ? Math.trunc(n) : null;
}

// Event an die bestehende kostenrechner-Bridge schicken (Team-Mail bzw.
// Kundenmail) — fire & forget.
function notifyBridge(
  fetchFn: typeof fetch,
  kostenrechnerUrl: string,
  payload: { token: string; event: string; metadata: Record<string, unknown> },
): void {
  try {
    fetchFn(`${kostenrechnerUrl.replace(/\/$/, "")}/api/lead-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((e) => console.error("notifyBridge failed:", (e as Error).message));
  } catch (e) {
    console.error("notifyBridge threw:", (e as Error).message);
  }
}

// ─── Real ChatStore (Supabase) ──────────────────────────────────────────────

function makeStore(supabase: SupabaseClient): ChatStore {
  return {
    async findLeadIdByToken(token) {
      const { data, error } = await supabase
        .from("leads")
        .select("id")
        .eq("token", token)
        .maybeSingle();
      if (error) {
        console.error("findLeadIdByToken error:", error.message);
        return null;
      }
      return (data?.id as string) ?? null;
    },
    async findTokenByLeadId(leadId) {
      const { data, error } = await supabase
        .from("leads")
        .select("token")
        .eq("id", leadId)
        .maybeSingle();
      if (error) {
        console.error("findTokenByLeadId error:", error.message);
        return null;
      }
      return (data?.token as string) ?? null;
    },
    async insertMessage(row) {
      const { data, error } = await supabase
        .from("lead_caregiver_messages")
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(`insertMessage: ${error.message}`);
      return data as MessageRow;
    },
    async listMessages(leadId, applicationId) {
      let q = supabase
        .from("lead_caregiver_messages")
        .select()
        .eq("lead_id", leadId);
      if (applicationId !== null) q = q.eq("application_id", applicationId);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw new Error(`listMessages: ${error.message}`);
      return (data ?? []) as MessageRow[];
    },
  };
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

if (import.meta.main) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const deps: ChatDeps = {
    secrets: {
      anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      kostenrechnerUrl: Deno.env.get("KOSTENRECHNER_URL") ?? "https://kostenrechner.primundus.de",
      replySecret: Deno.env.get("CAREGIVER_CHAT_REPLY_SECRET") ?? "",
    },
    store: makeStore(supabase),
  };
  Deno.serve((req) => handleRequest(req, deps));
}
