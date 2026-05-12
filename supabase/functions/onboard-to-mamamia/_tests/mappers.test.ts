import { assertEquals } from "@std/assert";
import {
  buildCaregiverWish,
  buildCustomerInput,
  buildJobOfferTitle,
  buildPatients,
  computeArrivalDate,
  extractPlzFromFormularDaten,
  extractPlzFromLead,
  mapCareLevel,
  mapDementia,
  mapDrivingLicense,
  mapGender,
  mapGermanySkill,
  mapLiftId,
  mapMobilityToId,
  mapNightOperations,
  mapOtherPeopleInHouse,
  mapSalutation,
  mapToolIds,
  resolvePatientFirstName,
  resolvePatientLastName,
  resolvePatientSalutation,
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
    // mapGermanySkill throws na missing/unknown — fixture defaultuje na
    // valid enum żeby happy-path testy przeszły. Tests które weryfikują
    // throw na missing override'ują na {} przez `{} as FormularDaten`.
    deutschkenntnisse: "kommunikativ",
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
    // Far-future expiry — mappers.ts doesn't actually check expiry, but
    // keep stable for cross-test consistency. See handler.test.ts:15.
    token_expires_at: "2099-01-01T00:00:00.000Z",
    token_used: false,
    care_start_timing: "sofort",
    kalkulation: {
      bruttopreis: 3200,
      eigenanteil: 1700,
      formularDaten: makeFormularDaten(),
    },
    // Stage-B Primundus fields — null by default (only set in tests
    // that explicitly exercise the post-betreuung-beauftragen state).
    patient_anrede: null,
    patient_vorname: null,
    patient_nachname: null,
    patient_street: null,
    patient_zip: null,
    patient_city: null,
    special_requirements: null,
    order_confirmed_at: null,
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

Deno.test("mapMobilityToId: gehstock → 2 (Walking stick)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "gehstock" })), 2);
});

Deno.test("mapMobilityToId: gehfaehig → 3 (Walker)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "gehfaehig" })), 3);
});

Deno.test("mapMobilityToId: rollator → 3 (live formularDaten variant)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "rollator" })), 3);
});

Deno.test("mapMobilityToId: gehhilfe → 3 (synonym)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "gehhilfe" })), 3);
});

Deno.test("mapMobilityToId: case-insensitive (Rollator → 3)", () => {
  assertEquals(mapMobilityToId(makeFormularDaten({ mobilitaet: "Rollator" })), 3);
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

Deno.test("mapCareLevel: 0 (kalkulator 'Kein/e') → null (Mamamia natywne 'Keine')", () => {
  // Mamamia panel oferuje "Keine" zapisane jako care_level=null.
  // Zweryfikowane live 2026-05-07 na Customer 7658 po ręcznym
  // ustawieniu "brak" w panelu (query zwróciło null).
  // Forward verbatim: pflegegrad=0 → null. Bug #13e.
  assertEquals(mapCareLevel(makeFormularDaten({ pflegegrad: 0 })), null);
});

Deno.test("mapCareLevel: out-of-range / missing → 2 (most-common active default)", () => {
  assertEquals(mapCareLevel(makeFormularDaten({ pflegegrad: 99 })), 2);
  assertEquals(mapCareLevel({} as FormularDaten), 2);
});

// ─── mapDementia ─────────────────────────────────────────────────────────────
// Helper used by patient form save (patientFormMapper) — onboard does NOT
// set patient.dementia anymore (Bug #13: kalkulator nigdy nie pyta).

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

// Enum values verified against Mamamia prod DB on 2026-04-27.
Deno.test("mapNightOperations: nein → 'no'", () => {
  assertEquals(mapNightOperations(makeFormularDaten({ nachteinsaetze: "nein" })), "no");
});

Deno.test("mapNightOperations: gelegentlich → 'up_to_1_time'", () => {
  // 'occasionally' is a valid Mamamia DB enum but NOT rendered in the panel
  // dropdown — it shows "Bitte wählen" even when stored. Closest renderable
  // option is 'up_to_1_time' ("Bis zu 1 Mal"). Changed 2026-05-12.
  assertEquals(
    mapNightOperations(makeFormularDaten({ nachteinsaetze: "gelegentlich" })),
    "up_to_1_time",
  );
});

Deno.test("mapNightOperations: legacy 'regelmaessig' → 'up_to_1_time'", () => {
  // Pre-2026-04-28 calculator label, kept for back-compat with old leads.
  assertEquals(
    mapNightOperations(makeFormularDaten({ nachteinsaetze: "regelmaessig" })),
    "up_to_1_time",
  );
});

Deno.test("mapNightOperations: taeglich (Primundus '1×') → 'up_to_1_time'", () => {
  assertEquals(
    mapNightOperations(makeFormularDaten({ nachteinsaetze: "taeglich" })),
    "up_to_1_time",
  );
});

Deno.test("mapNightOperations: mehrmals (Primundus 'Mehrmals nachts') → 'more_than_2'", () => {
  // Pre-2026-05-01 we mapped this to "1_2_times" — but "Mehrmals nachts"
  // in Marcin's NEW calculator means MORE than 2× per night, not 1-2.
  assertEquals(
    mapNightOperations(makeFormularDaten({ nachteinsaetze: "mehrmals" })),
    "more_than_2",
  );
});

Deno.test("mapNightOperations: missing → 'no'", () => {
  assertEquals(mapNightOperations({} as FormularDaten), "no");
});

// ─── mapGermanySkill ────────────────────────────────────────────────────────
// Mapping updated 2026-05-12 (decyzja biznesowa Michała):
//   grundlegend → level_1 (było level_2)
//   kommunikativ → level_2 (było level_3)
//   sehr-gut    → level_4 (unchanged)
//   level_3 świadomie pomijany — agency picks manually w Mamamia panel.
// NO soft default — unknown/missing value triggers throw (Święta zasada nr 1).

Deno.test("mapGermanySkill: grundlegend → level_1", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "grundlegend" })), "level_1");
});

Deno.test("mapGermanySkill: kommunikativ → level_2", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "kommunikativ" })), "level_2");
});

Deno.test("mapGermanySkill: sehr-gut → level_4", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "sehr-gut" })), "level_4");
});

Deno.test("mapGermanySkill: sehr_gut underscore alias → level_4", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "sehr_gut" })), "level_4");
});

Deno.test("mapGermanySkill: missing throws (no soft default)", () => {
  let threw = false;
  try {
    mapGermanySkill({} as FormularDaten);
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes("unknown deutschkenntnisse value")) {
      throw new Error(`unexpected error message: ${(e as Error).message}`);
    }
  }
  if (!threw) throw new Error("expected throw on missing deutschkenntnisse");
});

Deno.test("mapGermanySkill: unknown value throws (no enum guessing)", () => {
  let threw = false;
  try {
    mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "fluent" }));
  } catch (_e) {
    threw = true;
  }
  if (!threw) throw new Error("expected throw on unknown deutschkenntnisse value");
});

// ─── mapDrivingLicense ──────────────────────────────────────────────────────

Deno.test("mapDrivingLicense: ja → yes", () => {
  assertEquals(mapDrivingLicense(makeFormularDaten({ fuehrerschein: "ja" })), "yes");
});

Deno.test("mapDrivingLicense: nein / egal / missing → not_important", () => {
  assertEquals(mapDrivingLicense(makeFormularDaten({ fuehrerschein: "nein" })), "not_important");
  assertEquals(mapDrivingLicense(makeFormularDaten({ fuehrerschein: "egal" })), "not_important");
  assertEquals(mapDrivingLicense({} as FormularDaten), "not_important");
});

// ─── mapGender ───────────────────────────────────────────────────────────────

Deno.test("mapGender: weiblich → 'female'", () => {
  assertEquals(mapGender(makeFormularDaten({ geschlecht: "weiblich" })), "female");
});

Deno.test("mapGender: maennlich → 'male'", () => {
  assertEquals(mapGender(makeFormularDaten({ geschlecht: "maennlich" })), "male");
});

Deno.test("mapGender: egal → 'not_important' (verified prod enum)", () => {
  assertEquals(mapGender(makeFormularDaten({ geschlecht: "egal" })), "not_important");
});

Deno.test("mapGender: missing → null", () => {
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

Deno.test("computeArrivalDate: 2-4-wochen = now + 21 days (live value)", () => {
  assertEquals(computeArrivalDate("2-4-wochen", NOW_2026_04_23), "2026-05-14");
});

Deno.test("computeArrivalDate: 1-monat = now + 30 days", () => {
  assertEquals(computeArrivalDate("1-monat", NOW_2026_04_23), "2026-05-23");
});

Deno.test("computeArrivalDate: 1-2-monate = now + 45 days (live value)", () => {
  assertEquals(computeArrivalDate("1-2-monate", NOW_2026_04_23), "2026-06-07");
});

Deno.test("computeArrivalDate: unklar = now + 30 days (live value)", () => {
  assertEquals(computeArrivalDate("unklar", NOW_2026_04_23), "2026-05-23");
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

// ─── buildPatients (post-Bug-#13 minimal payload) ───────────────────────────
// Onboard ships ONLY fields the calculator collects (or derivable from
// those — lift_id / tool_ids from mobility_id). All previously-injected
// defaults (gender, weight, height, dementia, incontinence_*, smoking,
// *_description{,_de,_en,_pl}) are deferred to patient form save.

Deno.test("buildPatients: single patient carries only real care attrs + derivations", () => {
  const patients = buildPatients(makeFormularDaten({ weitere_personen: "nein" }));
  assertEquals(patients.length, 1);
  // Real / derived from real
  assertEquals(patients[0].mobility_id, 4);                  // rollstuhl
  assertEquals(patients[0].care_level, 3);                   // pflegegrad
  assertEquals(patients[0].night_operations, "up_to_1_time"); // gelegentlich → up_to_1_time (not occasionally — panel can't render it)
  assertEquals(patients[0].lift_id, 1);                      // derived (mobility>=4 → Yes)
  assertEquals(patients[0].tool_ids, [3]);                   // derived (wheelchair only)
});

Deno.test("buildPatients: cut fields are NOT set on patient row (Bug #13)", () => {
  const patients = buildPatients(makeFormularDaten());
  const p = patients[0];
  // Mamamia accepts these as null/omitted at StoreCustomer time — verified
  // 2026-05-07 via /tmp/test-minimal-storecustomer.mjs (Customer 7651).
  assertEquals(p.gender, undefined);
  assertEquals(p.weight, undefined);
  assertEquals(p.height, undefined);
  assertEquals(p.dementia, undefined);
  assertEquals(p.incontinence, undefined);
  assertEquals(p.incontinence_feces, undefined);
  assertEquals(p.incontinence_urine, undefined);
  assertEquals(p.smoking, undefined);
  assertEquals(p.lift_description, undefined);
  assertEquals(p.lift_description_de, undefined);
  assertEquals(p.lift_description_en, undefined);
  assertEquals(p.lift_description_pl, undefined);
  assertEquals(p.night_operations_description, undefined);
  assertEquals(p.dementia_description, undefined);
});

Deno.test("buildPatients: rollator + taeglich (Primundus '1×' bucket)", () => {
  const patients = buildPatients(makeFormularDaten({
    mobilitaet: "rollator",
    nachteinsaetze: "taeglich",
  }));
  assertEquals(patients[0].mobility_id, 3);
  assertEquals(patients[0].night_operations, "up_to_1_time");
});

Deno.test("buildPatients: betreuung_fuer='ehepaar' → 2 patients (couple under care)", () => {
  // Pre-2026-04-28 we incorrectly used weitere_personen as the trigger;
  // the correct field is betreuung_fuer.
  const patients = buildPatients(makeFormularDaten({ betreuung_fuer: "ehepaar" }));
  assertEquals(patients.length, 2);
  // 1st patient filled from formular (rollstuhl in fixture)
  assertEquals(patients[0].mobility_id, 4);
  // 2nd patient inherits Person 1's care attrs (the calculator collects
  // ONE set of answers for the couple as a unit).
  assertEquals(patients[1].mobility_id, 4);
  assertEquals(patients[1].care_level, patients[0].care_level);
  assertEquals(patients[1].lift_id, patients[0].lift_id);
  assertEquals(patients[1].tool_ids, patients[0].tool_ids);
  assertEquals(patients[1].night_operations, patients[0].night_operations);
  // Bug #13: NO gender heuristic (we don't know couple composition).
  assertEquals(patients[1].gender, undefined);
});

Deno.test("buildPatients: betreuung_fuer='1-person' → single patient even with weitere_personen=ja", () => {
  // Regression guard: weitere_personen='ja' must NOT add a 2nd patient.
  // It only feeds customer.other_people_in_house.
  const patients = buildPatients(makeFormularDaten({
    betreuung_fuer: "1-person",
    weitere_personen: "ja",
  }));
  assertEquals(patients.length, 1);
});

Deno.test("buildPatients: empty formularDaten → single default patient (no crash)", () => {
  const patients = buildPatients({} as FormularDaten);
  assertEquals(patients.length, 1);
  assertEquals(patients[0].mobility_id, 1);
  assertEquals(patients[0].care_level, 2);
  // Bug #13: patient.gender NOT set when formularDaten missing — patient
  // form will collect it from the user's explicit pick.
  assertEquals(patients[0].gender, undefined);
});

Deno.test("buildPatients: geburtsjahr in formularDaten → year_of_birth on patient[0]", () => {
  const patients = buildPatients(makeFormularDaten({ geburtsjahr: 1945 }));
  assertEquals(patients[0].year_of_birth, 1945);
});

// ─── mapLiftId / mapToolIds ────────────────────────────────────────────────

Deno.test("mapLiftId: wheelchair (4) / bedridden (5) → 1 (Yes)", () => {
  assertEquals(mapLiftId(4), 1);
  assertEquals(mapLiftId(5), 1);
});

Deno.test("mapLiftId: mobile / walking-stick / walker → 2 (No)", () => {
  assertEquals(mapLiftId(1), 2);
  assertEquals(mapLiftId(2), 2);
  assertEquals(mapLiftId(3), 2);
});

// NEVER include id 7 (Others) — selecting it triggers a required
// "Jakie inne narzędzia są używane?" free-text we cannot fill.
Deno.test("mapToolIds: bedridden → [Patient hoist, Care bed] (no Others)", () => {
  assertEquals(mapToolIds(5), [4, 6]);
});

Deno.test("mapToolIds: wheelchair → [Wheelchair] only", () => {
  assertEquals(mapToolIds(4), [3]);
});

Deno.test("mapToolIds: walker → [Rollator] only", () => {
  assertEquals(mapToolIds(3), [2]);
});

Deno.test("mapToolIds: walking-stick → [Walking stick] only", () => {
  assertEquals(mapToolIds(2), [1]);
});

Deno.test("mapToolIds: mobile (independent) → [] (no mobility aid)", () => {
  // User feedback 2026-05-12: auto-adding Gehstock dla mobility=1 falszuje
  // wybor "Mobil – geht selbstandig" w panelu Mamamii. Pacjent samodzielny
  // nie potrzebuje walking stick.
  assertEquals(mapToolIds(1), []);
});

// ─── mapSalutation ─────────────────────────────────────────────────────────
// Helper used by acceptance flow (StoreConfirmation contracts) and
// patient identity helpers — NOT by onboard since contracts moved out.

Deno.test("mapSalutation: Frau → 'Mrs.' (prod enum, NOT 'Frau')", () => {
  assertEquals(mapSalutation("Frau"), "Mrs.");
  assertEquals(mapSalutation("frau"), "Mrs.");
});

Deno.test("mapSalutation: Herr → 'Mr.'", () => {
  assertEquals(mapSalutation("Herr"), "Mr.");
});

Deno.test("mapSalutation: null/empty → 'Mr.' (safest default)", () => {
  assertEquals(mapSalutation(null), "Mr.");
  assertEquals(mapSalutation(""), "Mr.");
  assertEquals(mapSalutation("unknown"), "Mr.");
});

// ─── mapOtherPeopleInHouse ─────────────────────────────────────────────────

Deno.test("mapOtherPeopleInHouse: weitere_personen=ja → 'yes'", () => {
  assertEquals(mapOtherPeopleInHouse(makeFormularDaten({ weitere_personen: "ja" })), "yes");
});

Deno.test("mapOtherPeopleInHouse: nein/missing → 'no'", () => {
  assertEquals(mapOtherPeopleInHouse(makeFormularDaten({ weitere_personen: "nein" })), "no");
  assertEquals(mapOtherPeopleInHouse({} as FormularDaten), "no");
});

// ─── buildCaregiverWish (post-Bug-#13: only real preference enums) ─────────

Deno.test("buildCaregiverWish: carries only real preference enums", () => {
  const wish = buildCaregiverWish(makeFormularDaten({
    geschlecht: "weiblich",
    deutschkenntnisse: "kommunikativ",
    fuehrerschein: "ja",
  }));
  assertEquals(wish.gender, "female");
  assertEquals(wish.germany_skill, "level_2");   // kommunikativ → level_2 (refactor 2026-05-12)
  assertEquals(wish.driving_license, "yes");
  assertEquals(wish.is_open_for_all, false);   // Primundus business default
});

Deno.test("buildCaregiverWish: cut fields are NOT set (Bug #13)", () => {
  const wish = buildCaregiverWish(makeFormularDaten({ fuehrerschein: "ja" }));
  // Bug #13: smoking/shopping/tasks*/shopping_be_done*/driving_license_gearbox
  // are deferred to patient form save (real user choice, not auto-string).
  assertEquals(wish.smoking, undefined);
  assertEquals(wish.shopping, undefined);
  assertEquals(wish.tasks, undefined);
  assertEquals(wish.tasks_de, undefined);
  assertEquals(wish.tasks_en, undefined);
  assertEquals(wish.tasks_pl, undefined);
  assertEquals(wish.shopping_be_done, undefined);
  // Even when driving_license=yes — gearbox lives on patient form.
  assertEquals(wish.driving_license_gearbox, undefined);
});

Deno.test("buildCaregiverWish: missing gender → 'not_important' (prod-safe default)", () => {
  // deutschkenntnisse jest required przez mapGermanySkill (throw na missing) —
  // ten test sprawdza tylko gender fallback, dorzucamy valid deutschkenntnisse
  // żeby wish nie wybuchł na innej missing field.
  const wish = buildCaregiverWish({ deutschkenntnisse: "kommunikativ" } as FormularDaten);
  assertEquals(wish.gender, "not_important");
});

Deno.test("buildCaregiverWish: real Primundus stage-A fields override defaults", () => {
  const wish = buildCaregiverWish(makeFormularDaten({
    deutschkenntnisse: "sehr-gut",
    fuehrerschein: "ja",
    geschlecht: "maennlich",
  }));
  assertEquals(wish.germany_skill, "level_4");
  assertEquals(wish.driving_license, "yes");
  assertEquals(wish.gender, "male");
});

// ─── extractPlzFromLead (primary path) ─────────────────────────────────────

Deno.test("extractPlzFromLead: lead.patient_zip is preferred (Primundus stage-B field)", () => {
  const lead = makeLead({ patient_zip: "10115" });
  assertEquals(extractPlzFromLead(lead), "10115");
});

Deno.test("extractPlzFromLead: 4-digit zip on patient_zip is padded", () => {
  const lead = makeLead({ patient_zip: "1067" });
  assertEquals(extractPlzFromLead(lead), "01067");
});

Deno.test("extractPlzFromLead: missing patient_zip falls back to formularDaten.plz", () => {
  const lead = makeLead({
    patient_zip: null,
    kalkulation: {
      bruttopreis: 0,
      eigenanteil: 0,
      formularDaten: { ...makeFormularDaten(), plz: "80331" },
    },
  });
  assertEquals(extractPlzFromLead(lead), "80331");
});

Deno.test("extractPlzFromLead: no PLZ anywhere → null", () => {
  const lead = makeLead({ patient_zip: null });
  assertEquals(extractPlzFromLead(lead), null);
});

// ─── extractPlzFromFormularDaten (legacy / fallback helper) ────────────────

Deno.test("extractPlzFromFormularDaten: plz key (string)", () => {
  assertEquals(extractPlzFromFormularDaten({ plz: "10115" } as FormularDaten), "10115");
});

Deno.test("extractPlzFromFormularDaten: postleitzahl key (number)", () => {
  assertEquals(extractPlzFromFormularDaten({ postleitzahl: 80331 } as FormularDaten), "80331");
});

Deno.test("extractPlzFromFormularDaten: pads 4-digit PLZ to 5 (e.g. 1067 → 01067)", () => {
  assertEquals(extractPlzFromFormularDaten({ plz: "1067" } as FormularDaten), "01067");
});

Deno.test("extractPlzFromFormularDaten: no PLZ → null", () => {
  assertEquals(extractPlzFromFormularDaten({} as FormularDaten), null);
  assertEquals(extractPlzFromFormularDaten({ plz: "abc" } as FormularDaten), null);
});

// ─── Patient identity helpers ──────────────────────────────────────────────
// Used by buildCustomerInput to set Customer.first_name/last_name.
// Stage-B `patient_*` fields take priority; MVP fallback is lead.* (orderer).

Deno.test("resolvePatientFirstName: prefers patient_vorname (stage-B)", () => {
  assertEquals(
    resolvePatientFirstName(makeLead({ patient_vorname: "Zenon" })),
    "Zenon",
  );
});

Deno.test("resolvePatientFirstName: falls back to lead.vorname (stage-A only)", () => {
  assertEquals(
    resolvePatientFirstName(makeLead({ patient_vorname: null })),
    "hildegard",
  );
});

Deno.test("resolvePatientLastName: prefers patient_nachname (stage-B)", () => {
  assertEquals(
    resolvePatientLastName(makeLead({ patient_nachname: "Test" })),
    "Test",
  );
});

Deno.test("resolvePatientSalutation: prefers patient_anrede over lead.anrede", () => {
  assertEquals(
    resolvePatientSalutation(makeLead({ patient_anrede: "Herr" })),
    "Mr.",
  );
  assertEquals(
    resolvePatientSalutation(makeLead({ patient_anrede: null, anrede: "Frau" })),
    "Mrs.",
  );
});

// ─── buildCustomerInput (post-Bug-#13: minimal payload) ────────────────────

Deno.test("buildCustomerInput: identity + business defaults + real formularDaten", () => {
  const lead = makeLead();
  const input = buildCustomerInput(lead);

  // Identity (real from lead.*; patient_* are null in MVP)
  assertEquals(input.first_name, "hildegard");
  assertEquals(input.last_name, "von norman");
  assertEquals(input.email, "frau@example.de");
  assertEquals(input.phone, "+49 89 1234567");

  // Business defaults — NOT pytania do klienta
  assertEquals(input.language_id, 1);
  assertEquals(input.visibility, "public");
  assertEquals(input.commission_agent_salary, 10);

  // Real from kalkulation
  assertEquals(input.care_budget, 3200);
  assertEquals(input.monthly_salary, 3200);

  // Derived from real care_start_timing
  if (typeof input.arrival_at !== "string" || input.arrival_at.length === 0) {
    throw new Error("expected input.arrival_at to be non-empty YYYY-MM-DD");
  }

  // Real from formularDaten
  assertEquals(input.other_people_in_house, "no");   // weitere_personen=nein
  assertEquals(input.gender, "female");              // geschlecht=weiblich

  // Nested
  assertEquals(input.patients.length, 1);
  if (!input.customer_caregiver_wish) throw new Error("wish must be set");
});

Deno.test("buildCustomerInput: cut fields are NOT in payload (Bug #13)", () => {
  const lead = makeLead();
  // deno-lint-ignore no-explicit-any
  const input = buildCustomerInput(lead) as any;

  // Customer-level fields cut from onboard — Mamamia accepts as
  // null/omitted (verified 2026-05-07). Patient form save populates
  // them via UpdateCustomer (real user choice, not phantom default).
  assertEquals(input.urbanization_id, undefined);
  assertEquals(input.equipment_ids, undefined);
  assertEquals(input.day_care_facility, undefined);
  assertEquals(input.accommodation, undefined);
  assertEquals(input.caregiver_accommodated, undefined);  // Mamamia auto-defaults to "room_premises"
  assertEquals(input.has_family_near_by, undefined);
  assertEquals(input.internet, undefined);
  assertEquals(input.pets, undefined);                    // Mamamia auto-defaults to "no_information"
  assertEquals(input.is_pet_dog, undefined);
  assertEquals(input.is_pet_cat, undefined);
  assertEquals(input.is_pet_other, undefined);
  assertEquals(input.smoking_household, undefined);
  assertEquals(input.job_description, undefined);
  assertEquals(input.job_description_de, undefined);
  assertEquals(input.job_description_en, undefined);
  assertEquals(input.job_description_pl, undefined);

  // Contracts moved to acceptance flow (StoreConfirmation).
  assertEquals(input.customer_contract, undefined);
  assertEquals(input.invoice_contract, undefined);
  assertEquals(input.customer_contacts, undefined);
});

Deno.test("buildCustomerInput: weitere_personen=ja propagates only to other_people_in_house (not 2 patients)", () => {
  const lead = makeLead({
    kalkulation: {
      bruttopreis: 3000,
      eigenanteil: 1500,
      formularDaten: { ...makeFormularDaten(), weitere_personen: "ja" },
    },
  });
  const input = buildCustomerInput(lead);
  assertEquals(input.other_people_in_house, "yes");
  assertEquals(input.patients.length, 1);
});

Deno.test("buildCustomerInput: stage-B patient_* override lead.* for top-level identity", () => {
  const lead = makeLead({
    vorname: "Michał",
    nachname: "Test",
    anrede: "Herr",
    patient_anrede: "Herr",
    patient_vorname: "Zenon",
    patient_nachname: "Test",
  });
  const input = buildCustomerInput(lead, 1148);
  // Customer top-level identity = patient (Zenon), since stage-B has run.
  assertEquals(input.first_name, "Zenon");
  assertEquals(input.last_name, "Test");
});

Deno.test("buildCustomerInput: betreuung_fuer='ehepaar' yields 2 patients", () => {
  const lead = makeLead({
    kalkulation: {
      bruttopreis: 3000,
      eigenanteil: 1500,
      formularDaten: { ...makeFormularDaten(), betreuung_fuer: "ehepaar" },
    },
  });
  const input = buildCustomerInput(lead);
  assertEquals(input.patients.length, 2);
});

Deno.test("buildCustomerInput: null kalkulation throws (no soft default — Święta zasada nr 1)", () => {
  // Pre-2026-05-12: ten test asser'ował że null kalkulation "no crash" —
  // defaultami wszystkich enum field'ów. Post-refactor mapGermanySkill:
  // missing deutschkenntnisse → throw. Onboard fail loud zamiast soft
  // default'u. Legacy lead bez kalkulacji = anomalia wymagająca manual fix.
  const lead = makeLead({ kalkulation: null });
  let threw = false;
  try {
    buildCustomerInput(lead);
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes("unknown deutschkenntnisse value")) {
      throw new Error(`unexpected error: ${(e as Error).message}`);
    }
  }
  if (!threw) throw new Error("expected throw on null kalkulation");
});

Deno.test("buildCustomerInput: locationId arg propagates to customer top-level", () => {
  const lead = makeLead();
  const input = buildCustomerInput(lead, 1148);
  assertEquals(input.location_id, 1148);
});

Deno.test("buildCustomerInput: no locationId → location_id stays null (patient form fills)", () => {
  const lead = makeLead();
  const input = buildCustomerInput(lead);
  assertEquals(input.location_id, null);
  // No location_custom_text on customer top-level — patient form's PLZ+Ort
  // propagate via UpdateCustomer.
});
