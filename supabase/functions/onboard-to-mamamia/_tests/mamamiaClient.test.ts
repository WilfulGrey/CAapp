import { assertEquals, assertRejects } from "@std/assert";
import { loginAgency, mamamiaRequest } from "../../_shared/mamamiaClient.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function fakeFetch(
  responses: Array<{ status?: number; body: object; expectedUrl?: string }>,
): typeof fetch {
  let idx = 0;
  return async (input: string | URL | Request, _init?: RequestInit) => {
    const r = responses[idx++];
    if (!r) throw new Error(`Unexpected fetch call #${idx}`);
    if (r.expectedUrl && input.toString() !== r.expectedUrl) {
      throw new Error(`URL mismatch: got ${input}, expected ${r.expectedUrl}`);
    }
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ─── loginAgency ──────────────────────────────────────────────────────────

Deno.test("loginAgency: returns token on success", async () => {
  const fetchFn = fakeFetch([{
    body: {
      data: {
        LoginAgency: {
          id: 8190,
          name: "Primundus",
          email: "primundus+portal@mamamia.app",
          token: "32649|abc",
        },
      },
    },
  }]);

  const result = await loginAgency({
    authEndpoint: "https://beta.example/graphql/auth",
    email: "primundus+portal@mamamia.app",
    password: "pw",
    fetchFn,
  });

  assertEquals(result.token, "32649|abc");
  assertEquals(result.user.id, 8190);
});

Deno.test("loginAgency: throws on GraphQL errors", async () => {
  const fetchFn = fakeFetch([{
    body: { errors: [{ message: "Invalid credentials" }] },
  }]);

  await assertRejects(
    () =>
      loginAgency({
        authEndpoint: "https://beta.example/graphql/auth",
        email: "x",
        password: "y",
        fetchFn,
      }),
    Error,
    "Invalid credentials",
  );
});

Deno.test("loginAgency: throws on HTTP error", async () => {
  const fetchFn = fakeFetch([{ status: 500, body: { error: "Server error" } }]);

  await assertRejects(
    () =>
      loginAgency({
        authEndpoint: "https://beta.example/graphql/auth",
        email: "x",
        password: "y",
        fetchFn,
      }),
    Error,
    "HTTP 500",
  );
});

// ─── mamamiaRequest ──────────────────────────────────────────────────────

Deno.test("mamamiaRequest: returns data on success", async () => {
  const fetchFn = fakeFetch([{
    body: { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
  }]);

  const data = await mamamiaRequest<{ StoreCustomer: { id: number } }>({
    endpoint: "https://beta.example/graphql",
    token: "bearer-xyz",
    query: "mutation { StoreCustomer(first_name: \"X\") { id customer_id status } }",
    fetchFn,
  });

  assertEquals(data.StoreCustomer.id, 7566);
});

Deno.test("mamamiaRequest: throws on GraphQL errors (first error's message)", async () => {
  const fetchFn = fakeFetch([{
    body: { errors: [{ message: "validation", extensions: { validation: { phone: ["required"] } } }] },
  }]);

  await assertRejects(
    () =>
      mamamiaRequest({
        endpoint: "https://beta.example/graphql",
        token: "t",
        query: "mutation { X }",
        fetchFn,
      }),
    Error,
    "validation",
  );
});

Deno.test("mamamiaRequest: throws on HTTP error with status code", async () => {
  const fetchFn = fakeFetch([{ status: 401, body: { error: "Unauthorized" } }]);

  await assertRejects(
    () =>
      mamamiaRequest({
        endpoint: "https://beta.example/graphql",
        token: "expired",
        query: "{}",
        fetchFn,
      }),
    Error,
    "HTTP 401",
  );
});

Deno.test("mamamiaRequest: sends bearer auth header", async () => {
  let seenAuth: string | null = null;
  const fetchFn: typeof fetch = async (_input, init) => {
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    seenAuth = headers.get("authorization");
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  };

  await mamamiaRequest({
    endpoint: "https://beta.example/graphql",
    token: "bearer-zzz",
    query: "{ ok }",
    fetchFn,
  });

  assertEquals(seenAuth, "Bearer bearer-zzz");
});

Deno.test("mamamiaRequest: variables are serialized in request body", async () => {
  let seenBody: string | null = null;
  const fetchFn: typeof fetch = async (_input, init) => {
    seenBody = (init as RequestInit | undefined)?.body as string;
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  };

  await mamamiaRequest({
    endpoint: "https://beta.example/graphql",
    token: "t",
    query: "mutation ($id: Int!) { DestroyCustomer(id: $id) }",
    variables: { id: 7566 },
    fetchFn,
  });

  assertEquals(JSON.parse(seenBody!).variables, { id: 7566 });
});
