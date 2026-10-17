# Primundus: Profilabschluss statt Preiseinstieg — Gegenprüfung für Claude

Datum: 2026-10-17. **Status: experimenteller Git-Branch, NICHT live.**

## Verbindliche Geschäftsentscheidung
- Primäre Portal-Conversion: **erstmals vollständig gespeichertes Patientenprofil** (`patient_data_saved`, kein bloßer Klick auf 'Einladen').
- Einladung/Bewerbung: Motivation und nachgelagerter Flow, kein Optimierungsziel.
- Positionierung: 6× Testsieger bei DIE WELT (laut Geschäftsführung rechtlich/faktisch geprüft), sofort passende Pflegekräfte **ansehen**, Bestpreisgarantie, täglich kündbar, Direktanbieter ohne Vermittlungsgebühr, Anreise ab 3 Tagen **möglich**. Preis bleibt sichtbar, aber nicht als Aufhänger.
- Google/Ads: Impression → Klick → Anfrage → gespeichertes vollständiges Patientenprofil. **Keine Buchungs-KPI.** Kosten-Suchanfragen weiterhin mit Kosten-Intent bedienen.
- Bewährten Rollback Registry #122 beibehalten. In `src/components/portal/EinstiegVorSpeichern.tsx` existiert bereits eine Optimierung von 10.10. nach dokumentiertem Profilabschluss-Einbruch (42/151 zu 2/48; Kohorten/Kanäle genau prüfen). Keine breite UX-Änderung ohne Experiment.

## Hier umgesetzte Preview
- `src/components/portal/EinstiegVorSpeichern.tsx` nur bei `?usp=pflegekraefte` zusätzliche Trust-/Auswahl-Copy; Default unverändert.
- Header: "Passende Pflegekräfte für Ihre Familie" plus "6× Testsieger bei DIE WELT · Mit Bestpreisgarantie".
- Angebotskarte mit täglich kündbar, Direktanbieter ohne Gebühr, Anreise ab 3 Tagen, freie Entscheidung.
- Matching und Profilbereich erklären Zweck des Ergänzens, ohne vermeintlich schon eingegangene Bewerbungen vorzutäuschen.
- Kein Backend-/Migrations-/Cron-/Tracking-Write.

## Bereits vorhandene Messdaten **unbedingt benutzen**
- `supabase/functions/daily-analytics-report/`: Cron, Email "Primundus Daily", `DAILY_REPORT_RECIPIENTS`; `fetchDailyStats`, `lead_events` und `patient_data_saved`.
- `docs/google-ads-tracking.md`: qualifizierter Lead = erstes `patient_data_saved`; Google-Ads-Offline-Conversion (90 EUR), derzeit SECONDARY.
- `project 3/app/admin/wachstum`: fertige Profile pro Tag, getrennt eigene/gekaufte Anfragen.
- `src/lib/leadEvents.ts` und `onMesspunkt={messen}`: Micro-Events vor Profilabschluss.

## Bitte unabhängige Prüfung durch Claude
1. Ist `integration/mamamia-onboarding` wirklich das operative Repo/Branch für beide produktiven Domains? `CLAUDE.md` sagt ja; Preview soll nichts live verändern.
2. Prüfe Layout- und TS-/Vitest-Build der Preview; gerade 360px/390px. Prüfe ob Copy im Kontext redundant ist oder zu früh das Ziel verdeckt.
3. Profilabschluss-Definition: zähle je Lead erstes erfolgreiches `patient_data_saved` (Server), nicht nur `updateCustomer`-Versuch; prüfe E-Mail und daily-report und den periodischen Query-Mechanismus, eventuelle Dubletten.
4. Prüfe ROLLBACK vs Experiment auf echte zusammenhängende Kohorten: Ad/organic und Suchbegriff, gleiche Fenster, eindeutige Leads; kläre, ob mehr USPs helfen oder der Profil-CTA verschwindet.
5. Bewertung, ob neue Headline vor Anzeige der Karten die Zahl tatsächlich gefundener/ladender Pflegekräfte korrekt repräsentiert. Fallback bei null Vorschlägen.
6. Testvorschlag: stabile Zuteilung per anonymem Variant-Key/Lead ID, serverseitiges `profile_saved` nach Variante, keine Query-Parameter-GTM-Leaks und kein Consent-Bypass. **Nicht** selbst live deployen.
7. Nach Prüfbericht Gegenmeinung als Kommentar an dem Entwurfs-PR hinterlegen. Bitte keine unkommentierten weiteren Textänderungen.

## Sicherheitsregeln
- Keine echten Lead-Tokens in GitHub/PR/Mails.
- Prod-Deployment über Merge läuft automatisch; PR bleibt DRAFT. Kein Merge ohne explizite Freigabe.
- Fragen nach patient profile analytics nicht mit dem älteren `marcinwysocki007/CAapp`-Prototyp beantworten; operativ ist `WilfulGrey/CAapp`.
