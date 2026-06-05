import { assert, assertEquals } from "@std/assert";
import {
  type ChatDeps,
  type ChatStore,
  handleRequest,
  type MessageRow,
  type NewMessage,
} from "../index.ts";
import { checkBlocked } from "../guardrail.ts";

// ─── In-memory Fake-Store ────────────────────────────────────────────────────

function makeFakeStore(opts: { leadId?: string | null } = {}): ChatStore & { rows: MessageRow[] } {
  const rows: MessageRow[] = [];
  let id = 1;
  return {
    rows,
    findLeadIdByToken(token: string) {
      if ("leadId" in opts) return Promise.resolve(opts.leadId ?? null);
      return Promise.resolve(token === "good-token" ? "lead-uuid-1" : null);
    },
    findTokenByLeadId(leadId: string) {
      return Promise.resolve(leadId === "lead-uuid-1" ? "good-token" : null);
    },
    insertMessage(row: NewMessage) {
      const full: MessageRow = { id: id++, created_at: "2026-06-05T12:00:00Z", ...row };
      rows.push(full);
      return Promise.resolve(full);
    },
    listMessages(leadId: string, applicationId: number | null) {
      return Promise.resolve(
        rows.filter((r) => r.lead_id === leadId && (applicationId === null || r.application_id === applicationId)),
      );
    },
  };
}

// Übersetzung deterministisch faken (kein Netzwerk): markiert die Zielsprache.
const fakeTranslate = (
  _key: string,
  text: string,
  _from: string,
  to: string,
) => Promise.resolve(`[${to}] ${text}`);

const fakeFetch: typeof fetch = () =>
  Promise.resolve(new Response("{}", { status: 200 }));

function deps(store: ChatStore, fetchFn: typeof fetch = fakeFetch): ChatDeps {
  return {
    secrets: { anthropicApiKey: "k", kostenrechnerUrl: "https://kr.test", replySecret: "s3cret" },
    store,
    fetchFn,
    translateFn: fakeTranslate as unknown as ChatDeps["translateFn"],
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/caregiver-chat", {
    method: "POST",
    headers: { Origin: "http://localhost:5173", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Guardrail ────────────────────────────────────────────────────────────────

Deno.test("guardrail: blocks email, phone, money; allows date + normal text", () => {
  assertEquals(checkBlocked("schreib mir an a@b.de"), "kontakt");
  assertEquals(checkBlocked("ruf an 0176 12345678"), "kontakt");
  assertEquals(checkBlocked("2000 € im Monat?"), "geld");
  assertEquals(checkBlocked("Wie viel Gehalt bekommen Sie?"), "geld");
  assertEquals(checkBlocked("Können Sie ab dem 19.05.2026 anreisen?"), null);
  assertEquals(checkBlocked("Haben Sie Erfahrung mit Demenz?"), null);
});

// ─── send ─────────────────────────────────────────────────────────────────────

Deno.test("send: stores customer message DE + translated PL, returns mapped row", async () => {
  const store = makeFakeStore();
  const res = await handleRequest(
    post({ action: "send", token: "good-token", application_id: 42, caregiver_id: 7, text: "Hallo, ab wann können Sie anreisen?" }),
    deps(store),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.message.from, "customer");
  assertEquals(out.message.text, "Hallo, ab wann können Sie anreisen?"); // Kunde sieht DE
  assertEquals(store.rows.length, 1);
  assertEquals(store.rows[0].sender, "customer");
  assertEquals(store.rows[0].text_de, "Hallo, ab wann können Sie anreisen?");
  assertEquals(store.rows[0].text_pl, "[pl] Hallo, ab wann können Sie anreisen?");
  assertEquals(store.rows[0].application_id, 42);
});

Deno.test("send: guardrail blocks phone → 422, nothing stored", async () => {
  const store = makeFakeStore();
  const res = await handleRequest(
    post({ action: "send", token: "good-token", text: "Rufen Sie mich an unter 0176 12345678" }),
    deps(store),
  );
  assertEquals(res.status, 422);
  const out = await res.json();
  assertEquals(out.reason, "kontakt");
  assert(typeof out.message === "string" && out.message.length > 0);
  assertEquals(store.rows.length, 0);
});

Deno.test("send: invalid token → 401", async () => {
  const store = makeFakeStore();
  const res = await handleRequest(post({ action: "send", token: "nope", text: "hi" }), deps(store));
  assertEquals(res.status, 401);
  assertEquals(store.rows.length, 0);
});

// ─── list ───────────────────────────────────────────────────────────────────

Deno.test("list: returns thread for token mapped to DE text", async () => {
  const store = makeFakeStore();
  await handleRequest(post({ action: "send", token: "good-token", application_id: 1, text: "Frage eins" }), deps(store));
  const res = await handleRequest(post({ action: "list", token: "good-token", application_id: 1 }), deps(store));
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.messages.length, 1);
  assertEquals(out.messages[0].from, "customer");
  assertEquals(out.messages[0].text, "Frage eins");
});

// ─── reply ──────────────────────────────────────────────────────────────────

Deno.test("reply: wrong secret → 401", async () => {
  const store = makeFakeStore();
  const res = await handleRequest(
    post({ action: "reply", lead_id: "lead-uuid-1", text: "Dzień dobry" }, { "x-reply-secret": "wrong" }),
    deps(store),
  );
  assertEquals(res.status, 401);
});

Deno.test("reply: correct secret stores caregiver msg, PL input + DE translation, notifies customer", async () => {
  const store = makeFakeStore();
  // Bridge-Aufrufe aufzeichnen, um die Kundenmail-Benachrichtigung zu prüfen.
  const bridgeCalls: Array<Record<string, unknown>> = [];
  const recordingFetch: typeof fetch = (_url, init) => {
    try { bridgeCalls.push(JSON.parse(String(init?.body ?? "{}"))); } catch { /* ignore */ }
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const res = await handleRequest(
    post({ action: "reply", lead_id: "lead-uuid-1", application_id: 1, caregiver_name: "Maria K.", text: "Dzień dobry" }, { "x-reply-secret": "s3cret" }),
    deps(store, recordingFetch),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.message.from, "caregiver");
  assertEquals(out.message.translated, true);
  assertEquals(out.message.text, "[de] Dzień dobry"); // Kunde sieht DE-Übersetzung
  assertEquals(store.rows[0].text_pl, "Dzień dobry");
  assertEquals(store.rows[0].text_de, "[de] Dzień dobry");
  // Kundenmail-Event an die Bridge ausgelöst.
  const replyEvt = bridgeCalls.find((c) => c.event === "caregiver_chat_reply");
  assert(replyEvt, "expected caregiver_chat_reply bridge call");
  assertEquals((replyEvt!.metadata as Record<string, unknown>).preview, "[de] Dzień dobry");
});

// ─── misc ─────────────────────────────────────────────────────────────────────

Deno.test("unknown action → 400", async () => {
  const res = await handleRequest(post({ action: "frobnicate", token: "good-token" }), makeFakeStore() && deps(makeFakeStore()));
  assertEquals(res.status, 400);
});

Deno.test("OPTIONS preflight → ok with CORS", async () => {
  const res = await handleRequest(
    new Request("http://localhost/caregiver-chat", { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } }),
    deps(makeFakeStore()),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
});
