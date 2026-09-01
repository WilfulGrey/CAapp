# Eingekaufte Leads (Pflegehilfe, Pflegebund)

Zweiter Weg in dieselbe Strecke: nicht der Kunde füllt den Kostenrechner
aus, sondern wir kaufen seine Anfrage bei einem Portal. Ab dem Lead läuft
alles wie immer — Preis, Token, Kundenportal, Mail 1.

## Der Weg einer Anfrage

```
Portal-Mail  →  Postfach        →  Abholer (Cron, jede Minute)
                pflegehilfe@       scripts/portal/abholer.ts
                primundus.de            │
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

Die Portal-Reiter stehen dort **auch ohne Leads**, mit einer `0`. Das ist
die Antwort auf „kommt da eigentlich was an?" — ein fehlender Reiter ließe
offen, ob nichts ankam oder der Abholer steht. Gerade beim Scharfschalten
die wichtigere Auskunft.

## Takt: jede Minute

Das Portal gibt dieselbe Anfrage an **bis zu drei Anbieter gleichzeitig**.
Wer zuerst antwortet, gewinnt — deshalb der enge Takt. Eine Minute fällt
gegenüber einem Menschen, der die Mail liest und zurückruft, nicht ins
Gewicht.

Ein Lauf dauert rund **eine Sekunde**: verbinden, ungelesene Mails holen,
verarbeiten, schließen. `buildCommand` läuft nur beim Deploy, nicht bei
jedem Lauf.

Bewusst ein Cron und kein Dauerprozess: ein Skript, das startet, arbeitet
und endet, hat keine Verbindung, die wegbrechen kann, und keinen Prozess,
der still stirbt, ohne dass es jemand merkt.

## Die Postfächer sind Eingänge, keine Absender

Jedes Portal bekommt eine eigene Adresse. **Die Adresse ist die
Quellenangabe** — was dort ankommt, kommt von diesem Portal.

Von diesen Postfächern wird **nie gesendet**. Jede Kundenmail geht über
`kostenrechner@primundus.de` (SMTP-Konfiguration der Edge Function).
Die Zugangsdaten liegen außerhalb des Repos und dienen nur dem Lesen.

## Scharfschalten

**Schritt 1 — Trockenlauf.** Der Cron Job startet mit
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

Der Dienst heißt `portal-abholer` und ist ein **Cron Job** (`* * * * *`).

## Warum es so gebaut ist

**Ungelesen = unerledigt.** Eine Mail wird erst nach einer verstandenen
Antwort des Endpunkts als gelesen markiert. Bricht der Lauf vorher ab,
holt der nächste sie eine Minute später erneut — lieber ein zweiter Versuch als ein
verlorener Lead, der bezahlt ist. Gegen Dubletten schützt
`findOrCreateLead` über die E-Mail-Adresse.

**Ein bewusstes Überspringen ist erledigt.** Der Endpunkt antwortet auch
bei „zu alt" oder „Status nicht ansprechbar" mit 200 und
`uebersprungen: true`. Diese Mail darf weg — sie kommt nicht wieder.

**Der Parser lässt weg, was er nicht versteht.** Dann greift die Annahme
aus `portal-lead.ts` mit dem *teureren* Wert: lieber ein Preis, der nach
einer Korrektur fällt, als einer, der steigt. Was angenommen wurde, steht
im Ereignislog und entscheidet, ob die Mail den Annahme-Hinweis zeigt.

**Ein Portal darf das andere nicht aufhalten.** Fällt ein Postfach aus,
laufen die übrigen weiter.

**Jeder liegengebliebene Lead färbt den Lauf rot.** Nicht nur ein kaputtes
Postfach, auch eine einzelne Mail, die nicht durchging, setzt den
Exit-Code auf 1. Sonst zeigte Render bei einem Takt von einer Minute 60
grüne Läufe pro Stunde, während derselbe bezahlte Lead nie durchgeht.

## Neues Portal aufnehmen

**Drei Stellen**, alle zusammen pflegen:

1. `lib/portal-lead.ts` — `PORTALE`. Diese Liste speist Eingang, Abholer
   und Admin-Reiter; dort genügt die eine Zeile.
2. `send-scheduled-emails/herkunft.ts` — `PORTAL_QUELLEN`, Anzeigename
   **ohne TLD**. Muss doppelt stehen, weil die Edge Function (Deno) keinen
   Code mit der Next-App teilen kann. Fehlt das Portal hier, bekommt der
   Kunde die normale Mail statt der Portal-Fassung.
3. `render.yaml` — Zugangsdaten des neuen Postfachs. Die Namen leitet der
   Abholer aus der Domain ab: `pflegehilfe.org` → `PFLEGEHILFE_USER` /
   `PFLEGEHILFE_PASS`.

Nicht nachzutragen: der Reiter im Admin und die Allowlist des Eingangs —
beide kommen aus `PORTALE`.

## Prüfskripte

Das Projekt hat keinen Testrunner; die Skripte laufen eigenständig:

```bash
cd "project 3" && deno run --allow-read --no-check scripts/pruef-portal-reiter.ts
```

`pruef-portal-parser.ts` (liest die Portal-Mail), `pruef-portal-defaults.ts`
(füllt Lücken zum teureren Wert), `pruef-portal-reiter.ts` (Admin-Reiter).
