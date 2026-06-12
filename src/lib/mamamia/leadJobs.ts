// Multi-Job (Variant A) — display helpers for the "Alle meine Einsätze"
// overview. The backend stores geplant/gebucht/abgeschlossen/storniert;
// 'laufend' is purely a presentation state derived from the booked job's
// date window (Anreise ≤ heute < Abreise). Keeping the derivation here (not
// in the component) makes it unit-testable and keeps the card dumb.

import type { LeadJobRow, LeadJobDisplayStatus } from './types';

// yyyy-mm-dd for "today" in local time. ISO date-only strings compare
// correctly lexicographically, so we never construct Date objects for the
// window check (avoids timezone drift around midnight).
function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Normalise the stored status to one we know how to render; unknown values
// fall through to 'geplant' (safest neutral "in Arbeit" bucket) so a new
// backend status never blanks a card.
function normaliseStored(status: string): LeadJobDisplayStatus {
  switch (status) {
    case 'gebucht':
    case 'geplant':
    case 'abgeschlossen':
    case 'storniert':
      return status;
    default:
      return 'geplant';
  }
}

// Derive the badge status. Only a 'gebucht' job whose date window contains
// today becomes 'laufend'; everything else keeps its stored status.
export function deriveJobDisplayStatus(job: LeadJobRow, now: Date = new Date()): LeadJobDisplayStatus {
  const stored = normaliseStored(job.status);
  if (stored === 'gebucht' && job.anreise && job.abreise) {
    const today = todayIso(now);
    if (job.anreise <= today && today < job.abreise) return 'laufend';
  }
  return stored;
}

const STATUS_ORDER: Record<LeadJobDisplayStatus, number> = {
  laufend: 0,
  gebucht: 1,
  geplant: 2,
  abgeschlossen: 3,
  storniert: 4,
};

// Sort for the overview: by display status (laufend first), then by Anreise
// ascending (nulls last), then by the stored `position` as a stable tiebreak.
export function sortLeadJobs(jobs: LeadJobRow[], now: Date = new Date()): LeadJobRow[] {
  return [...jobs].sort((a, b) => {
    const sa = STATUS_ORDER[deriveJobDisplayStatus(a, now)];
    const sb = STATUS_ORDER[deriveJobDisplayStatus(b, now)];
    if (sa !== sb) return sa - sb;
    const an = a.anreise ?? '9999-99-99';
    const bn = b.anreise ?? '9999-99-99';
    if (an !== bn) return an < bn ? -1 : 1;
    return a.position - b.position;
  });
}

// yyyy-mm-dd → dd.mm.yyyy (German portal convention). Returns '' for null so
// callers can branch on emptiness.
export function formatJobDate(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// "01.07.2026 – 12.08.2026" or "ab 01.07.2026" when the end is open.
export function formatJobZeitraum(job: LeadJobRow): string {
  const von = formatJobDate(job.anreise);
  const bis = formatJobDate(job.abreise);
  if (von && bis) return `${von} – ${bis}`;
  if (von) return `ab ${von}`;
  if (bis) return `bis ${bis}`;
  return 'Zeitraum offen';
}
