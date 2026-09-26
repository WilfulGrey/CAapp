# Mail-Templates — Design-Workspace

Hier liegen **alle Kundenmails als HTML** mit echten Beispieldaten (Bilder
laden aus der Prod-Seite, also siehst du die echte Optik). Dieser Ordner ist
ein **Design-Workspace** — er wird **nicht** deployed und beeinflusst keinen
Build. Die echten Mails werden im Code generiert (siehe „Wo es im Code lebt").

## Regeln (gelten für ALLE Mails)

Diese Regeln gelten mailübergreifend. Beim Bauen/Zurückbauen jeder Mail prüfen.

1. **CTA-Buttons benennen den konkreten Nutzen — niemals „Zum Portal".**
   Ein Knopf je Mail, Koralle, über die volle Breite, Wortlaut wie der Portal-Knopf,
   der dasselbe tut (Vorschau v2, 26.09.2026): „Bewerbungen erhalten" (öffnet die
   Pflegesituation, `goto=anfragen`), „Angebot prüfen" (öffnet die Bewerbung,
   `view=application`), „Stand Ihrer Suche ansehen", „{VORNAME} zur Bewerbung
   einladen", „Pflegekräfte einladen" / „Neue Pflegekräfte ansehen" (`goto=matches`).
   Faustregel: **Verb + konkretes Objekt**, kein Ort.
2. **Anrede:** „Guten Tag {Anrede} {Nachname}," in **allen** Kundenmails, sonst
   „Guten Tag," — nie der Vorname (seit 26.09.2026 auch nicht mehr „Hallo …").
3. **Tonalität:** Ilka spricht in **Ich-Form**. Kein „wir", das eigentlich Ilka
   meint („Rufen Sie **uns** an" → „Rufen Sie **mich** an").
4. **Schlusssatz** (Ich-Form): „Wenn Sie Fragen [zum X] haben — rufen Sie mich
   an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese
   E-Mail. Ich bin gerne für Sie da." ({X}: 01–05 „zum Angebot", 11/06 „zu Marias
   Profil", 12/07–10 „zu Marias Bewerbung", 13 „zur Buchung oder zum Vertrag",
   14 „zu den Pflegekraft-Vorschlägen").
5. **Header / Footer / Signatur** identisch zu Mail 01 (zentral, nicht pro Mail).
6. **Bestpreis-Garantie:** Ein *eigener, separater* beiger Block existiert **nur in
   Mail 02 und Mail 04**. Sonst ist Bestpreis entweder **integriert** (01, 05, 11, 12,
   15 — in 05 als Baustein 2 der Vertrauens-Box, Titel golden #B8860B) oder **gar nicht**
   vorhanden (03, 06–10, 13, 14).

## Flow — wann läuft welche Mail (und warum sie stoppt)

Stand 26.09.2026 (Registry #96/#97, abgenommene Vorschau v2). Die Texte leben im
Code: Warteschlange `project 3/supabase/functions/send-scheduled-emails/kundenMails.ts`,
Sofort-Mails `project 3/lib/email.ts`, beide aus `mail-bausteine` (zwei Kopien). Die
HTML-Dateien in diesem Ordner zeigen noch den alten Stand.

### A) Vor dem Absenden der Pflegesituation (Nurture)

```
0h     Angebot („Passt Ihnen das Angebot?" → Ja, Bewerbungen erhalten)
+4h    Nudge 1  (bis zu fünf passende Pflegekräfte)
+28h   Nudge 2  („Soll ich die Angaben mit Ihnen zusammen ausfüllen?")
+48h   Vier Dinge, die Primundus anders macht
+72h   Nachfass 2
+120h  Nachfass 3 (drei Antwortknöpfe → /rueckmeldung)
+49d   Wechsel-Mail
```
Alles nachts (21–8 Uhr) auf 8 Uhr. **Stopp:** Nudges, Vier Dinge, Nachfass 2 und 3
stoppen, sobald die Pflegesituation abgesendet ist (`patient_data_saved`, auch eine
Bewerbung zählt) oder eingeladen, gebucht, nicht interessiert.

### B) Nach dem Absenden / Ereignisse

```
patient_data_saved        → Mail D „Ihre Suche läuft" + nach 48 h „Noch keine Bewerbung?"
caregiver_interest_shown  → Mail A „{VORNAME} interessiert sich" + Erinnerung +1 h
caregiver_invited         → nach 24 h „Neue passende Pflegekräfte" (nicht nachts,
                             nicht während einer Reservierung)
application_received      → Mail B „Neue Bewerbung – 72 Stunden reserviert"
                             + Erinnerungen Ende − 52 h / − 24 h / − 8 h
auto_timeout_72h          → „Reservierung abgelaufen – Ihre Suche läuft weiter"
application_accepted      → Mail C „Buchung bestätigt"
```
Ende der Reservierung = frühester echter Eingang + 72 h, abgerundet (wie Portal und
Server). Erinnerungen nie nachts, die letzte sicher vor dem Ende; sie stoppen bei Zu-
oder Absage, gebucht, weniger als 1 h Rest oder weniger als 6 h nach der letzten Mail
zu derselben Bewerbung. „Noch keine Bewerbung?" entfällt mit Bewerbung oder Interesse.

## So arbeiten wir (kein Chaos)

1. **Du** editierst die HTML hier (direkt im Repo via GitHub-Editor, lokal,
   oder im Mail-Tool → editiertes HTML zurück in dieselbe Datei).
2. **Du** committest / machst einen PR (oder sagst Bescheid, welche Dateien
   fertig sind).
3. **Ich** baue die fertigen Designs zurück ins System: dynamische Stellen
   (siehe unten) wieder einsetzen, im Code verdrahten, rendern, deployen.

**Wichtig:** Die **dynamischen Stellen** (Tabelle unten) werden zur Laufzeit
ersetzt. Du darfst die Beispielwerte (z.B. „Barbara B.", „62 J.") gern stehen
lassen oder umbauen — ich erkenne sie beim Zurückbauen an dieser Spec. Wenn du
einen dynamischen Wert **verschiebst**, bleibt er dynamisch; wenn du ihn
**löschst**, fällt das Feld weg.

## Subject-Zeilen (stehen nicht im HTML)

| Mail | Betreff |
|------|---------|
| Angebot | Ihr Angebot zur 24-Stunden-Betreuung – Primundus *(Resubmit: „Ihr aktualisiertes Angebot …"; Portal-Lead: eigener Betreff)* |
| Nudge 1 | Fünf passende Pflegekräfte – es fehlen nur 2 Minuten *(Zahl aus mamamia)* |
| Nudge 2 | Soll ich die Angaben mit Ihnen zusammen ausfüllen? |
| Vier Dinge | Vier Dinge, die Primundus anders macht |
| Nachfass 2 | Ihre Betreuung – kann ich Ihnen etwas abnehmen? |
| Nachfass 3 | Eine letzte Frage: Wie ist der Stand bei Ihnen? |
| Mail D | Ihre Suche läuft – das passiert jetzt |
| Stand nach 2 Tagen | Noch keine Bewerbung? So geht es schneller |
| Neue Pflegekräfte | Neue passende Pflegekräfte für Sie |
| Mail A | `{VORNAME}` interessiert sich für Ihre Anfrage |
| Mail B | Neue Bewerbung von `{VORNAME}` – 72 Stunden für Sie reserviert |
| Erinnerung 1 | `{VORNAME}`s Bewerbung: noch 2 Tage für Sie reserviert *(Countdown aus der Reservierung)* |
| Erinnerung 2 | Noch 24 Stunden: `{VORNAME}`s Bewerbung |
| Letzte Erinnerung | Nur noch 8 Stunden reserviert: `{VORNAME}`s Bewerbung |
| Reservierung abgelaufen | `{VORNAME}`s Reservierung ist abgelaufen – Ihre Suche läuft weiter |
| Mail C | Buchung bestätigt – so geht es jetzt weiter |

## Feste Bausteine (überall gleich, am besten nicht pro Mail einzeln ändern)

Wenn du diese änderst, sag es dazu — ich ziehe die Änderung dann **zentral**
durch (sie betreffen alle Mails):

- **Header** — Primundus-Logo + Testsieger-Badge (oben)
- **Ilka-Signatur** — Foto, „Ilka Wysocki · Pflegeberaterin", Telefon,
  WhatsApp, Testsieger-Kasten (unten in jeder Mail)
- **Footer** — Adresse / Kontakt / Abmelde-Hinweis (ganz unten)

> Seit 17.09.2026 baut **eine** Funktion die Signaturkarte im Code: `project 3/lib/marta-karte.ts`
> (Anrufen + WhatsApp, Bewertungssterne, Faktenzeile mit Bestpreisgarantie). Die Kundenvorlagen
> hier zeigen noch die alte Ilka-Karte; 15/19 (Vermittler) sind die gerenderte Vermittler-Karte.

Den **Bereich dazwischen** (Body) kannst du frei umbauen.

**Handy-Breite (seit 11.09.2026):** Jede Mail muss bei 360 px ohne seitliches
Scrollen passen. Die Signatur schafft das nur mit drei Dingen, die beim
Umbauen nicht verloren gehen dürfen: Name/Rolle/Zeiten ohne `white-space:nowrap`
(Zeiten als zwei nowrap-Teile „Mo – So," / „8 – 20 Uhr"), die Klassen
`sig-siegel-*` am Testsieger-Kasten samt Media-Query `max-width: 480px` im
`<style>` und die Presselogos mit fester Breite + `max-width:100%`. Prüfen:
Mail in einem 360 px breiten Rahmen öffnen, `document.documentElement.scrollWidth`
muss 360 sein.

## Dynamische Stellen je Mail

Beispielwert → Bedeutung (Token beim Zurückbauen):

| Feld | Beispiel | Bedeutung |
|------|----------|-----------|
| `ANREDE` | Guten Tag Frau Wendt | Begrüßung aus Anrede + Nachname des Kunden |
| `VORNAME` | Barbara | Vorname der Pflegekraft |
| `NAME` | Barbara B. | Kurzname Pflegekraft (Vorname + Initial) |
| `FOTO` | (Bild / „BB"-Initialen) | Pflegekraft-Foto, sonst Initialen-Avatar |
| `ALTER` | 62 J. | Alter der Pflegekraft |
| `DEUTSCH` | B1-B2 | Deutsch-Level (CEFR, wie im Portal) |
| `BADGE` | Gold-Pflegekraft | Erfahrungs-Badge (nur Mail A/B/Interesse) |
| `ERFAHRUNG/EINSAETZE` | 6 Jahre · 14 Einsätze | nur Mail A/B/Interesse |
| `BIO` | „Ich betreue …" | AI-Beschreibung (nur Mail A/B/Interesse) |
| `PORTAL_URL` | Link hinter Buttons/Links | tokenisierter Magic-Link des Kunden |
| `PREIS` | Monatssatz / Eigenanteil | nur Eingangsbestätigung |
| `PATIENTENDATEN` | Name, Pflegegrad, … | nur Eingangsbestätigung (Tabelle) |

### Welche Mail nutzt was

| Datei | Dynamisch |
|-------|-----------|
| `01-eingangsbestaetigung` | ANREDE, PREIS, PATIENTENDATEN, PORTAL_URL |
| `02-nachfass-1` | ANREDE, PORTAL_URL (Text variiert je Fortschritt des Kunden) |
| `03-nachfass-2` | ANREDE, PORTAL_URL |
| `04-nachfass-3` | ANREDE (Antwort-Buttons via mailto) |
| `05-warum-primundus` | ANREDE, PORTAL_URL (sonst statischer Text) |
| `06-interesse-reminder` | ANREDE, NAME, VORNAME, FOTO, BADGE, ERFAHRUNG, BIO, PORTAL_URL |
| `07–10 bewerbung-reminder (1h/4h/12h/46h)` | ANREDE, NAME, VORNAME, FOTO, ALTER, DEUTSCH, PORTAL_URL — Text eskaliert je Stufe |
| `11-mailA-interesse` | ANREDE, NAME, VORNAME, FOTO, BADGE, ERFAHRUNG, BIO, PORTAL_URL |
| `12-mailB-bewerbung` | ANREDE, NAME, VORNAME, FOTO, BADGE, ERFAHRUNG, BIO, PORTAL_URL |
| `13-mailC-buchung` | ANREDE, NAME, VORNAME, FOTO, PORTAL_URL |
| `14-mailD-profil-erfasst` | ANREDE, PORTAL_URL (keine Pflegekraft) |

## Wo es im Code lebt (für mich)

- **Reminder, Interesse-Reminder, Eingangsbestätigung, Nachfass 1–3,
  „Warum Primundus"** → `project 3/supabase/functions/send-scheduled-emails/index.ts`
- **Mail A (Interesse), B (Bewerbung), C (Buchung), D (Profil erfasst)** →
  `project 3/lib/email.ts`

## Hinweise zum Vergleichen

- Pflegekraft-**Foto** zeigt in diesen Beispielen teils Initialen („BB"), weil
  die Demo-Daten keine Foto-URL haben — in echt kommt das Foto.
- `11–13` (Mail A/B/C) haben noch die **alte** Box (Badge/Bio/Einsätze);
  `07–10` die **neue** kompakte Box (Foto · Alter · Deutsch · „Profil ansehen").
  Die Angleichung steht noch aus — gern als Teil deines Redesigns mitdenken.
