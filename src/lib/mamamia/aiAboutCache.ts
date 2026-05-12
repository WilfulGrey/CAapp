// Module-level cache for AI-generated "Über die Pflegekraft" texts.
//
// Chains off caregiverCache: when a caregiver profile lands in the cache
// the AI call fires automatically (no waiting for the modal to open).
// By the time the user clicks on a nurse card the text is often ready.
//
// Pattern mirrors caregiverCache:
//   getAiAbout(id)            → cached text or undefined (sync read)
//   scheduleAiAbouts(ids)     → register ids; fires when profile lands
//   subscribeAiAbout(id, fn)  → notified when text resolves

import { callMamamia } from './client';
import type { MamamiaCaregiverFull } from './types';
import { getCached, subscribe } from './caregiverCache';

type AiEntry =
  | { state: 'pending' }
  | { state: 'resolved'; text: string | null };

const cache = new Map<number, AiEntry>();
const listenerMap = new Map<number, Set<() => void>>();

function notify(id: number): void {
  listenerMap.get(id)?.forEach(fn => fn());
}

export function getAiAbout(id: number): string | null | undefined {
  const e = cache.get(id);
  if (!e || e.state === 'pending') return undefined; // still in flight
  return e.text;
}

export function subscribeAiAbout(id: number, listener: () => void): () => void {
  let set = listenerMap.get(id);
  if (!set) { set = new Set(); listenerMap.set(id, set); }
  set.add(listener);
  return () => { set!.delete(listener); if (!set!.size) listenerMap.delete(id); };
}

function buildInput(cg: MamamiaCaregiverFull): Record<string, unknown> {
  const levels: Record<string, string> = {
    level_0: 'A1', level_1: 'A2', level_2: 'B1', level_3: 'B2', level_4: 'C1+',
  };
  return {
    firstName: cg.first_name ?? undefined,
    experienceYears: cg.care_experience
      ? `${cg.care_experience} Jahre`
      : cg.hp_total_days
      ? `${Math.round(cg.hp_total_days / 365)} Jahre`
      : undefined,
    assignments: cg.hp_total_jobs ?? undefined,
    languageLevel: levels[cg.germany_skill ?? ''] ?? cg.germany_skill ?? undefined,
    nationality: cg.nationality?.nationality ?? undefined,
    personalities: (cg.personalities ?? []).map(p => p.personality).filter(Boolean),
    hobbies: (cg.hobbies ?? []).map(h => h.hobby).filter(Boolean),
    isNurse: cg.is_nurse ?? undefined,
    qualifications: cg.qualifications ?? undefined,
    education: cg.education ?? undefined,
  };
}

function generateForCaregiver(id: number, cg: MamamiaCaregiverFull): void {
  if (cache.has(id)) return; // already pending or resolved
  cache.set(id, { state: 'pending' });
  callMamamia<{ about: string | null }>('generateCaregiverAbout', buildInput(cg))
    .then(r => {
      cache.set(id, { state: 'resolved', text: r.about ?? null });
      notify(id);
    })
    .catch(() => {
      cache.set(id, { state: 'resolved', text: null }); // fallback: modal shows mechanical text
      notify(id);
    });
}

// Schedule AI about generation for a list of caregiver IDs.
// - If the full profile is already in caregiverCache → fire immediately.
// - Otherwise subscribe to caregiverCache and fire when profile lands.
// Safe to call multiple times with the same ids (idempotent via cache.has).
export function scheduleAiAbouts(ids: number[]): void {
  for (const id of ids) {
    if (cache.has(id)) continue; // already scheduled or done

    const cg = getCached(id);
    if (cg !== undefined) {
      // Profile already in cache — fire now (null means fetch failed, skip).
      if (cg) generateForCaregiver(id, cg);
      else { cache.set(id, { state: 'resolved', text: null }); notify(id); }
    } else {
      // Profile still loading — subscribe and fire when it arrives.
      const unsub = subscribe(id, () => {
        const resolved = getCached(id);
        if (resolved === undefined) return; // still pending, wait
        unsub();
        if (resolved) generateForCaregiver(id, resolved);
        else { cache.set(id, { state: 'resolved', text: null }); notify(id); }
      });
    }
  }
}

// Test / debug helper.
export function _resetAiAboutCache(): void {
  cache.clear();
  listenerMap.clear();
}
