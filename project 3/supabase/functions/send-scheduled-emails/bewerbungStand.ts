// Registry #125 (16.10.2026): Führt mamamia die Bewerbung noch, an die eine Erinnerung
// erinnert? Der Detect-Sweep (`cancelOrphanedReminders`, Cron alle 15 Min.) bricht offene
// Erinnerungen zu verschwundenen Bewerbungen ab — aber eine Rausnahme im SA-Portal kurz vor
// der Sendezeit rutschte durch (Kundin 52dc3e9d: Rausnahme ~11:50, Erinnerung 12:00).
// Deshalb fragt der Versand VOR jeder Bewerbungs-Erinnerung selbst bei mamamia nach.
//
// Zugang: dieselben Agentur-Secrets wie die Edge Functions im Root (`MAMAMIA_ENDPOINT`,
// `MAMAMIA_AUTH_ENDPOINT`, `MAMAMIA_AGENCY_EMAIL`, `MAMAMIA_AGENCY_PASSWORD`; Supabase-Secrets
// gelten projektweit). `_shared/mamamiaClient.ts` lässt sich von hier nicht importieren
// (die Funktion wird aus `project 3` ausgeliefert), deshalb der kleine eigene Client —
// Login-Mutation und Abfrage sind 1:1 die aus `_shared/mamamiaClient.ts` bzw.
// `detect-caregiver-events/queries.ts` (`LIST_APPLICATIONS`, dort auf PROD bewährt; die
// Felder `id`/`caregiver_id` sind eine Teilmenge davon, `rejected_at` bewusst NICHT —
// das Feld brach auf PROD jede Abfrage, 11.–13.07.).
//
// Entscheidung: „aktiv“ = die Pflegekraft steht mit irgendeiner Bewerbung in der Liste des
// Jobs (eine erneut eingestellte Bewerbung derselben Kraft zählt — die Erinnerung meint sie
// weiter). „weg“ = keine Bewerbung dieser Kraft mehr ⇒ Erinnerung abbrechen, Grund
// `application_no_longer_active` wie beim Sweep.
// Seit Registry #136 tragen neue Zeilen ihre `application_id`, und eine neue Bewerbung derselben
// Kraft bekommt eigene Erinnerungen. Für solche Zeilen zählt deshalb nur DIESE Bewerbung — sonst
// liefen die Erinnerungen der alten (mit ihrem alten Countdown) neben denen der neuen weiter.
// Zeilen ohne `application_id` behalten die Regel je Pflegekraft. Fehler (Timeout, HTTP, GraphQL) werfen —
// „nicht gefragt“ ist nie „weg“ (Lehre Registry #89); der Aufrufer verschiebt die Zeile.
import { sendezeitIso } from "./quietHours.ts";

export interface StandDeps {
  /** Agentur-GraphQL, z. B. https://backend.prod.mamamia.app/graphql */
  endpoint: string;
  /** Login, z. B. https://backend.prod.mamamia.app/graphql/auth */
  authEndpoint: string;
  email: string;
  password: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export type BewerbungStand = "aktiv" | "weg";

export interface BewerbungZeile {
  id?: number | null;
  caregiver_id?: number | string | null;
}

/** Pure: steht die Bewerbung noch in der Liste? Mit `applicationId` genau diese (Registry #136),
 *  ohne irgendeine Bewerbung der Pflegekraft (Zeilen von vor #136). */
export function standAus(
  zeilen: BewerbungZeile[], caregiverId: number | string, applicationId: number | string | null = null,
): BewerbungStand {
  const cg = String(caregiverId);
  const app = applicationId == null ? "" : String(applicationId);
  if (app) {
    return zeilen.some((z) => z.id != null && String(z.id) === app && (z.caregiver_id == null || String(z.caregiver_id) === cg))
      ? "aktiv"
      : "weg";
  }
  return zeilen.some((z) => z.caregiver_id != null && String(z.caregiver_id) === cg) ? "aktiv" : "weg";
}

/** Keine Antwort von mamamia: neuer Versuch in zehn Minuten, höchstens dreimal — danach
 *  geht die Erinnerung wie bisher raus (`null`). Ein 30-Minuten-Ausfall darf nicht alle
 *  Erinnerungen verschlucken; die Rausnahme-Lücke bleibt dann so groß wie vor #125. */
export const STAND_WIEDERHOLUNGEN = 3;
export function standNochmalUm(fehlschlaege: number, jetzt: Date): string | null {
  return fehlschlaege <= STAND_WIEDERHOLUNGEN
    ? sendezeitIso(new Date(jetzt.getTime() + 10 * 60_000))
    : null;
}

/** Secrets aus der Umgebung; fehlt eines, gibt es keine Prüfung (der Aufrufer loggt). */
export function standDepsAusEnv(
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StandDeps | null {
  const endpoint = env("MAMAMIA_ENDPOINT");
  const authEndpoint = env("MAMAMIA_AUTH_ENDPOINT");
  const email = env("MAMAMIA_AGENCY_EMAIL");
  const password = env("MAMAMIA_AGENCY_PASSWORD");
  if (!endpoint || !authEndpoint || !email || !password) return null;
  return { endpoint, authEndpoint, email, password };
}

const LOGIN_AGENCY = /* GraphQL */ `
  mutation LoginAgency($email: String!, $password: String!) {
    LoginAgency(email: $email, password: $password, remember: true) { token }
  }
`;

const LISTE = /* GraphQL */ `
  query StandListApplications($job_offer_id: Int!, $limit: Int, $page: Int) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: $limit, page: $page) {
      total
      data { id caregiver_id }
    }
  }
`;

const SEITE = 100;
const MAX_SEITEN = 5;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

// Token je warmer Instanz (Muster `_shared/mamamiaClient.ts`), damit nicht jede Erinnerung
// einen Login kostet.
let tokenCache: { token: string; seit: number } | null = null;
export function _standTokenCacheLeeren(): void {
  tokenCache = null;
}

interface GraphQLAntwort<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphql<T>(
  f: typeof fetch, url: string, body: Record<string, unknown>, token: string | null, timeoutMs: number,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await f(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`mamamia HTTP ${res.status}`);
  const json = await res.json() as GraphQLAntwort<T>;
  if (json.errors && json.errors.length > 0) throw new Error(`mamamia: ${json.errors[0].message}`);
  if (!json.data) throw new Error("mamamia: Antwort ohne data");
  return json.data;
}

async function agenturToken(deps: StandDeps, f: typeof fetch, timeoutMs: number): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.seit < TOKEN_TTL_MS) return tokenCache.token;
  const d = await graphql<{ LoginAgency?: { token?: string | null } | null }>(
    f, deps.authEndpoint, { query: LOGIN_AGENCY, variables: { email: deps.email, password: deps.password } }, null, timeoutMs,
  );
  const token = d.LoginAgency?.token;
  if (!token) throw new Error("mamamia: LoginAgency ohne token");
  tokenCache = { token, seit: Date.now() };
  return token;
}

/**
 * Fragt mamamia, ob die Bewerbung (bzw. ohne `applicationId` irgendeine Bewerbung der
 * Pflegekraft) auf dem Job noch steht.
 * Wirft bei jedem Fehler — der Aufrufer entscheidet (verschieben, nicht abbrechen).
 */
export async function bewerbungStand(
  deps: StandDeps, jobOfferId: number, caregiverId: number | string, applicationId: number | string | null = null,
): Promise<BewerbungStand> {
  const f = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 12_000;
  const zeilen: BewerbungZeile[] = [];
  let token = await agenturToken(deps, f, timeoutMs);
  for (let page = 1; page <= MAX_SEITEN; page++) {
    let d: { JobOfferApplicationsWithPagination?: { data?: BewerbungZeile[] | null } | null };
    try {
      d = await graphql(f, deps.endpoint, { query: LISTE, variables: { job_offer_id: jobOfferId, limit: SEITE, page } }, token, timeoutMs);
    } catch (e) {
      // Abgelaufener Token (Instanz lebt länger als die 23 h): einmal neu anmelden.
      if (page === 1 && tokenCache && /HTTP 401|Unauthenticated/i.test(e instanceof Error ? e.message : String(e))) {
        tokenCache = null;
        token = await agenturToken(deps, f, timeoutMs);
        d = await graphql(f, deps.endpoint, { query: LISTE, variables: { job_offer_id: jobOfferId, limit: SEITE, page } }, token, timeoutMs);
      } else {
        throw e;
      }
    }
    const data = d.JobOfferApplicationsWithPagination?.data ?? [];
    zeilen.push(...data);
    if (data.length < SEITE) break;
  }
  return standAus(zeilen, caregiverId, applicationId);
}
