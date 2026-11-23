# Meta Ads (Facebook und Instagram) — Messkette

Stand: 23.11.2026. Schwesterdokument zu [openai-ads-tracking.md](openai-ads-tracking.md)
und [google-ads-tracking.md](google-ads-tracking.md).

## Was läuft

Anzeigen laufen im Meta-Werbeanzeigenmanager, Werbekonto „Primundus"
(`1357917132982741`, Business-Portfolio Primundus `1384211821436967`),
Kampagne „Primundus Start 11-2026 (Traffic)", Ziel Landingpage-Aufrufe auf
`kostenrechner.primundus.de`. Jede Anzeige hängt
`utm_source=facebook&utm_medium=paid_social&utm_campaign=meta-start-2026-11&utm_content={{ad.name}}`
an; der Rechner speichert diese Werte an jeder Anfrage (`lib/analytics.ts`
`AD_PARAM_KEYS` → `angebot-anfordern` `HERKUNFT_KEYS`), **auch ohne
Cookie-Zustimmung**. Das ist die vollständige Zählung der Meta-Anfragen; der
Pixel sieht nur die Besucher mit Marketing-Einwilligung.

| | |
|---|---|
| Pixel-ID | `2358395084910089` (Datensatz „Primundus Kostenrechner") |
| SDK | `https://connect.facebook.net/en_US/fbevents.js` |
| Lader | `project 3/app/layout.tsx`, Script-ID `meta-pixel-consent` |
| Ereignis | `project 3/lib/meta-pixel.ts` → `meldeMetaAnfrage()` |
| Auslöser | `components/calculator/MultiStepForm.tsx` und `app/result/page.tsx` (neben `meldeAnfrage` des OpenAI-Pixels), `public/pria.html` + generiertes `pria-widget.js` |
| Test | `src/__tests__/metaPixel.test.ts` |

## Einwilligung

Wie beim OpenAI-Pixel: Schalter **„Marketing"** des Cookie-Banners
(`primundus_cookie_consent`, zweite Quelle Cookie `pm_consent`). Ohne
Einwilligung wird `fbevents.js` **gar nicht geholt** — es setzt beim Start
`_fbp` (und mit `fbclid` in der URL `_fbc`). Deshalb gibt es auch **kein**
`<noscript>`-Bild aus Metas Standard-Schnipsel: das würde ohne jede Wahl senden.

- **Zustimmung** (beim Laden oder später über `cookie-consent-changed`) →
  laden, `set autoConfig false`, `init`, `PageView`.
- **Widerruf** → `consent revoke`; eine erneute Zustimmung → `consent grant`.

## Was an Meta geht

- `PageView` beim Laden des Pixels.
- `Lead` nach abgeschickter Anfrage: `{ value: 20, currency: 'EUR' }`, `eventID`
  = leadId. Wert = feste Staffelung aus `lib/oaiq.ts` (`WERT_ANFRAGE_EUR`), in
  **ganzen Euro** (anders als OpenAI, das Cent erwartet).

Nicht an Meta: Antworten aus dem Rechner (Pflegegrad, Mobilität, Nacht sind
Gesundheitsangaben), Name, E-Mail, Telefon, Preis. `autoConfig` ist aus, damit
das SDK nicht selbst Knopf-Klicks und Seitendaten einsammelt. Die automatische
erweiterte Abgleichung („Automatic Advanced Matching") liest Formularfelder aus
und wird im **Events Manager** geschaltet, nicht im Code — dort muss sie für
diesen Datensatz **aus** bleiben.

Datenschutzerklärung: `app/datenschutz/page.tsx` Abschnitt 8, Absatz
„Meta-Pixel".

## Offen

- **Server-Weg (Conversions API):** Meta hängt an jeden Anzeigenklick `fbclid`
  an. Der Rechner speichert es heute nicht (`AD_PARAM_KEYS`). Für eine
  Messung über die ca. 6 % mit Einwilligung hinaus wäre das der nächste
  Schritt — wie `oppref`/`openai-conversions` (Registry #64), mit eigener
  Datenschutzentscheidung.
