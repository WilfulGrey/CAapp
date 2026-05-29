# Mail 03 — Nachfass 2

**Datei:** `mail-templates/03-nachfass-2.html`
**Code-Pfad:** `project 3/supabase/functions/send-scheduled-emails/index.ts`
**Builder:** `buildNachfass2Html(lead, siteUrl, portalBase)`

---

## Subject

| Variante | Subject |
|---|---|
| Standard | `Soll ich Ihnen bei den nächsten Schritten helfen?` |

Persönliche, beratende Frage — kein Werbe-Subject. Passt zum Ton der Mail (Ilka bietet Hilfe an).

---

## Trigger

72h nach Mail 01, wenn keine Aktion erfolgt ist (kein Portal-Login, keine Bewerbung, keine Antwort).

Reihenfolge der Nurture-Strecke: Mail 02 (24h) → Mail 05 (48h) → **Mail 03 (72h)** → Mail 04 (120h).

Stop-Logik: Sobald der Kunde aktiv wird (Login / Bewerbung / Antwort), entfällt diese und alle weiteren Nurture-Mails.

---

## Variablen

### Anrede

| Token | Quelle | Beispiel | Pflicht |
|---|---|---|---|
| `ANREDE_HALLO` | `"Hallo " + lead.salutation + " " + lead.lastName + ","` | `Hallo Frau Wendt,` | ja |

> **Anrede-Regel:** Mail 03 ist eine Nachfass-/Reminder-Mail → **„Hallo …"** (nicht „Guten Tag …", das gilt nur für die Haupt-Mails 01, 11, 12, 13, 14).

### Text-Link (statt CTA-Button)

| Token | Quelle | Beispiel | Pflicht |
|---|---|---|---|
| `PORTAL_URL` | `buildPortalUrl(portalBase, lead.token)` | `https://kundenportal.primundus.de/?token=…` | ja |

Kein Button. Stattdessen ein dezenter Text-Link (siehe „Aufbau").

---

## Aufbau (finale Struktur)

1. **Anrede** — `Hallo {Salutation} {Nachname},`
2. **Eröffnung** (persönliches Hilfsangebot von Ilka, Ich-Form):
   > *„vor ein paar Tagen haben Sie Ihr Angebot bekommen — und vielleicht hängt es gerade an einer konkreten Frage, dass Sie noch nicht weiter sind. Das passiert oft, und genau dafür bin ich da."*
3. **Fragen-Box** (beige `#FAF8F4`, Label „FRAGEN, DIE ICH OFT HÖRE", **ohne** Karte-Frame, **ohne** Häkchen) mit drei häufigen Fragen:
   - *„Wie funktioniert das mit den Patientendaten genau?"*
   - *„Welche Pflegekräfte passen wirklich zu unserer Situation?"*
   - *„Wie hoch sind am Ende die tatsächlichen Kosten?"*
4. **Text-Link** direkt unter der Fragen-Box:
   - Text: `Angebot & Pflegekräfte im Portal ansehen →`
   - Stil: `color:#8B7355; text-decoration:none; font-weight:700; font-size:14px;` (Markenbraun — identisch zum Profil-Link in der Pflegekraft-Karte, siehe `_caregiver-card.md`)
   - Position: zwischen Fragen-Box und Schlusssatz, `margin: 8px 0 24px`
5. **Persönlicher Schlusssatz** (Ich-Form, Kontext „zum Angebot"):
   > *„Wenn Sie Fragen zum Angebot haben — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da."*
6. **Grüße + Ilka-Signatur** (Standard-Signaturkarte wie Mail 01/02)

---

## Bewusst NICHT enthalten

| Element | Warum nicht |
|---|---|
| **CTA-Button (grün)** | Mail 03 braucht keinen Button — der Schlusssatz mit drei Wegen + der dezente Text-Link sind der CTA. |
| **Übergangs-Satz** *„Lassen Sie uns kurz telefonieren oder schreiben — 10 Minuten reichen meist."* | **Entfernt** — Doppelung zum persönlichen Schlusssatz darunter (beide bieten Telefon/Schreiben an). |
| **Bestpreis-Garantie-Box** | **Entfernt** — Mail 03 ist eine reine Ilka-Beratungs-Mail; der Werbe-Block bricht den persönlichen Ton. |

> **Abweichung zur Tranche-Spec:** `_tranche-2-und-3.spec.md` listete unter Mail 03 noch den Übergangs-Satz (Punkt 4) und die Bestpreis-Box (Punkt 6). Beide wurden auf Wunsch entfernt; stattdessen kam der Text-Link dazu. Diese Datei ist die maßgebliche Quelle für Mail 03.

---

## Tonalität

Beratend, persönlich, „ich kenne Ihre Situation und helfe gerne". Durchgängig **Ich-Form** (Ilka spricht) — kein „wir-versteckt-mich".

---

## Hinweise für Claude Code

1. **HTML 1:1 übernehmen** — Layout, Farben, Spacing sind bewusst gesetzt. Nur Anrede-Token und `PORTAL_URL` ersetzen.
2. **Anrede** über die zentrale Anrede-Funktion (`Hallo`-Variante für Reminder/Nachfass).
3. **Text-Link-Stil zentral** halten (gleicher Stil wie Profil-Link), damit Marken-Konsistenz gewahrt bleibt.
4. **Subject im Code** setzen — steht nicht in der HTML.
5. **Bildpfade** in der HTML zeigen auf `kostenrechner.primundus.de/images/...`.
6. **Footer-Abmelden-Link** ist enthalten (`/abmelden?token=…`).
