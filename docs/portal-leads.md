# Eingekaufte Leads (Pflegehilfe, Pflegebund, Pflege-Helfer24)

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

## Die Postfächer sind Eingänge, keine Absender

Jedes Portal bekommt eine eigene Adresse. **Die Adresse ist die
Quellenangabe** — was dort ankommt, kommt von diesem Portal.

Von diesen Postfächern wird **nie gesendet**. Jede Kundenmail geht über
`kostenrechner@primundus.de` (SMTP-Konfiguration der Edge Function).
Die Zugangsdaten liegen außerhalb des Repos und dienen nur dem Lesen.

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
VOLLEN Datensatz (Name, Telefon, Pflegegrad, Mobilität, Gewicht,
Krankheiten …). Der Abholer liest sie als erste Quelle — aus der Zeile
wird ein "Label: Wert"-Text synthetisiert und durch dasselbe
`parsePflegehilfe` geschickt (EIN Mapper, ein `unbekannt[]`-Kanal). Der
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

## Environment (Render-Dashboard des Kostenrechners)

| Variable | Zweck |
|---|---|
| `PORTAL_LEAD_KEY` | Auth des Eingangs `/api/portal-lead`; fehlt er, antwortet der 503 |
| `PFLEGEHILFE_USER` / `_PASS` | Postfach. Fehlt eines, wird das Portal übersprungen |
| `PFLEGEBUND_USER` / `_PASS` | dito |
| `PFLEGEHELFER24_API_TOKEN` | Partner-API pflege-helfer24.de. Fehlt er, wird das Portal übersprungen. **Staging: nur zum Test, danach entfernen** |
| `PORTAL_IMAP_HOST` | `imap.ionos.de` |
| `PORTAL_TROCKENLAUF` | `1` = alle Portale nur lesen, **oder Domain-Liste** (`pflege-helfer24.de`) für ein Portal allein |
| `PORTAL_TESTPHASE` | `1` = alle Portale, **oder Domain-Liste** — Kundenmails dieses Portals ans Team (auch als Supabase-Secret!) |
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
| `abgelehnt` | deterministisch (keine Kundenadresse, HTTP 400): **dauerhaft, kein Retry** — im Admin als Shell-Lead `manuell_pruefen`. Eine fehlende Einwilligung ist seit 04.09. KEIN Ablehnungsgrund mehr (s. „Direktmails des Portals") |
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

Nicht nachzutragen: der Reiter im Admin und die Allowlist des Eingangs —
beide kommen aus `PORTALE`.

## Tests

Die Prüfungen laufen im root-vitest (Cross-App-Import der pure Module,
Muster wie `portalUrl.test.ts`) und damit im **required CI-Check** vor
jedem Merge — nicht mehr als eigenständige Deno-Skripte (die brachen den
`next build` beider Kostenrechner-Slots, Registry #38):

```bash
npx vitest run src/__tests__/portalLead.test.ts src/__tests__/portalParser.test.ts src/__tests__/portalMailLog.test.ts src/__tests__/portalHelfer24.test.ts src/__tests__/portalSchutz.test.ts
```

`portalHelfer24.test.ts` (API-Zeile → Body: Spalten per Name, exakte
Auswahlwerte, `spaeter`, falsches Produkt, Einwilligung), `portalSchutz.test.ts`
(Testphase per Domain, `Aktiv`), `portalParser.test.ts` (liest die Portal-Mail), `portalLead.test.ts`
(Lücken zum teureren Wert füllen + Admin-Reiter via `reiterFuer` aus
`lib/portal-lead.ts` — die Seite ruft dieselbe Funktion auf, der Test
prüft keine Kopie), `portalMailLog.test.ts` (welche UIDs ein Lauf
anfasst: `zuVerarbeiten` aus `lib/portal-mail-log.ts`).
