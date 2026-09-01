#!/usr/bin/env node
// Einmal-Backfill: den Portal-Token-Spiegel auf Mamamia-Kunden nachziehen.
//
// Warum (Registry #44): `pushCustomerToken` lief bis 2026-09-01 NUR beim
// Anlegen des Kunden. Jeder Lead, der seinen Token danach rotiert hat
// („Neuen Link senden" oder Admin-Knopf), trägt in Mamamia noch den Token
// vom ersten Portalbesuch — das MM-Team klickt dort auf einen toten Link.
// Der Fix wirkt nur vorwärts; dieses Skript holt den Bestand nach.
//
// Was es tut: für jeden betroffenen Lead ein
// `POST /functions/v1/onboard-to-mamamia { token, mirror_token: true }` —
// derselbe Weg wie die Rotation selbst. Idempotent: schreibt denselben Wert,
// legt nichts an (der Kunde existiert per Auswahl bereits).
//
// Nutzung:
//   node scripts/backfill-mamamia-token-mirror.mjs           # Dry-Run: nur zählen
//   node scripts/backfill-mamamia-token-mirror.mjs --apply   # wirklich pushen
//
// Zugangsdaten aus der Umgebung (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY);
// fehlen sie, wird `project 3/.env` gelesen.

import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const APPLY = process.argv.includes('--apply');
// Ein Push = 3 Panel-Requests (csrf → LoginAgency → Mutation). Mamamia
// limitiert Agency-Calls auf ~60/min (Gotcha #9), also gemütlich takten.
const PAUSE_MS = 1500;

function ladeZugang() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // .env selbst parsen statt den Aufrufer `export $(grep …)` tippen zu
    // lassen — das zerlegt Werte mit Sonderzeichen.
    const datei = new URL('../project 3/.env', import.meta.url);
    let inhalt = '';
    try {
      inhalt = readFileSync(datei, 'utf8');
    } catch {
      // Kein .env (z.B. Git-Worktree) — der Aufrufer setzt die Variablen selbst.
    }
    for (const zeile of inhalt.split('\n')) {
      const m = zeile.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const wert = m[2].trim().replace(/^["']|["']$/g, '');
      if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = wert;
      if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY' && !key) key = wert;
    }
  }
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen — setzen oder das Skript aus einem Checkout mit "project 3/.env" starten.',
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

const { url, key } = ladeZugang();
const kopf = { apikey: key, Authorization: `Bearer ${key}` };

async function rest(pfad) {
  const res = await fetch(`${url}/rest/v1/${pfad}`, { headers: kopf });
  if (!res.ok) throw new Error(`REST ${pfad} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const LIMIT = 5000;

// Rotiert = es gibt mindestens ein token_regenerated-Event. Genau diese
// Leads haben in Mamamia garantiert einen veralteten Spiegel.
const events = await rest(`lead_events?event_type=eq.token_regenerated&select=lead_id&limit=${LIMIT}`);
const rotiert = new Set(events.map((e) => e.lead_id));

// Abgelaufene Tokens werden übersprungen: einen toten Link durch einen
// anderen toten Link zu ersetzen bringt dem MM-Team nichts.
const jetzt = new Date().toISOString();
const leads = await rest(
  `leads?mamamia_customer_id=not.is.null&token_expires_at=gt.${jetzt}` +
    `&select=id,email,token,token_expires_at,mamamia_customer_id&limit=${LIMIT}`,
);

if (events.length === LIMIT || leads.length === LIMIT) {
  console.warn(`⚠️  LIMIT ${LIMIT} erreicht — Auswahl ist unvollständig, Limit erhöhen.`);
}

const treffer = leads.filter((l) => rotiert.has(l.id) && l.token);

console.log(`Projekt:            ${url}`);
console.log(`token_regenerated:  ${rotiert.size} Leads`);
console.log(`davon mit MM-Kunde + gültigem Token: ${treffer.length}\n`);
for (const l of treffer) {
  console.log(
    `  ${l.id}  mm=${l.mamamia_customer_id}  token=${String(l.token).slice(0, 8)}…  gültig bis ${String(l.token_expires_at).slice(0, 10)}  ${l.email ?? ''}`,
  );
}

if (!APPLY) {
  console.log(`\nDry-Run. Mit --apply werden ${treffer.length} Pushes gesendet (~${Math.ceil((treffer.length * PAUSE_MS) / 1000)} s).`);
  process.exit(0);
}

let ok = 0;
let fehler = 0;
for (const [i, l] of treffer.entries()) {
  try {
    const res = await fetch(`${url}/functions/v1/onboard-to-mamamia`, {
      method: 'POST',
      headers: { ...kopf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: l.token, mirror_token: true }),
    });
    // HTTP 200 heisst „onboard lief durch" — der Push selbst ist best-effort
    // und wird geschluckt. Der Beleg steht in den Function-Logs
    // (`[onboard] token mirrored …` mit dem von MM zurückgegebenen Präfix).
    console.log(`[${i + 1}/${treffer.length}] lead=${l.id} http=${res.status}`);
    res.ok ? ok++ : fehler++;
  } catch (e) {
    console.error(`[${i + 1}/${treffer.length}] lead=${l.id} FEHLER: ${e.message}`);
    fehler++;
  }
  if (i < treffer.length - 1) await sleep(PAUSE_MS);
}
console.log(`\nFertig: ${ok} ok, ${fehler} Fehler. Function-Logs prüfen (stored=… muss zu sent=… passen).`);
