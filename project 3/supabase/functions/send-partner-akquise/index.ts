// Partner-Akquise: Rundmail + drei Nachfassmails an Vermittler, eigener Versand
// über partner@primundus.de (IONOS). Siehe plan.ts für Reihe und Drosselung.
//
// ZWEI SPERREN, beide müssen offen sein, bevor eine Mail an einen Kontakt geht:
//   1. Secret PARTNER_VERSAND_AKTIV=1
//   2. partner_mail_freigaben.freigegeben_am für genau diese Mail
// Martin, 11.09.2026: „Es darf aber keine mail raus, bevor das nicht explizit
// freigegeben wurde von mir.“
//
// Aufruf nur mit Service-Key (POST, JSON):
//   {"modus":"probelauf"}                       sendet nichts, zeigt Stand + nächsten Lauf (Standard)
//   {"modus":"test","mail":"haupt","variante":"A"}  eine Mail an PARTNER_TEST_AN (martin@wyzzi.net)
//   {"modus":"test","alle":true}                alle fünf Fassungen an PARTNER_TEST_AN
//   {"modus":"versand"}                         Cron-Lauf, nur mit beiden Sperren offen
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
import { planeLauf, REIHE, STANDARD_GRENZEN, type Kontakt, type MailKey, type Versand } from "./plan.ts";
import { anredeZeile, renderMail, type FertigeMail, type Variante } from "./mails.ts";

const SITE = (Deno.env.get("PARTNER_SITE_URL") ?? "https://kostenrechner.primundus.de").replace(/\/$/, "");
const TEST_AN = (Deno.env.get("PARTNER_TEST_AN") ?? "martin@wyzzi.net")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

interface KontaktZeile extends Kontakt {
  anrede: string | null;
  nachname: string | null;
  variante: Variante;
  abmelde_token: string;
}

interface Smtp {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function smtp(): Smtp | null {
  const user = Deno.env.get("PARTNER_SMTP_USER") ?? "";
  const pass = Deno.env.get("PARTNER_SMTP_PASS") ?? "";
  if (!user || !pass) return null;
  return {
    host: Deno.env.get("PARTNER_SMTP_HOST") ?? "smtp.ionos.de",
    port: Number(Deno.env.get("PARTNER_SMTP_PORT") ?? "587"),
    user,
    pass,
    from: Deno.env.get("PARTNER_SMTP_FROM") ?? "partner@primundus.de",
    fromName: Deno.env.get("PARTNER_SMTP_FROM_NAME") ?? "Magdalena Gorska | Primundus",
  };
}

function transport(s: Smtp) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: false,
    requireTLS: true,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: { user: s.user, pass: s.pass },
  });
}

function links(token: string) {
  return { seite: `${SITE}/abmelden?p=${token}`, api: `${SITE}/api/unsubscribe?p=${token}` };
}

async function sende(
  t: ReturnType<typeof transport>,
  s: Smtp,
  an: string,
  mail: FertigeMail,
  abmeldenApi: string,
): Promise<void> {
  await t.sendMail({
    from: `"${s.fromName}" <${s.from}>`,
    to: an,
    replyTo: s.from,
    subject: mail.betreff,
    html: mail.html,
    text: mail.text,
    headers: {
      "List-Unsubscribe": `<${abmeldenApi}>, <mailto:${s.from}?subject=Abmelden>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/** PostgREST liefert höchstens 1000 Zeilen am Stück — seitenweise holen. */
async function alle<T>(db: SupabaseClient, tabelle: string, spalten: string, ordnung: string): Promise<T[]> {
  const out: T[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.from(tabelle).select(spalten).order(ordnung).range(von, von + 999);
    if (error) throw new Error(`${tabelle}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function ladeStand(db: SupabaseClient) {
  const [kontakte, versand, freigabeZeilen] = await Promise.all([
    alle<KontaktZeile>(db, "partner_kontakte", "id,email,domain,status,anrede,nachname,variante,abmelde_token", "email"),
    alle<Versand>(db, "partner_mail_versand", "kontakt_id,mail,status,erstellt_am,gesendet_am", "id"),
    alle<{ mail: MailKey; freigegeben_am: string | null }>(db, "partner_mail_freigaben", "mail,freigegeben_am", "mail"),
  ]);
  const freigaben = new Set(freigabeZeilen.filter((f) => f.freigegeben_am).map((f) => f.mail));
  return { kontakte, versand, freigaben, freigabeZeilen };
}

function zaehle<T>(liste: T[], schluessel: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of liste) out[schluessel(x)] = (out[schluessel(x)] ?? 0) + 1;
  return out;
}

async function probelauf(db: SupabaseClient) {
  const jetzt = new Date();
  const { kontakte, versand, freigaben, freigabeZeilen } = await ladeStand(db);
  const plan = planeLauf(jetzt, kontakte, versand, freigaben);
  // Was der erste Lauf täte, wenn die Hauptmail freigegeben wäre (unabhängig von Uhrzeit).
  const fenster = { ...STANDARD_GRENZEN, startStunde: 0, endStunde: 24 };
  const probe = new Date(jetzt);
  while ([0, 6].includes(probe.getUTCDay())) probe.setUTCDate(probe.getUTCDate() + 1);
  const simulation = planeLauf(probe, kontakte, versand, new Set<MailKey>(["haupt", ...freigaben]), fenster);
  const byId = new Map(kontakte.map((k) => [k.id, k]));
  const zeile = (g: { kontakt: Kontakt; mail: MailKey }) => {
    const k = byId.get(g.kontakt.id)!;
    return { email: k.email, mail: g.mail, variante: k.variante, anrede: anredeZeile(k.anrede, k.nachname) };
  };
  return {
    modus: "probelauf",
    jetzt: jetzt.toISOString(),
    versandAktiv: Deno.env.get("PARTNER_VERSAND_AKTIV") === "1",
    smtpBereit: smtp() !== null,
    freigaben: Object.fromEntries(freigabeZeilen.map((f) => [f.mail, f.freigegeben_am])),
    kontakte: { gesamt: kontakte.length, ...zaehle(kontakte, (k) => k.status) },
    gesendet: zaehle(versand.filter((v) => v.status === "gesendet"), (v) => v.mail),
    haengend: versand.filter((v) => v.status !== "gesendet").length,
    dieserLauf: plan.map(zeile),
    ersterLaufMitFreigabe: simulation.map(zeile),
  };
}

async function test(body: Record<string, unknown>) {
  const s = smtp();
  if (!s) return { fehler: "PARTNER_SMTP_USER/PASS fehlen" };
  const an = String(body.an ?? TEST_AN[0] ?? "").toLowerCase();
  if (!TEST_AN.includes(an)) return { fehler: `Testmails nur an ${TEST_AN.join(", ")}` };
  const faelle: { mail: MailKey; variante: Variante }[] = body.alle
    ? [{ mail: "haupt", variante: "A" }, { mail: "haupt", variante: "B" }, { mail: "nf1", variante: "A" },
      { mail: "nf2", variante: "A" }, { mail: "nf3", variante: "A" }]
    : [{ mail: (REIHE.includes(body.mail as MailKey) ? body.mail : "haupt") as MailKey, variante: body.variante === "B" ? "B" : "A" }];
  const t = transport(s);
  const l = links("00000000-0000-0000-0000-000000000000");
  const gesendet: string[] = [];
  for (const f of faelle) {
    const m = renderMail(f.mail, { anrede: body.anrede as string, nachname: body.nachname as string, variante: f.variante }, l.seite);
    await sende(t, s, an, { ...m, betreff: `[TEST ${f.mail}${f.mail === "haupt" ? " " + f.variante : ""}] ${m.betreff}` }, l.api);
    gesendet.push(`${f.mail}${f.mail === "haupt" ? "/" + f.variante : ""}`);
  }
  return { modus: "test", an, gesendet };
}

async function versand(db: SupabaseClient) {
  if (Deno.env.get("PARTNER_VERSAND_AKTIV") !== "1") return { modus: "versand", gesperrt: "PARTNER_VERSAND_AKTIV ist nicht 1" };
  const s = smtp();
  if (!s) return { modus: "versand", gesperrt: "PARTNER_SMTP_USER/PASS fehlen" };
  const { kontakte, versand, freigaben } = await ladeStand(db);
  if (freigaben.size === 0) return { modus: "versand", gesperrt: "keine Mail freigegeben" };

  const plan = planeLauf(new Date(), kontakte, versand, freigaben);
  const byId = new Map(kontakte.map((k) => [k.id, k]));
  const t = transport(s);
  const ergebnis: { email: string; mail: MailKey; ok: boolean; fehler?: string }[] = [];
  for (const g of plan) {
    const k = byId.get(g.kontakt.id)!;
    // Erst reservieren: der unique-Index verhindert, dass zwei Läufe dieselbe Mail senden.
    const { data: zeile, error: resErr } = await db.from("partner_mail_versand")
      .insert({ kontakt_id: k.id, mail: g.mail, status: "reserviert" }).select("id").single();
    if (resErr || !zeile) continue;
    try {
      const l = links(k.abmelde_token);
      const m = renderMail(g.mail, k, l.seite);
      await sende(t, s, k.email, m, l.api);
      await db.from("partner_mail_versand")
        .update({ status: "gesendet", gesendet_am: new Date().toISOString(), betreff: m.betreff }).eq("id", zeile.id);
      ergebnis.push({ email: k.email, mail: g.mail, ok: true });
    } catch (e) {
      const fehler = e instanceof Error ? e.message : String(e);
      await db.from("partner_mail_versand").update({ status: "fehler", fehler }).eq("id", zeile.id);
      ergebnis.push({ email: k.email, mail: g.mail, ok: false, fehler });
      break; // SMTP-Problem: Lauf abbrechen statt die ganze Liste als Fehler zu markieren
    }
  }
  return { modus: "versand", geplant: plan.length, ergebnis };
}

Deno.serve(async (req: Request) => {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`) {
    return antwort({ fehler: "nur mit Service-Key" }, 401);
  }
  if (req.method !== "POST") return antwort({ fehler: "nur POST" }, 405);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* leerer Body = Probelauf */ }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false } });
  try {
    if (body.modus === "versand") return antwort(await versand(db));
    if (body.modus === "test") return antwort(await test(body));
    return antwort(await probelauf(db));
  } catch (e) {
    console.error("send-partner-akquise:", e);
    return antwort({ fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
