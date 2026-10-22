import { createHash, timingSafeEqual } from 'node:crypto';

/* ─── Login des Admin-Panels: Passwortvergleich und Fehlversuch-Limit ────
 *
 * Nur für POST /api/admin/auth (Node-Laufzeit). Die Sitzung selbst steckt in
 * lib/admin-sitzung.ts, das auch in der middleware (Edge) läuft.
 *
 * Bis 10/2026 gab es kein Limit: das Repo ist öffentlich, der Login-Weg also
 * bekannt, und man konnte beliebig oft raten (Audit C, 22.10.2026;
 * Registry #132).
 *
 * GRENZEN des Limits (bewusst einfach gehalten):
 *  - Der Zähler liegt im Speicher der Instanz. Ein Deploy oder Neustart setzt
 *    ihn zurück; liefen mehrere Instanzen, hätte jede ihren eigenen Zähler
 *    (render.yaml: eine Instanz, Plan starter). Ein gemeinsamer Speicher
 *    (Redis o. ä.) existiert im Projekt nicht.
 *  - Die IP kommt aus cf-connecting-ip bzw. x-forwarded-for (clientIp aus
 *    lib/bewertungen.ts). Wer den Ursprung bei Render direkt anspricht statt
 *    über Cloudflare, kann diese Kopfzeilen setzen und so das Limit je IP
 *    umgehen. Der eigentliche Schutz bleibt ein langes, zufälliges Passwort.
 *  - Dasselbe Passwort öffnet das Supabase-Konto info@primundus.de; dort
 *    gelten die Rate Limits von Supabase Auth, nicht dieses hier.
 */

export const MAX_FEHLVERSUCHE = 5;
export const FENSTER_MS = 15 * 60 * 1000;

/** Vergleich in konstanter Zeit. Über SHA-256, weil timingSafeEqual gleich
 *  lange Puffer verlangt und die Länge des Passworts sonst durchsickert. */
export function passwortStimmt(eingabe: unknown, erwartet: string): boolean {
  if (typeof eingabe !== 'string' || eingabe.length === 0 || eingabe.length > 1000) return false;
  const a = createHash('sha256').update(eingabe, 'utf8').digest();
  const b = createHash('sha256').update(erwartet, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Feste Fenster je Schlüssel (IP): das Fenster beginnt mit dem ersten
 *  Fehlversuch; nach MAX_FEHLVERSUCHE ist bis zu seinem Ende zu. */
export class FehlversuchZaehler {
  private eintraege = new Map<string, { anzahl: number; seit: number }>();

  constructor(
    private readonly max: number = MAX_FEHLVERSUCHE,
    private readonly fensterMs: number = FENSTER_MS,
    private readonly maxEintraege: number = 10_000,
  ) {}

  /** Millisekunden bis zum nächsten erlaubten Versuch, oder 0. */
  wartezeit(schluessel: string, jetzt: number = Date.now()): number {
    const e = this.eintraege.get(schluessel);
    if (!e) return 0;
    const ende = e.seit + this.fensterMs;
    if (jetzt >= ende) {
      this.eintraege.delete(schluessel);
      return 0;
    }
    return e.anzahl >= this.max ? ende - jetzt : 0;
  }

  fehlversuch(schluessel: string, jetzt: number = Date.now()): void {
    const e = this.eintraege.get(schluessel);
    if (e && jetzt < e.seit + this.fensterMs) {
      e.anzahl += 1;
      return;
    }
    if (this.eintraege.size >= this.maxEintraege) this.aufraeumen(jetzt);
    this.eintraege.set(schluessel, { anzahl: 1, seit: jetzt });
  }

  erfolg(schluessel: string): void {
    this.eintraege.delete(schluessel);
  }

  private aufraeumen(jetzt: number): void {
    this.eintraege.forEach((e, k) => {
      if (jetzt >= e.seit + this.fensterMs) this.eintraege.delete(k);
    });
    // Immer noch voll (Flut aus gefälschten IPs): ältesten Eintrag verwerfen.
    if (this.eintraege.size >= this.maxEintraege) {
      const aeltester = this.eintraege.keys().next().value;
      if (aeltester !== undefined) this.eintraege.delete(aeltester);
    }
  }
}
