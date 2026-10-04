import { createHmac } from 'crypto';
import type { SozialHerkunft } from './sozial-zuordnung';

/*
 * Meldung an den Content-Loop (Registry #112) — nur Server.
 *
 * Umgebung (nur Render-Prod-Slot des Kostenrechners; ohne Werte ist die Meldung
 * aus — Staging und lokal bleiben leer, der Content-Loop hat kein Staging):
 *   SOZIAL_ZUORDNUNG_URL         Edge Function des Content-Loops
 *   SOZIAL_ZUORDNUNG_SCHLUESSEL  gemeinsames Geheimnis, Kopfzeile x-zuordnung-schluessel
 *   SOZIAL_ZUORDNUNG_SALZ        Schlüssel für den HMAC der Lead-ID; bleibt im Rechner,
 *                                der Content-Loop kann daraus keine Lead-ID zurückrechnen.
 *                                Ohne ihn werden keine Anfragen gemeldet.
 *
 * Was den Rechner verlässt, steht vollständig in zuordnungsNutzlast(): Variante,
 * Beitrag, Plattform, Zeitpunkt auf die volle Stunde, bei Anfragen extern_ref.
 * Keine Lead-ID, keine E-Mail, kein Name, keine Sitzung, keine IP, kein User-Agent.
 */

export type ZuordnungsEreignis =
  | { ereignis: 'besuch'; herkunft: SozialHerkunft }
  | { ereignis: 'anfrage'; herkunft: SozialHerkunft; leadId: string };

/** Zeitpunkt auf die volle Stunde (UTC) — genug für Tages- und Wochenfenster, schwer mit einem Lead abzugleichen. */
export function volleStunde(d: Date): string {
  const x = new Date(d.getTime());
  x.setUTCMinutes(0, 0, 0);
  return x.toISOString();
}

/** Entdopplungsschlüssel einer Anfrage: HMAC-SHA256 der Lead-ID, 32 Hex-Zeichen. */
export function externRef(leadId: string, salz: string): string {
  return createHmac('sha256', salz).update(`anfrage:${leadId}`).digest('hex').slice(0, 32);
}

export function zuordnungsNutzlast(e: ZuordnungsEreignis, salz: string, jetzt: Date = new Date()) {
  const basis = {
    ereignis: e.ereignis,
    tracking_id: e.herkunft.variante,
    content_id: e.herkunft.beitrag,
    plattform: e.herkunft.plattform,
    zeitpunkt: volleStunde(jetzt),
  };
  return e.ereignis === 'anfrage' ? { ...basis, extern_ref: externRef(e.leadId, salz) } : basis;
}

type Umgebung = Record<string, string | undefined>;

export async function anContentLoopMelden(
  e: ZuordnungsEreignis,
  env: Umgebung = process.env,
  fetchFn: typeof fetch = fetch,
  jetzt: Date = new Date(),
): Promise<'gesendet' | 'aus' | 'fehler'> {
  const url = (env.SOZIAL_ZUORDNUNG_URL ?? '').trim();
  const schluessel = (env.SOZIAL_ZUORDNUNG_SCHLUESSEL ?? '').trim();
  const salz = (env.SOZIAL_ZUORDNUNG_SALZ ?? '').trim();
  if (!url || !schluessel || (e.ereignis === 'anfrage' && !salz)) return 'aus';

  const body = JSON.stringify(zuordnungsNutzlast(e, salz, jetzt));
  // Anfragen sind über extern_ref idempotent, ein zweiter Versuch ist sicher.
  // Besuche haben keinen Schlüssel: nach einem Zeitüberlauf zählte ein zweiter doppelt.
  const versuche = e.ereignis === 'anfrage' ? 2 : 1;
  for (let i = 0; i < versuche; i++) {
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-zuordnung-schluessel': schluessel },
        body,
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return 'gesendet';
      if (res.status < 500) {
        console.error(`[sozial-zuordnung] ${e.ereignis} abgelehnt: HTTP ${res.status}`);
        return 'fehler';
      }
    } catch {
      // Netz oder Zeitüberlauf — bei Anfragen folgt der zweite Versuch.
    }
  }
  console.error(`[sozial-zuordnung] ${e.ereignis} nicht zugestellt`);
  return 'fehler';
}
