import { assertEquals } from "@std/assert";
import {
  buildCaregiverWish,
  buildContactsFromLead,
  buildContractFromLead,
  buildCustomerInput,
  buildJobDescription,
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

// Enum values verified against Mamamia prod DB on 2026-04-27.
Deno.test("mapNightOperations: nein → 'no'", () => {
  assertEquals(mapNightOperations(makeFormularDaten({ nachteinsaetze: "nein" })), "no");
});

Deno.test("mapNightOperations: gelegentlich → 'occasionally'", () => {
  assertEquals(
    mapNightOperations(makeFormularDaten({ nachteinsaetze: "gelegentlich" })),
    "occasionally",
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

Deno.test("mapNightOperations: mehrmals (Primundus 'multiple times') → '1_2_times'", () => {
  assertEquals(
    mapNightOperations(makeFormularDaten({ nachteinsaetze: "mehrmals" })),
    "1_2_times",
  );
});

Deno.test("mapNightOperations: missing → 'no'", () => {
  assertEquals(mapNightOperations({} as FormularDaten), "no");
});

// ─── mapGermanySkill ────────────────────────────────────────────────────────

Deno.test("mapGermanySkill: grundlegend → level_2", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "grundlegend" })), "level_2");
});

Deno.test("mapGermanySkill: kommunikativ → level_3", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "kommunikativ" })), "level_3");
});

Deno.test("mapGermanySkill: sehr-gut → level_4", () => {
  assertEquals(mapGermanySkill(makeFormularDaten({ deutschkenntnisse: "sehr-gut" })), "level_4");
});

Deno.test("mapGermanySkill: missing → level_3 (prod-most-common default)", () => {
  assertEquals(mapGermanySkill({} as FormularDaten), "level_3");
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

// ─── buildPatients ──────────────────────────────────────────────────────────

Deno.test("buildPatients: weitere_personen=nein → single patient with all 100%-fill fields set", () => {
  const patients = buildPatients(makeFormularDaten({ weitere_personen: "nein" }));
  assertEquals(patients.length, 1);
  assertEquals(patients[0].mobility_id, 4);
  assertEquals(patients[0].care_level, 3);
  assertEquals(patients[0].gender, "female");
  // Default fixture: nachteinsaetze="gelegentlich" → "occasionally".
  assertEquals(patients[0].night_operations, "occasionally");
  // dementia: default fixture has no demenz key → mapDementia returns "no".
  assertEquals(patients[0].dementia, "no");
  // Defaults verified vs prod patients-active sweep + customer panel form:
  // - lift_id depends on mobility (rollstuhl=4 → lift_id=1 "Yes")
  // - panel form requires *_description fields, auto-text fills them
  assertEquals(patients[0].lift_id, 1);          // rollstuhl → lift required
  assertEquals(patients[0].tool_ids, [3]);       // wheelchair only — never Others
  assertEquals(patients[0].weight, "61-70");
  assertEquals(patients[0].height, "161-170");
  assertEquals(patients[0].incontinence, false);
  assertEquals(patients[0].incontinence_feces, false);
  assertEquals(patients[0].incontinence_urine, false);
  assertEquals(patients[0].smoking, false);
  // Auto-text descriptions in 4 locales — panel form requires non-empty
  for (
    const k of [
      "lift_description",
      "lift_description_de",
      "lift_description_en",
      "lift_description_pl",
      "night_operations_description",
      "night_operations_description_de",
      "night_operations_description_en",
      "night_operations_description_pl",
      "dementia_description",
      "dementia_description_de",
      "dementia_description_en",
      "dementia_description_pl",
    ] as const
  ) {
    if (!patients[0][k] || patients[0][k]?.length === 0) {
      throw new Error(`expected patients[0].${k} to be non-empty`);
    }
  }
});

Deno.test("buildPatients: rollator + taeglich (Primundus '1×' bucket)", () => {
  // taeglich in Primundus calculator = "once a night" → maps to
  // Mamamia 'up_to_1_time'. Pre-2026-04-28 we incorrectly mapped this
  // to '1_2_times'.
  const patients = buildPatients(makeFormularDaten({
    mobilitaet: "rollator",
    nachteinsaetze: "taeglich",
  }));
  assertEquals(patients[0].mobility_id, 3);
  assertEquals(patients[0].night_operations, "up_to_1_time");
});

Deno.test("buildPatients: dementia=ja propagates to patient[0]", () => {
  const patients = buildPatients(makeFormularDaten({ demenz: "ja" }));
  assertEquals(patients[0].dementia, "yes");
});

Deno.test("buildPatients: betreuung_fuer='ehepaar' → 2 patients (couple under care)", () => {
  // Primundus stage-A field that signals "two people need care". This is
  // the correct trigger — pre-2026-04-28 we incorrectly used
  // weitere_personen which is a different question (others IN house).
  const patients = buildPatients(makeFormularDaten({ betreuung_fuer: "ehepaar" }));
  assertEquals(patients.length, 2);
  // first patient filled from formular
  assertEquals(patients[0].mobility_id, 4);
  // second patient — required fields all set (Mamamia rejects partial patient
  // shapes inside the same StoreCustomer call)
  assertEquals(patients[1].mobility_id, 1);
  assertEquals(patients[1].care_level, 2);
  assertEquals(patients[1].lift_id, 2);  // mobile → no lift
  assertEquals(patients[1].tool_ids, [1]); // mobile → Walking stick only (never Others)
  assertEquals(patients[1].weight, "61-70");
  // 2nd patient is the spouse — opposite gender as a best-guess heuristic.
  // Default primaryGender is "female" (when no opts.primaryGender given),
  // so secondGender flips to "male".
  assertEquals(patients[1].gender, "male");
});

Deno.test("buildPatients: opts.primaryGender drives both rows (couple swap)", () => {
  const patients = buildPatients(
    makeFormularDaten({ betreuung_fuer: "ehepaar" }),
    { primaryGender: "male" },
  );
  assertEquals(patients[0].gender, "male");
  assertEquals(patients[1].gender, "female"); // flipped
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
  // patient.gender defaults to "female" (prod-most-common, 61% of active
  // patients) when no primaryGender is provided. Mamamia rejects
  // "not_important" on patient.gender — separate concept from caregiver
  // preference (customer_caregiver_wish.gender).
  assertEquals(patients[0].gender, "female");
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

Deno.test("mapToolIds: walking-stick / mobile → [Walking stick] only", () => {
  assertEquals(mapToolIds(2), [1]);
  assertEquals(mapToolIds(1), [1]);
});

// ─── mapSalutation ─────────────────────────────────────────────────────────

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

// ─── buildCaregiverWish ────────────────────────────────────────────────────

Deno.test("buildCaregiverWish: prod-most-common defaults + gender from formularDaten", () => {
  const wish = buildCaregiverWish(makeFormularDaten({ geschlecht: "weiblich" }));
  assertEquals(wish.gender, "female");
  assertEquals(wish.germany_skill, "level_3");
  assertEquals(wish.driving_license, "not_important");
  assertEquals(wish.smoking, "yes_outside");
  assertEquals(wish.shopping, "no");
  assertEquals(wish.is_open_for_all, false);
  // Free-text fields must be non-null (99-100% in active customers).
  // We don't assert the exact wording — just that all 4 locales carry
  // a non-empty string for tasks + shopping_be_done.
  for (
    const k of [
      "tasks",
      "tasks_de",
      "tasks_en",
      "tasks_pl",
      "shopping_be_done",
      "shopping_be_done_de",
      "shopping_be_done_en",
      "shopping_be_done_pl",
    ] as const
  ) {
    if (!wish[k] || wish[k]?.length === 0) {
      throw new Error(`expected wish.${k} to be non-empty`);
    }
  }
});

Deno.test("buildCaregiverWish: missing gender → 'not_important' (prod-safe default)", () => {
  const wish = buildCaregiverWish({} as FormularDaten);
  assertEquals(wish.gender, "not_important");
});

Deno.test("buildCaregiverWish: real Primundus stage-A fields override defaults", () => {
  // Verify deutschkenntnisse + fuehrerschein from formularDaten flow
  // through to germany_skill / driving_license rather than being shadowed
  // by the prod-default fallbacks.
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

// ─── buildContractFromLead / buildContactsFromLead ─────────────────────────

Deno.test("buildContractFromLead: lead → invoice/main contract with patient role", () => {
  const lead = makeLead();
  const contract = buildContractFromLead(lead);
  assertEquals(contract.contact_type, "patient");
  assertEquals(contract.is_same_as_first_patient, true);
  assertEquals(contract.salutation, "Mrs.");      // Frau → Mrs.
  assertEquals(contract.first_name, "hildegard");
  assertEquals(contract.last_name, "von norman");
  assertEquals(contract.email, "frau@example.de");
  assertEquals(contract.phone, "+49 89 1234567");
  // Without locationId → manual-entry fallback (mirrors panel checkbox)
  assertEquals(contract.location_id, undefined);
  assertEquals(contract.location_custom_text, "Wird vom Kunden ergänzt");
});

Deno.test("buildContractFromLead: with locationId → uses dropdown id, no custom_text", () => {
  const lead = makeLead();
  const contract = buildContractFromLead(lead, 1148);
  assertEquals(contract.location_id, 1148);
  assertEquals(contract.location_custom_text, undefined);
});

// ─── Patient identity vs contract contact ────────────────────────────────
//
// Primundus stage-B form puts the actual care recipient in patient_*
// fields (e.g. Zenon Test) and keeps the orderer/payer in lead.*
// (e.g. Michał Test = the person who filled the calculator).
// Mamamia tracks both as distinct rows; we must not collapse them.

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

Deno.test("resolvePatientSalutation: prefers patient_anrede over lead.anrede", () => {
  assertEquals(
    resolvePatientSalutation(makeLead({ patient_anrede: "Herr" })),
    "Mr.",
  );
  // Fallback to lead.anrede when patient_anrede missing.
  assertEquals(
    resolvePatientSalutation(makeLead({ patient_anrede: null, anrede: "Frau" })),
    "Mrs.",
  );
});

Deno.test("buildContractFromLead kind='patient' uses patient_* identity", () => {
  const lead = makeLead({
    vorname: "Michał",
    nachname: "Test",
    anrede: "Herr",
    patient_anrede: "Herr",
    patient_vorname: "Zenon",
    patient_nachname: "Test",
  });
  const contract = buildContractFromLead(lead, 1148, "patient");
  assertEquals(contract.first_name, "Zenon");
  assertEquals(contract.last_name, "Test");
  assertEquals(contract.salutation, "Mr.");
  assertEquals(contract.contact_type, "patient");
});

Deno.test("buildContractFromLead kind='contact' uses lead.* identity (orderer/payer)", () => {
  const lead = makeLead({
    vorname: "Michał",
    nachname: "Test",
    anrede: "Herr",
    patient_anrede: "Herr",
    patient_vorname: "Zenon",
    patient_nachname: "Test",
  });
  const contract = buildContractFromLead(lead, 1148, "contact");
  assertEquals(contract.first_name, "Michał");
  assertEquals(contract.last_name, "Test");
  assertEquals(contract.contact_type, "invoice");
  // Patient ≠ contact identity → not mirrored
  assertEquals(contract.is_same_as_first_patient, false);
});

Deno.test("buildContractFromLead patient address fields propagate from patient_*", () => {
  const lead = makeLead({
    patient_street: "Hans Kloss Strasse",
    patient_zip: "10176",
    patient_city: "Berlin",
  });
  const contract = buildContractFromLead(lead, 1148, "patient");
  assertEquals(contract.street_number, "Hans Kloss Strasse");
  assertEquals(contract.zip_code, "10176");
  assertEquals(contract.city, "Berlin");
});

Deno.test("buildContactsFromLead: patient ≠ contact → is_same_as_first_patient=false", () => {
  const lead = makeLead({
    vorname: "Michał",
    nachname: "Test",
    patient_vorname: "Zenon",
    patient_nachname: "Test",
  });
  const contacts = buildContactsFromLead(lead);
  assertEquals(contacts[0].first_name, "Michał");
  assertEquals(contacts[0].is_same_as_first_patient, false);
});

Deno.test("buildContactsFromLead: stage-A only (patient missing) → is_same_as_first_patient=true", () => {
  const lead = makeLead({
    patient_vorname: null,
    patient_nachname: null,
  });
  const contacts = buildContactsFromLead(lead);
  assertEquals(contacts[0].is_same_as_first_patient, true);
});

Deno.test("buildContactsFromLead: returns single contact mirroring lead", () => {
  const lead = makeLead({ anrede: "Herr", vorname: "klaus" });
  const contacts = buildContactsFromLead(lead);
  assertEquals(contacts.length, 1);
  assertEquals(contacts[0].salutation, "Mr.");
  assertEquals(contacts[0].first_name, "klaus");
  assertEquals(contacts[0].is_same_as_first_patient, true);
});

// ─── buildJobDescription ───────────────────────────────────────────────────

Deno.test("buildJobDescription: includes care_level + mobility label in 3 locales", () => {
  const desc = buildJobDescription(makeFormularDaten({
    pflegegrad: 4,
    mobilitaet: "rollstuhl",
  }));
  // sanity checks — actual wording is implementation detail, but must
  // include the care level number and reference the mobility category
  if (!desc.de.includes("4") || !desc.de.toLowerCase().includes("rollstuhl")) {
    throw new Error(`unexpected DE: ${desc.de}`);
  }
  if (!desc.en.includes("4") || !desc.en.toLowerCase().includes("wheelchair")) {
    throw new Error(`unexpected EN: ${desc.en}`);
  }
  if (!desc.pl.includes("4") || !desc.pl.toLowerCase().includes("wózk")) {
    throw new Error(`unexpected PL: ${desc.pl}`);
  }
});

// ─── buildCustomerInput (top-level) ────────────────────────────────────────

Deno.test("buildCustomerInput: every must-fill field is set for active-state customer", () => {
  const lead = makeLead();
  const input = buildCustomerInput(lead);

  // Identity — when stage-B hasn't run, the patient identity falls
  // back to lead.* so first_name == lead.vorname.
  assertEquals(input.first_name, "hildegard");
  assertEquals(input.email, "frau@example.de");
  assertEquals(input.phone, "+49 89 1234567");

  // 100% fill in active prod (must-set)
  assertEquals(input.urbanization_id, 2);
  assertEquals(input.language_id, 1);
  assertEquals(input.visibility, "public");
  assertEquals(input.accommodation, "single_family_house");
  assertEquals(input.caregiver_accommodated, "room_premises");
  assertEquals(input.has_family_near_by, "not_important");
  assertEquals(input.internet, "yes");
  assertEquals(input.pets, "no_information");
  assertEquals(input.other_people_in_house, "no");   // weitere_personen=nein
  assertEquals(input.smoking_household, "no");
  assertEquals(input.gender, "female");              // from formularDaten

  // Panel form requires these — verified vs screenshots from customer 7579/7580
  // (NEVER pick "Others" id 8 — triggers required "Inne urządzenia" text)
  assertEquals(input.equipment_ids, [1, 2]);        // Own TV, Own Bathroom
  assertEquals(input.day_care_facility, "no");

  // Care budget = bruttopreis (mirrored to monthly_salary)
  assertEquals(input.care_budget, 3200);
  assertEquals(input.monthly_salary, 3200);
  // Primundus default commission — panel rejects 0
  assertEquals(input.commission_agent_salary, 300);
  // arrival_at on Customer (separate from JobOffer) — Mamamia
  // active-state gate requires it. computeArrivalDate("sofort") = +7d.
  if (typeof input.arrival_at !== "string" || input.arrival_at.length === 0) {
    throw new Error("expected input.arrival_at to be non-empty YYYY-MM-DD");
  }

  // Job description set in all 4 locales
  if (!input.job_description || input.job_description.length === 0) {
    throw new Error("job_description must be non-empty");
  }
  if (!input.job_description_de || !input.job_description_en || !input.job_description_pl) {
    throw new Error("job_description_{de,en,pl} must all be non-empty");
  }

  // Nested
  assertEquals(input.patients.length, 1);
  if (!input.customer_caregiver_wish) throw new Error("wish must be set");
  if (!input.customer_contract) throw new Error("contract must be set");
  if (!input.invoice_contract) throw new Error("invoice contract must be set");
  if (!input.customer_contacts || input.customer_contacts.length === 0) {
    throw new Error("contacts must be set");
  }
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
  // Single patient — weitere_personen is "others IN house", not "2 patients
  // under care". Couple-under-care needs betreuung_fuer='ehepaar'.
  assertEquals(input.patients.length, 1);
});

Deno.test("buildCustomerInput: stage-B lead → top-level uses patient_*, contracts split correctly", () => {
  const lead = makeLead({
    vorname: "Michał",
    nachname: "Test",
    anrede: "Herr",
    patient_anrede: "Herr",
    patient_vorname: "Zenon",
    patient_nachname: "Test",
    patient_street: "Hans Kloss Strasse",
    patient_zip: "10115",
    patient_city: "Berlin",
  });
  const input = buildCustomerInput(lead, 1148);

  // Customer top-level identity = patient (Zenon)
  assertEquals(input.first_name, "Zenon");
  assertEquals(input.last_name, "Test");

  // customer_contract = patient (Zenon) — contact_type 'patient'
  assertEquals(input.customer_contract?.first_name, "Zenon");
  assertEquals(input.customer_contract?.contact_type, "patient");
  assertEquals(input.customer_contract?.zip_code, "10115");

  // invoice_contract = orderer/payer (Michał) — contact_type 'invoice'
  assertEquals(input.invoice_contract?.first_name, "Michał");
  assertEquals(input.invoice_contract?.contact_type, "invoice");
  assertEquals(input.invoice_contract?.is_same_as_first_patient, false);

  // customer_contacts mirrors invoice (orderer)
  assertEquals(input.customer_contacts?.[0].first_name, "Michał");
  assertEquals(input.customer_contacts?.[0].is_same_as_first_patient, false);
});

Deno.test("buildCustomerInput: betreuung_fuer='ehepaar' yields 2 patients (couple-under-care)", () => {
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

Deno.test("buildCustomerInput: null kalkulation → defaults preserved (no crash)", () => {
  const lead = makeLead({ kalkulation: null });
  const input = buildCustomerInput(lead);
  assertEquals(input.care_budget, null);
  assertEquals(input.monthly_salary, null);
  assertEquals(input.urbanization_id, 2);
  assertEquals(input.patients.length, 1);
  assertEquals(input.other_people_in_house, "no");
});

Deno.test("buildCustomerInput: locationId arg propagates to customer + both contracts", () => {
  const lead = makeLead();
  const input = buildCustomerInput(lead, 1148);
  assertEquals(input.location_id, 1148);
  assertEquals(input.customer_contract?.location_id, 1148);
  assertEquals(input.invoice_contract?.location_id, 1148);
  // No custom_text fallback when location_id is supplied
  assertEquals(input.customer_contract?.location_custom_text, undefined);
});

Deno.test("buildCustomerInput: no locationId → contracts carry custom_text fallback", () => {
  const lead = makeLead();
  const input = buildCustomerInput(lead);
  assertEquals(input.location_id, null);
  assertEquals(input.customer_contract?.location_custom_text, "Wird vom Kunden ergänzt");
  assertEquals(input.invoice_contract?.location_custom_text, "Wird vom Kunden ergänzt");
});
