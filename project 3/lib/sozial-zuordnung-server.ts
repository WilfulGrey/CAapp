import type { SozialHerkunft } from './sozial-zuordnung';

/*
 * Meldung „Anfrage“ an den Content-Loop (Registry #112, schlanke Fassung) — nur Server.
 *
 * Umgebung (nur Render-Prod-Slot des Kostenrechners; ohne Werte ist die Meldung
 * aus — Staging und lokal bleiben leer, der Content-Loop hat kein Staging):
 *   SOZIAL_ZUORDNUNG_URL         Edge Function `zuordnung` des Content-Loops
 *   SOZIAL_ZUORDNUNG_SCHLUESSEL  gemeinsames Geheimnis, Kopfzeile x-zuordnung-schluessel
 *
 * Was den Rechner verlässt, steht vollständig in anfrageNutzlast(): Variante,
 * Beitrag, Plattform und das Datum (Europe/Berlin). Keine Lead-ID und nichts daraus
 * Abgeleitetes, keine Uhrzeit, keine E-Mail, kein Name, keine Sitzung, keine IP,
 * kein User-Agent.
 *
 * Genau ein Versuch mit höchstens 3 s: eine Anfrage kann nicht doppelt ankommen;
 * fällt der Content-Loop aus, geht sie verloren (die Zahlen sind Untergrenzen).
 */

export const ZUORDNUNG_ZEITLIMIT_MS = 3000;

/** Datum in Europe/Berlin als YYYY-MM-DD. */
export function berlinTag(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function anfrageNutzlast(herkunft: SozialHerkunft, jetzt: Date = new Date()) {
  return {
    ereignis: 'anfrage' as const,
    tracking_id: herkunft.variante,
    content_id: herkunft.beitrag,
    plattform: herkunft.plattform,
    tag: berlinTag(jetzt),
  };
}

type Umgebung = Record<string, string | undefined>;

export async function anfrageAnContentLoop(
  herkunft: SozialHerkunft,
  env: Umgebung = process.env,
  fetchFn: typeof fetch = fetch,
  jetzt: Date = new Date(),
): Promise<'gesendet' | 'aus' | 'fehler'> {
  const url = (env.SOZIAL_ZUORDNUNG_URL ?? '').trim();
  const schluessel = (env.SOZIAL_ZUORDNUNG_SCHLUESSEL ?? '').trim();
  if (!url || !schluessel) return 'aus';
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-zuordnung-schluessel': schluessel },
      body: JSON.stringify(anfrageNutzlast(herkunft, jetzt)),
      signal: AbortSignal.timeout(ZUORDNUNG_ZEITLIMIT_MS),
    });
    if (res.ok) return 'gesendet';
    console.error(`[sozial-zuordnung] anfrage abgelehnt: HTTP ${res.status}`);
  } catch {
    console.error('[sozial-zuordnung] anfrage nicht zugestellt');
  }
  return 'fehler';
}
