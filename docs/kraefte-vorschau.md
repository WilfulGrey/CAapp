# Kräfte-Vorschau vor der Kontaktschranke

**Warum (Martin, 09.09.2026):** Im Kostenrechner brechen 44 % der Kunden auf
Schritt 9 ab — dort verlangen wir Name, E-Mail und Telefon, bevor der Kunde
etwas bekommen hat (alle anderen Schritte: unter 8 % Abbruch). Die Vorschau
dreht die Reihenfolge: erst drei echte, gerade verfügbare Pflegekräfte, dann
die Kontaktdaten, dann sofort Preis und Verfügbarkeit im Portal. Stufe 1 der
Idee „Pflegekraft-Suche statt Formular"; Stufe 2 (eigene Suchseite) folgt,
wenn Stufe 1 die Abbruchquote senkt.

| | |
|---|---|
| Function | `supabase/functions/kraefte-vorschau` (Agentur-Login wie onboard-to-mamamia, `CaregiversWithPagination`, 10-Minuten-Cache, Auswahl in `vorschau.ts`) |
| Rechner | `project 3/lib/kraefte-vorschau.ts` (Schalter, Wünsche, Kartenzeile, Absicherung) + `components/calculator/MultiStepForm.tsx` (Aufruf beim Wechsel 8 → Warte-Screen, Karten auf Schritt 9) |
| Schalter | `?kraefte=1` schaltet ein und merkt sich das in sessionStorage; `?kraefte=0` aus. Ohne Schalter: alter Kasten. Freigabe durch Martin, danach Split in `lib/analytics.ts` |
| Messung | `step_view`/`step_complete` (Schritt 9) tragen `kraefte_vorschau: true/false` → Abbruch auf Schritt 9 je Variante; Ziel: 44 % → 30 % |

**Pool (seit 09.09., zweiter Wurf):** `CaregiversWithPagination` ohne
Filter liefert alle ~22.000 Registrierungen, neueste zuerst — der erste Wurf
las davon 400 und zeigte lauter „Neu bei Primundus" mit 0 Einsätzen. Jetzt
mit den serverseitigen Filtern des alten Lead-Point-Pipelines
(`caregiver-filtering-pipeline.md`): `last_contact` ≤ 60 Tage,
`has_retouched_avatar: true`, `min_hp_jobs: 1` → rund 1.000 Kräfte, alle
mit Foto und Einsatz-Historie; Seite 1 zuerst, weitere Seiten parallel,
Deckel 8 × 400. **`hp_caregiver_id` muss in der Auswahl stehen** — ohne das
Feld liefert mamamia `hp_total_jobs` für alle als 0 (auch bei
`Caregiver(id)`). Foto-URLs sind signierte S3-Links mit 30 Minuten
Gültigkeit, deshalb bleibt der Cache bei 10 Minuten und es gibt keinen
Tages-Snapshot.

**Auswahl:** passt zu Deutsch-Wunsch (wie im Portal: gleiche Stufe oder
unbekannt), Geschlecht, Führerschein; nicht gesperrt; bald verfügbar
(≤ 60 Tage) zuerst, dann Verfügbarkeit unbekannt; innerhalb eines Topfs:
Stufe (Einsätze), dann Berufserfahrung, dann Werbefoto, dann wie im Portal
(weiblich, ≤ 60 Jahre, Verfügbarkeit, letzter Kontakt). Alter aus
`birth_date`, sonst `year_of_birth`, sonst ohne Alter. Nie ohne Foto, nie
das rohe Avatar.

**Prüfen:** `POST … {"stats":true}` liefert nur Zählwerte (Poolgröße,
gesperrt, mit Einsätzen, Fotos, verfügbar ≤ 60 Tage) plus eine Stichprobe
`Caregiver(id)` gegen die Liste — keine Personendaten.

**Datenschutz:** Die Karten stehen VOR jedem Lead auf einer öffentlichen
Seite. Es verlassen nur Vorname, Alter, Stufe, Erfahrungsjahre, Deutsch-Wort,
Foto-URL und Verfügbarkeitsdatum die Function. Fotos bevorzugt aus
`avatar_retouched_promo` (Werbefreigabe).

**Ausfall:** Function antwortet bei jedem Fehler mit HTTP 200 und leerer
Liste; der Rechner zeigt dann seinen bisherigen Kasten. Der Warte-Screen
wartet nie auf die Function.

**Deploy:** Staging per CI (`test.yml`), Prod von Hand:
`supabase functions deploy kraefte-vorschau --project-ref ycdwtrklpoqprabtwahi`.
Braucht dieselben Secrets wie onboard-to-mamamia (MAMAMIA_ENDPOINT,
MAMAMIA_AUTH_ENDPOINT, MAMAMIA_AGENCY_EMAIL, MAMAMIA_AGENCY_PASSWORD).
