# Mail-Templates — Design-Workspace

Hier liegen **alle Kundenmails als HTML** mit echten Beispieldaten (Bilder
laden aus der Prod-Seite, also siehst du die echte Optik). Dieser Ordner ist
ein **Design-Workspace** — er wird **nicht** deployed und beeinflusst keinen
Build. Die echten Mails werden im Code generiert (siehe „Wo es im Code lebt").

## Flow — wann läuft welche Mail (und warum sie stoppt)

Es gibt **zwei parallele Stränge**:

### A) Zeit-getriggert — „Kunde tut nichts" (Nurture)
Startet automatisch nach der Anfrage, **fixe Zeitabstände**:

```
0h     [01] Eingangsbestätigung + Angebot   (sofort bei Anfrage)
+24h   [02] Nachfass 1
+48h   [05] Warum Primundus                 ← VOR Nachfass 2
+72h   [03] Nachfass 2
+120h  [04] Nachfass 3   (Break-up, 3 mailto-Buttons)
```

**Abbruch der Kette:**
- Nachfass 1–3 stoppen, sobald der Kunde **bucht**, **„nicht interessiert"** ist
  **oder eine Pflegekraft einlädt**.
- „Warum Primundus" stoppt nur bei **gebucht / nicht interessiert** (läuft also
  weiter, auch wenn schon eingeladen — Preis-Argument hilft bis zur Buchung).
- Nachfass-Texte passen sich dem Fortschritt an (Portal geöffnet / Daten
  erfasst / eingeladen) — sind **nicht** fix „Patientendaten unvollständig".

### B) Event-getriggert — vom System / Mamamia
Laufen unabhängig vom Timer, sobald das Event passiert:

```
patient_data_saved        → [14] Mail D — Profil erfasst
caregiver_interest_shown  → [11] Mail A + [06] Interesse-Reminder (+1h)
application_received       → [12] Mail B + [07/08/09/10] Reminder 1h/4h/12h/46h
application_accepted        → [13] Mail C — Buchung
```

**Abbruch / Konsequenz:**
- [06] und [07–10] stoppen, sobald der Kunde für **diese** Pflegekraft reagiert
  (annimmt ODER ablehnt).
- Nach [10] (46h-Reminder): ~2h später lehnt das System die Bewerbung
  **automatisch ab** (48h ohne Reaktion). Keine Mail, sondern die Konsequenz.

> A und B laufen gleichzeitig: Ein Kunde kann z.B. mitten in der Nurture-Kette
> eine Bewerbung erhalten (B) — die Nurture-Kette bricht dann ab, sobald er
> reagiert/einlädt/bucht.

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

Die Betreff-Zeilen werden im Code gesetzt, nicht im HTML — hier zum Mitbearbeiten:

| Datei | Subject |
|-------|---------|
| 01 Eingangsbestätigung | Ihr persönliches Angebot zur 24-Stunden-Betreuung – Primundus *(Resubmit: „Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus")* |
| 02 Nachfass 1 | AW: Kurze Rückfrage zu Ihrem Angebot |
| 03 Nachfass 2 | Brauchen Sie noch Hilfe? |
| 04 Nachfass 3 | Eine letzte Frage — wie schaut's bei Ihnen aus? |
| 05 Warum Primundus | Kennen Sie die Primundus-Bestpreis-Garantie? |
| 06 Interesse-Reminder | `{VORNAME}` wartet auf Ihre Rückmeldung |
| 07 Bewerbung 1h | `{VORNAME}` wartet auf Ihre Entscheidung |
| 08 Bewerbung 4h | `{VORNAME}`: bitte kurz Bescheid geben |
| 09 Bewerbung 12h | `{VORNAME}`: ist die Bewerbung noch aktuell? |
| 10 Bewerbung 46h | `{VORNAME}`: letzte Erinnerung — wir schließen die Bewerbung bald |
| 11 Mail A — Interesse | Eine Pflegekraft interessiert sich für Ihre Anfrage |
| 12 Mail B — Bewerbung | Sie haben eine neue Bewerbung erhalten |
| 13 Mail C — Buchung | Buchung bestätigt — wir kümmern uns um alle weiteren Schritte |
| 14 Mail D — Profil | Ihre Pflegedaten sind bei uns eingegangen |

> Hinweis: Die Reminder-Subjects 07–10 stammen noch aus der alten Tonalität
> (v.a. 10 „… wir schließen die Bewerbung bald" ist negativer als der neue
> Mailtext). Wenn du die Subjects mit anpassen willst, schreib die Wunsch-
> Betreffs einfach in diese Tabelle — ich ziehe sie nach.

## Feste Bausteine (überall gleich, am besten nicht pro Mail einzeln ändern)

Wenn du diese änderst, sag es dazu — ich ziehe die Änderung dann **zentral**
durch (sie betreffen alle Mails):

- **Header** — Primundus-Logo + Testsieger-Badge (oben)
- **Ilka-Signatur** — Foto, „Ilka Wysocki · Pflegeberaterin", Telefon,
  WhatsApp, Testsieger-Kasten (unten in jeder Mail)
- **Footer** — Adresse / Kontakt / Abmelde-Hinweis (ganz unten)

Den **Bereich dazwischen** (Body) kannst du frei umbauen.

## Dynamische Stellen je Mail

Beispielwert → Bedeutung (Token beim Zurückbauen):

| Feld | Beispiel | Bedeutung |
|------|----------|-----------|
| `ANREDE` | Hallo Frau Wendt | Begrüßung aus Anrede + Nachname des Kunden |
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
