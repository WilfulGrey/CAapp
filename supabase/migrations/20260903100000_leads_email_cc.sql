-- Zweite Empfängeradresse je Lead (Martin, 03.09.2026: "damit alle Mails
-- auch an beide Adressen gehen" — z. B. die Tochter liest mit).
--
-- Bewusst eine EIGENE Spalte statt Komma in leads.email: die Adresse ist
-- überall eine Identität (Lead-Dedupe per eq('email'), mamamia-Kunde,
-- Laravel-Validierung, Tippfehler-Wächter) — ein Komma-String bräche das
-- alles. Gesendet wird als CC: beide Adressen sehen einander (Entscheidung
-- Martin). Nullable ⇒ rückwärtskompatibel mit laufendem Code (Święta
-- zasada nr 3). Die Sender lesen die Spalte fail-soft — fehlt sie noch,
-- geht die Mail wie bisher nur an leads.email.

alter table leads
  add column if not exists email_cc text;

comment on column leads.email_cc is
  'Zweite Empfängeradresse (CC) für ALLE Kundenmails. Gepflegt im SA-Portal (Kontakt-Sync) und im CAapp-Admin. Nie Teil der Lead-Identität.';
