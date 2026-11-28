/**
 * Kontaktdaten aus dem Facebook-/Instagram-Formular im Kostenrechner vorausfüllen
 * (Martin 28.11.2026, Registry #172).
 *
 * Weg: Die Bestätigungsmail (lib/meta-leads-mails.ts) hängt an den Knopf das Fragment
 * `#fb=<rechner_token>`. Der Kostenrechner liest es beim Laden (`tokenAusHash`), nimmt es
 * sofort aus der Adresse und holt über POST /api/fb-kontakt Name, E-Mail und Telefon.
 * Die Daten stehen nie im Link; der Schlüssel liegt im Fragment, damit er nicht an
 * Server und Protokolle geht. Beim Absenden verknüpft /api/angebot-anfordern die
 * Zeile in fb_leads mit dem neuen Lead.
 *
 * Diese Datei ist frei von Node-Modulen (auch der Rechner im Browser nutzt sie).
 */

/** 24 Zufallsbytes als base64url = 32 Zeichen (lib/meta-leads.ts erzeugt sie). */
export const FB_TOKEN_MUSTER = /^[A-Za-z0-9_-]{32}$/;

/** Bis zu diesem Alter des Formular-Leads füllt der Rechner vor; danach ist der Link nur noch ein normaler Link. */
export const KONTAKT_MAX_TAGE = 30;

/** sessionStorage-Schlüssel: der Schlüssel überlebt ein Neuladen, nachdem er aus der Adresse genommen wurde. */
export const FB_SPEICHER_KEY = '_prim_fb';

/** Liest `fb` aus dem Adress-Fragment (`#fb=…`, auch neben anderen Werten). Ungültig ⇒ null. */
export function tokenAusHash(hash: string | null | undefined): string | null {
  const roh = String(hash ?? '').replace(/^#/, '');
  if (!roh) return null;
  for (const teil of roh.split('&')) {
    const [k, v] = teil.split('=');
    if (k === 'fb' && v && FB_TOKEN_MUSTER.test(v)) return v;
  }
  return null;
}

/** Facebook / Instagram aus dem Feld `platform` des Leads (fb/ig); sonst null. */
export function kanalName(platform: string | null | undefined): 'Facebook' | 'Instagram' | null {
  const p = String(platform ?? '').toLowerCase();
  if (p === 'fb' || p === 'facebook') return 'Facebook';
  if (p === 'ig' || p === 'instagram') return 'Instagram';
  return null;
}

export type FbKontakt = { name: string; email: string; telefon: string; kanal: 'Facebook' | 'Instagram' | null };

/** Zeile aus fb_leads → Antwort der Route; zu alt oder ohne jeden Kontaktwert ⇒ null. */
export function kontaktAusZeile(
  zeile: { name: string | null; email: string | null; phone: string | null; platform: string | null; created_time: string } | null,
  jetzt: Date = new Date(),
): FbKontakt | null {
  if (!zeile) return null;
  const alter = jetzt.getTime() - new Date(zeile.created_time).getTime();
  if (!(alter >= 0 && alter <= KONTAKT_MAX_TAGE * 86400000)) return null;
  const k: FbKontakt = {
    name: (zeile.name ?? '').trim(),
    email: (zeile.email ?? '').trim(),
    telefon: (zeile.phone ?? '').trim(),
    kanal: kanalName(zeile.platform),
  };
  return k.name || k.email || k.telefon ? k : null;
}

/** Satz über den vorausgefüllten Feldern im letzten Schritt des Rechners (Portal-Look, statt KONTAKT_FERTIG.text in
 *  components/calculator/FormularPortal.tsx). Wortlaut von Martin am 28.11.2026 freigegeben („Ja, so bauen“, Bild
 *  seo-reports/analysen/meta-leadformular-2026-11/fassung-10). */
export function kontaktFertigVorausgefuellt(kanal: FbKontakt['kanal']): string {
  const herkunft = kanal ? `Ihrer ${kanal}-Anfrage` : 'Ihrer Anfrage';
  return `Ihre Kontaktdaten haben wir aus ${herkunft} übernommen. Bitte kurz prüfen, danach sehen Sie sofort Ihr Angebot und Ihre passende Pflegekräfte-Auswahl.`;
}
