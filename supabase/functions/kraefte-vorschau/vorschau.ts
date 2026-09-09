/* ─── Kräfte-Vorschau VOR der Kontaktschranke ─────────────────────────────
 *
 * ZWECK (Martin, 09.09.2026): Im Kostenrechner brechen 44 % der Kunden genau
 * dort ab, wo wir Name, E-Mail und Telefon verlangen, bevor sie etwas
 * bekommen haben. Ab jetzt sehen sie VORHER drei echte, gerade verfügbare
 * Pflegekräfte, die zu ihren Wünschen passen — erst dann die Kontaktdaten,
 * dann sofort Preis und Verfügbarkeit im Portal.
 *
 * WOHER DIE DATEN KOMMEN
 * Matchings gibt es in mamamia erst mit einer job_offer, also erst nach dem
 * Lead. Vor dem Lead fragen wir die Agentur-weite Liste ab
 * (`CaregiversWithPagination`, wie das SA-Portal für den Kräfte-Teaser) und
 * filtern hier lokal nach den Wünschen aus dem Rechner: Deutsch, Geschlecht,
 * Führerschein. Reihenfolge und Stufen-Wörter sind KOPIEN der Portal-Logik
 * (send-scheduled-emails/empfehlung.ts ← src/lib/mamamia/*), damit die
 * Kraft im Rechner dieselbe ist, die der Kunde danach im Portal oben sieht.
 *
 * DATENSCHUTZ: Diese Karten stehen VOR jedem Lead auf einer öffentlichen
 * Seite. Deshalb nur Vorname, Alter, Stufe, Erfahrung, Deutsch und Foto —
 * und Fotos bevorzugt aus `avatar_retouched_promo` (für Werbung freigegeben);
 * `avatar_retouched` nur zum Auffüllen, das rohe `avatar` nie.
 *
 * FÄLLT ETWAS AUS, liefert die Function eine leere Liste und der Rechner
 * zeigt seinen bisherigen Kasten — nie eine erfundene Pflegekraft.
 */

export interface RohKraft {
  id: number;
  first_name?: string | null;
  gender?: string | null;
  year_of_birth?: number | null;
  germany_skill?: string | null;
  care_experience?: string | null;
  available_from?: string | null;
  last_contact_at?: string | null;
  hp_total_jobs?: number | null;
  driving_license?: string | null;
  caregiver_status?: { is_blocked?: boolean | null } | null;
  avatar_retouched_promo?: { aws_url?: string | null } | null;
  avatar_retouched?: { aws_url?: string | null } | null;
}

export interface Wuensche {
  /** grundlegend | kommunikativ | sehr-gut (Werte des Rechners, Schritt 6) */
  deutsch?: string | null;
  /** egal | weiblich | maennlich (Schritt 8) */
  geschlecht?: string | null;
  /** ja | nein (Schritt 7) */
  fuehrerschein?: string | null;
}

export interface VorschauKraft {
  id: number;
  vorname: string;
  alter: number | null;
  deutschWort: string | null;
  erfahrungJahre: number;
  einsaetze: number;
  stufe: string;
  fotoUrl: string;
  /** ISO-Datum (YYYY-MM-DD) oder null, wenn mamamia keins kennt. */
  verfuegbarAb: string | null;
}

export const ANZAHL = 3;
/** Verfügbar heißt: schon frei oder frei innerhalb der nächsten 60 Tage. */
export const VERFUEGBAR_BIS_TAGE = 60;

// ─── Stufe / Deutsch — Kopien aus send-scheduled-emails (empfehlung.ts, deutschStufe.ts)

export function badgeTier(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score >= 12) return 4;
  if (score >= 6) return 3;
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  return 0;
}

export function stufenWort(einsaetze?: number | null, jahre?: number | null): string {
  const jobs = einsaetze ?? 0;
  if (jobs >= 12) return "Elite";
  if (jobs >= 6) return "Stammkraft";
  if (jobs >= 2) return "Bewährt";
  if (jobs >= 1) return "Bekannt";
  return (jahre ?? 0) > 0 ? "Berufserfahren" : "Neu bei Primundus";
}

export function erfahrungJahre(careExperience: string | null | undefined): number {
  return typeof careExperience === "string" ? Math.max(0, parseInt(careExperience, 10) || 0) : 0;
}

const DEUTSCH_WORT: Record<string, string> = {
  level_0: "Grund", level_1: "Grund", level_2: "Mittel", level_3: "Gut", level_4: "Gut",
};
export function deutschWort(skill: string | null | undefined): string | null {
  return DEUTSCH_WORT[(skill ?? "").trim()] ?? null;
}

export function requiredGermanyLevelForWish(wunsch: string | null | undefined): string | null {
  const v = (wunsch ?? "").toLowerCase().trim();
  if (v === "grundlegend") return "level_1";
  if (v === "kommunikativ") return "level_2";
  if (v === "sehr-gut" || v === "sehr_gut" || v === "gut") return "level_3";
  return null;
}

/** Wie das Portal: Wunsch erfüllt, wenn Stufe gleich ODER unbekannt. */
export function matchesGermanyWish(skill: string | null | undefined, wunsch: string | null | undefined): boolean {
  const required = requiredGermanyLevelForWish(wunsch);
  if (!required) return true;
  if (!skill) return true;
  return skill === required;
}

export function fotoUrl(cg: RohKraft): string | null {
  return cg.avatar_retouched_promo?.aws_url || cg.avatar_retouched?.aws_url || null;
}

// ─── Filter ───────────────────────────────────────────────────────────────

function verfuegbarBald(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime() + VERFUEGBAR_BIS_TAGE * 24 * 3600 * 1000;
}

export function passtZuWuenschen(cg: RohKraft, w: Wuensche): boolean {
  if (cg.caregiver_status?.is_blocked) return false;
  if (!matchesGermanyWish(cg.germany_skill, w.deutsch)) return false;
  const g = (w.geschlecht ?? "").toLowerCase();
  if (g === "weiblich" && cg.gender !== "female") return false;
  if (g === "maennlich" && cg.gender !== "male") return false;
  if ((w.fuehrerschein ?? "").toLowerCase() === "ja") {
    if (!(cg.driving_license ?? "").toLowerCase().startsWith("yes")) return false;
  }
  return true;
}

// ─── Reihenfolge — Kopie aus src/lib/mamamia/matchingsRanking.ts ─────────

export function rangVergleich(now: Date) {
  const nowMs = now.getTime();
  const nowYear = now.getFullYear();
  const availMs = (iso: string | null | undefined): number => {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? Math.max(0, t - nowMs) : Infinity;
  };
  const contactMs = (iso: string | null | undefined): number => {
    if (!iso) return -Infinity;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : -Infinity;
  };
  return (a: RohKraft, b: RohKraft): number => {
    const ba = badgeTier(a.hp_total_jobs ?? 0), bb = badgeTier(b.hp_total_jobs ?? 0);
    if (ba !== bb) return bb - ba;
    const af = a.gender === "female" ? 1 : 0, bf = b.gender === "female" ? 1 : 0;
    if (af !== bf) return bf - af;
    const ay = a.year_of_birth && nowYear - a.year_of_birth <= 60 ? 1 : 0;
    const by = b.year_of_birth && nowYear - b.year_of_birth <= 60 ? 1 : 0;
    if (ay !== by) return by - ay;
    const av = availMs(a.available_from), bv = availMs(b.available_from);
    if (av !== bv) return av - bv;
    const ac = contactMs(a.last_contact_at), bc = contactMs(b.last_contact_at);
    if (ac !== bc) return bc - ac;
    return (b.hp_total_jobs ?? 0) - (a.hp_total_jobs ?? 0);
  };
}

// ─── Auswahl ──────────────────────────────────────────────────────────────

/**
 * Drei Kräfte für die Vorschau. Reihenfolge der Töpfe:
 *  1. passt zu den Wünschen, bald verfügbar, Werbe-Foto (promo)
 *  2. passt, bald verfügbar, retuschiertes Foto
 *  3. passt, Verfügbarkeit unbekannt, Werbe-Foto
 * Jeder Topf ist wie im Portal sortiert. Ohne Foto nie — die Karte lebt vom Bild.
 */
export function waehleVorschau(alle: RohKraft[], w: Wuensche, now: Date = new Date()): VorschauKraft[] {
  const cmp = rangVergleich(now);
  const passend = alle.filter((cg) => passtZuWuenschen(cg, w) && fotoUrl(cg));
  const toepfe = [
    passend.filter((cg) => verfuegbarBald(cg.available_from, now) && cg.avatar_retouched_promo?.aws_url),
    passend.filter((cg) => verfuegbarBald(cg.available_from, now) && !cg.avatar_retouched_promo?.aws_url),
    passend.filter((cg) => !cg.available_from && cg.avatar_retouched_promo?.aws_url),
  ];
  const gewaehlt: RohKraft[] = [];
  const gesehen = new Set<number>();
  for (const topf of toepfe) {
    for (const cg of [...topf].sort(cmp)) {
      if (gewaehlt.length >= ANZAHL) break;
      if (gesehen.has(cg.id)) continue;
      gesehen.add(cg.id);
      gewaehlt.push(cg);
    }
  }
  return gewaehlt.map((cg) => anonymisiere(cg, now));
}

export function anonymisiere(cg: RohKraft, now: Date): VorschauKraft {
  const jahre = erfahrungJahre(cg.care_experience);
  const vorname = (cg.first_name ?? "").trim().split(/\s+/)[0] || "Pflegekraft";
  const alter = cg.year_of_birth ? now.getFullYear() - cg.year_of_birth : null;
  return {
    id: cg.id,
    vorname,
    alter: alter && alter > 17 && alter < 80 ? alter : null,
    deutschWort: deutschWort(cg.germany_skill),
    erfahrungJahre: jahre,
    einsaetze: cg.hp_total_jobs ?? 0,
    stufe: stufenWort(cg.hp_total_jobs, jahre),
    fotoUrl: fotoUrl(cg) as string,
    verfuegbarAb: cg.available_from ? cg.available_from.slice(0, 10) : null,
  };
}
