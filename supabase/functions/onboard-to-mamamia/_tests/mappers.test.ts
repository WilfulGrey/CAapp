import { assertEquals } from "@std/assert";
import {
  mapMobilityToId,
  mapCareLevel,
  mapDementia,
  mapNightOperations,
  mapGender,
  computeArrivalDate,
  buildJobOfferTitle,
  buildPatients,
} from "../mappers.ts";
import type { FormularDaten, Lead } from "../types.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeFormularDaten(overrides: Partial<FormularDaten> = {}): FormularDaten {
  return {
    pflegegrad: 3,
    mobilitaet: "rollstuhl",
    nachteinsaetze: "gelegentlich",
    weitere_personen: "nein",
    geschlecht: "weiblich",
    ...overrides,
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    email: "frau@example.de",
    vorname: "hildegard",
    nachname: "von norman",
    anrede: "Frau",
    anrede_text: "Frau",
    telefon: "+49 89 1234567",
    status: "angebot_requested",
    token: "tok",
    token_expires_at: "2026-05-07T12:00:00.000Z",
    token_used: false,
    care_start_timing: "sofort",
    kalkulation: {
      bruttopreis: 3200,
      eigenanteil: 1700,
      formularDaten: makeFormularDaten(),
    },
    created_at: "2026-04-23T09:00:00.000Z",
    updated_at: "2026-04-23T09:00:00.000Z",
    mamamia_customer_id: null,
    mamamia_job_offer_id: null,
    mamamia_user_token: null,
    mamamia_onboarded_at: null,
    ...overrides,
  };
}

// ─── mapMobilityToId ─────────────────────────────────────────────────────────

Deno.test("mapMobilityToId: mobil → 1", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "mobil" })), 1);
});

Deno.test("mapMobilityToId: gehfaehig → 3 (Rollator)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "gehfaehig" })), 3);
});

Deno.test("mapMobilityToId: rollstuhl → 4", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "rollstuhl" })), 4);
});

Deno.test("mapMobilityToId: bettlaegerig → 5", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "bettlaegerig" })), 5);
});

Deno.test("mapMobilityToId: unknown/missing → 1 (default, preventing crash)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "unknown" })), 1);
  assertEquals(mapMobilityToId({} as FormularDaten), 1);
});

// ─── mapCareLevel ────────────────────────────────────────────────────────────

Deno.test("mapCareLevel: valid 1-5 passes through", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assertEquals(mapCareLevel(makeFormularDaten({ pflegegrad: n })), n);
  }
});

Deno.test("mapCareLevel: 0 or out-of-range → 2 (default)", () => {
  assertEquals(mapCareLevel(makeFormularDaten({ pflegegrad: 0 })), 2);
  assertEquals(mapCareLevel(makeFormularDaten({ pflegegrad: 99 })), 2);
  assertEquals(mapCareLevel({} as FormularDaten), 2);
});

// ─── mapDementia ─────────────────────────────────────────────────────────────

Deno.test("mapDementia: absent in formularDaten → 'no' (default)", () => {
  assertEquals(mapDementia(makeFormularDaten()), "no");
});

Deno.test("mapDementia: truthy-ish → 'yes'", () => {
  assertEquals(mapDementia(makeFormularDaten({ demenz: "ja" })), "yes");
  assertEquals(mapDementia(makeFormularDaten({ demenz: "yes" })), "yes");
});

Deno.test("mapDementia: nein/no → 'no'", () => {
  assertEquals(mapDementia(makeFormularDaten({ demenz: "nein" })), "no");
  assertEquals(mapDementia(makeFormularDaten({ demenz: "no" })), "no");
});

// ─── mapNightOperations ─────────────────────────────────────────────────────

Deno.test("mapNightOperations: nein → 'no'", () => {
  assertEquals(mapNightOperations(makeFormularDaten({ nachteinsaetze: "nein" })), "no");
});

Deno.test("mapNightOperations: gelegentlich → 'yes'", () => {
  assertEquals(mapNightOperations(makeFormularDaten({ nachteinsaetze: "gelegentlich" })), "yes");
});

Deno.test("mapNightOperations: regelmaessig → 'yes'", () => {
  assertEquals(mapNightOperations(makeFormularDaten({ nachteinsaetze: "regelmaessig" })), "yes");
});

Deno.test("mapNightOperations: missing → 'no'", () => {
  assertEquals(mapNightOperations({} as FormularDaten), "no");
});

// ─── mapGender ───────────────────────────────────────────────────────────────

Deno.test("mapGender: weiblich → 'female'", () => {
  assertEquals(mapGender(makeFormularDaten({ geschlecht: "weiblich" })), "female");
});

Deno.test("mapGender: maennlich → 'male'", () => {
  assertEquals(mapGender(makeFormularDaten({ geschlecht: "maennlich" })), "male");
});

Deno.test("mapGender: egal/missing → null (unset, Mamamia handles)", () => {
  assertEquals(mapGender(makeFormularDaten({ geschlecht: "egal" })), null);
  assertEquals(mapGender({} as FormularDaten), null);
});

// ─── computeArrivalDate ──────────────────────────────────────────────────────

const NOW_2026_04_23 = "2026-04-23T00:00:00.000Z";

Deno.test("computeArrivalDate: sofort = now + 7 days", () => {
  assertEquals(computeArrivalDate("sofort", NOW_2026_04_23), "2026-04-30");
});

Deno.test("computeArrivalDate: 1-2-wochen = now + 10 days", () => {
  assertEquals(computeArrivalDate("1-2-wochen", NOW_2026_04_23), "2026-05-03");
});

Deno.test("computeArrivalDate: 1-monat = now + 30 days", () => {
  assertEquals(computeArrivalDate("1-monat", NOW_2026_04_23), "2026-05-23");
});

Deno.test("computeArrivalDate: spaeter = now + 60 days", () => {
  assertEquals(computeArrivalDate("spaeter", NOW_2026_04_23), "2026-06-22");
});

Deno.test("computeArrivalDate: null defaults to 'sofort'", () => {
  assertEquals(computeArrivalDate(null, NOW_2026_04_23), "2026-04-30");
});

Deno.test("computeArrivalDate: unknown timing falls back to 'sofort'", () => {
  assertEquals(computeArrivalDate("nieznane", NOW_2026_04_23), "2026-04-30");
});

// ─── buildJobOfferTitle ──────────────────────────────────────────────────────

Deno.test("buildJobOfferTitle: nachname only (no city yet)", () => {
  assertEquals(buildJobOfferTitle(makeLead({ nachname: "schmidt" })), "Primundus — schmidt");
});

Deno.test("buildJobOfferTitle: missing nachname falls back to 'Primundus' + lead id prefix", () => {
  const l = makeLead({ nachname: null });
  assertEquals(buildJobOfferTitle(l), "Primundus — aaaaaaaa");
});

// ─── buildPatients ──────────────────────────────────────────────────────────

Deno.test("buildPatients: weitere_personen=nein → single patient", () => {
  const patients = buildPatients(makeFormularDaten({ weitere_personen: "nein" }));
  assertEquals(patients.length, 1);
  assertEquals(patients[0].mobility_id, 4);
  assertEquals(patients[0].care_level, 3);
  assertEquals(patients[0].gender, "female");
  assertEquals(patients[0].night_operations, "yes");
  assertEquals(patients[0].dementia, "no");
});

Deno.test("buildPatients: weitere_personen=ja → 2 patients (second blank)", () => {
  const patients = buildPatients(makeFormularDaten({ weitere_personen: "ja" }));
  assertEquals(patients.length, 2);
  // first patient filled from formular
  assertEquals(patients[0].mobility_id, 4);
  // second patient - minimal required fields (mobility_id required by Mamamia to prevent crash)
  assertEquals(patients[1].mobility_id, 1);
  assertEquals(patients[1].care_level, 2);
});

Deno.test("buildPatients: empty formularDaten → single default patient (no crash)", () => {
  const patients = buildPatients({} as FormularDaten);
  assertEquals(patients.length, 1);
  assertEquals(patients[0].mobility_id, 1);
  assertEquals(patients[0].care_level, 2);
});
