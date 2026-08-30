/* ─── Eingekaufte Leads: Herkunft aus einem Fremdportal ───────────────────
 *
 * Leads aus dem eigenen Kostenrechner haben source="rechner" (Pria-Chat:
 * "pria-chat"). Leads, die wir bei einem Fremdportal EINGEKAUFT haben
 * (Pflegehilfe.org, Pflegebund.eu, ...), kommen als "portal:<domain>".
 *
 * Diese Kunden haben nicht bei uns angefragt, sondern beim Portal — und
 * warten dort gerade auf mehrere Anbieter. Sie bekommen deshalb dieselbe
 * Mail 1 wie alle anderen (Preis, Portal-CTA, Ablauf), nur mit anderem
 * erstem Absatz: ohne den Bezug zur eigenen Anfrage liest sich die Mail
 * wie Kaltwerbung.
 */

/* Bewusst eine ALLOWLIST statt einer Ableitung aus dem String: der Wert
 * stammt aus fremder Quelle (Mailparser eines Portals) und wird in HTML
 * gerendert. Ein unbekanntes Portal liefert null ⇒ der Kunde bekommt die
 * normale Mail, statt dass ungeprueftes Fremdtext in unsere Vorlage laeuft.
 * Neues Portal einkaufen = hier eine Zeile ergaenzen. */
export const PORTAL_QUELLEN: Record<string, string> = {
  "pflegehilfe.org": "Pflegehilfe.org",
  "pflegebund.eu": "Pflegebund.eu",
};

export const PORTAL_PREFIX = "portal:";

/** Anzeigename des Portals, oder null fuer eigene/unbekannte Quellen. */
export function portalHerkunft(source?: string | null): string | null {
  if (!source || typeof source !== "string") return null;
  if (!source.toLowerCase().startsWith(PORTAL_PREFIX)) return null;
  const domain = source.slice(PORTAL_PREFIX.length).trim().toLowerCase();
  return PORTAL_QUELLEN[domain] ?? null;
}

/* Erster Absatz. Traegt drei Dinge: den Bezug zur Anfrage beim Portal, den
 * Grund, warum wir und nicht der naechste Anbieter aus derselben Liste
 * ("sofort" gegen "wir melden uns"), und den Beleg dafuer (Testsieger).
 * Die Zahl steht hier bewusst — sie stuetzt an dieser Stelle ein Argument
 * (anders als im Hero, wo sie laut Martin nicht hingehoert). */
export function portalIntroHtml(portal: string): string {
  return `vielen Dank für Ihre Anfrage nach einer 24-Stunden-Betreuung über <strong style="color:#2D1F0F;">${portal}</strong>. Darauf müssen Sie bei uns nicht warten: Als <strong style="color:#2D1F0F;">6× in Folge ausgezeichneter Testsieger</strong> bei DIE WELT erhalten Sie Ihr persönliches Angebot sofort — mit festem Preis, ohne Vermittlungsgebühr und mit den Pflegekräften, die für Sie verfügbar sind, direkt zum Einsehen.`;
}

export function portalIntroText(portal: string): string {
  return `vielen Dank für Ihre Anfrage nach einer 24-Stunden-Betreuung über ${portal}. Darauf müssen Sie bei uns nicht warten: Als 6× in Folge ausgezeichneter Testsieger bei DIE WELT erhalten Sie Ihr persönliches Angebot sofort — mit festem Preis, ohne Vermittlungsgebühr und mit den Pflegekräften, die für Sie verfügbar sind, direkt zum Einsehen.`;
}

/* Hinweis ueber der Angaben-Tabelle. Bei eingekauften Leads stammt nur ein
 * Teil der Angaben vom Kunden — was das Portal nicht liefert, nehmen wir
 * zum teureren Wert an (lieber ein Preis, der faellt, als einer, der
 * steigt). Das muss dastehen: sonst wundert sich der Kunde, woher wir
 * Dinge wissen, die er nie gesagt hat. Zugleich der beste Grund, das
 * Portal zu oeffnen. */
export function portalAngabenHinweisHtml(portal: string): string {
  return `<p style="font-size:14px;line-height:1.7;color:#666;margin:0 0 10px;">Diese Angaben haben wir aus Ihrer Anfrage bei ${portal} übernommen und dort, wo uns etwas fehlte, vorsichtig angenommen. Im Kundenportal können Sie alles in einer Minute korrigieren — der Preis passt sich sofort an.</p>`;
}

export function portalAngabenHinweisText(portal: string): string {
  return `Diese Angaben haben wir aus Ihrer Anfrage bei ${portal} übernommen und dort, wo uns etwas fehlte, vorsichtig angenommen. Im Kundenportal können Sie alles in einer Minute korrigieren — der Preis passt sich sofort an.`;
}
