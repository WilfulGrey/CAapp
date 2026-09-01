# Eingekaufte Leads (Pflegehilfe, Pflegebund)

Zweiter Weg in dieselbe Strecke: nicht der Kunde füllt den Kostenrechner
aus, sondern wir kaufen seine Anfrage bei einem Portal. Ab dem Lead läuft
alles wie immer — Preis, Token, Kundenportal, Mail 1.

## Der Weg einer Anfrage

```
Portal-Mail  →  Postfach        →  Abholer (Worker, IMAP IDLE)
                pflegehilfe@       scripts/portal/abholer.ts
                primundus.de       meldet sich in ~2 s
                                        │
                                        ▼
                                   lib/portal-parser.ts
                                   liest "Label: Wert"
                                        │
                                        ▼
                            POST /api/portal-lead   (x-portal-key)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              Schutzregeln         berechnePreis      scheduleEmail
              portal-schutz.ts     + Annahmen         Mail 1, sofort
                                   portal-lead.ts
```

Im Admin erscheint der Lead unter **Leads** mit eigenem Reiter je Portal
und der Spalte *Herkunft* (rot hervorgehoben — er hat Geld gekostet).

## Warum ein Worker und kein Cron

Das Portal gibt dieselbe Anfrage an **bis zu drei Anbieter gleichzeitig**.
Wer zuerst antwortet, gewinnt — Tempo ist hier kein Komfort, sondern der
Unterschied zwischen bezahltem Lead und verlorenem Geld.

Der Worker hält eine stehende IMAP-Verbindung offen (IDLE): der Server
meldet die neue Mail von sich aus. Gemessen im Test: **1,7 – 2 Sekunden**
von „Mail liegt im Postfach" bis „Kundenmail ist raus".

Ein Cron käme dafür nicht in Frage. Render startet je Lauf einen frischen
Container samt `npm install` — allein das dauert ein bis zwei Minuten,
also länger als der Vorsprung, um den es geht. Ein Takt von 10 Minuten
wäre real eher 11.

`autoIdleDelay` steht auf 1 s (Standard: 15 s). Das ist die Pause, bis
ImapFlow nach einem Befehl wieder ins IDLE geht; in diesem Fenster meldet
der Server nichts.

## Die Postfächer sind Eingänge, keine Absender

Jedes Portal bekommt eine eigene Adresse. **Die Adresse ist die
Quellenangabe** — was dort ankommt, kommt von diesem Portal.

Von diesen Postfächern wird **nie gesendet**. Jede Kundenmail geht über
`kostenrechner@primundus.de` (SMTP-Konfiguration der Edge Function).
Die Zugangsdaten liegen außerhalb des Repos und dienen nur dem Lesen.

## Scharfschalten

**Schritt 1 — Trockenlauf.** Der Worker startet mit
`PORTAL_TROCKENLAUF=1`: er liest, parst und protokolliert, legt aber
keinen Lead an und löst keine Kundenmail aus. Die Mails bleiben ungelesen.

Im Log steht pro Mail, wie viele Felder erkannt wurden. Eine Zeile
`⚠ nicht zugeordnet` bedeutet: das Portal hat seine Vorlage geändert —
erst den Parser nachziehen, nicht scharfschalten.

**Schritt 2 — scharf.** `PORTAL_TROCKENLAUF` leeren. Ab dann bekommt jeder
eingehende Lead automatisch Mail 1, ohne dass ein Mensch draufschaut.

## Environment (Render, Dienst `portal-abholer`)

| Variable | Zweck |
|---|---|
| `PORTAL_LEAD_URL` | Basis-URL des Kostenrechners (ohne `/api/...`) |
| `PORTAL_LEAD_KEY` | derselbe Wert wie auf `kostenrechner-beta`; fehlt er dort, antwortet der Endpunkt 503 |
| `PFLEGEHILFE_USER` / `_PASS` | Postfach. Fehlt eines, wird das Portal übersprungen |
| `PFLEGEBUND_USER` / `_PASS` | dito |
| `PORTAL_IMAP_HOST` | `imap.ionos.de` |
| `PORTAL_TROCKENLAUF` | `1` = nur lesen (siehe oben) |

Der Dienst heißt `portal-abholer` und ist ein **Worker**, kein Cron Job.

## Warum es so gebaut ist

**Ungelesen = unerledigt.** Eine Mail wird erst nach einer verstandenen
Antwort des Endpunkts als gelesen markiert. Bricht der Lauf vorher ab,
holt der nächste sie erneut — lieber ein zweiter Versuch als ein
verlorener Lead, der bezahlt ist. Gegen Dubletten schützt
`findOrCreateLead` über die E-Mail-Adresse.

**Ein bewusstes Überspringen ist erledigt.** Der Endpunkt antwortet auch
bei „zu alt" oder „Status nicht ansprechbar" mit 200 und
`uebersprungen: true`. Diese Mail darf weg — sie kommt nicht wieder.

**Der Parser lässt weg, was er nicht versteht.** Dann greift die Annahme
aus `portal-lead.ts` mit dem *teureren* Wert: lieber ein Preis, der nach
einer Korrektur fällt, als einer, der steigt. Was angenommen wurde, steht
im Ereignislog und entscheidet, ob die Mail den Annahme-Hinweis zeigt.

**Ein Portal darf das andere nicht aufhalten.** Jedes Postfach hat seine
eigene Verbindung und seine eigene Wiederanlauf-Schleife. Bricht eine
Verbindung weg — Serverneustart, Timeout, Netz — wird sie neu aufgebaut,
erst nach 5 s, dann mit wachsendem Abstand bis 5 Minuten. Ein totes
Postfach heißt verlorene, bezahlte Leads; deshalb gibt der Worker nie auf.

**Nur ein Durchgang gleichzeitig.** Trifft während der Verarbeitung eine
weitere Mail ein, wird sie an den laufenden Durchgang angehängt statt
parallel gestartet — sonst greifen zwei Durchgänge auf dieselbe
Verbindung zu.

## Neues Portal aufnehmen

Vier Stellen, alle zusammen pflegen:

1. `send-scheduled-emails/herkunft.ts` — `PORTAL_QUELLEN`, Anzeigename **ohne TLD**
2. `app/api/portal-lead/route.ts` — `ERLAUBTE_PORTALE`
3. `scripts/portal/abholer.ts` — `POSTFAECHER`
4. `render.yaml` — Zugangsdaten des neuen Postfachs

Ein Portal, das nur an einer Stelle steht, bekommt die normale Mail statt
der Portal-Fassung — oder wird gar nicht erst abgeholt.

Der Reiter im Admin muss **nicht** nachgetragen werden: er entsteht aus
den vorhandenen Leads (`app/admin/leads/page.tsx`).
