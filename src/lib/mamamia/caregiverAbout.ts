// Caregiver "about_de" freshness + on-demand regeneration.
//
// The portal shows Mamamia's raw `about_de` directly (no more portal-side AI
// generation). Old Mamamia descriptions were capped at 200 chars; new
// (regenerated) ones are always longer. So we treat anything ≤ 200 chars (or
// empty/null) as STALE and regenerate it via Mamamia's
// GenerateCaregiverGermanDescription mutation (LLM-write, costs) — dedup'd per
// caregiver so a profile is regenerated at most once per session. Once
// regenerated, Mamamia stores the fresh about_de permanently, so later visits
// read it for free.

import { callMamamia } from './client';

// Old Mamamia descriptions had a 200-char cap; regenerated ones are longer.
// Threshold kept as a constant so it's trivial to change (or swap to a
// timestamp criterion later — see the Sadash guide §9).
export const ABOUT_DE_MAX_OLD_LENGTH = 200;

/** Stale = empty/null OR ≤ 200 chars. Computed from the RAW about_de. */
export function isAboutDeStale(aboutDe: string | null | undefined): boolean {
  return (aboutDe ?? '').length <= ABOUT_DE_MAX_OLD_LENGTH;
}

export interface RegeneratedAbout {
  aboutDe: string | null;
  motivation: string | null;
}

// Dedup: one in-flight (and resolved) promise per caregiver id. The profile
// modal (and any future PDF path) share the single call → one LLM regeneration.
// Errors are NOT cached so a retry is possible.
const _runs = new Map<number, Promise<RegeneratedAbout>>();

export function regenerateGermanDescription(caregiverId: number): Promise<RegeneratedAbout> {
  const existing = _runs.get(caregiverId);
  if (existing) return existing;

  const run = callMamamia<{ about_de: string | null; motivation: string | null }>(
    'generateCaregiverGermanDescription',
    { id: caregiverId },
  ).then((r) => ({ aboutDe: r.about_de ?? null, motivation: r.motivation ?? null }));

  run.catch(() => { _runs.delete(caregiverId); }); // don't cache failures → retry possible
  _runs.set(caregiverId, run);
  return run;
}

// Test helper — reset the dedup cache between tests.
export function _resetRegenerateCache(): void {
  _runs.clear();
}
