// Abgleich Kostenrechner → Mamamia über onboard-to-mamamia { lead_id, resync }
// (service_role). EIN Weg für zwei Auslöser:
//  - Admin-Korrektur der Angaben (Registry #55, /api/admin/leads/[id]/angaben)
//  - erneute Anfrage eines Kunden, der schon in Mamamia angelegt ist
//    (Registry #113, findOrCreateLead → mamamiaNachAnfrage)
//
// Registry #113 (Martin 06.10.2026, Kunde 11228): „Wenn es ein aktualisiertes
// Angebot gibt und der Kunde es sieht, muss es sofort auch bei uns sichtbar sein
// und rübergehen zu Mamamia, sonst suchen wir falsche Pflegekräfte." Mit Budget
// setzt der Resync deshalb zusätzlich den Preis des JOBS (`jobPreis`) — das
// SA-Portal und die Bewerbungen lesen JobOffer.salary_offered, nicht das
// Kundenbudget. Weg dafür wie das SA-Portal, siehe onboard.ts jobPreisNachziehen.
//
// Die reinen Teile (abgleichNachAnfrage, pendingNachAbgleich) sind ohne Netz
// testbar (src/__tests__/mamamiaAbgleich.test.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Kalkulation } from './calculation';
import { diffAngaben, FD_KEYS, mamamiaFelder } from './angaben-diff';

export const RESYNC_TIMEOUT_MS = 25_000;

export type JobPreisStatus = 'aktualisiert' | 'unveraendert' | 'gebucht' | 'ohne_anreise';

export type MamamiaStatus = {
  status: 'ok' | 'skipped' | 'error';
  http?: number;
  message: string;
  patients_before?: number;
  patients_after?: number;
  removed_ids?: number[];
  patient_ids?: number[];
  /** Registry #113: Ergebnis für den Preis des Jobs (nur mit Budget). */
  job?: { status: JobPreisStatus; job_offer_id?: number; alt: number | null; neu: number };
};

export type Pending = NonNullable<Kalkulation['mamamia_sync_pending']>;

export function ohnePending(k: Kalkulation): Kalkulation {
  const { mamamia_sync_pending: _drop, ...rest } = k;
  return rest as Kalkulation;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;

function jobText(job: MamamiaStatus['job']): string {
  if (!job) return '';
  switch (job.status) {
    case 'aktualisiert': return `, Job ${job.alt != null ? euro(job.alt) : '–'} → ${euro(job.neu)}`;
    case 'unveraendert': return `, Job schon ${euro(job.neu)}`;
    case 'gebucht': return ', Job gebucht – Preis dort nicht geändert';
    case 'ohne_anreise': return ', Job ohne Anreisedatum – Preis dort nicht geändert';
  }
}

/**
 * Was eine erneute Anfrage nach Mamamia schicken muss — die geänderten
 * Mamamia-Felder (dieselbe Regel wie die Admin-Korrektur: erst diff, dann nur
 * zulässige Werte) und der neue Preis. Ein früher gescheiterter Abgleich
 * (mamamia_sync_pending der alten Kalkulation) wird vereinigt, nie verloren.
 * null = nichts zu tun.
 */
export function abgleichNachAnfrage(
  alt: Kalkulation | null | undefined,
  neu: Kalkulation | null | undefined,
  altTiming?: string | null,
): { felder: string[]; budget?: number } | null {
  if (!neu) return null;
  const altFd = ((alt as { formularDaten?: unknown } | null | undefined)?.formularDaten ?? {}) as Record<string, unknown>;
  const neuFd = ((neu as { formularDaten?: unknown }).formularDaten ?? {}) as Record<string, unknown>;
  const angaben: Record<string, unknown> = {};
  for (const k of FD_KEYS) if (k in neuFd) angaben[k] = neuFd[k];
  // Unzulässige Werte (`fehler`) gehen nicht nach Mamamia — der Preis schon.
  const { changed } = diffAngaben(altFd, altTiming ?? null, angaben);
  const pending = alt?.mamamia_sync_pending;
  const felder = Array.from(new Set([...(pending?.felder ?? []), ...mamamiaFelder(changed)]));

  const neuB = Number(neu.bruttopreis);
  const altB = Number(alt?.bruttopreis);
  const preisGeaendert = Number.isFinite(neuB) && neuB > 0 && (!Number.isFinite(altB) || Math.round(altB) !== Math.round(neuB));
  const budget = preisGeaendert ? neuB : pending?.budget;

  if (!felder.length && budget === undefined) return null;
  return budget !== undefined ? { felder, budget } : { felder };
}

/** Ruft den Resync auf (mit Budget immer auch den Jobpreis) und übersetzt die Antwort. */
export async function resyncAufrufen(args: {
  supabaseUrl: string;
  serviceKey: string;
  leadId: string;
  felder: string[];
  budget?: number;
  fetchFn?: typeof fetch;
}): Promise<MamamiaStatus> {
  const { supabaseUrl, serviceKey, leadId, felder, budget, fetchFn = fetch } = args;
  const resync = budget !== undefined ? { felder, budget, jobPreis: true } : { felder };
  try {
    const res = await fetchFn(`${supabaseUrl}/functions/v1/onboard-to-mamamia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ lead_id: leadId, resync }),
      signal: AbortSignal.timeout(RESYNC_TIMEOUT_MS),
    });
    let payload: Record<string, unknown> = {};
    try { payload = await res.json(); } catch { /* kein JSON */ }
    if (res.ok) {
      const r = (payload.resync ?? {}) as Record<string, unknown>;
      const before = Number(r.patients_before);
      const after = Number(r.patients_after);
      const job = (r.job && typeof r.job === 'object' ? r.job : undefined) as MamamiaStatus['job'];
      const basis = Number.isFinite(before) && Number.isFinite(after)
        ? `${before} → ${after} Patient${after === 1 ? '' : 'en'}${budget !== undefined ? `, Budget ${budget} €` : ''}`
        : 'synchronisiert';
      return {
        status: 'ok',
        http: res.status,
        message: `${basis}${jobText(job)}`,
        patients_before: before,
        patients_after: after,
        removed_ids: Array.isArray(r.removed_ids) ? (r.removed_ids as number[]) : [],
        ...(job ? { job } : {}),
      };
    }
    return {
      status: 'error',
      http: res.status,
      message: `Mamamia-Sync fehlgeschlagen (HTTP ${res.status}): ${String(payload.error ?? res.statusText)}`,
      ...(Array.isArray(payload.patient_ids) ? { patient_ids: payload.patient_ids as number[] } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 'error',
      message: /abort|timeout/i.test(msg) ? `Mamamia-Sync: Zeitüberschreitung (${RESYNC_TIMEOUT_MS / 1000} s)` : `Mamamia-Sync: Netzfehler — ${msg}`,
    };
  }
}

/** Pending-Eintrag nach einem Abgleich: gesetzt bei jedem Fehler (letzte nicht angekommene Absicht), sonst weg. */
export function pendingNachAbgleich(
  kalk: Kalkulation,
  mamamia: MamamiaStatus,
  felder: string[],
  budget: number | undefined,
): Kalkulation {
  if (mamamia.status === 'ok') return ohnePending(kalk);
  const pending: Pending = {
    felder,
    ...(budget !== undefined ? { budget } : {}),
    error: mamamia.message,
    ...(mamamia.http !== undefined ? { http: mamamia.http } : {}),
    at: new Date().toISOString(),
  };
  return { ...kalk, mamamia_sync_pending: pending };
}

/** Admin-Korrektur (Registry #55): Resync + Pending in leads.kalkulation schreiben. */
export async function syncMamamia(
  supabase: SupabaseClient,
  row: { id: string; mamamia_customer_id: number | null },
  kalk: Kalkulation,
  felder: string[],
  budget: number | undefined,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ mamamia: MamamiaStatus; kalkulation: Kalkulation }> {
  if (!row.mamamia_customer_id) {
    return { mamamia: { status: 'skipped', message: 'Lead ist nicht mit Mamamia verknüpft' }, kalkulation: kalk };
  }
  if (!felder.length && budget === undefined) {
    return { mamamia: { status: 'skipped', message: 'Keine Mamamia-relevanten Änderungen' }, kalkulation: kalk };
  }

  let mamamia = await resyncAufrufen({ supabaseUrl, serviceKey, leadId: row.id, felder, budget });

  // leads-Update: pending setzen (jedes non-2xx — nie verloren) oder räumen (nur 2xx).
  const kalkulation = pendingNachAbgleich(kalk, mamamia, felder, budget);
  const { error } = await supabase.from('leads').update({ kalkulation }).eq('id', row.id);
  if (error) {
    console.error(`[admin-angaben] lead=${row.id} kalkulation nach Mamamia-Sync nicht gespeichert: ${error.message}`);
    mamamia = { ...mamamia, message: `${mamamia.message} (Status nicht gespeichert: ${error.message})` };
  }
  console.log(`[admin-angaben] lead=${row.id} mamamia=${mamamia.status} felder=${felder.join(',') || '-'} budget=${budget ?? '-'} ${mamamia.message}`);
  return { mamamia, kalkulation };
}
