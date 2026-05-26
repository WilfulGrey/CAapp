# Mail 01 — Eingangsbestätigung / Angebot

**Datei:** `mail-templates/01-eingangsbestaetigung.html`
**Code-Pfad:** `project 3/supabase/functions/send-scheduled-emails/index.ts`
**Builder:** `buildEingangsbestaetigungHtml(lead, siteUrl, portalBase, isResubmit)`

---

## Subject

| Variante | Subject |
|---|---|
| Erstversand | `Ihr Angebot zur 24-Stunden-Betreuung – Primundus` |
| Resubmit | `Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus` |

Das Wort *„persönliches"* aus dem alten Subject ist raus — abgenutzte Floskel. Der Subject sagt jetzt direkt was drin steht.

---

## Trigger

Sofort nach Abschicken der Anfrage auf `primundus.de` (`lead.created`).
Beim Resubmit (Kunde ändert Anfrage und schickt erneut ab) gleiche Mail mit angepasstem Subject.

---

## Variablen

### Anrede

| Token | Quelle | Beispiel | Pflicht |
|---|---|---|---|
| `ANREDE_VOLL` | `"Guten Tag " + lead.salutation + " " + lead.lastName + ","` | `Guten Tag Frau Wendt,` | ja |

### Preis-Bühne

| Token | Quelle | Beispiel | Pflicht |
|---|---|---|---|
| `TAGESSATZ` | `Math.round(lead.kalkulation.bruttopreis / 30)` oder direkt aus `pricing_config` falls Tagessatz dort separat geführt wird | `95` | ja |
| `MONATSSATZ` | `lead.kalkulation.bruttopreis` | `2850` | ja |
| `EIGENANTEIL` | `lead.kalkulation.eigenanteil` (Fallback `bruttopreis − zuschüsse.gesamt`) | `1623` | ja |
| `ANREISE_STANDARD` | Standardwert aus `pricing_config` oder hartcodiert | `125` | ja |

Formatierung: Tausender-Trennzeichen `.`, kein Dezimalzeichen bei ganzen €-Beträgen (deutsche Konvention).

### Schritte (statisch)

Keine Variablen — Text steht fest in der HTML.

### CTA-Button

| Token | Quelle | Beispiel | Pflicht |
|---|---|---|---|
| `PORTAL_URL` | `buildPortalUrl(portalBase, lead.token)` | `https://kundenportal.primundus.de/?token=…` | ja |

### Angaben-Tabelle (zwei Sektionen)

**Sektion 1 — Pflegesituation & Anforderungen**

| Token | Quelle | Mapping | Conditional |
|---|---|---|---|
| `BETREUUNG_FUER` | `lead.formularDaten.beneficiary` oder `betreuung_fuer` | siehe Mapping unten | immer zeigen |
| `PFLEGEGRAD` | `lead.formularDaten.pflegegrad` | `"3"` → `"Pflegegrad 3"`, etc. | immer zeigen |
| `WEITERE_PERSONEN` | `lead.formularDaten.weitere_personen` | `true` → `"Ja"`, `false` → `"Nein"` | immer zeigen |
| `MOBILITAET` | `lead.formularDaten.mobility` | siehe Mapping | immer zeigen |
| `NACHTEINSAETZE` | `lead.formularDaten.night_calls` | siehe Mapping | immer zeigen |
| `GEWUENSCHTER_START` | `lead.care_start_timing` | siehe Mapping | immer zeigen |

**Sektion 2 — Anforderungen an die Pflegekraft**

| Token | Quelle | Mapping | Conditional |
|---|---|---|---|
| `DEUTSCH_LEVEL` | `lead.formularDaten.germanLevelRequired` | siehe Mapping | immer zeigen |
| `ERFAHRUNG` | `lead.formularDaten.experience_required` | siehe Mapping | wenn `null` → Zeile als grau „nicht angegeben" zeigen ODER ausblenden (entscheide einheitlich) |
| `FUEHRERSCHEIN` | `lead.formularDaten.driving_license_required` | `true` → `"Ja"`, `false` → `"Nein"`, `null` → ausblenden | konditional |
| `GESCHLECHT` | `lead.formularDaten.gender_preference` | `"male"` → `"Männlich"`, `"female"` → `"Weiblich"`, `"any"` oder `null` → `"Egal"` | immer zeigen |

---

## Mappings (Roh-Wert → Anzeigetext)

```
BETREUUNG_FUER:
  "first_person"     → "1 Person"
  "couple"           → "Ehepaar (2 Personen)"
  "other"            → "1 Person"        // fallback

MOBILITAET:
  "unlimited"        → "Uneingeschränkt"
  "limited"          → "Eingeschränkt"
  "wheelchair"       → "Auf Rollstuhl angewiesen"
  "bedridden"        → "Bettlägerig"

NACHTEINSAETZE:
  "none"             → "Keine"
  "rare"             → "Selten"
  "occasional"       → "Gelegentlich"
  "multiple"         → "Mehrmals nachts"
  null               → "Nicht angegeben"

GEWUENSCHTER_START / care_start_timing:
  "immediately"      → "Sofort (4–7 Tage)"
  "1_2_weeks"        → "In 1–2 Wochen"
  "2_4_weeks"        → "In 2–4 Wochen"
  "later"            → "Später / noch flexibel"

DEUTSCH_LEVEL:
  "basic" / "level_1" / "level_2"  → "Grundlegend"
  "good" / "level_3"               → "Gut"
  "very_good" / "level_4"          → "Sehr gut"
  "fluent" / "level_5"             → "Fließend"

ERFAHRUNG:
  "no_preference"    → null  (Zeile ausblenden oder „nicht angegeben")
  "some"             → "Erste Berufserfahrung"
  "experienced"      → "Mehrjährige Erfahrung"
  "specialized"      → "Spezialisierte Erfahrung"
```

> Mappings sind Vorschläge, gerne final mit dem echten Enum-Set aus dem Anfrage-Formular abgleichen. Die Logik: Roh-Wert verschwindet, menschlicher Text steht in der Mail.

---

## Conditional-Logik

- **Erfahrung-Zeile:** Bei `null`/`"no_preference"` zwei Optionen: (a) Zeile komplett ausblenden, (b) als graue Zeile „nicht angegeben" stehen lassen. **Empfehlung:** Ausblenden — sauberer, kein „leerer" Eindruck.
- **Führerschein-Zeile:** Bei `null` ausblenden. Bei `true`/`false` zeigen.
- **Weitere Personen im Haushalt:** Immer zeigen (auch wenn „Nein") — ist für Pflegekraft relevant.

---

## Geänderte / entfernte Elemente vs. alter Mail

| Element | Alt | Neu |
|---|---|---|
| Subject | „Ihr persönliches Angebot zur 24-Stunden-Betreuung – Primundus" | „Ihr Angebot zur 24-Stunden-Betreuung – Primundus" (ohne „persönliches") |
| Begrüßungstext | *„Auf Grundlage Ihrer Angaben…"* | *„Auf Basis Ihrer Angaben…"* (weniger Beamtensprache) |
| Preis-Anzeige | Nur Monatssatz + Eigenanteil prominent | **Tagessatz + Monatssatz nebeneinander**, Eigenanteil als Nebeninfo unter Monatssatz |
| Zusatzkosten-Hinweis | nicht vorhanden | *„zzgl. ca. 125 € Anreise- und Abreisekosten je Strecke sowie Kost und Logis"* |
| Trust-Häkchen-Bar (3 Häkchen oben) | vorhanden | **gestrichen** — durch Trust-Statement-Block ersetzt |
| Trust-Statement | nicht vorhanden | Eigene Sektion in Preis-Bühne: *„100 % risikofrei — tagesgenau, ohne Vertragsbindung…"* |
| Bestpreis-Garantie | Kleines P.S. ganz unten | **Prominenter Block in Preis-Bühne**, beide Sätze gleichgewichtig |
| Schritt 1 Wording | *„Pflegekräfte ansehen – jederzeit möglich"* | *„Angebot und erste Pflegekräfte ansehen"* (Angebot zuerst) |
| Schritt 2 Wording | *„…Voraussetzung für den nächsten Schritt."* | *„…Dauert wenige Minuten."* (weicher) |
| Schritt 3 Wording | *„sobald die Patientendaten vollständig sind"* | *„…mit Anreisedatum und Reisekosten"* (Brücke zu Mail 12) |
| Roh-Werte in Tabelle | `first_person`, `level_3`, `immediately` als Klartext sichtbar | **Mapping zu lesbaren Begriffen** (siehe oben) |
| Tabellen-Struktur | Eine flache Liste | **Zwei Sektionen** mit eigenen Überschriften, wie im Anfrage-Formular |
| Persönlicher Schlusssatz | nicht vorhanden | Neuer Satz vor Grüßen: *„Wenn Sie Fragen haben oder Unterstützung möchten…"* |
| Visuelles Design | 4 verschiedene Akzentfarben + Badges + Häkchen | **Eine beige „Preis-Bühne"** vereint Preise, Trust und Bestpreis. Nur ein farbiger Akzent: der grüne CTA-Button. |
| CTA-Button | Schlicht | Etwas größer, Padding, sanfter Gradient + dezenter Schatten |

---

## Hinweise für Claude Code

1. **HTML 1:1 übernehmen** — Layout, Farben, Spacing sind bewusst gesetzt. Nur die im Tag `data-token` oder den Platzhaltern markierten Stellen ersetzen.
2. **Mappings zentralisieren:** Idealerweise in `lib/labels.ts` (oder ähnliche Datei) sammeln, damit andere Mails dieselben Mappings nutzen können (07–10 und Mail 12 brauchen z.B. dasselbe Deutsch-Level-Mapping).
3. **Subject im Code anpassen** — steht nicht in HTML.
4. **Tabellen-Conditional:** Bei `null`-Werten Zeilen rausrendern statt mit „nicht angegeben" zeigen.
5. **Bildpfade** in HTML zeigen auf `kostenrechner.primundus.de/images/...` — wenn das so passt, lassen. Falls die offizielle Asset-Domain wechselt, hier zentral ersetzen.
