# Eingekaufte Leads (Pflegehilfe, Pflegebund, Pflege-Helfer24) + Vermittler (Pflegena)

Zweiter Weg in dieselbe Strecke: nicht der Kunde füllt den Kostenrechner
aus, sondern wir kaufen seine Anfrage bei einem Portal. Ab dem Lead läuft
alles wie immer — Preis, Token, Kundenportal, Mail 1.

Zwei Lieferwege, EIN Eingang: Pflegehilfe/Pflegebund schicken Mails in
ein Postfach; pflege-helfer24.de liefert über eine **Partner-API** (kein
Postfach). Beide enden im selben `POST /api/portal-lead`.

## Der Weg einer Anfrage

```
                         pg_cron (jede Minute, Supabase)
                         POST /api/portal-abholen (Bearer)
                         app/api/portal-abholen/route.ts
                     ┌───────────────┴────────────────┐
  Portal-Mail        ▼                                ▼   pflege-helfer24.de
  → Postfach   ~1s IMAP-Poll (READ-ONLY)     GET api_export (Bearer-Token,
  pflegehilfe@       │                       Timeout 15s, Fenster 7 Tage)
  primundus.de       ▼                                │
           UID-Abgleich portal_mail_log      Abgleich portal_api_log
           nur UIDs ohne Eintrag / 'offen'   (portal, Lead-UUID); Erstlauf:
                     │                       alles von VOR heute = altbestand
                     ▼                                │
           CSV-Anhang (ERSTE Quelle)                  ▼
           lib/portal-csv.ts → Text          lib/portal-helfer24.ts
                     │                       Spalten per NAME, exakte
                     ▼                       Auswahlwerte → Body
           lib/portal-parser.ts                       │
           "Label: Wert" (+ Einwilligung)             │
                     └───────────────┬────────────────┘
                                     ▼  (Loopback im selben Prozess)
                         POST /api/portal-lead   (x-portal-key)
                                     │
             ┌───────────────────────┼───────────────────────┐
             ▼                       ▼                       ▼
     Bestandskunden-Guard       Schutzregeln            berechnePreis
     (Registry #50)             portal-schutz.ts        + Annahmen
     kein Lead, keine Mail 1                            portal-lead.ts
     für nicht_interessiert,                                 │
     vertrag_abgeschlossen …                                 ▼
                                                    scheduleEmail Mail 1
                                                    (nicht bei Duplikat)
                                     │
                                     ▼
                 Ausgang → portal_mail_log / portal_api_log
                 erledigt / uebersprungen / abgelehnt / offen
```

Im Admin erscheint der Lead unter **Leads** mit eigenem Reiter je Portal
und der Spalte *Herkunft* (rot hervorgehoben — er hat Geld gekostet).
Im selben Reiter zeigt der Abschnitt **„Postfach … — Mails ohne Lead"**
das Protokoll aller Mails, die KEIN Lead wurden (offen, abgelehnt,
übersprungen, Altbestand) — nichts scheitert still.

Die Seite aktualisiert sich **live** (Registry #48): Supabase Realtime
streamt `postgres_changes` auf `leads` und `portal_mail_log` (Migration
`20260903170000_realtime_admin_leads.sql` nimmt beide in die Publikation
`supabase_realtime` auf) — schreibt der Abholer, springt die Liste ohne
Reload um, und ein kurzer **Ding** (WebAudio, kein Asset) meldet jeden
neuen Lead bzw. jede neue Mail; ein Ton pro Schwall. Der Ton kommt erst
nach der ersten Interaktion mit der Seite (Autoplay-Regel der Browser).
Der Punkt neben „Aktualisieren" zeigt den Kanal: grün = verbunden, grau =
Verbindung weg (dann gilt der Knopf als Fallback; nach Rückkehr des
Sockets und beim Sichtbarwerden der Karte lädt die Seite still nach).

Die Portal-Reiter stehen dort **auch ohne Leads**, mit einer `0`. Das ist
die Antwort auf „kommt da eigentlich was an?" — ein fehlender Reiter ließe
offen, ob nichts ankam oder der Abholer steht. Gerade beim Scharfschalten
die wichtigere Auskunft.

## Takt: jede Minute

Das Portal gibt dieselbe Anfrage an **bis zu drei Anbieter gleichzeitig**.
Wer zuerst antwortet, gewinnt — deshalb der enge Takt. Eine Minute fällt
gegenüber einem Menschen, der die Mail liest und zurückruft, nicht ins
Gewicht.

Ein Lauf dauert rund **eine Sekunde**: verbinden, UIDs gegen
`portal_mail_log` abgleichen, Neues verarbeiten, schließen.

Getaktet wird von **pg_cron** (Migration
`20260901120000_setup_portal_abholer_cron.sql`) — dieselbe Infra wie
detect-caregiver-events und send-scheduled-emails, **kein eigener
Render-Dienst** (Entscheidung Michał 01.09., Registry #39: „mamy już
crony"). Der Lauf lebt als Route im ohnehin laufenden Kostenrechner:
der Parser bleibt geteilt statt kopiert, und es gibt keinen zweiten
bezahlten Dienst. Gegen die Eigenheiten des langlebigen Prozesses
schützen ein Überlapp-Guard (ein Takt zugleich; ausgelassene Takte sind
egal, die Mails bleiben liegen) und `socketTimeout: 30s` auf der
IMAP-Verbindung (eine hängende Session heilt sich nicht mehr durch
Prozessende).

## Die Portal-Postfächer sind Eingänge, keine Absender

Jedes eingekaufte Portal bekommt eine **eigene** Adresse. Dort ist die
**Adresse die Quellenangabe** — was ankommt, kommt von diesem Portal, und
der Abholer darf getrost jede Mail darin ansehen.

Von diesen Postfächern wird **nie gesendet**. Jede Kundenmail geht über
`kostenrechner@primundus.de` (SMTP-Konfiguration der Edge Function).
Die Zugangsdaten liegen außerhalb des Repos und dienen nur dem Lesen.

**Für den Vermittler gilt beides NICHT** (Abschnitt „Vermittler: Pflegena"):
er schreibt an `info@primundus.de` — die Hauptadresse der Firma, in der auch
Kundenpost, die BCC-Kopien unserer eigenen Mails und Team-Benachrichtigungen
liegen. Dort ist die Quelle der **Absender**, nicht das Postfach, und aus
genau dieser Adresse geht die Antwort auch wieder raus.

## Scharfschalten

**Schritt 1 — Trockenlauf.** `PORTAL_TROCKENLAUF=1` (alle) bzw.
`PORTAL_TROCKENLAUF=<domain>` (nur dieses Portal) im Render-Dashboard
des Kostenrechners setzen (+ Redeploy): die Route liest, parst und loggt
in die Konsole, legt aber keinen Lead an, löst keine Kundenmail aus und
schreibt NICHTS in `portal_mail_log` (auch keinen Seed — der passiert
beim Scharfschalten).

Im Log (Render-Logs des Kostenrechners, Präfix `[portal-abholer]`) steht
pro Mail, wie viele Felder erkannt wurden. Eine Zeile `⚠ nicht zugeordnet`
bedeutet: das Portal hat seine Vorlage geändert — erst den Parser
nachziehen, nicht scharfschalten.

**Schritt 2 — Testphase (Mails ans Team).** `PORTAL_TESTPHASE` setzen —
an ZWEI Stellen: Render-Env des Kostenrechners (+ Redeploy) UND als
Supabase-Secret (`npx supabase secrets set PORTAL_TESTPHASE=<wert>
--project-ref <ref>` — die Edge Function send-scheduled-emails liest ihre
eigene Env, ohne Redeploy wirksam). Wert `1` = alle Portale; **Domain-Liste**
(`pflege-helfer24.de`) = nur dieses Portal, die anderen laufen scharf
weiter (Registry #50 — so ging Pflege-Helfer24 in die Testphase, während
Pflegehilfe schon live war). Ab dann läuft die Strecke SCHARF
(Lead, Preis, Ereignisse), aber **jede Kundenmail eines Portal-Leads geht
an `info@mamamia.app` + `martin@mamamia.app`** statt an den Kunden; der
Betreff nennt den eigentlichen Empfänger (`[TESTPHASE → kunde@…]`). Der
Lead behält die echte Adresse — umgeleitet wird nur der Versand
(Kostenrechner-Leads sind nie betroffen). Logik: `lib/portal-schutz.ts`
(`testphaseUmleitung`) + Kopie `send-scheduled-emails/testphase.ts`.

**Schritt 3 — scharf.** `PORTAL_TROCKENLAUF` und `PORTAL_TESTPHASE`
(beide Stellen!) leeren. Ab dann bekommt jeder eingehende Lead automatisch
Mail 1, ohne dass ein Mensch draufschaut.

**Bestandskunden bekommen keine zweite Mail 1 (Registry #50).** Der
Eingang prüft VOR dem Anlegen, ob die Adresse schon einen Lead hat
(case-insensitiv). Nur offene, bekannte Status (`info_requested`,
`manuell_pruefen`, `angebot_requested`, `folge_einsatz`) laufen weiter —
`nicht_interessiert`, `vertrag_abgeschlossen`, `betreuung_beauftragt` und
alles Unbekannte werden als `uebersprungen` gemeldet und hängen als
Ereignis am bestehenden Lead (sichtbar, keine Mail, kein Onboarding). Ein
Lead, der schon `angebot_requested` ist (dieselbe Anfrage über ein zweites
Portal gekauft), bekommt **keine zweite Mail 1** — sie trüge den Namen des
ersten Portals und ggf. einen anderen Preis; im Protokoll steht `erledigt`
mit Grund „Lead bereits vorhanden — keine Mail 1", im Admin sichtbar.
Ausnahme: liegt die letzte Mail 1 länger als 60 Tage zurück (oder ging
nie raus), fragt der Kunde wirklich neu — dann Token erneuern, Mail 1 wie
bei einer neuen Anfrage. Hat der Kunde seine Antworten selbst gegeben
(Kostenrechner), überschreiben unsere Annahmen sie NICHT; nur die
Portal-Details (PLZ, Gewicht, Demenz …) kommen dazu. Die Team-Mail geht in
jedem Fall. Ein hochgestufter Lead (`info_requested` → Portal) wechselt
die `source` auf das Portal — er ist ab jetzt eingekauft.

**CSV zuerst.** Pflegehilfe hängt an jede Lead-Mail eine CSV mit dem
vollen Datensatz (Name, EIN Telefon + `PhoneType`, Pflegegrad, Mobilität,
Gewicht, Krankheiten …). Der Abholer liest sie als erste Quelle — aus der Zeile
wird ein "Label: Wert"-Text synthetisiert und durch dasselbe
`parsePflegehilfe` geschickt (EIN Mapper, ein `unbekannt[]`-Kanal). Die Datei beginnt mit einem UTF-8-BOM (U+FEFF); `parseCsv` streift ihn ab — sonst trüge die erste Spalte den BOM im Namen, `RequestNumber` würde nicht gefunden und die Anfragen-Nr. (`portal_lead_id`) ginge verloren; im Log steht dann `⚠ CSV ohne RequestNumber` (Registry #57). Der
Mailtext bleibt für den **Einwilligungsnachweis** (der steht nur dort)
und als Fallback für Mails ohne Anhang — sowie für Mails mit
handverstümmeltem Anhang: eine Datenzeile mit weniger als der Hälfte der
Kopfspalten (z. B. die ganze Zeile in einem Anführungszeichenpaar, Registry
#46) gilt als unlesbar, im Log steht `⚠ CSV-Zeile unbrauchbar`. Spalten ohne Zuhause bei uns
(Krankheiten, Gewicht, Beziehung …) landen als `zusatz` im Ereignis
`portal_lead_eingekauft` — append-only, nichts geht verloren.

**Mamamia sofort (Registry #44).** Der Eingang onboardet den Lead
UNMITTELBAR nach dem Anlegen zu Mamamia (gleicher Edge-Fn-Weg wie aus dem
Browser, idempotent) — Kunde + Job stehen dort in derselben Minute wie der
Lead, samt Details. Schlägt das fehl (MM down), bricht der Eingang NICHT
ab: Mail 1 geht raus und der Lazy-Onboard beim ersten Portal-Besuch bleibt
als Fallback.

**Details fließen weiter (Registry #43).** Nicht-preisrelevante Angaben
aus CSV/Mail haben feste Häuser: Gewicht (kg → Mamamia-Bucket), Internet,
Krankheiten/Diagnosen und PLZ/Ort wandern in `formularDaten` → füllen das
Patientenformular vor (`prefillPatientFromLead`) und gehen beim Onboarding
mit (`patient.weight`, `patient.dementia` + Beschreibung,
`customer.internet`, Locations-Lookup über `fd.plz`). Der menschliche
Kontextblock (Beziehung, Lebenssituation, Dauer, Zimmer, Erreichbarkeit …)
landet in der **JobOffer-Beschreibung** — die Agentur sieht ihn ab der
ersten Minute. „Zimmer: Vorhanden" wird bewusst NICHT auf einen
Unterbringungs-Enum geraten (welche Art, sagt es nicht) — das wählt der
Kunde im Formular.

**Geschlecht des Seniors (Registry #45).** `SeniorSex` aus der CSV, und
fehlt die Spalte: das Beziehungswort — „Schwiegervater" IST ein Mann,
„Mutter" IST eine Frau (nur eindeutige Wörter; „Elternteil"/„Partner" ⇒
nichts). Landet als `leads.patient_anrede` (+ Senior-Name, wenn geliefert)
→ `patient.gender` beim Onboarding und `patientGenderKnown` im Formular.

**Weitergeleitete Mails** (jemand forwardet eine Portal-Mail ins
Postfach): der Parser normalisiert Zitat-Marker (`> `) und Soft-Hyphens,
liest also auch Forwards. Tabellen-Umbrüche des weiterleitenden
Mailclients kann er nicht heilen — dann greifen die Annahme-Regeln und
`⚠ nicht zugeordnet` im Log. Der verlässliche Test ist immer die
Direktmail des Portals.

**Direktmails des Portals** (Registry #51, prod uid 40/45/46, 04.09.): der
text/plain-Teil von Pflegehilfe trägt HTML-Reste (`&#228;`, `<br/>`) und
stellt beide Zustimmungen samt Beratungsgespräch in EINE Zeile, nur durch
Leerzeichen getrennt. Der Parser dekodiert Entities/`<br>` in der
Normalisierung und liest den Einwilligungs-Zeitstempel als DATUM hinter dem
Label (`zeitstempel()`, Fallback auf zeilenweises `feld()`); Label-Leerzeichen
gelten als beliebiger Whitespace. Vorher: alle drei Direktmails abgelehnt
mit „kein Einwilligungsnachweis" — alle Mails davor waren Apple-Mail-Forwards
oder Martins Klartext-Tests, die Direktform war nie durch den Parser gelaufen.

**Die Einwilligung ist kein Gate** (Entscheidung Michał 04.09.): der
Abholer lehnt keine Mail mehr ab, weil der Zeitstempel fehlt. Findet der
Parser den Stempel des Portals, wird er bezeugt; sonst steht im Nachweis,
was wir wissen — Lieferung per Mail vom Portal, Datum der Mail (Anfragen-Nr.,
wenn gelesen) — wie bei der Partner-API. `erstellt_am` = dieser Zeitpunkt,
die 60-Tage-Schutzregel greift weiter.

## API-Portal: pflege-helfer24.de (Registry #50)

Kein Postfach — der Abholer holt im selben Takt (nach den Postfächern)
`GET https://pflege-helfer24.de/partner_portal/leads/api_export` mit
`Authorization: Bearer <PFLEGEHELFER24_API_TOKEN>` (Token im Partner-Portal
→ „API-Integration"; Doku hinter dem Partner-Login:
`https://pflege-helfer24.de/partner_portal/api/docs`).

- Antwort `{ headers, data }` — Spalten IMMER per **Name** (Spalten, die
  für alle Zeilen leer wären, fehlen; `"N/A"` = kein Wert). Mapper:
  `lib/portal-helfer24.ts`, Auswahlfelder als **exakte** Werte (geschlossene
  Listen laut Feld-Referenz); fremde Werte → `⚠ nicht zugeordnet` im Log
  und Annahme, bewusst nicht abgebildete (z. B. „Nachtschichten: Ja" — sagt
  nicht wie oft) → still Annahme.
- Startdatum ab 6 Monaten → `care_start_timing = spaeter` (unser
  Legacy-Wert: Portal „zu einem späteren Zeitpunkt", Mamamia +60 Tage).
- Einwilligung: die API liefert keine — laut Nutzungsbedingungen liegt
  sie beim Portal; wir protokollieren die Lieferung (Lead-ID, Leadtyp,
  Liefer Datum) als Nachweis, `zeitpunkt` = Liefer Datum (Entscheidung
  Michał 04.09.).
- Gedächtnis: **`portal_api_log`** (PK `portal, extern_id` = Lead-UUID),
  Statusse wie `portal_mail_log`. **Erstlauf** (Tabelle leer für das
  Portal): alle Leads holen, die von **vor heute** (Berlin) als
  `altbestand` registrieren — in EINEM Insert mit dem Sentinel
  `__seed__` — und nur die von heute verarbeiten („pomijaj starsze niż z
  dzisiaj"). Danach Fenster **7 Tage** (`?timestamp`): was während eines
  Ausfalls kam, holt sich der nächste Lauf selbst; `offen`-Zeilen älter
  als 7 Tage kommen NICHT mehr zurück (Badge im Admin sagt das).
- Ein GET-Fehler (401 Token rotiert, 429, Timeout) färbt den Lauf **nicht**
  rot — nichts liegt, und einen Dauer-500 sieht niemand (Registry #36/#46).
  Sichtbar wird er über die Sentinel-Zeile `__api__` (`offen` mit HTTP-
  Grund; `erledigt` nach dem nächsten guten Abruf — auch nach einem
  Neustart des Prozesses, der erste gute Abruf prüft den Sentinel einmal)
  im Admin-Abschnitt „API pflege-helfer24.de — Leads ohne Lead".
- **Token rotieren = Render-Env ändern UND redeployen.** Eine Env-Änderung
  allein erreicht den laufenden Prozess nicht (Registry #50, 04.09.: nach
  der Rotation lief der alte Token weiter → `HTTP 401` jede Minute, bis
  zum manuellen Deploy).
- Status `Aktiv` ist ansprechbar; `Storniert` / `Stornierung *` →
  `uebersprungen` (terminal). Produkt ≠ `24h-Pflege` → `uebersprungen`.
- Storno-API (`POST …/cancellation_requests`) bewusst NICHT angebunden.
- **Die API ist EINE gemeinsame Quelle.** Anders als ein Postfach, das nur
  eine Umgebung liest, sehen Staging und Prod dieselben bezahlten Leads:
  den Token auf Staging nur für einen Test setzen und danach entfernen.

Einen Lead von Hand erneut anstoßen:

```sql
update portal_api_log set status = 'offen', updated_at = now()
 where portal = 'pflege-helfer24.de' and extern_id = '<Lead-UUID>';
```

## Vermittler: Pflegena (kein eingekaufter Lead)

Pflegehilfe und Pflege-Helfer24 verkaufen uns die Anfrage eines KUNDEN.
Pflegena ist etwas anderes: ein **Vermittler**, der für seinen Kunden bei
uns anfragt und auf unseren Preis seine Provision schlägt (10 €/Tag). Der
Empfänger jeder Mail ist damit ein Geschäftspartner, kein Endkunde — und
die ganze Kundenwelt (Portal, Magic-Link, Nachfass-Kette, Bewertung) hat
in seinem Postfach nichts verloren.

### Geteiltes Postfach, Quelle ist der Absender

Pflegena schreibt an **`info@primundus.de`** — kein eigenes Postfach,
sondern die Hauptadresse der Firma. Dort liegen auch: Antworten von Kunden,
die **BCC-Kopien jeder Mail, die wir selbst verschicken** (`SMTP_BCC`), und
sämtliche Team-Benachrichtigungen. Zwei Folgen:

1. **Die Quelle ist der Absender, nicht das Postfach.** Der Abholer fragt
   den IMAP-Server nur nach Post von `@pflegena.com` (`SEARCH FROM`) und
   sieht den Rest nie. Das ist nicht bloß Höflichkeit: ohne den Filter
   würde der Erstlauf JEDE Mail des Postfachs als `altbestand` ins
   Protokoll schreiben — bei einem Portal sind das Dutzende, hier
   Zehntausende in einem Insert.
2. **Ein zweiter Riegel im Code.** `SEARCH FROM` prüft den rohen
   Kopfzeilentext, also auch den Anzeigenamen; eine fremde Mail mit
   „pflegena.com" im Namen käme durch. Nach dem Parsen wird deshalb die
   Absenderdomain noch einmal geprüft — passt sie nicht, wird die Mail als
   `erledigt` abgehakt (kein Shell-Lead, kein Modellaufruf, nie wieder
   angefasst).

Registry-Schlüssel bleibt die Absenderdomain (`portal_mail_log.postfach =
'pflegena.com'`), nicht das Postfach — die Protokollzeilen gehören zur
Quelle, und die UIDs stammen ohnehin aus einer einzigen INBOX.

**Offene Kante:** `info@primundus.de` ist eine Postfach, in dem Menschen
arbeiten. Verschiebt jemand eine Pflegena-Mail in einen Unterordner, bevor
der Minuten-Cron sie gesehen hat, ist die Anfrage weg und niemand erfährt
davon. Wenn das passiert: Ionos-Regel „Absender `@pflegena.com` → Ordner"
einrichten und den Abholer auf diesen Ordner zeigen lassen — dann fällt der
Wettlauf weg (bewusst noch nicht gebaut, ein Element weniger außerhalb des
Repos).

**Der Betreff ist eine vollwertige Quelle.** Aus dem echten Postfach
(09.09.): „Neue Stelle ab sofort **Brunhilde Weber 79780 Stühlingen**",
„EILT Ablösekraft ab **09.09.2026 Hedwig Jordan, 79761 Waldshut**". Name,
Ort und Termin stehen dort — der Fließtext wiederholt sie oft nicht.
Deshalb bekommt das Modell Betreff und Text als getrennte Blöcke, und der
PLZ-Beleg zählt in **beiden**. Ein Check nur gegen den Fließtext hätte die
PLZ jeder zweiten Anfrage verworfen.

**Die Daten stehen im ANHANG, der Brief ist das Anschreiben.** Bis zum
09.09.2026 stand hier das Gegenteil („keine CSV, keinen Anhang — nur einen
Brief"). Das war falsch und hat 60 Angaben pro Anfrage gekostet: die erste
echte Mail (uid 17318) trug ein dreiseitiges Kundenblatt, der Abholer sah
davon nichts, weil er in `mail.attachments` nur nach `.csv` sucht. Pflegegrad,
Mobilität und Nachteinsätze wurden geraten — alle drei standen im PDF
(Registry #60).

Das PDF ist ein aus Word gedrucktes Dokument, dessen Text als Vektorpfade
vorliegt: `pdftotext` liefert daraus **drei Bytes**. Lesen kann es nur ein
Modell mit Augen — deshalb geht es als `document`-Block mit an denselben
Aufruf, und wir rastern nichts selbst (auf 512 MB wäre das die Klasse
Registry #27/#29).

**Prosa statt Formular — im Brief.** Dort gibt es kein „Label: Wert" und
keine CSV:

> „wenigstens mittlere Deutschkenntnisse sind gewünscht, Tagessatz IHR
> PREISANGEBOT + 10 Pflegena = ?? € plus Reisekosten … ein liebes Ehepaar,
> sie ist nicht pflegebedürftig, er ist aktuell sehr geschwächt,
> Hebetechnik erforderlich, falls Transfer Bett/Rollstuhl"

Dafür liest ein Modell (`lib/pflegena.ts`: Schema, Prompt, Prüfung — rein
und ohne Schlüssel testbar; der Netzaufruf steht in der Abholer-Route,
Muster Pria). Es ordnet den Text denselben neun Kalkulator-Feldern zu, die
auch das Formular kennt. **Was nicht im Text steht, bleibt `null`** — die
Lücke füllt danach `ergaenzeAngaben` mit dem teureren Wert und schreibt sie
nach `angenommene_felder`. Werte außerhalb des Kanons (`ERLAUBT` in
`lib/angaben-diff.ts`) werden verworfen und geloggt, nie gesetzt.

### `source` bleibt `portal:`, unterschieden wird per Spalte

`leads.source` ist `portal:pflegena.com` — damit funktionieren Admin-Reiter,
Herkunft-Badge, die Sektion „Postfach — Mails ohne Lead", die
`PORTAL_TESTPHASE`-Umleitung und der Kostenreport **unverändert**.
Unterschieden wird über die neue Spalte **`leads.vermittler`**
(`'pflegena.com'`). Sie ist der Schalter für die fünf Bremsen und braucht auf
der Deno-Seite keine Kopie der Portal-Liste: `if (lead.vermittler)`.

`PORTAL_PREISE` trägt `pflegena.com: 0` in **beiden** Kopien
(`lib/lead-kosten.ts`, `daily-analytics-report/queries.ts`) — die Anfrage
kostet nichts, die Provision fällt erst mit dem Auftrag an. Im Tagesreport
entscheidet seit dieser Änderung *Preis bekannt?* statt *Preis > 0*, sonst
meldete er täglich ein fehlendes Preisschild, das keins ist.

### Jede Anfrage ist ein eigener Lead

`findOrCreateLead` dedupliziert per E-Mail — bei einem Vermittler trägt
**jede** Anfrage dieselbe Absenderadresse. Ab der zweiten fände die
Funktion den bestehenden Lead, sähe eine Mail 1 jünger als 60 Tage und
verschluckte die Anfrage als Duplikat. Deshalb legt der Eingang für
Vermittler direkt an (Felder 1:1 an `findOrCreateLead` abgeglichen, inkl.
`token_used`, `anrede_text` und dem Ereignis `angebot_requested`).

Gegen Doppelverarbeitung schützt stattdessen **`leads.quelle_nachricht_id`**
(die Message-ID der Mail, unique-partial). Fällt ein Lauf zwischen
Lead-Anlage und Warteschlange aus, greift beim nächsten Takt `23505` — der
Eingang holt den Lead und `sorgeFuerVermittlerMails` zieht genau die
fehlende Zeile nach. Ohne diesen Schritt wäre die Anfrage für immer stumm:
das Abholer-Protokoll führte sie als `erledigt`.

**Antworten im Thread** (`In-Reply-To`/`References` treffen eine bekannte
`quelle_nachricht_id`) werden vor dem Modell abgefangen: Ereignis
`vermittler_antwort` am **richtigen** Lead, kein Modellaufruf, kein neuer
Lead. Was übrig bleibt und trotzdem keine Anfrage ist, wird `abgelehnt`,
landet als Shell-Lead im Admin **und** geht als Volltext an `info@` — der
Partner wartet auf eine Antwort in seinem Faden, ein stiller Fehlschlag
wäre hier teurer als beim Portal.

### Zwei Mails, beide als Antwort im Thread

| Typ | Wann | Inhalt |
|---|---|---|
| `vermittler_angebot` | sofort | Tagessatz, Monatssatz, Anreise, **Provisionsblock** („Ihre Provision von 10 €/Tag kommt auf den Preis. Familie Schmidt zahlt damit 98 €/Tag"), Konditionen, eine passende Kraft |
| `vermittler_kraefte` | +2 h (durch `sendezeitIso`) | die verfügbaren Kräfte als Liste, ohne Preiswiederholung |

**Die Antwort geht über das Postfach raus, das wir auch lesen** — Ionos-SMTP
von `info@primundus.de`, nicht über das SES-Konto der Kundenpost. Zwei
Gründe, beide nachgeprüft:

- Der SPF-Eintrag der Domain lautet `v=spf1 include:_spf-eu.ionos.com ~all`
  und autorisiert damit **Ionos**, nicht SES. Die Kundenpost aus SES läuft
  heute mit SPF-Softfail — ohne DMARC-Record akzeptieren Empfänger das, und
  empirisch kommt sie an. Für eine Antwort an einen Geschäftspartner, dessen
  Filter wir nicht kennen, ist ein sauberer SPF aber das billigere Los.
- Aus derselben Adresse zu antworten, an die geschrieben wurde, ist für den
  Partner eine Antwort. Ein anderer Absender liest sich wie neue Post.

Technisch: ein **zweites SMTP-Profil im Supabase-Vault**
(`vermittler_smtp_host/_port/_user/_pass/_from`, RPC
`get_vermittler_smtp_config`), das die Edge Function nur dann lädt, wenn
eine `vermittler_*`-Zeile fällig ist. **Ohne Rückfall auf das Kundenkonto:**
fehlt Zugang oder Absender, scheitert der Versand laut (Zeile `failed` +
Ops-Alarm), statt die Antwort still mit fremdem Absender rauszuschicken.
Der DEMO-Versand nimmt dasselbe Profil und prüft den Zugang damit nebenbei.
`Reply-To` bleibt `info@primundus.de` wie überall.

Preis dieser Entscheidung, bewusst getragen: das Passwort von
`info@primundus.de` liegt an **zwei** Stellen — Render (`INFO_PASS`, fürs
Lesen per IMAP) und Supabase-Vault (`vermittler_smtp_pass`, fürs Senden).
Bei einer Rotation beide anfassen.

Betreff ist `Re: <Originalbetreff>`, dazu `In-Reply-To`/`References` —
`sendEmailSmtp` hat dafür einen neunten Parameter bekommen (bewusst
positionell: `cc` wird an einer Stelle positionsweise durchgereicht, ein
Options-Objekt hätte es dort verloren). Der fertige Antwort-Betreff reist in
`scheduled_emails.metadata`, damit `betreffAntwort` nicht als dritte Kopie
auf der Deno-Seite landet.

**Was in diesen Mails NICHT stehen darf** (Test hält es fest):
- **kein Token.** Der Abmelde-Link der Standard-Fußzeile trägt `lead.token`
  — denselben Wert, mit dem `buildPortalUrl` das KUNDENPORTAL öffnet
  (Patientenbogen, Bewerbungen, Vertragsunterschrift). Die Vermittler-Mails
  bekommen deshalb eine eigene Fußnote ohne Link.
- **keine Kunden-Konditionen.** „Keine Vermittlungsgebühren" und
  „Direktanbieter ohne Vermittler" stehen an rund zehn Stellen im Repo —
  neben einem Provisionsblock wären sie ein Widerspruch.
- **keine Profil-Links**, kein CTA: es gibt für den Partner kein Portal.

Liefert mamamia keine Kräfte, geht Mail 1 ohne Empfehlung raus (Preis und
Provision tragen sie), und der Satz „weitere sende ich in den nächsten
Stunden" erscheint gar nicht erst. Mail 2 wird dann **nicht** verschickt:
Zeile `cancelled`, Ereignis `vermittler_kraefte_entfallen`, Mail ans Team.

### Fünf Bremsen

Der Lead sieht für alle Automatiken aus wie ein normaler Kunde — er hat
Token, mamamia-Kunden und JobOffer. Fünf Stellen mussten das wissen:

| Wo | Was sonst passiert wäre |
|---|---|
| `bewertung.ts` | sieben Tage nach JEDER Anfrage „wie hilfreich war unsere Beratung?" — die Runde läuft außerhalb der Warteschlange |
| `detect-caregiver-events` (`autoRejectStaleApplications`) | nach 72 h ohne Portal-Reaktion automatisch abgelehnt; ein Portal gibt es hier nicht |
| `mamamia-proxy` (`scheduleNeuePflegekraefteMail`) | „Pflegekraft einladen" im Panel (der Token ist dort gespiegelt) hätte eine Kundenmail ausgelöst |
| `lead-event/route.ts` | Mail A/B/C/D, `offer_updated` und alle fünf Reaktions-Reminder |
| `lead-regenerate-token` | „Neuen Link senden" hätte den Magic-Link an den Partner geschickt (Rotation und mamamia-Spiegel laufen weiter) |

Team-Mails laufen überall weiter. Die Team-Mail des Eingangs nennt
zusätzlich den Kunden des Vermittlers und **welche Angaben unsere Annahme
sind** — die Mail an den Partner nennt sie bewusst nicht (Entscheidung
Michał 08.09.), also ist das die einzige Stelle, an der jemand den Preis mit
seiner Herkunft sieht.

### Takt und Kosten

Das Vermittler-Postfach wird **zuletzt** gelesen — nach den Postfächern und
nach dem API-Portal — und **eine Mail pro Takt**. Ein Modellaufruf (5–15 s)
plus Onboarding im Eingang (bis 25 s) sprengt sonst den Minutentakt, und
`laeuft` ließe den nächsten Takt für alle Quellen ausfallen. 60 Mails/h
liegen weit über dem Aufkommen.

`portal_mail_log.versuche` zählt transiente Fehlschläge **nur** für
Vermittler-Mails; ab 5 wird die Mail `abgelehnt` (plus Team-Mail), sonst
liefe sie im Minutentakt für immer durch ein kostenpflichtiges Modell. Der
gemeinsame Deckel wäre für die bezahlten Portale falsch: eine fünfminütige
Störung von `/api/portal-lead` würde dort einen Lead vernichten.

Fehlerklassen: `abgelehnt` nur bei einem Urteil über DIESE Mail (keine
Anfrage, mehrere Anfragen, Nachtrag, nichts lesbar, HTTP 400). Alles andere
— 401/403 (Schlüssel rotiert), 429, 5xx, Timeout — ist `offen` und wird
erneut versucht.

**Ausnahme: leeres Guthaben** (Registry #61). Anthropic meldet ein
erschöpftes Konto als HTTP **400** `invalid_request_error` mit dem Satz
„Your credit balance is too low…" — nach der Regel oben also „diese Mail nie
wieder". Genau das passierte am 11.09.2026 zwei echten Anfragen von Pflegena
(uid 17650, 17695): Team-Mail, Shell-Lead, und die Antwort an den Partner
musste anschließend von Hand aus dem Protokoll geholt werden.
`modellFehlerArt` (`lib/pflegena.ts`) klassifiziert diesen Fall darum als
eigenes Lager `guthaben`: `offen` **und ohne Zähler**, weil der Aufruf vor
der Inferenz abgelehnt wird und nichts kostet. Der Deckel von 5 Versuchen
verteidigt bezahlte Aufrufe — bei einer Störung, die Stunden dauert, hätte
er die Mail nach fünf Minuten trotzdem verloren. Der zweite Anlauf ohne
Anhang entfällt in diesem Fall ebenfalls (der Anhang war nicht das Problem).
Das ist der **einzige** Fall, in dem wir den Fehlertext lesen statt die
Struktur — es gibt kein anderes Signal; `billing_error` (403) wird als
strukturierte Form derselben Sache mit erkannt.

Preis dieser Entscheidung: solange das Guthaben fehlt, bleibt die Mail
`offen`, der Lauf meldet HTTP 500 (`liegengeblieben`) und die Vermittler-
Schlange steht — sie läuft von selbst wieder an, sobald das Konto gedeckt
ist, aber es gibt **keine** Team-Mail mehr für diesen Fall. Ein Konto, das
dauerhaft leer bleibt, fällt also nur in den Logs auf.

Im **Trockenlauf** merkt sich der Prozess die schon gelesenen UIDs im
Speicher: das Protokoll bleibt dort unberührt, und ohne dieses Gedächtnis
liefe dieselbe Mail in jedem Takt erneut durchs Modell.

### Anhänge und die Richtung der Annahmen

**Was ans Modell geht:** PDFs (Typ `application/pdf` ODER Dateiname auf
`.pdf` — Absender verschicken PDFs als `octet-stream`), zusammen höchstens
6 MB. Inline-Bilder aus dem HTML (`related`) fliegen still raus, das ist das
Pflegena-Logo in jeder Signatur. Fremde Dateitypen und übersprungene
Anhänge stehen als `hinweis` in der Team-Mail — so sieht man nach ein paar
Wochen, was der Partner wirklich schickt, statt es zu vermuten.

**Ein Anhang macht eine Mail nie schlechter.** Scheitert der Aufruf MIT
Dokument — 400, Zeitüberschreitung, abgeschnittene Antwort —, wird genau
einmal ohne Dokument gefragt; erst dieses Ergebnis wird bewertet. Und
`max_tokens` steht bei 8000, nicht bei 1000: das Denken des Modells zählt in
dieses Budget, eine abgeschnittene Antwort hat keinen `tool_use`-Block und
sähe aus wie ein vorübergehender Fehler — fünf bezahlte Wiederholungen und
dann abgelehnt.

**PLZ:** steht sie in Betreff oder Text, gilt sie wie bisher. Steht sie NUR
im Anhang, entscheidet der Abgleich mit dem Betreff — Pflegena setzt PLZ und
Ort per Konvention dorthin, und das ist die einzige unabhängige, von einem
Menschen geschriebene Quelle, die wir haben (das PDF können wir nicht
gegenlesen). Widerspruch ⇒ der Betreff gilt, die Abweichung steht in der
Team-Mail. Ein Selbst-Abgleich („steht die PLZ in der Adresszeile, die
dasselbe Modell geschrieben hat?") prüfte nur, ob das Modell sich selbst
widerspricht — dagegen käme jede Büro-, Tochter- oder Klinikadresse durch.
Die Straße landet in `leads.patient_street` (Admin); nach Mamamia geht vom
Einsatzort ausschliesslich die PLZ.

**Lücken werden beim Vermittler GÜNSTIG gefüllt**, nicht teuer wie bei den
eingekauften Portalen (`ergaenzeAngaben`, Parameter `richtung`). Die alte
Regel begründet sich damit, dass der Kunde im Portal korrigiert und der
Preis dann fällt — ein Vermittler hat kein Portal. Bewusst in Kauf genommen
(Michał, 09.09.): zu tief ist leiser als zu hoch, weil niemand einen
günstigen Preis reklamiert. **Zu beachten:** ohne Angabe zum Deutsch heisst
günstig `grundlegend`, und die Kräfteauswahl vergleicht die Stufe auf
GLEICHHEIT — Mail 2 zeigt dann nur Kräfte der untersten Stufe. Was
angenommen wurde, steht deshalb in der Team-Mail.

**Gemessen am 09.09. auf der echten Mail** (uid 17318, drei Läufe je
Variante). Beweiskraft hat nur, was AUSSCHLIESSLICH im PDF steht — Betreff
und Fließtext tragen Nachname, PLZ, Ort und „kein Transfer" ohnehin:

| | mit Anhang | ohne Anhang |
|---|---|---|
| Pflegegrad | **3** | — |
| Nachteinsätze | **nein** | — |
| Gewicht | 50 kg → `40-50` | — |
| Jahrgang | 1943 | — |
| Straße | „Obere Rappenhalde 4" | — |

Ein Lauf mit ABSICHTLICH geleertem Betreff („Anfrage") und Text („siehe
Anhang") lieferte dieselben Werte — das Dokument wird also wirklich gelesen
und nicht der Betreff abgeschrieben.

**Zwei Felder sind nicht stabil, und das gehört gewusst:**

- `mobilitaet` schwankt zwischen `rollator` und `rollstuhl` (3 von 5 Läufen
  `rollator`). Das Dokument nennt „Stock, Gehwagen oder Rollstuhl" und sagt
  im selben Absatz, dass Hebetechnik nicht nötig ist. Der Unterschied kostet
  100 € und entscheidet in mamamia über `lift_id` und die Hilfsmittel — bei
  `rollstuhl` leitet der Mapper „Heben erforderlich" ab, also das Gegenteil
  des Dokuments. Der Prompt sagt inzwischen ausdrücklich, dass „geht, sei es
  am Stock" `rollator` ist; ganz stabil ist es damit nicht.
- `deutschkenntnisse`: das PDF verlangt „Gute Deutschkenntnisse", der
  Fließtext „wenigstens mittlere" — 450 € gegen 250 €. Die Regel im Prompt
  lautet „bei Widerspruch gilt der Anhang", das Modell folgt hier aber
  meistens dem Fließtext. Wer den Fall trifft, sieht ihn am `hinweis`.

### Was aus dem Anhang nach Mamamia geht

Preisrelevant sind nur die neun Kalkulator-Felder. Der Rest des Kundenblatts
geht trotzdem hinüber, damit die Agentur beim Auswählen der Kraft dasselbe
weiß wie der Vermittler:

| aus dem Dokument | in Mamamia |
|---|---|
| Größe (cm) | `patient.height` (Bucket) |
| Inkontinenz | `incontinence` + `_urine` + `_feces` |
| Haustiere | `pets` + `is_pet_dog/cat/other` |
| Wohnungstyp | `accommodation` |
| Rauchen erlaubt | `wish.smoking` |
| Getriebe | `wish.driving_license_gearbox` |
| Pflegedienst | `day_care_facility` |
| Familie in der Nähe | `has_family_near_by` |

**Der Weg ist der des Patientenbogens, nicht der der Kundenanlage.**
`StoreCustomer` kennt diese Felder nicht — `UpdateCustomer` schon, denn dort
schreibt sie der Kunde selbst, wenn er den Bogen ausfüllt. Deshalb gehen sie
NACH dem Onboarding als `resync: { felder: [], details: true }` hinterher
(server-only, service_role). Eigene Flagge statt Eintrag in `RESYNC_FELDER`:
das sind keine Kalkulator-Angaben, es gibt nichts zu diffen — sie stehen im
Dokument oder eben nicht.

Die Enum-Zuordnungen sind aus `src/lib/mamamia/patientFormMapper.ts`
**abgeschrieben**, nicht erfunden (Heilige Regel 1.5). Zweite Kopie wie bei
`RESYNC_FELDER`, mit Sync-Hinweis an beiden Stellen.

Schlägt der Nachlauf fehl, steht der Kunde trotzdem und die Mails gehen raus
— die Angaben fehlen dann in Mamamia, der Grund steht im Log.

### Bekannte Kanten

- Der mamamia-Kunde trägt die Kontaktdaten des **Vermittlers** (`Customer` =
  Kontaktperson, nicht Patient). Unterschieden werden die Anfragen über
  `leads.patient_*` und die erste Zeile des Kontextblocks
  (`fd.portal_details` → JobOffer-Beschreibung): „Familie Schmidt, Kassel".
- Kommt dieselbe Familie zusätzlich über unseren Kostenrechner, entstehen
  zwei Leads mit zwei Preisen (einer mit, einer ohne Provision). Über die
  E-Mail nicht erkennbar — im Admin nach `patient_nachname` suchen.
- Ein menschlicher Forward derselben Anfrage hat eine NEUE Message-ID. Der
  Thread-Vorcheck fängt ihn nur, wenn der Client `References` mitschickt.
- **Pflegena schickt dieselbe Person erneut**, wenn sich etwas ändert: im
  Postfach steht „Brunhilde Weber 79780 Stühlingen" am 02.09. („Neue Stelle
  07.09. oder früher") **und** am 09.09. („Neue Stelle ab sofort") — zwei
  Mails, zwei Message-IDs, kein gemeinsamer Thread. Daraus werden zwei Leads
  und zwei Angebote. Ob das stört, zeigt der Betrieb: es kann auch schlicht
  eine neue Anfrage sein, weil sich der Termin verschoben hat.
- Die Mails sind **groß** (1–6 MB, Anhänge). Ein Mail pro Takt hält den
  Speicher im Rahmen — `simpleParser` puffert die ganze Nachricht, und der
  Kostenrechner läuft auf 512 MB (Registry #27/#29).
- Pflegena steht bewusst **nicht** in `herkunft.ts` `PORTAL_QUELLEN`: der
  Vermittler bekommt nie eine `eingangsbestaetigung`, und ein Test hält
  fest, dass seine Mailtypen diesen Wert nicht enthalten.

## Environment (Render-Dashboard des Kostenrechners)

| Variable | Zweck |
|---|---|
| `PORTAL_LEAD_KEY` | Auth des Eingangs `/api/portal-lead`; fehlt er, antwortet der 503 |
| `PFLEGEHILFE_USER` / `_PASS` | Postfach. Fehlt eines, wird das Portal übersprungen |
| `PFLEGEBUND_USER` / `_PASS` | dito |
| `PFLEGEHELFER24_API_TOKEN` | Partner-API pflege-helfer24.de. Fehlt er, wird das Portal übersprungen. **Staging: nur zum Test, danach entfernen** |
| `INFO_USER` / `INFO_PASS` | Zugang zu `info@primundus.de` — GETEILTES Postfach, nicht dem Vermittler allein. Registry-Feld `postfach: 'INFO'`. Nur fürs **Lesen** (IMAP) |
| `ANTHROPIC_API_KEY` | Liest die Vermittler-Anfragen (dasselbe Konto wie Pria). Fehlt er, bleiben die Mails `offen` |
| `PFLEGENA_MODELL` | optionaler Override, Default `claude-sonnet-5` |

Zum **Senden** kommt der Zugang nicht aus Render, sondern aus dem
Supabase-Vault (Edge Function): `vermittler_smtp_user`, `_pass`, `_from`
(Pflicht — ohne sie scheitert der Versand laut) sowie optional `_host`
(Default `smtp.ionos.de`), `_port` (587), `_from_name`. Setzen per
Management-API-SQL (`vault.create_secret` / `vault.update_secret`), NICHT
über eine Migration und NICHT über `supabase secrets` — das ist ein anderer
Speicher.
| `PORTAL_IMAP_HOST` | `imap.ionos.de` |
| `PORTAL_TROCKENLAUF` | `1` = alle Portale nur lesen, **oder Domain-Liste** (`pflege-helfer24.de`) für ein Portal allein |
| `PORTAL_TESTPHASE` | `1` = alle Portale, **oder Domain-Liste** — Kundenmails dieses Portals ans Team (auch als Supabase-Secret!) |
| `PORTAL_TESTPHASE_EMPFAENGER` | Ziel der Umleitung. Leer = Team (`info@` + `martin@mamamia.app`); eine einzelne Adresse für einen gezielten Durchlauf. Auch als Supabase-Secret |
| `PORTAL_LEAD_URL` | optionaler Override des Loopback-Ziels; normal NICHT gesetzt |

Der Takt kommt aus pg_cron: neues Vault-Secret `kostenrechner_url`
(per Env verschieden) + bestehendes `supabase_service_role_key` als
Bearer — die Route prüft ihn mit `timingSafeEqual`. Ohne Postfach-Zugänge
antwortet sie `200 {verarbeitet: 0}` — auf Staging bewusst wirkungslos
(Muster wie die Google-Secrets).

## Warum es so gebaut ist

**Nicht im Protokoll = unerledigt (Registry #47).** Das Gedächtnis des
Abholers ist die Tabelle **`portal_mail_log`** (eine Zeile je
`postfach, uidvalidity, uid`), nicht mehr die `\Seen`-Flagge. `\Seen` war
Zustand, den wir uns mit Menschen teilten: zweimal (02.–03.09.) hat ein
offener Webmail-Client Mails als gelesen markiert und der Cron sah sie
nie. Jetzt ist das Postfach für uns **READ-ONLY** — der Abholer schreibt
keine Flags (fetchOne holt per `BODY.PEEK`). **Jeder darf im Postfach
lesen, sortieren, aufräumen** — am Abholer ändert das nichts.

Die Status:

| Status | Bedeutung |
|---|---|
| `erledigt` | Lead angelegt (`lead_id` gesetzt) |
| `uebersprungen` | Schutzregel (zu alt, Status nicht ansprechbar) — `grund`; im Admin als Shell-Lead/Event sichtbar |
| `abgelehnt` | deterministisch (keine Kundenadresse, HTTP 400 — außer leerem Guthaben, s. o.): **dauerhaft, kein Retry** — im Admin als Shell-Lead `manuell_pruefen`. Eine fehlende Einwilligung ist seit 04.09. KEIN Ablehnungsgrund mehr (s. „Direktmails des Portals") |
| `offen` | transient (5xx, Netz): nächster Takt versucht erneut — nur dieser Status färbt den Lauf rot |
| `altbestand` | beim Erstlauf eines (postfach, uidvalidity)-Paars vorgefunden, nie verarbeitet (Seed, Muster Bug #25; `uid=0` = Sentinel „Postfach war leer") |

Eine Mail von Hand erneut anstoßen (z. B. nach einem Parser-Fix):

```sql
update portal_mail_log set status = 'offen', updated_at = now()
 where postfach = 'pflegehilfe.org' and uid = 28;
```

**Keine Mail scheitert still (Entscheidung Michał 03.09.).** Jede Mail,
die kein echter Lead wurde — `abgelehnt` wie `uebersprungen` — wird im
Admin sichtbar: als Event auf dem bestehenden Lead derselben Adresse,
sonst als Shell-Lead mit Status **`manuell_pruefen`** (rot). Betreff,
Grund und ein Textauszug stehen im Ereignis (`portal_mail_fehler` /
`portal_mail_uebersprungen`); bei **abgelehnten** Mails zusätzlich der
komplette Mailtext (+ CSV-Zeilen) als `metadata.volltext` — die Mail kann
nach dem Lauf aus dem Postfach verschwunden sein (Trageser 04.09.), dann
ist das Ereignis die einzige Kopie. Dazu listet der Portal-Reiter im Admin den
Abschnitt „Postfach — Mails ohne Lead" direkt aus `portal_mail_log`.
Jede Mail hat Geld gekostet — ein stiller Verlust ist teurer als ein
roter Eintrag zu viel.

**Der Parser lässt weg, was er nicht versteht.** Dann greift die Annahme
aus `portal-lead.ts` mit dem *teureren* Wert: lieber ein Preis, der nach
einer Korrektur fällt, als einer, der steigt. Was angenommen wurde, steht
im Ereignislog und entscheidet, ob die Mail den Annahme-Hinweis zeigt.

**Ein Portal darf das andere nicht aufhalten.** Fällt ein Postfach aus,
laufen die übrigen weiter.

**Nur `offen` färbt den Lauf rot.** Eine transient gescheiterte Mail
macht die Antwort zu **HTTP 500** mit `{liegengeblieben: N}` — der
nächste Takt versucht sie erneut. Dauerhaft `abgelehnt`e Mails tun das
NICHT mehr: früher hielt eine einzige kaputte Mail den Lauf **jede Minute
für immer** auf 500 (Registry #46) — jetzt steht sie im Admin und im
Protokoll, und der Lauf wird wieder grün. Wichtig: pg_cron-„succeeded"
heißt nur „HTTP gefeuert" (Registry #36), und `net._http_response`
rotiert in Stunden — die Wahrheit steht in den **Render-Logs des
Kostenrechners** (`[portal-abholer]`) und in `portal_mail_log`.

## Kunde sagt: „Die Angaben stimmen nicht" (Registry #55)

Die Annahmen aus `portal-lead.ts` (teurerer Wert, wenn das Portal nichts geliefert
hat) landen als `angenommene_felder` in der Kalkulation — und als echte Patienten
in Mamamia (Fall Rapp: „Ehepaar" angenommen, es ist eine Person ⇒ zwei Patienten
im MM-Kunden). Korrektur-Weg:

1. `/admin/leads/<id>` → „Eingaben des Kunden" → **Bearbeiten** — Felder ändern.
2. **Speichern** (Preis bleibt) oder **Neu berechnen & speichern** (neuer Preis;
   Häkchen „Kunden per E-Mail … informieren" schickt „Aktualisiertes Angebot",
   nur wenn sich der Preis wirklich ändert).
3. Die Statuszeile sagt, was in Mamamia passiert ist („2 → 1 Patient", Budget).
   Nach Mamamia gehen NUR die geänderten Felder (Personenzahl, Pflegegrad,
   Mobilität, Nacht, weitere Personen, Wunsch-Sprache/-Führerschein/-Geschlecht,
   Budget bei Neuberechnung) — der Patientenbogen des Kunden und Agentur-Werte
   bleiben. Betreuungsbeginn und Erfahrung gehen nicht nach Mamamia.
4. Rot ⇒ Mamamia hat nicht mitgezogen; der Lead trägt
   `kalkulation.mamamia_sync_pending`, der Knopf „Mamamia erneut synchronisieren"
   wiederholt genau diese Felder. Supabase ist schon aktuell.

**Offene Kante (bewusst so gelassen):** hat der Kunde den Patientenbogen im Portal
offen oder einen alten Entwurf im Browser, kann sein nächster Speichern-Klick einen
bei 2→1 entfernten Patienten in Mamamia neu anlegen. Wenn die Korrektur am Telefon
passiert: den Kunden das Portal neu laden lassen — oder die Personenzahl in Mamamia
nach seinem nächsten Speichern kurz gegenprüfen.

Mit dem Speichern gelten die Angaben als **mit dem Kunden geprüft**:
`angenommene_felder` wird geleert, damit eine spätere Portal-Mail derselben Adresse
(`echteAntworten` in `/api/portal-lead`) die Korrektur nicht mit frischen Annahmen
überschreibt.

## Neues Portal aufnehmen

**Drei Stellen**, alle zusammen pflegen:

1. `lib/portal-lead.ts` — `PORTALE` mit `abholung: 'imap' | 'api'`. Diese
   Liste speist Eingang, Abholer und Admin-Reiter; dort genügt die eine
   Zeile. (Ein zweites API-Portal bräuchte zusätzlich einen eigenen Mapper
   wie `portal-helfer24.ts` und einen Token-Namen in `holeApiAb`.)
2. `send-scheduled-emails/herkunft.ts` — `PORTAL_QUELLEN`, Anzeigename
   **ohne TLD**. Muss doppelt stehen, weil die Edge Function (Deno) keinen
   Code mit der Next-App teilen kann. Fehlt das Portal hier, bekommt der
   Kunde die normale Mail statt der Portal-Fassung.
3. `render.yaml` (Block `kostenrechner-beta`) + Render-Dashboard —
   Zugangsdaten des neuen Postfachs (bzw. API-Token). Die Postfach-Namen
   leitet die Abholer-Route aus der Domain ab: `pflegehilfe.org` →
   `PFLEGEHILFE_USER` / `PFLEGEHILFE_PASS`.
4. Nur bei `art: 'vermittler'`: `PORTAL_PREISE` in **beiden** Kopien
   (`lib/lead-kosten.ts`, `daily-analytics-report/queries.ts`) — auch mit
   dem Wert 0, sonst meldet der Tagesreport ein fehlendes Preisschild.

Nicht nachzutragen: der Reiter im Admin und die Allowlist des Eingangs —
beide kommen aus `PORTALE`.

## Zweite Telefonnummer (`leads.telefon_2`, Registry #56)

Etwa jede fünfte Pflegehilfe-Anfrage trägt ZWEI Nummern (Festnetz + Mobil,
manchmal zwei Mobil). Sie stehen **nur im HTML-Teil** der Mail: im Block
„Kontakt&shy;informationen des Interessenten“ als `<b>Festnetz:</b>` /
`<b>Mobil:</b>` mit `<a href="tel:…" title="Telefon">`. Der text/plain-Teil
hat an der Stelle nur `( tel: )`, die CSV eine einzige `Phone`-Spalte —
bis 09/2026 ging die zweite Nummer verloren (Abholer las nur `mail.text`,
Peek auf der Prod-Box am 07.09.: uid 71 Steinbeck, uid 66 Urban).

`lib/portal-parser.ts:telefoneAusHtml(html)` liest die `tel:`-Links
**nur zwischen** dieser Überschrift und dem ersten „Informationen zu…“
(zum Senior / zu den Senioren): die Hotline des Portals
(`tel:004961312652011`) steht im Footer und trägt DASSELBE
`title="Telefon"` — ein Filter über das Attribut griffe sie mit. Fehlt
einer der beiden Marker ⇒ `[]` (lieber nichts als die Hotline).
Reklamations-Mails haben keinen Kontaktblock ⇒ `[]` ⇒ Verhalten wie bisher.

`waehleTelefone(csvTelefon, textTelefon, htmlNummern)` entscheidet, was
`telefon` und was `telefon_2` wird — EINE Stelle, unit-getestet:
`telefon` = CSV-Phone, wenn vorhanden (leere Phone-Spalte ⇒ kein
`Mobil`-Label im synthetischen Text ⇒ `''`), sonst erste HTML-Nummer
(Direktmail ohne CSV — bisher blieb `telefon` dort leer), sonst der
Text-Parse; `telefon_2` = erste HTML-Nummer, die nicht dieselbe ist
(Vergleich auf den letzten 9 Ziffern: `+49 176…` == `0176…`). Folge:
CSV-Mail ⇒ `telefon` = CSV-`Phone`, `telefon_2` = die andere; Direktmail
⇒ `telefon` = erster `tel:`-Link (meist Festnetz), `telefon_2` = Mobil.
Auf dem Duplikat-Pfad überschreibt `findOrCreateLead` `telefon`, wenn
nicht leer — CSV-Mails taten das schon, Direktmails tun es jetzt auch
(ein Re-Run per `status='offen'` überschreibt eine Admin-Korrektur).

Der Eingang (`/api/portal-lead`) schreibt `telefon_2` als **eigenes**
best-effort Update nach dem `patient_*`-Patch — fehlt die Spalte noch
(Migration läuft nach), darf das `patient_*` nicht mitreißen. Der Eingang
**setzt nur, löscht nie** (wie `telefon` in `findOrCreateLead`); leeren
geht über den Admin (Kontaktformular, Feld „Telefon 2“, leer ⇒ `null`).
Sichtbar in `/admin/leads` (Liste + Suche) und im Lead-Detail. mamamia
kennt EINE Nummer (`Customer.phone`) — `telefon_2` bleibt bei uns; die
Partner-API pflege-helfer24 liefert nur eine `Telefon`-Spalte, dort
ändert sich nichts.

## Tests

Die Prüfungen laufen im root-vitest (Cross-App-Import der pure Module,
Muster wie `portalUrl.test.ts`) und damit im **required CI-Check** vor
jedem Merge — nicht mehr als eigenständige Deno-Skripte (die brachen den
`next build` beider Kostenrechner-Slots, Registry #38):

```bash
npx vitest run src/__tests__/portalLead.test.ts src/__tests__/portalParser.test.ts src/__tests__/portalMailLog.test.ts src/__tests__/portalHelfer24.test.ts src/__tests__/portalSchutz.test.ts src/__tests__/pflegena.test.ts
```

Die Vermittler-Mails selbst prüft die Deno-Suite der Edge Function
(`project 3/supabase/functions/send-scheduled-emails`: `vermittler.test.ts`
für Preis, Provision, fehlende Links und den fehlenden Token;
`bewertung.test.ts` für die Bremse).

`portalHelfer24.test.ts` (API-Zeile → Body: Spalten per Name, exakte
Auswahlwerte, `spaeter`, falsches Produkt, Einwilligung), `portalSchutz.test.ts`
(Testphase per Domain, `Aktiv`), `portalParser.test.ts` (liest die Portal-Mail; `telefoneAusHtml` gegen VERBATIM-Fragmente aus prod uid 71 — beide Nummern, nie die Hotline, ohne Ende-Marker `[]`; `waehleTelefone` — CSV ohne Phone darf die einzige Nummer nicht nach `telefon_2` schieben), `portalLead.test.ts`
(Lücken zum teureren Wert füllen + Admin-Reiter via `reiterFuer` aus
`lib/portal-lead.ts` — die Seite ruft dieselbe Funktion auf, der Test
prüft keine Kopie), `portalMailLog.test.ts` (welche UIDs ein Lauf
anfasst: `zuVerarbeiten` aus `lib/portal-mail-log.ts`).
