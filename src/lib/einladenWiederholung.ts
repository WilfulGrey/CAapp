// Stille Wiederholungen beim Einladen (StoreRequest über mamamia-proxy inviteCaregiver), solange mamamia direkt nach dem
// Speichern der Pflegesituation kurz ablehnt („Unauthorized", cat=authorization; Registry #102: „the invite would succeed
// 5-15s later", 6 manuelle Prod-Tests). Wiederholt wird NUR diese Form, alles andere scheitert sofort (CustomerPortalPage).
//
//  - Knopf von Hand: 3 Versuche im Abstand von 5 s (0/5/10 s). Zwischen Speichern und Tipp liegt meist Zeit.
//  - automatisch nach dem ersten Speichern (Registry #145, die Vorgemerkten): startet ca. 1 s nach updateCustomer, also
//    mitten in der Sperre. Darum 6 Versuche (0–25 s, das ursprüngliche Budget aus #102) — deckt 5–15 s mit Abstand.
//    Fehlversuche kosten nichts von der Grenze 5 je Stunde: der Proxy zählt erst nach mamamias Erfolg
//    (actions.ts, recordInviteAttempt).
export const EINLADEN_ABSTAND_MS = 5000;
export const EINLADEN_VERSUCHE = 3;
export const EINLADEN_VERSUCHE_NACH_SPEICHERN = 6;
