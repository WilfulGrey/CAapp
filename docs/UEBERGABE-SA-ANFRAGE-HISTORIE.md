# Übergabe an eine Session in `mamamia-sadash`: erneute Anfragen in der Historie

Von der Kostenrechner-Session („Pm.de, kostenrechner, CAapp, Mails“), 06.10.2026, im Auftrag von Martin.
Gegenstück im CAapp-Repo: PR WilfulGrey/CAapp#779, Registry #113.
Laut `mamamia-sadash/CLAUDE.md` ändert jede Session nur ihr eigenes Repository. Deshalb hier die Übergabe statt einer Änderung von außen.

## Worum es geht

Kunde 11228 (Beatrix Englberger, Job 1) hat am 05.10. angefragt: 2.600 €. Am 06.10. hat er erneut angefragt, mit „Weitere Personen im Haushalt: Ja“: 2.800 €.

Das SA-Portal zeigt davon heute nur einen Eintrag ganz unten in der Historie: „Anfrage über das Kundenportal — Angebot 2.800 €“, datiert auf den 05.10. Das Popup zeigt die Angaben der zweiten Anfrage.

Grund: `PortalIntakeController` liest `leads.kalkulation`, und die überschreibt der Kostenrechner bei jeder Anfrage. `submittedAt` ist dagegen `leads.created_at`.

Martin am 06.10.2026:

> „Anfrage erneut gemacht und Angebot aktualisiert, und dann klicken wir auch wieder drauf und dann sehen wir, was der Kunde dann angefragt hat.“

**Ziel:**
- Je erneute Anfrage ein eigener Eintrag in den Aktivitäten, zum Datum der Anfrage, klickbar.
- Das Popup zeigt die Angaben und das Angebot dieser Anfrage und hebt hervor, was sich geändert hat.
- Der unterste Eintrag zeigt wieder die ursprüngliche Anfrage.

## Datenquelle (kommt mit CAapp #779)

Tabelle `lead_events` in der CAapp-Supabase. Die Brücke liest dort bereits `leads` mit `CAAPP_SUPABASE_SERVICE_KEY`.

```
event_type = 'anfrage_erneut'
lead_id    = Lead des Kunden (dieselbe Zuordnung wie CustomerOfferBridge::leadForCustomer)
created_at = Zeitpunkt der erneuten Anfrage
metadata = {                       (Beispielwerte)
  "quelle": "rechner" | null,
  "alt": { "bruttopreis": 2600, "eigenanteil": 1625.75, "formularDaten": { ... } },
  "neu": { "bruttopreis": 2800, "eigenanteil": 1824.75, "formularDaten": { ... } },
  "geaendert": [ { "key": "weitere_personen", "alt": "nein", "neu": "ja" } ],
  "preis_geaendert": true
}
```

**Regeln für das Ereignis**
- Es entsteht nur, wenn sich Angaben oder Preis geändert haben. Eine identische Wiederholung erzeugt keins.
- `alt` des **ersten** Ereignisses ist die ursprüngliche Anfrage.
- Gibt es kein Ereignis, gilt wie bisher `kalkulation.original ?? kalkulation`.
- `formularDaten` hat dieselbe Form wie heute in `kalkulation.formularDaten`. Die Beschriftung kommt aus `OfferFactorMapper::ANTWORT_LABELS`, wie in `labeledFields`.

**Ergebnis des Mamamia-Abgleichs, optional anzeigen.** Das ist ein eigenes Ereignis, Sekunden nach `anfrage_erneut`:

```
event_type = 'mamamia_abgleich_nach_anfrage'
metadata = { felder: [...], alt_preis, neu_preis, status: 'ok'|'error'|'skipped', message,
             job?: { status: 'aktualisiert'|'unveraendert'|'gebucht'|'ohne_anreise', alt, neu } }
```

**Alte Fälle:** Ereignisse gibt es erst ab dem Merge von CAapp #779. Für 11228 und alle früheren Fälle bleibt es beim heutigen Bild.

## Umzusetzen in mamamia-sadash

1. **`CustomerOfferBridge`:** neue Methode `reinquiriesForLead(string $leadId): array`.
   - Abfrage: `GET /rest/v1/lead_events?lead_id=eq.{id}&event_type=in.(anfrage_erneut,mamamia_abgleich_nach_anfrage)&select=event_type,created_at,metadata&order=created_at.asc`
   - Headers wie die vorhandenen Lesezugriffe.

2. **`PortalIntakeController::show`**, fail-soft: Ein Fehler beim Lesen der Ereignisse darf die Antwort nicht brechen.
   - **Ursprung:** Gibt es `anfrage_erneut`, kommen `price`, `eigenanteil` und `fields` aus `metadata.alt` des ersten Ereignisses. Sonst bleibt die heutige Logik.
   - **`submittedAt`** bleibt `lead.created_at`.
   - **Neu `updates`:** je `anfrage_erneut` ein Eintrag mit diesen Feldern:
     - `at` = created_at
     - `price` = neu.bruttopreis
     - `oldPrice` = alt.bruttopreis
     - `eigenanteil` = neu.eigenanteil
     - `fields` = labeledFields(neu.formularDaten)
     - `changed` = [{label, alt, neu}], beschriftet wie die Felder
     - `source` = quelle
     - `mamamia`: das nächste `mamamia_abgleich_nach_anfrage` danach, falls vorhanden
   - **Zugehörigkeitsprüfung** über den session-gescopten mamamia-Call bleibt unverändert und kommt zuerst.

3. **`CustomerDetail.vue`**
   - **Historien-Eintrag:** je `update` ein Eintrag mit Akteur „Kunde“ und Zeitstempel `at`. Er wird normal in die Historie einsortiert; nur der Ursprungs-Eintrag bleibt fest ganz unten.
   - **Text des Eintrags:**
     - mit Preisänderung: „Anfrage erneut über den Kostenrechner — Angebot 2.600 € → 2.800 €“
     - ohne Preisänderung: „… — Angaben geändert, Angebot 2.800 €“
   - **Popup:** Klick öffnet dasselbe Popup wie beim Ursprung, mit dem gewählten Stand.
     - Titel „Erneute Anfrage aus dem Kostenrechner“, Zeile „angefragt am 06.10.2026“.
     - Preis-Box wie beim Ursprung, darunter die Tabelle.
     - Geänderte Zeilen hervorheben, mit „vorher: Nein“.
   - **Mamamia-Ergebnis (optional):** eine Zeile wie „In Mamamia übernommen: Job 2.600 € → 2.800 €“. Bei `gebucht` bzw. `error` sichtbar: „nicht übernommen (Job gebucht)“ bzw. „Abgleich fehlgeschlagen, bitte prüfen“.
   - **Ursprungs-Eintrag:** zeigt jetzt den Preis der ursprünglichen Anfrage, für neue Fälle also 2.600 € statt 2.800 €.

4. **i18n** de/en/pl für die neuen Texte.

5. **Tests:** `tests/Feature/PortalIntakeTest.php` mit Bridge-Fake, mindestens diese Fälle:
   - Ursprung aus `alt` des ersten Ereignisses
   - `updates` in der richtigen Reihenfolge, mit `changed`
   - ohne Ereignisse wie heute
   - Fehler beim Lesen der Ereignisse: Antwort wie heute, ohne `updates`
   - fremder Kunde: weiterhin `found: false`

6. **Vorschau für Martin vor jeder Freigabe:** Screenshot der Historie und des Popups an einem Beispiel auf beta. Das ist Martins feste Regel: erst gerenderte Vorschau, dann Freigabe.

7. **Release:** PR nach `main` (beta). `production` nur auf Martins ausdrücklichen Wunsch, per Fast-Forward wie in `CLAUDE.md` beschrieben.

## Reihenfolge

Die SA-Änderung ist rein additiv: Ohne Ereignisse sieht alles aus wie heute. Sie kann deshalb vor oder nach CAapp #779 gemergt werden. Sichtbar wird sie erst bei der ersten erneuten Anfrage nach dem Merge von #779.

## Nebenbei aufgefallen (nicht Teil dieses Auftrags)

**Kommentar in `PortalIntakeController`:** Dort steht „Die Anfrage-Historie zeigt IMMER die ursprünglichen Lead-Daten“. Das stimmt nur für Anpassungen über `OfferAdjust`, nicht für erneute Anfragen über den Kostenrechner. Das sollte dort korrigiert werden.

**Berater-Anpassung wird überschrieben:** Fragt ein Kunde mit identischen Angaben erneut an, überschreibt der Kostenrechner eine Berater-Anpassung, also `kalkulation.original` samt angepasstem Preis. Das betrifft das CAapp-Repo; die Kostenrechner-Session nimmt es dort auf.
