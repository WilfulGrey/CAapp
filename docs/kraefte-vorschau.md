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

**Schritt 9 seit Runde 2 (10.09., Martins Feedback zur ersten Fassung):**
Karten wie im Kundenportal (`MatchCard`): Foto 64 px, Name und Alter,
Chip „✓ Match" oben rechts, Zeile „Deutsch ●●○ Mittel" mit Sprachbalken,
Faktenzeile „Stufe: X J. Erfahrung · N Einsätze über Primundus", fester
Chip „Ab sofort verfügbar" — **kein Datum**, `available_from` wird nicht
gepflegt und veraltet. Jede Karte hat „Profil ansehen ›" und „Einladen";
Karte, beide Knöpfe und der Knopf „Kontaktdaten eingeben & Preis sehen →" darunter (Hinweis: „Nächster Schritt: Name, E-Mail und Telefon") öffnen
erst die Kontaktfelder (vorher stand die Überschrift „Preis anzeigen &
Kontaktdaten eingeben" über den Feldern — falsche Reihenfolge). Überschrift,
Satz und Absendeknopf richten sich nach der Wahl (`kraftAktionTexte`):
„Nikolina einladen" / „Profil von Nikolina ansehen" / „Preis & Profile
ansehen". Die Wahl geht als `kraefte_wahl`-Ereignis, im Submit-Payload
(`kraefte_aktion`, `kraefte_id`) und als Deeplink `&cg=<id>&goto=matches`
ins Portal — das öffnet ihr Profil aber nur, wenn sie dort im Matching steht
(Lücke für Stufe 2, siehe unten).

**Runde 3 (10.09., Martin: „da fehlt der rote Faden"):** Vorher widersprachen
sich die Zahlen (Zähler 72, Animation zählt auf 5, dann drei Karten), der Kopf
sagte „Ihr Angebot ist fertig" ohne Preis, die Karten boten „Profil ansehen"
und „Einladen", die nichts auslösten, und der Knopf hatte mit den Kräften nichts
zu tun. Jetzt: die Animation zählt im Vorschau-Modus auf die Zahl der Karten
(`zielAnzahl`), die dritte Zeile sagt „Ihre Pflegekräfte sehen Sie gleich", der
Kopf heißt „✓ 3 passende Pflegekräfte gefunden — Ab sofort verfügbar,
persönlich auf Ihre Angaben abgestimmt", die Karten sind reiner Beleg (keine
Aktionen), darunter die Brücke „Ihr Monatspreis und die vollständigen Profile
stehen in Ihrem Portal." und der Knopf „Preis & Profile freischalten →" mit
„Nächster Schritt: Name, E-Mail und Telefon · Ihr Portal öffnet sich sofort".
Nach dem Klick: „Fast geschafft: Ihre Kontaktdaten" → Felder → „Jetzt
freischalten →". Deeplink `cg=` und Kartenwahl sind raus (Martin: „ich würde
die auch nicht öffnen"). Texte in `lib/kraefte-vorschau.ts` (`kopfzeile`,
`BRUECKE`, `KNOPF_VOR_KONTAKT`, `SCHRANKE`).

**Runde 3b (10.09., Martin: „im Kundenportal zeigen wir doch 5"):** Die
Zahl ist 5 wie im Portal (`PORTAL_ANZAHL`, gleiche Zahl wie `waehleFuenf`),
nicht die Zahl der Karten: Animation zählt auf 5, Kopf „✓ 5 passende
Pflegekräfte gefunden", dritte Animationszeile „3 davon sehen Sie gleich
vorab", Brücke „Das sind 3 Ihrer 5 Pflegekräfte.", Knopf „Kontaktdaten
eingeben & Angebot ansehen →" mit „Danach sofort: Ihr Monatspreis und alle 5
Pflegekräfte im Portal", Absendeknopf „Angebot & Pflegekräfte anzeigen →" wie
im normalen Rechner.

**Runde 4 (10.09., Martins kompletter Aufbau):** Screen 1 (Warten): „Einen
Moment bitte — Wir erstellen Ihr Sofortangebot und suchen passende
Pflegekräfte." mit zwei Schritten „✓ Sofortangebot berechnet" und „✓ 5
passende Pflegekräfte gefunden", dann automatisch weiter. Screen 2: Kopf „5
passende Pflegekräfte – sofort verfügbar", darunter die Profile mit grossem
Foto (4:3, oben beschnitten) als wichtigstem Element: „Urszula, 63",
„Deutsch: gut · 10 Jahre Erfahrung", zwei Häkchen. Zwei Profile ganz, das
dritte läuft nach unten in einen Verlauf aus; im Verlauf „+ 3 weitere
passende Pflegekräfte / und Ihr persönliches Sofortangebot", Knopf „Alle
Pflegekräfte & Sofortangebot ansehen →", darunter „Dafür benötigen wir nur
noch Ihre Kontaktdaten." Nach dem Klick: alle drei Profile ganz, „Fast
geschafft: Ihre Kontaktdaten", Felder, Absendeknopf mit demselben Wortlaut.
**Häkchen** = Wortlaut der Angebotsmail (`anforderungenAusAnfrage`): sie
greifen die Angaben des Kunden auf (Rollstuhl/bettlägerig/Rollator, Nacht,
Ehepaar, Pflegegrad ≥ 4), sind kein zweites Matching; datengebunden ist nur
„Führerschein vorhanden" (die Function filtert danach); Auffüllen mit
Einsätzen und „Ab sofort verfügbar". Texte in `lib/kraefte-vorschau.ts`
(`WARTE`, `kopfzeile`, `kraftZeile`, `hakenAusAntworten`, `VERLAUF`,
`SCHRANKE`).

**Runde 5 (10.09., Martin: „warum veränderst du die Optik, das muss schon
bleiben"):** Die Karte ist wieder die Portal-Karte aus Runde 2/3b (Foto 64 px
links, Name, Chip „Match", Sprachbalken, Faktenzeile „Elite: 12 J. Erfahrung
· 31 Einsätze über Primundus", „Ab sofort verfügbar"); die grossen 4:3-Fotos
und die Häkchen aus Runde 4 sind raus. Der Aufbau drumherum (zwei Karten
ganz, dritte im Verlauf, „+ 3 weitere …", Knopf, Hinweis, Schranke) bleibt.
**Nicht gemergt ohne Martins Okay** — Vorschau lokal (Next-Dev-Server,
Playwright gegen localhost).

**Datenschutz:** Die Karten stehen VOR jedem Lead auf einer öffentlichen
Seite. Es verlassen nur Vorname, Alter, Stufe, Erfahrungsjahre, Deutsch-Wort,
Foto-URL und Verfügbarkeitsdatum die Function. Fotos bevorzugt aus
`avatar_retouched_promo` (Werbefreigabe).

**Offene Lücke (Stufe 2):** Vorschau-Pool (Agenturliste mit Filtern) und
Portal-Matching (mamamia je Job) sind zwei Auswahlen. „Einladen" auf einer
Karte kann im Portal nur einlösen, wer dort auch steht. Nötig: Portal zeigt
die per `cg=` gewählte Kraft über `getCaregiver(id)` auch außerhalb der
Matchings (Modal + Einladen), oder mamamia liefert dieselbe Auswahl für
beide (Michał).

**Ausfall:** Function antwortet bei jedem Fehler mit HTTP 200 und leerer
Liste; der Rechner zeigt dann seinen bisherigen Kasten. Der Warte-Screen
wartet nie auf die Function.

**Deploy:** Staging per CI (`test.yml`), Prod von Hand:
`supabase functions deploy kraefte-vorschau --project-ref ycdwtrklpoqprabtwahi`.
Braucht dieselben Secrets wie onboard-to-mamamia (MAMAMIA_ENDPOINT,
MAMAMIA_AUTH_ENDPOINT, MAMAMIA_AGENCY_EMAIL, MAMAMIA_AGENCY_PASSWORD).
