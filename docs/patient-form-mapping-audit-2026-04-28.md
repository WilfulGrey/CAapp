# Patient form → Mamamia mapping audit

Generated: 2026-04-28T15:34:40.988Z

Customer: 7596 (status=active)
Result: 25 ok, 0 bugs/gaps out of 25 fields

## Per-field

| Form field | Expected target | Actual | Status |
|---|---|---|---|
| `anzahl='1'` | 1 patient + other_people_in_house='no' | 1 patient(s), other_people_in_house=no | ✅ |
| `geschlecht='Männlich'` | patient.gender='male' | patient.gender=male | ✅ |
| `geburtsjahr='1942'` | patient.year_of_birth=1942 | 1942 | ✅ |
| `pflegegrad='Pflegegrad 4'` | patient.care_level=4 | 4 | ✅ |
| `gewicht='71-80 kg'` | patient.weight matches '71-80' bucket | '71-80 kg' | ✅ |
| `groesse='171-180 cm'` | patient.height matches '171-180' bucket | '171-180 cm' | ✅ |
| `mobilitaet='Rollatorfähig'` | patient.mobility_id=3 | 3 | ✅ |
| `heben='Ja'` | patient.lift_id=1 (Yes) | 1 | ✅ |
| `demenz='Mittelgradig'` | patient.dementia='yes' + gradation in description | dementia=yes desc='Demenzdiagnose: mittelgradig.' | ✅ |
| `inkontinenz='Stuhlinkontinenz'` | incontinence=true + _feces=true + _urine=false | inc=true feces=true urine=false | ✅ |
| `nacht='1–2 Mal'` | patient.night_operations='1_2_times' | 1_2_times | ✅ |
| `diagnosen=…SENTINEL…` | appears in customer.job_description | found | ✅ |
| `plz='10115' + ort='Berlin'` | location_id=1148 (resolved Berlin) | location_id=1148 | ✅ |
| `haushalt=SENTINEL` | (unmapped → drop OK) | (field never read by mapper) | ✅ |
| `wohnungstyp='Einfamilienhaus'` | customer.accommodation='single_family_house' | single_family_house | ✅ |
| `urbanisierung='Großstadt'` | urbanization_id=3 (Big city) | 3 | ✅ |
| `familieNahe='Ja'` | customer.has_family_near_by='yes' | yes | ✅ |
| `pflegedienst='Ja'` | customer.day_care_facility='yes' | yes | ✅ |
| `internet='Ja'` | customer.internet='yes' | yes | ✅ |
| `tiere='Hund'` | pets='yes' + is_pet_dog=true | pets=yes dog=undefined | ✅ |
| `unterbringung='Zimmer extern'` | caregiver_accommodated='room_other_premises' | room_other_premises | ✅ |
| `aufgaben=…SENTINEL…` | customer_caregiver_wish.tasks contains sentinel | wish.tasks='AUFGABEN_SENTINEL_GRUNDPFLEGE' | ✅ |
| `wunschGeschlecht='Männlich'` | customer_caregiver_wish.gender='male' | male | ✅ |
| `rauchen='Ja'` | wish.smoking='yes_outside' (NOT smoking_household) | wish.smoking=yes_outside | ✅ |
| `sonstigeWuensche=…SENTINEL…` | customer_caregiver_wish.other_wishes contains sentinel | wish.other_wishes='SONSTIGEWUENSCHE_SENTINEL_DEMENZ' | ✅ |