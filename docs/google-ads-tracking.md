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

## Schritt 1 — UTM-Suffix im Ads-Konto (ERLEDIGT 14.08., via API)

Auf KONTO-Ebene (customer.final_url_suffix, Konto 924-028-6999) gesetzt:

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}
```

- Suffix, NICHT Tracking-Vorlage — bricht paralleles Tracking nicht;
  gilt automatisch für alle (auch künftige) Kampagnen, solange keine
  Kampagne ein eigenes Suffix setzt.
- Auto-Tagging (`gclid`) war bereits aktiv — der Code liest `gclid`
  zusätzlich (PR #444).
- Ab sofort sind Ads-Sessions in `analytics_sessions` an
  `utm_medium='cpc'` erkennbar; `utm_campaign` trägt die Kampagnen-ID
  (Mapping auf Namen per API/GAQL).

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

## Schritt 3 — Offline-Import qualifizierter Leads (AUTOMATISIERT seit 14.08.)

Läuft ohne manuelles Zutun: Edge Function
`supabase/functions/upload-offline-conversions` (Cron täglich 06:20 UTC,
Migration `20260814121000`) lädt das jeweils ERSTE `patient_data_saved`
jedes Leads mit Klick-ID (gclid > wbraid > gbraid) per
`uploadClickConversions` in die Conversion-Aktion
**„Qualifizierter Lead (Patientendaten)"**
(`customers/9240286999/conversionActions/7720728390`, type UPLOAD_CLICKS,
category QUALIFIED_LEAD, ONE_PER_CLICK, 90-Tage-Fenster — angelegt
14.08.2026 via API). Details:

- **Secondary** (`primaryForGoal=false`): erscheint in Berichten
  („Alle Conversions"), beeinflusst Smart Bidding NICHT. Primär schalten
  ist eine bewusste Bidding-Entscheidung (Google Ads → Ziele), erst nach
  2–3 Wochen Datenlage.
- Conversion-Wert = Monats-Bruttopreis aus `leads.kalkulation` (EUR),
  Bestell-ID = `lead_id` (Google-seitige Dedup).
- Status je Lead in `offline_conversion_uploads` (uploaded /
  permanent_failure mit Fehlercode); Leads ohne Zeile = offen, werden
  täglich erneut versucht (z. B. TOO_RECENT_CLICK). 6h-Mindestabstand
  zum Event ist eingebaut.
- Secrets (nur Prod): `GOOGLE_ADS_DEVELOPER_TOKEN`,
  `GOOGLE_OAUTH_CLIENT_ID/_SECRET/_REFRESH_TOKEN` — fehlen sie
  (Staging), antwortet die Function 200 `{skipped}`.
- Manueller Lauf / Probelauf:
  `curl -X POST -H "Authorization: Bearer <service_role_key>" -H "Content-Type: application/json" -d '{"dryRun":true}' https://ycdwtrklpoqprabtwahi.supabase.co/functions/v1/upload-offline-conversions`

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
