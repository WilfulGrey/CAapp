// Diff + Validierung der Kalkulator-Angaben für die Admin-Korrektur
// (/api/admin/leads/[id]/angaben, Registry #55). PURE Modul — nur relative
// Type-Imports, damit der Root-vitest ihn cross-importieren darf.
//
// Kernregel: erst DIFF, dann Validierung NUR der geänderten Keys. In echten
// formularDaten stehen Werte außerhalb des Kanons (Rechner-Leads haben kein
// `erfahrung`, SA-Portal-Korrekturen schreiben `sehr-gut-sa`, der alte
// Admin-Select hinterließ `1-2-wochen`); unveränderte Keys passieren verbatim
// und werden auch nicht neu geschrieben.
import type {
  CareStartTiming, Driving, Experience, Gender, GermanLevel, HouseholdOthers, Mobility, NightCare, PatientCount,
} from './calculator-context';

// Die 9 Keys, die in kalkulation.formularDaten leben. `care_start_timing`
// ist KEIN fd-Key — es ist die Spalte leads.care_start_timing (Kalkulator
// und Portale schreiben es nie in fd; Onboard liest die Spalte).
export const FD_KEYS = [
  'betreuung_fuer', 'pflegegrad', 'weitere_personen', 'mobilitaet', 'nachteinsaetze',
  'deutschkenntnisse', 'erfahrung', 'fuehrerschein', 'geschlecht',
] as const;
export type FdKey = typeof FD_KEYS[number];
export type AngabenKey = FdKey | 'care_start_timing';

// Spiegel von supabase/functions/onboard-to-mamamia/onboard.ts RESYNC_FELDER
// (Deno-Modul, aus Next nicht importierbar). Nur diese Felder lösen einen
// Mamamia-Sync aus; care_start_timing/erfahrung haben dort kein Ziel.
export const RESYNC_FELDER = [
  'betreuung_fuer', 'pflegegrad', 'mobilitaet', 'nachteinsaetze', 'weitere_personen',
  'deutschkenntnisse', 'fuehrerschein', 'geschlecht',
] as const;

// ponytail: Spiegel der TS-Typen aus calculator-context.tsx — eine Runtime-
// Enum gibt es nicht, und pricing_config taugt nicht als Whitelist (0-€-Werte
// haben teils keine Zeile). `satisfies` fängt Tippfehler gegen die Typen.
// `''` = „nicht angegeben" (Rechner-Konvention: `state.driving || ''`).
// `sehr-gut-sa` ist bewusst NICHT wählbar (nur das SA-Portal setzt es).
export const ERLAUBT = {
  betreuung_fuer: ['1-person', 'ehepaar'] as const satisfies readonly PatientCount[],
  weitere_personen: ['nein', 'ja'] as const satisfies readonly HouseholdOthers[],
  mobilitaet: ['mobil', 'rollator', 'rollstuhl', 'bettlaegerig'] as const satisfies readonly Mobility[],
  nachteinsaetze: ['nein', 'gelegentlich', 'taeglich', 'mehrmals'] as const satisfies readonly NightCare[],
  deutschkenntnisse: ['grundlegend', 'kommunikativ', 'sehr-gut'] as const satisfies readonly GermanLevel[],
  erfahrung: ['einsteiger', 'erfahren', 'sehr-erfahren', ''] as const satisfies readonly (Experience | '')[],
  fuehrerschein: ['egal', 'ja', 'nein', ''] as const satisfies readonly (Driving | '')[],
  geschlecht: ['egal', 'weiblich', 'maennlich', ''] as const satisfies readonly (Gender | '')[],
  care_start_timing: ['sofort', '2-4-wochen', '1-2-monate', 'unklar', 'spaeter', ''] as const satisfies readonly (CareStartTiming | 'spaeter' | '')[],
};

export interface Aenderung {
  key: AngabenKey;
  alt: unknown;
  neu: unknown;
}

export interface DiffErgebnis {
  changed: Aenderung[];
  /** Geänderte Keys mit unzulässigem Wert — Route antwortet 400. */
  fehler: string[];
}

// Normalisierung für den Vergleich: undefined/null/'' sind „nicht angegeben",
// Zahlen und ihre String-Form sind gleich (pflegegrad 3 vs '3' aus alten
// aufschluesselung-Fallbacks).
export function norm(v: unknown): string {
  if (v == null || v === '') return '';
  return String(v);
}

/** Ein einzelner Angaben-Wert im Kanon? Auch vom Pflegena-Parser benutzt,
 *  damit es EINE Wahrheit ueber gueltige Werte gibt. */
export function zulaessig(key: AngabenKey, v: unknown): boolean {
  if (key === 'pflegegrad') {
    // Integer 0..5, KEINE Koerzierung (Number('') wäre 0 = Phantom-„Keine").
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5;
  }
  return typeof v === 'string' && (ERLAUBT[key] as readonly string[]).includes(v);
}

/**
 * Diff der Admin-Eingabe gegen den gespeicherten Stand.
 * @param altFd   kalkulation.formularDaten des Leads
 * @param altTiming leads.care_start_timing (Spalte)
 * @param neu     Eingabe des Admins — nur vorhandene Keys werden verglichen
 */
export function diffAngaben(
  altFd: Record<string, unknown>,
  altTiming: string | null | undefined,
  neu: Record<string, unknown>,
): DiffErgebnis {
  const changed: Aenderung[] = [];
  const fehler: string[] = [];
  const keys: AngabenKey[] = [...FD_KEYS, 'care_start_timing'];
  for (const key of keys) {
    if (!(key in neu)) continue;
    const alt = key === 'care_start_timing' ? altTiming : altFd[key];
    const wert = neu[key];
    if (norm(alt) === norm(wert)) continue;
    if (!zulaessig(key, wert)) {
      fehler.push(`${key}: unzulässiger Wert ${JSON.stringify(wert)}`);
      continue;
    }
    changed.push({ key, alt, neu: wert });
  }
  return { changed, fehler };
}

/** Teilmenge der Änderungen, die nach Mamamia gehen. */
export function mamamiaFelder(changed: Aenderung[]): string[] {
  const allowed = new Set<string>(RESYNC_FELDER);
  return changed.map((c) => c.key).filter((k) => allowed.has(k));
}
