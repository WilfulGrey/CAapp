# Google-Ads-Tracking für kostenrechner.primundus.de

Stand 14.08.2026 (SEA-Lauf 1, Bug #33). Ziel: Ads-Traffic von Organik
trennen und Google echte Leads als Conversions zurückmelden, damit Smart
Bidding auf Leads statt Klicks optimiert.

## Was der Code bereits kann (nach PR „SEA-Tracking")

| Baustein | Wo | Status |
|---|---|---|
| `utm_source/medium/campaign` auf `analytics_sessions` | `lib/analytics.ts` (Insert) | seit jeher |
| `utm_term/utm_content` + `gclid/wbraid/gbraid` auf `analytics_sessions` | `lib/analytics.ts` `persistAdParams()` (best-effort Update) | Bug #33 |
| Klick-IDs auf `leads` (`gclid/wbraid/gbraid`) | `angebot-anfordern/route.ts` (allowlist + best-effort Update) | Bug #33 |
| dataLayer-Event `angebot_erfolgreich` (lead_id, conversion_value, pflegegrad, care_start_timing) | `MultiStepForm.tsx` nach Server-Erfolg | seit jeher |
| GTM-sicherer Redirect (`eventCallback` + `eventTimeout 700` + Safety 900 ms) | `MultiStepForm.tsx` | Bug #33 |
| Submit-Tracking redirect-fest (sendBeacon → `/api/analytics/critical-event`) | `lib/analytics.ts` + neue API-Route | Bug #33 |
| GTM-Container `GTM-59V6N7RC` + GA4 `G-W2QEQ18EE7` | `app/layout.tsx` | seit jeher |

Migration: `supabase/migrations/20260814090000_ad_click_ids.sql`
(nullable-Spalten; Code ist fail-soft, aber ohne Migration fehlt die
Attribution).

## Schritt 1 — UTM-Suffix im Ads-Konto (Martin, ~5 Min)

Google Ads → Konto-Ebene (oder pro Kampagne) → **Einstellungen →
Kampagnen-URL-Optionen → Suffix der finalen URL**:

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}
```

- Suffix, NICHT Tracking-Vorlage — bricht paralleles Tracking nicht.
- Auto-Tagging (`gclid`) eingeschaltet lassen (Konto-Einstellung
  „Automatisches Tagging" = Ja) — der Code liest `gclid` zusätzlich.
- Wirkung sofort ab Speichern; ab dann sind Ads-Sessions in
  `analytics_sessions` an `utm_medium='cpc'` erkennbar.

## Schritt 2 — Bestehenden GTM-Tag erweitern (Martin, ~10 Min)

> **Befund SEA-Lauf 1 (API + Container-Analyse 14.08.):** Conversion-Aktion
> **und** GTM-Tag existieren BEREITS — nichts neu anlegen, sonst zählt
> alles doppelt!
>
> - Ads-Konto (924-028-6999) zählt in „Conversions" genau EINE Aktion:
>   **„DE – Angebot angefordert"** (WEBPAGE, ONE_PER_CLICK, primary).
>   „DE – Kalkulation Mail" ist sekundär (zählt nicht), „Anrufe über
>   Anzeigen" hatte 30 Tage lang 0.
> - Im Container GTM-59V6N7RC feuert der zugehörige Tag
>   (`AW-17906103518`, Label `yKlhCKnCx_wbEN7ppdpC`) auf dem
>   dataLayer-Event **`angebot_erfolgreich`** — also auf ECHTEN
>   erfolgreichen Submits. Die gemeldeten Conversions sind keine
>   Seitenaufruf-Inflation; Differenzen zu lead_events erklären sich
>   durch das 90-Tage-Klick-Fenster (Anzeigenklick → Tage später
>   organisch abgeschickt = zählt trotzdem als Ads-Conversion) und
>   dadurch, dass der Tag bis PR #444 im Redirect-Race ebenfalls
>   Conversions VERLOR.

Was am bestehenden Tag fehlt und ergänzt werden sollte (GTM →
Tags → der `__awct`-Tag auf `angebot_erfolgreich`):

1. **Conversion-Wert:** `{{dlv - conversion_value}}` (Datenschicht-
   variable anlegen, Pfad `conversion_value` = Monats-Bruttopreis),
   Währung EUR. In der Ads-Conversion-Aktion auf „Unterschiedliche
   Werte" stellen. → Voraussetzung, um später von Max. Conversions auf
   tROAS/Wert-Gebote zu wechseln.
2. **Bestell-ID:** `{{dlv - lead_id}}` — dedupliziert Mehrfach-Submits
   desselben Leads über Klicks hinweg.
3. Optional: **Enhanced Conversions** aktivieren (derzeit aus) — braucht
   gehashte E-Mail im dataLayer, separater Code-Schritt, erst später.
4. Vorschau testen → Veröffentlichen.
5. **Consent Mode:** Der Conversion-Tag unterliegt der
   Cookie-Einwilligung (Banner/`cookie-consent`). Prüfen, dass GTM
   Consent-Standardeinstellungen gesetzt sind (Consent Mode v2:
   `ad_storage`/`ad_user_data`), sonst modelliert Google die Conversions
   nur teilweise. Ggf. Datenschutzerklärung um Google-Ads-
   Conversion-Tracking ergänzen.

Der Code-seitige Redirect wartet via `eventCallback` max. ~900 ms auf den
Tag (PR #444) — vorher verlor auch dieser Tag einen Teil der Conversions
an den Sofort-Redirect. Nach dem Merge ist mit einem SPRUNG der
gemeldeten Ads-Conversions zu rechnen (Mess-Artefakt, kein echter
Anstieg — bei Vergleichen berücksichtigen).

## Schritt 3 (Ausbaustufe) — Offline-Import qualifizierter Leads

Sobald Klick-IDs auf `leads` liegen: `patient_data_saved`-Leads (=
qualifiziert) mit `gclid` als zweite Conversion-Aktion „Qualifizierter
Lead" importieren — CSV-Upload (Google Ads → Ziele → Conversions →
Uploads) oder später Google Ads API. Query-Basis:

```sql
select l.gclid, le.created_at, l.id
from lead_events le join leads l on l.id = le.lead_id
where le.event_type = 'patient_data_saved' and l.gclid is not null;
```

CSV-Spalten: `Google Click ID`, `Conversion Name`, `Conversion Time`
(Format `yyyy-MM-dd HH:mm:ss+02:00`), optional `Conversion Value` +
`Conversion Currency`. Frühestens ~4 h nach dem Klick hochladen, spätestens
innerhalb des Klick-Fensters (90 Tage).

## Messdefinitionen (für Auswertungen)

- **Lead** = `lead_events.event_type='email_eingangsbestaetigung_sent'`
  (unique `lead_id`).
- **Qualifizierter Lead** = `patient_data_saved`.
- **Ads-Session** = `analytics_sessions.utm_medium='cpc'` (nach Schritt 1);
  `gclid is not null` als Kreuzcheck.
- **Kontakt-Quote**: `step_complete(step=9)` zählt seit Bug #33 nur noch
  ERFOLGREICHE Submits (vorher: Feuern beim Klick inkl.
  Validierungsfehlern, dazu ~50 % Redirect-Verlust). Zeitreihen-Bruch am
  Deploy-Datum dieses PRs einplanen.
