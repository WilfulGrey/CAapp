# PostHog — Kostenrechner und Kundenportal

Stand 11.09.2026. Projekt **271682**, Region **EU** (`eu.posthog.com`).

## Entscheidungen (Martin, 11.09.)

| Frage | Entscheidung |
|---|---|
| Region | EU |
| Umfang | Kostenrechner **und** Kundenportal (ein Besucher über beide Domains verfolgbar) |
| Sitzungsaufzeichnung | **an** — Clarity soll später abgeschaltet werden |
| Einwilligung | **cookielos vor der Zustimmung**, voll danach |

⚠️ Der letzte Punkt ist in Deutschland juristisch umstritten (TTDSG §25).
Er gehört vor dem Livegang vom Datenschutz freigegeben — siehe
[Vor dem Livegang](#vor-dem-livegang).

## Aufbau

```
Browser (Rechner)  ─┐
                    ├─►  kostenrechner.primundus.de/ingest  ─►  eu.i.posthog.com
Browser (Portal)   ─┘         (Next.js-Rewrite)                  eu-assets.i.posthog.com
```

- **Nie direkt an `*.posthog.com`.** Werbeblocker und Safari verwerfen das
  lautlos — derselbe Fehler, der im August alle iPhone-Besucher aus der
  eigenen Statistik genommen hat. Ein Test wacht darüber
  (`src/__tests__/posthogRegeln.test.ts`, „Kein direkter Schreibweg").
- Das Portal ist eine **statische** Render-Seite ohne Server und nutzt den
  Proxy des Rechners (`${KOSTENRECHNER_URL}/ingest`, gleiche Hauptdomain).
  Render-Rewrites auf fremde Hosts wären möglich, ob POST samt Inhalt
  durchgereicht wird, ist aber nicht dokumentiert.
- `next.config.js`: `skipTrailingSlashRedirect: true` ist Pflicht (PostHogs
  Endpunkte enden auf `/`, sonst 308 auf jeden POST). Die eingebaute
  Weiterleitung `/x/` → `/x` stellt eine eigene `redirects()`-Regel für alle
  Pfade außer `/ingest` wieder her — ohne sie gäbe es jede Seite doppelt.

| Datei | Rolle |
|---|---|
| `project 3/lib/posthog-regeln.ts` | **Alle Regeln**, rein, von beiden Apps importiert: Schlüssel, Hosts, Konfiguration, Token-Filter, Positivliste |
| `project 3/lib/posthog.ts` | Rechner: Start, Abgleich mit dem Cookie-Banner, `postHogErfassen`, `postHogIdentifizieren` |
| `project 3/components/AnalyticsProvider.tsx` | startet PostHog vor der eigenen Analyse |
| `project 3/lib/analytics.ts` | reicht `trackEvent` und `trackCriticalSubmit` an PostHog weiter |
| `src/lib/posthog.ts` | Portal: Start, Ereignisse, Identifizieren — **ohne** eigenen Einwilligungs-Abgleich |
| `src/main.tsx` / `src/lib/leadEvents.ts` | Start vor dem ersten Render / Weiterleitung von `reportLeadEvent` |

Der Projekt-Schlüssel (`phc_…`) steht im Code: er ist öffentlich und steht in
jeder ausgelieferten Seite. Als `NEXT_PUBLIC_`/`VITE_`-Variable fiele er
lautlos auf `''` und müsste in vier Render-Diensten gepflegt werden.

## Einwilligung

Quelle der Wahrheit bleibt **unser Cookie-Banner** (`project 3/lib/cookie-consent.ts`).

| Stand im Banner | PostHog |
|---|---|
| noch nicht entschieden | cookielos gezählt (`distinct_id = $posthog_cookieless`, kein Cookie, kein Speicher) |
| abgelehnt / widerrufen | cookielos gezählt |
| Analyse zugestimmt | voll: Besucher-ID, Cookies, Aufzeichnung, Identifizieren mit Lead-ID |

Mechanik — **im posthog-js-Quelltext 1.430 geprüft**, die Doku lässt es offen:
`cookieless_mode: 'on_reject'` **plus** `opt_out_capturing_by_default: true`.
`isRejected()` ist bei offenem Stand dann wahr, also zählt PostHog
Unentschiedene cookielos. Ohne das zweite Flag zählt `on_reject` sie **gar
nicht** — und das sind bei uns die meisten. `cookieless_mode: 'always'`
scheidet aus, dort ignoriert PostHog `opt_in_capturing()`.

**Portal:** kein eigener Banner. Der Einwilligungs-Merker liegt als Cookie
auf `.primundus.de` (`opt_out_capturing_persistence_type: 'cookie'` +
`cross_subdomain_cookie`), das Portal erbt ihn. Wer direkt aus einer Mail
kommt, ohne je im Rechner zugestimmt zu haben, wird im Portal cookielos
gezählt. Auf Staging (`*.onrender.com` ist Public Suffix) funktioniert die
Übergabe nicht — dort ist das Portal immer cookielos.

## Was an PostHog geht — und was nie

**Magic-Link-Token nie.** Er ist der Zugang zum Kundenkonto. Drei Schichten:
1. `get_current_url` maskiert die Adresse an der Quelle (Kern und Recorder).
2. `before_send` säubert jedes Ereignis, auch Aufzeichnungs-Schnipsel
   (Link-Attribute im DOM: Vertrags-PDF, Einsatz-Übersicht).
3. `custom_personal_data_properties: ['token']` für Kampagnen-/Einstiegsdaten.

**Gesundheitsdaten nie.** Eigene Ereignisse laufen durch eine
**Positivliste** (`erlaubteEigenschaften`): `step`, `step_name`,
`time_on_step_seconds`, `source`, `depth`, `mail_source`,
`location_unresolved`. Antworten (`answer` = Pflegegrad, Mobilität …),
Telefon, PLZ, Ort, Pflegekraft-Namen kommen nicht durch. Autocapture ohne
Texte und Attribute (`mask_all_text`, `mask_all_element_attributes`).

**Aufzeichnung:** Eingaben immer maskiert. Im **Portal alle Texte**
(`maskTextSelector: '*'`) — dort stehen Namen, Adressen, Pflegegrad, Demenz,
Inkontinenz. Im Rechner bleibt der Marketingtext lesbar.

**Identifizieren** nur mit Zustimmung, und nur mit der **Lead-ID** (UUID) —
nie Name, E-Mail, Telefon oder Token.

## Ereignisse

| Ereignis | App | Woher |
|---|---|---|
| `$pageview`, `$autocapture` | beide | PostHog selbst |
| `wizard_opened`, `wizard_visible`, `step_view`, `step_complete`, `step_back`, `scroll_depth`, `consent_choice` | Rechner | `analytics.trackEvent` |
| `step_complete` (Schritt 9) + `angebot_angefordert` | Rechner | `analytics.trackCriticalSubmit` (sofort, sendBeacon — danach folgt der Redirect) |
| `portal_opened`, `portal_reopened`, `patient_form_step`, `patient_data_saved`, `caregiver_invited` … | Portal | `reportLeadEvent` |

Super-Eigenschaften an jedem Ereignis: `app` (`kostenrechner`/`kundenportal`)
und `umgebung` (`prod`/`test`).

## Prüfen

- PostHog startet nur auf `kostenrechner.primundus.de` und
  `kundenportal.primundus.de`. Auf Staging und localhost einmal
  **`?posthog=1`** an die Adresse hängen (gilt für die Browser-Sitzung).
  Dann: `umgebung = test`, Anfragen unkomprimiert, und die Instanz liegt
  unter **`window.__posthog`** (nur im Testlauf).
- In der Konsole:
  ```js
  const ph = window.__posthog
  ph.get_explicit_consent_status()   // pending | granted | denied
  ph.get_distinct_id()               // $posthog_cookieless ohne Zustimmung
  ph.on('eventCaptured', e => console.log(e.event, e.properties))
  ```
- Proxy von außen: `POST /ingest/e/` muss `{"status":"Ok"}` liefern (kein
  308), `/datenschutz/` muss per 308 auf `/datenschutz` gehen.

Lokal geprüft am 11.09.: beide Punkte oben, cookielos vor der Zustimmung
(kein Cookie, `$posthog_cookieless`), voll nach „Alle akzeptieren",
Portal erbt `granted`, Token weder in Ereignissen noch in Cookies.

## Stolperfallen (alle im Test vom 11.09. aufgetaucht)

- **Super-Eigenschaften gehen beim Umschalten verloren.** PostHog baut den
  Speicher bei cookielos ↔ voll neu auf — `app`/`umgebung` fehlten danach an
  jedem Ereignis. `einwilligungAbgleichen` registriert sie nach jedem Wechsel neu.
- **Nachgeholte Ereignisse** (`replayed_after_consent`) gehen nicht an
  PostHog — es hat sie cookielos schon bekommen.
- `opt_in_capturing({ captureEventName: false })`, sonst zählt jeder
  Seitenaufruf eines Zustimmers ein weiteres `$opt_in`.
- `defaults` ist ein Literal-Typ (`'2026-05-30' as const`).
- Doppelte Maskierung ergab `token=***<masked>` — der Token-Filter lässt
  bereits maskierte Werte stehen.

## Voraussetzungen in PostHog (einmalig, im Konto)

- **Settings → Project → Web analytics → „Cookieless server hash mode"** —
  ohne ihn verwirft PostHog die cookielosen Ereignisse.
- **Settings → Project → Session replay → „Record user sessions"**.
- **Settings → Organization → Legal → DPA** (Auftragsverarbeitungsvertrag).

## Vor dem Livegang

- [ ] Datenschutzerklärung: Abschnitt PostHog (Anbieter, EU-Hosting,
      Zweck, cookielose Zählung ohne Einwilligung, Aufzeichnung nur mit
      Einwilligung, Widerruf über den Cookie-Banner im Rechner).
      **Wortlaut vorher Martin zeigen.**
- [ ] Freigabe der cookielosen Zählung durch den Datenschutz.
- [ ] DPA abgeschlossen, beide Schalter oben an.

## Offen

- **Clarity abschalten**, sobald PostHog-Aufzeichnungen tragen (GTM-Tag).
- **Clarity bekommt heute den Magic-Link-Token als Nutzer-ID**
  (`src/lib/clarity.ts`, `project 3/lib/clarity.ts`) — also den Kontozugang.
  Unabhängig von PostHog zu beheben.
- Die ChatGPT-Verbindung zum PostHog-Konto (heute angelegt) ist ein
  zusätzlicher Datenweg zu OpenAI, sobald Kundenaufzeichnungen dort liegen.
