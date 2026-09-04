/* ─── Eingekaufte Leads: Herkunft aus einem Fremdportal ───────────────────
 *
 * Leads aus dem eigenen Kostenrechner haben source="rechner" (Pria-Chat:
 * "pria-chat"). Leads, die wir bei einem Fremdportal EINGEKAUFT haben
 * (Pflegehilfe.org, Pflegebund.eu, ...), kommen als "portal:<domain>".
 *
 * Diese Kunden haben nicht bei uns angefragt, sondern beim Portal — und
 * warten dort gerade auf mehrere Anbieter. Sie bekommen dieselbe Mail 1
 * wie alle anderen (Preis, Ablauf, Angaben), nur mit eigenem Kopf: der
 * Empfaenger kennt uns nicht und muss zuerst verstehen, warum wir
 * schreiben und was ihn erwartet.
 */

/* Bewusst eine ALLOWLIST statt einer Ableitung aus dem String: der Wert
 * stammt aus fremder Quelle (Mailparser eines Portals) und wird in HTML
 * gerendert. Ein unbekanntes Portal liefert null ⇒ der Kunde bekommt die
 * normale Mail, statt dass ungeprueftes Fremdtext in unsere Vorlage laeuft.
 *
 * SCHLUESSEL ist die volle Domain (kommt aus source="portal:<domain>" und
 * darf sich nie aendern), WERT der Name, den der Kunde liest — ohne TLD
 * (Martin 31.08.): "Pflegehilfe.org" las sich fuer Apple Mail wie eine
 * Domain und wurde ungefragt verlinkt, der Kunde landete beim Portal statt
 * bei uns. Neues Portal einkaufen = hier eine Zeile ergaenzen, Name ohne TLD. */
export const PORTAL_QUELLEN: Record<string, string> = {
  "pflegehilfe.org": "Pflegehilfe",
  "pflegebund.eu": "Pflegebund",
  "pflege-helfer24.de": "Pflege-Helfer24",
};

export const PORTAL_PREFIX = "portal:";

/* Betreff. Der Standard ("Ihr Angebot zur 24-Stunden-Betreuung") setzt
 * voraus, dass der Empfaenger weiss, wofuer er ein Angebot bekommt. Der
 * eingekaufte Lead weiss das nicht — deshalb nennt der Betreff gleich mit,
 * was ihn erwartet (Wortlaut Martin 30.08.). */
export const PORTAL_BETREFF =
  "Ihr Angebot für die 24-Stunden-Betreuung – inkl. passender Pflegekräfte";

/** Anzeigename des Portals, oder null fuer eigene/unbekannte Quellen. */
export function portalHerkunft(source?: string | null): string | null {
  if (!source || typeof source !== "string") return null;
  if (!source.toLowerCase().startsWith(PORTAL_PREFIX)) return null;
  const domain = source.slice(PORTAL_PREFIX.length).trim().toLowerCase();
  return PORTAL_QUELLEN[domain] ?? null;
}

/* ─── Kopf der Mail ──────────────────────────────────────────────────────
 *
 * Wortlaut Martin 30.08. Reihenfolge traegt die Logik: erst warum wir
 * schreiben, dann was schon fertig ist, dann der Unterschied zu jeder
 * anderen Antwort auf dieselbe Portal-Anfrage (die anderen melden sich und
 * fragen nach — wir zeigen Preis UND Kraefte, ohne Bindung).
 */
export function portalIntroHtml(portal: string): string {
  return `vielen Dank für Ihre Anfrage über <strong style="color:#2D1F0F;">${portal}</strong>.`;
}

export function portalIntroText(portal: string): string {
  return `vielen Dank für Ihre Anfrage über ${portal}.`;
}

/* Website-CTA-Farbe (#E76F63) statt des gruenen Standard-Buttons: der
 * Empfaenger kennt uns nicht und landet gleich auf der Seite — die Mail
 * soll aussehen wie das, was ihn dort erwartet (Martin 30.08.).
 *
 * Gilt fuer BEIDE Buttons der Mail. Zwei Farben in einer Mail lesen sich
 * als zwei verschiedene Angebote ("oben in der Farbe und unten in einer
 * anderen geht nicht", Martin 30.08.) — deshalb faerbt index.ts auch den
 * Button hinter der Preisbox hiermit ein, sobald es ein Portal-Lead ist. */
export const PORTAL_CTA_FARBE = "#E76F63";

/** Der Button, einmal gebaut — beide Stellen der Mail nutzen ihn. */
export function portalCtaButtonHtml(ctaUrl: string, beschriftung: string, margin: string): string {
  return `
    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:${margin};border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="${PORTAL_CTA_FARBE}" style="background-color:${PORTAL_CTA_FARBE};border-radius:12px;padding:18px 44px;box-shadow:0 4px 14px rgba(231,111,99,0.32);">
          <a href="${ctaUrl}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">${beschriftung}&nbsp;&nbsp;→</a>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->`;
}

/* Die Plakette von der Startseite, nur in E-Mail-Technik: fuenf Gesichter
 * und die Aussage daneben. Sie ist der Grund, warum jemand klickt, der uns
 * nicht kennt — ein Preis allein sieht aus wie jedes andere Angebot.
 *
 * Fuenf Bilder, fuenf Kraefte: die Zahl ist die Anzahl der Gesichter, die
 * daneben stehen, und behauptet damit nichts, was nicht im Bild ist. (Die
 * Startseite zeigt dort einen laufenden Zaehler aus einer Tagesformel —
 * der gehoert nicht in eine Mail, die archiviert und spaeter mit dem
 * verglichen wird, was im Portal wirklich steht.)
 *
 * Avatare stehen nebeneinander statt ueberlappend: negative Margins
 * ueberleben die Mailclients nicht. */
function avatarZellen(siteUrl: string): string {
  return [1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<td style="padding:0 1px;"><img src="${siteUrl}/images/caregivers/pk-${i}.jpg" width="24" height="24" alt="" style="display:block;width:24px;height:24px;border-radius:12px;border:2px solid #ffffff;" /></td>`,
    )
    .join("");
}

export function portalKraeftePlaketteHtml(siteUrl: string, ctaUrl: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 30px;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="#F0F7F1" style="background-color:#F0F7F1;border:1px solid #A8D5B0;border-radius:20px;padding:5px 14px;">
          <a href="${ctaUrl}" target="_blank" style="text-decoration:none;color:#3A6B42;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
              <tr>
                ${avatarZellen(siteUrl)}
                <td style="padding:0 0 0 8px;font-size:12px;color:#3A6B42;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;white-space:nowrap;"><strong style="color:#2D1F0F;">5 passende Pflegekräfte</strong> für Sie&nbsp;&nbsp;→</td>
              </tr>
            </table>
          </a>
        </td>
      </tr>
    </table>`;
}

/* Der Kopf des Portal-Leads.
 *
 * `mitPlakette` steuert die Fuenf-Gesichter-Plakette: Sie behauptet
 * "5 passende Pflegekraefte" mit anonymen Avataren. Steht weiter unten in
 * derselben Mail eine ECHTE gematchte Kraft mit Namen, Foto und Gruenden,
 * saehe der Kunde dieselbe Aussage zweimal — einmal als Versprechen, einmal
 * als Beleg. Dann gewinnt der Beleg, und die Plakette entfaellt (Martin
 * 01.09.). Ohne Empfehlung bleibt sie: dann ist sie das einzige Signal,
 * dass hier Menschen und nicht nur ein Preis warten. */
export function portalVorschauHtml(siteUrl: string, ctaUrl: string, mitPlakette = true): string {
  const p = (t: string) =>
    `<p style="font-size:15px;line-height:1.75;color:#444;margin:0 0 16px;">${t}</p>`;

  return `
    ${p(`Auf Basis Ihrer Angaben haben wir Ihr <strong style="color:#2D1F0F;">persönliches Angebot bereits berechnet</strong>. Preis und Konditionen finden Sie direkt in dieser E-Mail.`)}
    ${p(`Bei Primundus geht es aber um mehr als nur den Preis: Sie können <strong style="color:#2D1F0F;">verfügbare Pflegekräfte direkt einsehen</strong>, vergleichen und Ihre Wunsch-Pflegekraft selbst auswählen – ohne sich vorher vertraglich zu binden.`)}
    ${p(`So wissen Sie von Anfang an, was die Betreuung kostet und wer für Sie infrage kommt.`)}
    ${portalCtaButtonHtml(ctaUrl, "Angebot &amp; passende Pflegekräfte ansehen", "22px auto 14px")}
    ${mitPlakette ? portalKraeftePlaketteHtml(siteUrl, ctaUrl) : ""}`;
}

export function portalVorschauText(ctaUrl: string): string {
  return `Auf Basis Ihrer Angaben haben wir Ihr persönliches Angebot bereits berechnet. Preis und Konditionen finden Sie direkt in dieser E-Mail.

Bei Primundus geht es aber um mehr als nur den Preis: Sie können verfügbare Pflegekräfte direkt einsehen, vergleichen und Ihre Wunsch-Pflegekraft selbst auswählen – ohne sich vorher vertraglich zu binden.

So wissen Sie von Anfang an, was die Betreuung kostet und wer für Sie infrage kommt.

Angebot & passende Pflegekräfte ansehen: ${ctaUrl}`;
}

/* Hinweis ueber der Angaben-Tabelle — in zwei Faerbungen.
 *
 * Hat das Portal alles geliefert (bei Pflegehilfe der Normalfall: 9 von 9
 * Feldern), waere "wo uns etwas fehlte, haben wir angenommen" falsch und
 * saet Zweifel an Angaben, die stimmen. Dann nur die Herkunft nennen.
 *
 * Mussten wir Luecken fuellen, MUSS es dastehen: sonst wundert sich der
 * Kunde, woher wir Dinge wissen, die er nie gesagt hat. Zugleich der beste
 * Grund, das Portal zu oeffnen — was wir angenommen haben, war bewusst der
 * teurere Wert, eine Korrektur senkt also den Preis. */
export function portalAngabenHinweisHtml(portal: string, angenommen = true): string {
  return `<p style="font-size:14px;line-height:1.7;color:#666;margin:0 0 10px;">${portalAngabenHinweisText(portal, angenommen)}</p>`;
}

export function portalAngabenHinweisText(portal: string, angenommen = true): string {
  return angenommen
    ? `Diese Angaben haben wir aus Ihrer Anfrage bei ${portal} übernommen und dort, wo uns etwas fehlte, vorsichtig angenommen. Im Kundenportal können Sie alles in einer Minute korrigieren — der Preis passt sich sofort an.`
    : `Diese Angaben haben wir aus Ihrer Anfrage bei ${portal} übernommen. Stimmt etwas nicht, können Sie es im Kundenportal in einer Minute korrigieren — der Preis passt sich sofort an.`;
}
