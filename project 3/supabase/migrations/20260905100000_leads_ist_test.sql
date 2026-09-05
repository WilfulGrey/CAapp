-- Testleads kennzeichnen statt loeschen (Martin, 05.09.2026: „koennen wir beim
-- kostenrechner leads auch loeschen, wenn das zb testleads waren" → Entscheidung:
-- markieren und ausblenden, umkehrbar, UND aus der Statistik nehmen).
--
-- Warum nicht loeschen: an einem Lead haengen 14 Tabellen. Elf raeumen sich selbst
-- auf, zwei (vertraege, chat_conversations) blockieren absichtlich. Ein Flag ist
-- umkehrbar und nimmt niemandem die Moeglichkeit, spaeter doch zu loeschen.
alter table leads add column if not exists ist_test boolean not null default false;

comment on column leads.ist_test is
  'Testlead (Martin, 05.09.2026): bleibt in der Datenbank, verschwindet aber aus Admin-Liste, Statistik und Berichten. Umkehrbar.';

-- Nur die wenigen Testleads indizieren, nicht die Mehrheit.
create index if not exists leads_ist_test_idx on leads (ist_test) where ist_test;
