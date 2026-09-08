-- Zweite Telefonnummer je Lead (Michał, 07.09.2026: eingekaufte Portal-Leads
-- tragen oft Festnetz UND Mobil — bisher ging die zweite Nummer verloren).
--
-- Quelle: NUR der HTML-Teil der Pflegehilfe-Mail (Festnetz:/Mobil: als
-- tel:-Links im Block „Kontaktinformationen des Interessenten“); die CSV hat
-- eine Phone-Spalte, der text/plain-Teil keine. Eigene Spalte statt Komma in
-- leads.telefon: die Nummer geht 1:1 an mamamia (Customer.phone), Team-Mails
-- und Rueckruf-Logik — ein Komma-String braeche das. mamamia kennt nur EINE
-- Nummer; telefon_2 bleibt bei uns (Admin Kostenrechner). Nullable ⇒
-- rueckwaertskompatibel mit laufendem Code (Święta zasada nr 3); der Eingang
-- schreibt die Spalte als eigenes best-effort Update.

alter table leads
  add column if not exists telefon_2 text;

comment on column leads.telefon_2 is
  'Zweite Telefonnummer (Portal-Leads: Festnetz+Mobil aus dem HTML-Teil der Pflegehilfe-Mail). Nur bei uns — mamamia kennt eine Nummer. Nie Teil der Lead-Identität.';
