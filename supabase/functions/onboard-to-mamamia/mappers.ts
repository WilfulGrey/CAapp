import type { FormularDaten, Lead, PatientInput } from "./types.ts";

// ─── Mobility ────────────────────────────────────────────────────────────────
// Mamamia mobility_id values (from SADASH docs + live beta):
// 1 = Mobile, 2 = Walking stick, 3 = Walker/Rollator, 4 = Wheelchair, 5 = Bedridden
// `mobility_id` MUST be set, or StoreJobOffer crashes in checkSuperJob3.
const MOBILITY_MAP: Record<string, number> = {
  mobil: 1,
  gehfaehig: 3,
  rollstuhl: 4,
  bettlaegerig: 5,
};

export function mapMobilityToId(fd: FormularDaten): number {
  const key = (fd?.mobilitaet ?? "").toString();
  return MOBILITY_MAP[key] ?? 1; // default 1 = Mobile (safest — no crash)
}

// ─── Care level (Pflegegrad) ────────────────────────────────────────────────
// Valid 1-5. Mamamia required. Default 2 if missing/invalid.
export function mapCareLevel(fd: FormularDaten): number {
  const v = fd?.pflegegrad;
  if (typeof v === "number" && v >= 1 && v <= 5) return v;
  return 2;
}

// ─── Dementia ───────────────────────────────────────────────────────────────
export function mapDementia(fd: FormularDaten): "yes" | "no" {
  const v = (fd?.demenz ?? "").toString().toLowerCase();
  if (v === "ja" || v === "yes") return "yes";
  return "no";
}

// ─── Night operations ───────────────────────────────────────────────────────
export function mapNightOperations(fd: FormularDaten): "yes" | "no" {
  const v = (fd?.nachteinsaetze ?? "").toString().toLowerCase();
  if (v === "gelegentlich" || v === "regelmaessig") return "yes";
  return "no";
}

// ─── Gender ─────────────────────────────────────────────────────────────────
export function mapGender(fd: FormularDaten): "male" | "female" | null {
  const v = (fd?.geschlecht ?? "").toString().toLowerCase();
  if (v === "weiblich") return "female";
  if (v === "maennlich") return "male";
  return null;
}

// ─── Arrival date from care_start_timing ────────────────────────────────────
// Returns YYYY-MM-DD format expected by Mamamia StoreJobOffer.arrival_at.
const OFFSET_DAYS: Record<string, number> = {
  sofort: 7,
  "1-2-wochen": 10,
  "1-monat": 30,
  spaeter: 60,
};

export function computeArrivalDate(
  timing: string | null | undefined,
  nowISO: string,
): string {
  const days = OFFSET_DAYS[timing ?? "sofort"] ?? OFFSET_DAYS.sofort;
  const d = new Date(nowISO);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── JobOffer title generator ───────────────────────────────────────────────
// Mamamia requires non-empty title. Use "Primundus — {nachname}" when available,
// fall back to "Primundus — {first-8-chars-of-lead-id}" if nachname is null.
export function buildJobOfferTitle(lead: Lead): string {
  if (lead.nachname && lead.nachname.trim().length > 0) {
    return `Primundus — ${lead.nachname}`;
  }
  return `Primundus — ${lead.id.slice(0, 8)}`;
}

// ─── Build patients[] from formularDaten ────────────────────────────────────
// weitere_personen=ja → 2 patients, second with minimal required fields
// (mobility_id + care_level) to prevent StoreJobOffer crash.
export function buildPatients(fd: FormularDaten): PatientInput[] {
  const first: PatientInput = {
    gender: mapGender(fd),
    care_level: mapCareLevel(fd),
    mobility_id: mapMobilityToId(fd),
    dementia: mapDementia(fd),
    night_operations: mapNightOperations(fd),
    incontinence: false,
    smoking: false,
  };

  const second: PatientInput | null = fd?.weitere_personen === "ja"
    ? { care_level: 2, mobility_id: 1 } // placeholder — user fills later via UpdateCustomer
    : null;

  return second ? [first, second] : [first];
}
