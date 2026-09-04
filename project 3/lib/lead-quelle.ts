/**
 * Betreff-Zusatz der Team-Mail „Neuer Lead" je nach Herkunft.
 *
 * Martin, 03.09.2026: Das Team soll am Betreff sehen, woher der Lead kommt —
 * „Neuer Lead – Pflegehilfe.org", „… Kostenrechner Formular", „… Kostenrechner
 * Chat". Die Information stand bisher nur im Feld „Kam über" IN der Mail.
 *
 * Rohwerte, die es wirklich gibt (leads.source bzw. `quelle` des Requests):
 *   rechner, rechner:kosten-berechnen, rechner:sofortangebot   Formular
 *   kostenrechner-result (alt)                                  Formular
 *   pria-chat, chat:kosten-berechnen, chat:sofortangebot        Chat
 *   portal:pflegehilfe.org, portal:pflegebund.eu                Portal-Domain
 *
 * Unbekanntes liefert null — dann bleibt der bisherige Betreff
 * „Neuer Lead – Angebot angefordert" stehen, statt etwas zu erfinden.
 */
export function quelleBetreff(quelle: string | null | undefined): string | null {
  const q = String(quelle ?? '').trim().toLowerCase();
  if (!q) return null;
  if (q.startsWith('portal:')) {
    const domain = q.slice('portal:'.length).trim();
    return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : null;
  }
  if (q === 'rechner' || q.startsWith('rechner:') || q === 'kostenrechner-result') return 'Kostenrechner Formular';
  if (q === 'pria-chat' || q.startsWith('chat:')) return 'Kostenrechner Chat';
  return null;
}
