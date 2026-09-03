# Eingekaufte Leads (Pflegehilfe, Pflegebund)

Zweiter Weg in dieselbe Strecke: nicht der Kunde füllt den Kostenrechner
aus, sondern wir kaufen seine Anfrage bei einem Portal. Ab dem Lead läuft
alles wie immer — Preis, Token, Kundenportal, Mail 1.

## Der Weg einer Anfrage

```
Portal-Mail  →  Postfach        →  pg_cron (jede Minute, Supabase)
                pflegehilfe@       POST /api/portal-abholen (Bearer)
                primundus.de       app/api/portal-abholen/route.ts
                                        │  ~1s IMAP-Poll (READ-ONLY)
                                        ▼
                              UID-Abgleich mit portal_mail_log:
                              nur UIDs ohne Eintrag oder 'offen'
                                        │
                                        ▼
                              CSV-Anhang der Mail (ERSTE Quelle)
                              lib/portal-csv.ts → synthetischer Text
                                        │
                                        ▼
                                   lib/portal-parser.ts
                                   liest "Label: Wert"
                                   (Mailtext: Einwilligung + Fallback)
                                        │
                                        ▼  (Loopback im selben Prozess)
                            POST /api/portal-lead   (x-portal-key)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              Schutzregeln         berechnePreis      scheduleEmail
              portal-schutz.ts     + Annahmen         Mail 1, sofort
                                   portal-lead.ts
                                        │
                                        ▼
                              Ausgang → portal_mail_log
                              erledigt / uebersprungen /
                              abgelehnt / offen  (Registry #47)
```

Im Admin erscheint der Lead unter **Leads** mit eigenem Reiter je Portal
und der Spalte *Herkunft* (rot hervorgehoben — er hat Geld gekostet).
Im selben Reiter zeigt der Abschnitt **„Postfach … — Mails ohne Lead"**
das Protokoll aller Mails, die KEIN Lead wurden (offen, abgelehnt,
übersprungen, Altbestand) — nichts scheitert still.

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

**Schritt 1 — Trockenlauf.** `PORTAL_TROCKENLAUF=1` im Render-Dashboard
des Kostenrechners setzen (+ Redeploy): die Route liest, parst und loggt
in die Konsole, legt aber keinen Lead an, löst keine Kundenmail aus und
schreibt NICHTS in `portal_mail_log` (auch keinen Seed — der passiert
beim Scharfschalten).

Im Log (Render-Logs des Kostenrechners, Präfix `[portal-abholer]`) steht
pro Mail, wie viele Felder erkannt wurden. Eine Zeile `⚠ nicht zugeordnet`
bedeutet: das Portal hat seine Vorlage geändert — erst den Parser
nachziehen, nicht scharfschalten.

**Schritt 2 — Testphase (Mails ans Team).** `PORTAL_TESTPHASE=1` setzen —
an ZWEI Stellen: Render-Env des Kostenrechners (+ Redeploy) UND als
Supabase-Secret (`npx supabase secrets set PORTAL_TESTPHASE=1
--project-ref <ref>` — die Edge Function send-scheduled-emails liest ihre
eigene Env, ohne Redeploy wirksam). Ab dann läuft die Strecke SCHARF
(Lead, Preis, Ereignisse), aber **jede Kundenmail eines Portal-Leads geht
an `info@mamamia.app` + `martin@mamamia.app`** statt an den Kunden; der
Betreff nennt den eigentlichen Empfänger (`[TESTPHASE → kunde@…]`). Der
Lead behält die echte Adresse — umgeleitet wird nur der Versand
(Kostenrechner-Leads sind nie betroffen). Logik: `lib/portal-schutz.ts`
(`testphaseUmleitung`) + Kopie `send-scheduled-emails/testphase.ts`.

**Schritt 3 — scharf.** `PORTAL_TROCKENLAUF` und `PORTAL_TESTPHASE`
(beide Stellen!) leeren. Ab dann bekommt jeder eingehende Lead automatisch
Mail 1, ohne dass ein Mensch draufschaut.

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

## Environment (Render-Dashboard des Kostenrechners)

| Variable | Zweck |
|---|---|
| `PORTAL_LEAD_KEY` | Auth des Eingangs `/api/portal-lead`; fehlt er, antwortet der 503 |
| `PFLEGEHILFE_USER` / `_PASS` | Postfach. Fehlt eines, wird das Portal übersprungen |
| `PFLEGEBUND_USER` / `_PASS` | dito |
| `PORTAL_IMAP_HOST` | `imap.ionos.de` |
| `PORTAL_TROCKENLAUF` | `1` = nur lesen (siehe oben) |
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
| `abgelehnt` | deterministisch (keine Einwilligung, keine Kundenadresse, HTTP 400): **dauerhaft, kein Retry** — im Admin als Shell-Lead `manuell_pruefen` |
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
`portal_mail_uebersprungen`). Dazu listet der Portal-Reiter im Admin den
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

1. `lib/portal-lead.ts` — `PORTALE`. Diese Liste speist Eingang, Abholer
   und Admin-Reiter; dort genügt die eine Zeile.
2. `send-scheduled-emails/herkunft.ts` — `PORTAL_QUELLEN`, Anzeigename
   **ohne TLD**. Muss doppelt stehen, weil die Edge Function (Deno) keinen
   Code mit der Next-App teilen kann. Fehlt das Portal hier, bekommt der
   Kunde die normale Mail statt der Portal-Fassung.
3. `render.yaml` (Block `kostenrechner-beta`) + Render-Dashboard —
   Zugangsdaten des neuen Postfachs. Die Namen leitet die Abholer-Route
   aus der Domain ab: `pflegehilfe.org` → `PFLEGEHILFE_USER` /
   `PFLEGEHILFE_PASS`.

Nicht nachzutragen: der Reiter im Admin und die Allowlist des Eingangs —
beide kommen aus `PORTALE`.

## Tests

Die Prüfungen laufen im root-vitest (Cross-App-Import der pure Module,
Muster wie `portalUrl.test.ts`) und damit im **required CI-Check** vor
jedem Merge — nicht mehr als eigenständige Deno-Skripte (die brachen den
`next build` beider Kostenrechner-Slots, Registry #38):

```bash
npx vitest run src/__tests__/portalLead.test.ts src/__tests__/portalParser.test.ts src/__tests__/portalMailLog.test.ts
```

`portalParser.test.ts` (liest die Portal-Mail), `portalLead.test.ts`
(Lücken zum teureren Wert füllen + Admin-Reiter via `reiterFuer` aus
`lib/portal-lead.ts` — die Seite ruft dieselbe Funktion auf, der Test
prüft keine Kopie), `portalMailLog.test.ts` (welche UIDs ein Lauf
anfasst: `zuVerarbeiten` aus `lib/portal-mail-log.ts`).
