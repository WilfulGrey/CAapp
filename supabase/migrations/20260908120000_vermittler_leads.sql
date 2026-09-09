/* ─── Vermittler-Leads (Pflegena) ────────────────────────────────────────
 *
 * Ein Vermittler schickt uns Anfragen fuer SEINE Kunden. Der Lead traegt
 * dann die Adresse des Vermittlers, nicht die des Endkunden — deshalb
 * greift die E-Mail-Deduplizierung von findOrCreateLead nicht mehr, und
 * die zwei Dinge, die sie bisher nebenbei erledigte, brauchen ein eigenes
 * Zuhause.
 *
 * ALLE Aenderungen sind additiv und nullable (Heilige Regel Nr. 3): der
 * aktuell laufende Code ignoriert die Spalten, der neue benutzt sie.
 */

-- WELCHER Vermittler. Gleichzeitig der Schalter fuer die fuenf Bremsen
-- (Bewertungsrunde, Auto-Reject, neue_pflegekraefte_verfuegbar, Mail A-D,
-- "Neuen Link senden"): `if (lead.vermittler)` — eine Zeile, ohne Praefix-
-- Parsing und ohne Kopie der Portal-Liste auf der Deno-Seite.
alter table leads add column if not exists vermittler text;

-- Message-ID der Anfrage-Mail = Idempotenz-Schluessel. Ohne ihn wuerde ein
-- Lauf, dessen posteLead glueckte und dessen portal_mail_log-Schreiben
-- scheiterte, beim naechsten Takt ein ZWEITES Angebot an den Partner
-- schicken (dieselbe Fehlerklasse, die frueher die \Seen-Flagge hatte).
alter table leads add column if not exists quelle_nachricht_id text;

-- Partial: Leads ohne Message-ID (alle bestehenden, und Mails, die keine
-- tragen) kollidieren nicht miteinander.
create unique index if not exists leads_quelle_nachricht_id_uniq
  on leads (quelle_nachricht_id) where quelle_nachricht_id is not null;

-- Zaehler fuer transiente Fehlversuche. Der Abholer liest eine Mail mit
-- Status 'offen' in JEDEM Takt erneut; beim Vermittler kostet jeder dieser
-- Versuche einen LLM-Aufruf. Ab 5 wird die Mail 'abgelehnt' (plus Team-
-- Mail) statt fuer immer im Minutentakt bezahlt zu werden.
-- NOT NULL mit DEFAULT ist fuer den alten Code unsichtbar (er schreibt die
-- Spalte nie, der Default greift).
alter table portal_mail_log add column if not exists versuche integer not null default 0;
