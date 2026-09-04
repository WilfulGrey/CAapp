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
 *   website:apex-startseite, website:apex-kosten, …             Primundus.de
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
  if (q.startsWith('website:')) return 'Primundus.de';
  return null;
}

/**
 * Website-Herkunft für das Feld „Kam über" in der Team-Mail (Martin,
 * 04.09.2026: „Mir reicht Primundus.de. Die genaue Unterseite kann dann in
 * der Mail stehen").
 *
 * Die Knöpfe auf primundus.de verlinken mit `src=apex-…`. Die Markierung
 * nennt den Baustein, nicht immer die Seite: `apex-components` ist der
 * gemeinsame CTA-Knopf auf allen Unterseiten. Deshalb hängen wir den Pfad
 * der verweisenden Seite an, wenn der Browser ihn mitgibt.
 */
export function websiteHerkunftLabel(quelle: string | null | undefined, pfad?: string | null): string {
  const q = String(quelle ?? '').trim().toLowerCase();
  const src = q.startsWith('website:') ? q.slice('website:'.length) : q;
  const BAUSTEIN: Record<string, string> = {
    'apex-startseite': 'Startseite',
    'apex-kosten': 'Seite /kosten',
    'apex-usp': 'USP-Block',
    'apex-components': 'Seitenbaustein',
    'apex-referrer': '',
  };
  const teile = ['Website primundus.de'];
  const baustein = BAUSTEIN[src] ?? (src.startsWith('apex-') ? src.slice('apex-'.length) : '');
  const p = String(pfad ?? '').trim();
  if (p && p !== '/') teile.push(p);
  else if (baustein) teile.push(baustein);
  return teile.join(' · ');
}

/** Rohwert der Quelle absichern: der Client schickt ihn, der Server entscheidet. */
export function quelleBereinigen(roh: unknown): string | null {
  const q = typeof roh === 'string' ? roh.trim() : '';
  return /^(rechner|chat|website)(:[a-z0-9\-\/]{1,40})?$|^pria-chat$/.test(q) ? q : null;
}
