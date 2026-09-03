/* ─── Empfehlung für die Angebotsmail ────────────────────────────────────
 *
 * ZWECK (Martin, 31.08.2026): Die Angebotsmail schrieb bisher nur „Im
 * Kundenportal warten bereits Pflegekräfte, die zu Ihrem Bedarf passen."
 * Das ist eine Behauptung. Ab jetzt steht die beste Kraft MIT Foto, Alter,
 * Deutschstufe, Erfahrung und Anreisedatum direkt in der Mail — plus die
 * Gründe, warum ausgerechnet sie zu den Angaben des Kunden passt.
 *
 * WOHER DIE DATEN KOMMEN
 * Matchings hängen in mamamia an einer job_offer. Die entsteht beim
 * onboard-to-mamamia-Aufruf, den sonst der Browser beim ersten Portalbesuch
 * macht. Diese Datei ruft dieselbe Edge Function serverseitig auf (gleiches
 * Supabase-Projekt, gleicher Aufruf, idempotent — ein bereits onboardeter
 * Lead ist ein Cache-Treffer) und geht danach über mamamia-proxy exakt den
 * Weg, den auch das Portal geht. KEIN zweiter mamamia-Client, KEINE eigenen
 * Agentur-Zugangsdaten, KEINE Parallelstruktur.
 *
 *     onboard-to-mamamia { token }      → job_offer_id + session_token
 *     mamamia-proxy      listMatchings  → alle Matches
 *     (diese Datei)      waehleFuenf    → dieselben 5 wie das Portal
 *     mamamia-proxy      getCaregiver   → Raucher/Führerschein/Nationalität
 *
 * SCHALTER: `EMPFEHLUNG_ONBOARD=0` schaltet NUR das serverseitige Onboarding
 * ab. Dann bekommen nur Leads eine Empfehlung, die schon eine job_offer
 * haben (Resubmits, Portalbesucher). Alles andere läuft weiter.
 *
 * FÄLLT ETWAS AUS, fällt die Mail auf ihren heutigen Text zurück — nie ein
 * leerer Kasten, nie eine erfundene Pflegekraft (Święta zasada nr 1).
 *
 * ─── SYNC-PFLICHT ───────────────────────────────────────────────────────
 * Reihenfolge und Trichter MÜSSEN dieselben fünf liefern wie das Portal,
 * sonst steht in der Mail eine andere Frau als hinter dem Klick. Kopien von:
 *   src/lib/mamamia/badge.ts            → badgeTier / caregiverBadgeScore
 *   src/lib/mamamia/matchingsRanking.ts → rankComparator
 *   src/lib/mamamia/mappers.ts          → requiredGermanyLevelForWish,
 *                                         matchesGermanyWish, NATIONALITY_DE
 *   src/pages/CustomerPortalPage.tsx    → Alters-/Badge-Trichter, TARGET 5
 * Edge Functions können nicht aus `src/` importieren (CI kopiert nur den
 * functions-Ordner) — gleiche Lage wie names.ts, quietHours.ts, deutschStufe.ts.
 * Ändert sich dort die Reihenfolge, muss sie hier mit.
 */

// ─── Formen aus mamamia (nur was wir wirklich lesen) ─────────────────────

export interface MatchCaregiver {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  year_of_birth?: number | null;
  germany_skill?: string | null;
  care_experience?: string | null;
  available_from?: string | null;
  last_contact_at?: string | null;
  hp_total_jobs?: number | null;
  /** Durchschnittliche Einsatzdauer in TAGEN — Quelle der „Ø N Wochen"-Angabe. */
  hp_avg_mission_days?: number | null;
  avatar?: { aws_url?: string | null } | null;
  avatar_retouched?: { aws_url?: string | null } | null;
  avatar_retouched_promo?: { aws_url?: string | null } | null;
}

export interface Matching {
  id?: number;
  is_show?: boolean | null;
  caregiver: MatchCaregiver;
}

/** Zusatzfelder, die nur die Einzelabfrage `getCaregiver` liefert. */
export interface CaregiverExtra {
  smoking?: string | null;
  driving_license?: string | null;
  /** Vorstellungstext aus mamamia. Kann alt und kurz sein (≤200 Zeichen) —
   *  das Portal laesst ihn dann von mamamia neu schreiben. Der Mailer tut
   *  das NICHT: das waere ein LLM-Write aus einem Cron heraus. Ist nichts
   *  Brauchbares da, baut `vorstellungstext` denselben Ersatzsatz wie das
   *  Profil-Modal aus echten Feldern. */
  about_de?: string | null;
  motivation?: string | null;
}

/**
 * Was der Kunde im Kostenrechner angegeben hat. Quelle der drei Haken —
 * NICHT die Eigenschaften der Pflegekraft (Martin, 31.08.: „Wir greifen
 * lediglich die Angaben des Kunden kommunikativ wieder auf").
 */
export interface FormularDaten {
  deutschkenntnisse?: string | null;
  geschlecht?: string | null;
  fuehrerschein?: string | null;
  mobilitaet?: string | null;
  nachteinsaetze?: string | null;
  pflegegrad?: number | string | null;
  betreuung_fuer?: string | null;
}

export interface Empfehlung {
  caregiverId: number;
  /** „Maria" — für Anrede, Button und Fließtext. */
  vorname: string;
  /** „Maria K." — exakt die Schreibweise der Portal-Karte (displayName).
   *  Der ausgeschriebene Nachname verlässt das Portal nie. */
  anzeigeName: string;
  /** „7 Jahre Erfahrung · 9 Primundus-Einsätze" — ausgeschrieben, ohne
   *  interne Kennzahlen. */
  fakten: string;
  alter: number | null;
  deutschWort: string | null;
  erfahrungJahre: number;
  einsaetze: number;
  stufe: string;
  fotoUrl: string | null;
  gruende: string[];
  /** Sprachbalken 1–3 wie im Portal (GERMANY_SKILL_LEVELS.bars). */
  deutschBalken: number;
  /** „7 J. Erfahrung" — Wortlaut der Erfahrungs-Kachel im Profil-Modal. */
  erfahrungKurz: string;
  /** Anfang des Vorstellungstextes; laeuft in der Mail aus. */
  vorstellung: string;
}

export interface EmpfehlungErgebnis {
  empfehlung: Empfehlung;
  /** Wie viele Kräfte der Kunde im Portal insgesamt sieht (inkl. Empfehlung), max. 5. */
  sichtbarGesamt: number;
}

// ─── Badge / Stufe — Kopie aus src/lib/mamamia/badge.ts ──────────────────

export function caregiverBadgeScore(cg: { hp_total_jobs?: number | null }): number {
  return cg.hp_total_jobs ?? 0;
}

export function badgeTier(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score >= 12) return 4;
  if (score >= 6) return 3;
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  return 0;
}

/** Mindest-Score, den der Trichter bevorzugt (Tier ≥ 2 = „Bewährt"). */
export const MIN_BADGE_SCORE = 2;

/** Das Wort vor der Faktenzeile — wortgleich zu Portal, SA-Portal und Mails. */
export function stufenWort(einsaetze?: number | null, jahre?: number | null): string {
  const jobs = einsaetze ?? 0;
  if (jobs >= 12) return "Elite";
  if (jobs >= 6) return "Stammkraft";
  if (jobs >= 2) return "Bewährt";
  if (jobs >= 1) return "Bekannt";
  return (jahre ?? 0) > 0 ? "Berufserfahren" : "Neu dabei";
}

export function erfahrungJahre(careExperience: string | null | undefined): number {
  return typeof careExperience === "string"
    ? Math.max(0, parseInt(careExperience, 10) || 0)
    : 0;
}

// ─── Sprachwunsch — Kopie aus src/lib/mamamia/mappers.ts ─────────────────

export function requiredGermanyLevelForWish(wunsch: string | null | undefined): string | null {
  const v = (wunsch ?? "").toLowerCase().trim();
  if (v === "grundlegend") return "level_1";
  if (v === "kommunikativ") return "level_2";
  if (v === "sehr-gut" || v === "sehr_gut" || v === "gut") return "level_3";
  return null;
}

export function matchesGermanyWish(
  skill: string | null | undefined,
  wunsch: string | null | undefined,
): boolean {
  const required = requiredGermanyLevelForWish(wunsch);
  if (!required) return true;
  if (!skill) return true;
  return skill === required;
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
  const badge = (m: Matching): number => badgeTier(caregiverBadgeScore(m.caregiver));
  const hasPhoto = (m: Matching): number => (fotoUrl(m.caregiver) ? 1 : 0);
  const isFemale = (m: Matching): number => (m.caregiver.gender === "female" ? 1 : 0);
  const isYoung = (m: Matching): number => {
    const yob = m.caregiver.year_of_birth;
    if (!yob) return 0;
    return nowYear - yob <= 60 ? 1 : 0;
  };

  return (a: Matching, b: Matching): number => {
    const ba = badge(a), bb = badge(b);
    if (ba !== bb) return bb - ba;
    const ap = hasPhoto(a), bp = hasPhoto(b);
    if (ap !== bp) return bp - ap;
    const af = isFemale(a), bf = isFemale(b);
    if (af !== bf) return bf - af;
    const ay = isYoung(a), by = isYoung(b);
    if (ay !== by) return by - ay;
    const av = availMs(a.caregiver.available_from), bv = availMs(b.caregiver.available_from);
    if (av !== bv) return av - bv;
    const ac = contactMs(a.caregiver.last_contact_at), bc = contactMs(b.caregiver.last_contact_at);
    if (ac !== bc) return bc - ac;
    return (b.caregiver.hp_total_jobs ?? 0) - (a.caregiver.hp_total_jobs ?? 0);
  };
}

export function fotoUrl(cg: MatchCaregiver): string | null {
  return (
    cg.avatar_retouched_promo?.aws_url ||
    cg.avatar_retouched?.aws_url ||
    cg.avatar?.aws_url ||
    null
  );
}

// ─── Trichter — Kopie aus CustomerPortalPage `effectiveMatched` ──────────
// Zwei Hartfilter MIT Rückfall (User-Spec 14.06.): Alter ≤ 60 und Badge ≥
// „Bewährt" greifen nur, solange danach noch fünf übrig bleiben. Sonst
// füllen die Aussortierten hinten wieder auf — lieber eine ältere Kraft
// zeigen als eine leere Liste.

export const TARGET_VISIBLE = 5;
const MAX_AGE = 60;

export function waehleFuenf(
  matchings: Matching[],
  deutschWunsch: string | null | undefined,
  now: Date,
): Matching[] {
  const nowYear = now.getFullYear();

  const gesehen = new Set<number>();
  const eindeutig: Matching[] = [];
  for (const m of matchings) {
    if (!m?.caregiver || typeof m.caregiver.id !== "number") continue;
    if (gesehen.has(m.caregiver.id)) continue;
    gesehen.add(m.caregiver.id);
    eindeutig.push(m);
  }

  const sprachGefiltert = eindeutig
    .filter((m) => m.is_show !== false)
    .filter((m) => matchesGermanyWish(m.caregiver.germany_skill, deutschWunsch))
    .sort(rangVergleich(now));

  const zuAlt = (yob: number | null | undefined): boolean =>
    yob != null && nowYear - yob > MAX_AGE;

  const jung = sprachGefiltert.filter((m) => !zuAlt(m.caregiver.year_of_birth));
  const altRest = sprachGefiltert.filter((m) => zuAlt(m.caregiver.year_of_birth));
  const altersGefiltert =
    jung.length >= TARGET_VISIBLE ? jung : [...jung, ...altRest];

  const stark = altersGefiltert.filter(
    (m) => caregiverBadgeScore(m.caregiver) >= MIN_BADGE_SCORE,
  );
  const schwachRest = altersGefiltert.filter(
    (m) => caregiverBadgeScore(m.caregiver) < MIN_BADGE_SCORE,
  );
  const fertig = stark.length >= TARGET_VISIBLE ? stark : [...stark, ...schwachRest];
  const fuenf = fertig.slice(0, TARGET_VISIBLE);

  return empfehlungNachOben(fuenf);
}

/**
 * Letzter Schritt des Portals: INNERHALB der sichtbaren fünf wandert die
 * Kraft mit den meisten Einsätzen auf Platz 1 („Empfehlung des Beraters",
 * CustomerPortalPage `bestIdx`). Die übrigen behalten ihre Reihenfolge, bei
 * Gleichstand gewinnt die erste.
 *
 * Ohne diesen Schritt könnte die Mail eine andere Frau zeigen als das Portal:
 * rangVergleich sortiert nach Badge-STUFE (12+ = Elite) und bricht Gleichstand
 * über Foto/Geschlecht/Alter — 20 Einsätze ohne Foto landen dort hinter 13
 * Einsätzen mit Foto, im Portal aber davor.
 */
export function empfehlungNachOben(fuenf: Matching[]): Matching[] {
  let bestIdx = -1;
  let bestScore = -Infinity;
  fuenf.forEach((m, idx) => {
    const s = caregiverBadgeScore(m.caregiver);
    if (s > bestScore) { bestScore = s; bestIdx = idx; }
  });
  return bestIdx > 0
    ? [fuenf[bestIdx], ...fuenf.filter((_, idx) => idx !== bestIdx)]
    : fuenf;
}

// ─── Die drei Haken ──────────────────────────────────────────────────────
//
// KEIN zweites Matching zwischen Pflegekraft-Eigenschaften und Kundenangaben
// (Martin, 31.08.). Punkt 1 steht immer, Punkt 2 und 3 greifen auf, was der
// Kunde selbst im Kostenrechner angegeben hat — das ist der Beleg dafuer,
// dass wir seine Anfrage gelesen haben, keine Behauptung ueber die Person.
//
// Reihenfolge: erst die besonderen Anforderungen aus der Anfrage (max. 2),
// danach mit Standardangaben auffuellen. Nie mehr als drei.
//
// Danach steht die Verfuegbarkeit („Ab sofort", siehe HAKEN_VERFUEGBAR).
// Die restlichen Standards sind an Daten gebunden und werden weggelassen,
// wenn der Beleg fehlt (Święta zasada nr 1):
//   • Deutsch — nur, wenn die Stufe bekannt ist UND exakt dem Wunsch entspricht
//   • Fuehrerschein — nur, wenn der Kunde ihn wollte UND die Kraft einen hat
//     (der einzige Grund, warum getCaregiver ueberhaupt noch gerufen wird)

export const HAKEN_WUNSCHPROFIL = "Entspricht Ihrem Wunschprofil";

/** Besondere Anforderungen aus der Anfrage, wichtigste zuerst. */
export function anforderungenAusAnfrage(fd: FormularDaten): string[] {
  const treffer: string[] = [];
  const mob = (fd.mobilitaet ?? "").toLowerCase().trim();
  const nacht = (fd.nachteinsaetze ?? "").toLowerCase().trim();
  const pflegegrad = Number(fd.pflegegrad);

  if (mob === "bettlaegerig") treffer.push("Erfahrung mit bettlägerigen Patienten");
  else if (mob === "rollstuhl") treffer.push("Erfahrung mit Rollstuhlpatienten");

  if (nacht && nacht !== "nein") treffer.push("Erfahrung mit nächtlichen Einsätzen");

  if ((fd.betreuung_fuer ?? "").toLowerCase().trim() === "ehepaar") {
    treffer.push("Erfahrung in der Betreuung von Ehepaaren");
  }

  if (Number.isFinite(pflegegrad) && pflegegrad >= 4) {
    treffer.push("Erfahrung bei hohem Pflegebedarf");
  }

  // Rollator erst hier: eingeschraenkte Mobilitaet ist der Normalfall und
  // sagt weniger als die Punkte darueber.
  if (mob === "rollator") treffer.push("Erfahrung mit eingeschränkter Mobilität");

  return treffer;
}

/* ─── Verfuegbarkeit ──────────────────────────────────────────────────────
 *
 * IMMER „Ab sofort verfügbar" — kein Datum, keine Ableitung aus
 * `available_from` (Martin, 31.08.: „du sollst immer schreiben: Ab sofort
 * verfügbar, weil die Daten im System nicht gepflegt sind"). Das Feld wird
 * von den Kräften nicht aktuell gehalten; ein Datum daraus waere praeziser
 * FORMULIERT, aber nicht praeziser GEMEINT — „Ab 10. September" nach einem
 * vergessenen Eintrag verschiebt einen Start, den es gar nicht gibt.
 *
 * Deshalb ist auch die Wunschtermin-Pruefung (`passtZumTermin`) raus: sie
 * las dasselbe ungepflegte Feld. Die Reihenfolge der fuenf Kraefte nutzt
 * `available_from` weiter — dort spiegelt sie nur das Portal, sie behauptet
 * dem Kunden gegenueber nichts.
 */
export const HAKEN_VERFUEGBAR = "Ab sofort verfügbar";

export function haken(
  cg: MatchCaregiver,
  extra: CaregiverExtra | null,
  fd: FormularDaten,
  now: Date,
): string[] {
  const liste: string[] = [HAKEN_WUNSCHPROFIL];
  const ausAnfrage = anforderungenAusAnfrage(fd).slice(0, 2);

  /* Hat der Kunde nichts Besonderes angegeben, bleibt es bei zwei Haken:
     passt zum Profil, ist ab sofort verfuegbar (Martin, 31.08.). Vorher
     fuellten die Standards auf — und „Entspricht Ihrem Wunschprofil" direkt
     ueber „Deutschkenntnisse wie gewuenscht" liest sich wie derselbe Satz
     zweimal. */
  if (ausAnfrage.length === 0) return [HAKEN_WUNSCHPROFIL, HAKEN_VERFUEGBAR];

  for (const a of ausAnfrage) liste.push(a);

  if (liste.length < 3) liste.push(HAKEN_VERFUEGBAR);

  if (liste.length < 3) {
    const noetig = requiredGermanyLevelForWish(fd.deutschkenntnisse);
    if (noetig && cg.germany_skill === noetig) liste.push("Deutschkenntnisse wie gewünscht");
  }

  if (
    liste.length < 3 &&
    (fd.fuehrerschein ?? "").toLowerCase().trim() === "ja" &&
    extra?.driving_license === "yes"
  ) {
    liste.push("Führerschein vorhanden");
  }

  return liste.slice(0, 3);
}

// ─── Zusammenbauen ───────────────────────────────────────────────────────

export function baueEmpfehlung(
  m: Matching,
  extra: CaregiverExtra | null,
  fd: FormularDaten,
  sichtbarGesamt: number,
  now: Date,
): EmpfehlungErgebnis {
  const cg = m.caregiver;
  const jahre = erfahrungJahre(cg.care_experience);
  const einsaetze = cg.hp_total_jobs ?? 0;
  const alter = cg.year_of_birth ? now.getFullYear() - cg.year_of_birth : null;

  return {
    empfehlung: {
      caregiverId: cg.id,
      vorname: (cg.first_name ?? "").trim() || "Ihre Pflegekraft",
      anzeigeName: anzeigeName(cg.first_name ?? "", cg.last_name) || "Ihre Pflegekraft",
      fakten: kundenFakten(cg),
      alter: alter && alter > 17 && alter < 100 ? alter : null,
      deutschWort: deutschWortAus(cg.germany_skill),
      erfahrungJahre: jahre,
      einsaetze,
      stufe: stufenWort(einsaetze, jahre),
      fotoUrl: fotoUrl(cg),
      gruende: haken(cg, extra, fd, now),
      deutschBalken: deutschBalken(cg.germany_skill),
      erfahrungKurz: erfahrungKurz(cg),
      vorstellung: vorstellungstext(cg, extra, (cg.first_name ?? "").trim() || "Sie"),
    },
    sichtbarGesamt,
  };
}

/**
 * „Maria K." — Vorname plus Initiale des Nachnamens. Kopie von
 * `displayName` (src/components/portal/shared.ts): die Karte in der Mail und
 * die Karte im Portal müssen dieselbe Person gleich benennen, sonst wirkt der
 * Klick wie ein Wechsel. Der ausgeschriebene Nachname bleibt im Panel.
 */
export function anzeigeName(vorname: string, nachname?: string | null): string {
  const v = (vorname ?? "").trim();
  const n = (nachname ?? "").trim();
  if (!v) return "";
  return n ? `${v} ${n.charAt(0).toUpperCase()}.` : v;
}

/**
 * „7 Jahre Erfahrung · 9 Primundus-Einsätze".
 *
 * Bewusst NICHT die Portal-Kennzahlen (Martin, 31.08.: „Keine Informationen
 * zeigen, die nach internem CRM oder Datenbank aussehen"). Draussen sind
 * damit das Stufenwort („Stammkraft:") und die Durchschnittsdauer
 * („Ø 12 Wochen pro Einsatz") — beides liest sich wie ein Auszug aus einem
 * Verwaltungssystem. „J." ist zu „Jahre" ausgeschrieben, und die Einsaetze
 * heissen jetzt „Primundus-Einsaetze", damit klar ist, wovon die Rede ist.
 *
 * Ohne Zahlen bleibt derselbe ehrliche Ersatzsatz wie im Portal.
 */
export function kundenFakten(cg: MatchCaregiver): string {
  const teile: string[] = [];
  const jahre = erfahrungJahre(cg.care_experience);
  if (jahre > 0) teile.push(`${jahre} ${jahre === 1 ? "Jahr" : "Jahre"} Erfahrung`);

  const einsaetze = cg.hp_total_jobs ?? 0;
  if (einsaetze > 0) {
    teile.push(`${einsaetze} ${einsaetze === 1 ? "Primundus-Einsatz" : "Primundus-Einsätze"}`);
  }
  return teile.length > 0 ? teile.join(" &middot; ") : "bereit für den ersten Einsatz";
}

/** Sprachbalken 1–3 — Kopie von GERMANY_SKILL_LEVELS.bars (mappers.ts). */
export function deutschBalken(skill: string | null | undefined): number {
  const map: Record<string, number> = {
    level_0: 1, level_1: 1, level_2: 2, level_3: 3, level_4: 3,
  };
  return map[(skill ?? "").trim()] ?? 0;
}

/** „7 J. Erfahrung" — Wortlaut der Erfahrungs-Kachel im Profil-Modal
 *  (mapCaregiverToNurse: `${jahre} J. Erfahrung`, sonst „—"). */
export function erfahrungKurz(cg: MatchCaregiver): string {
  const jahre = erfahrungJahre(cg.care_experience);
  return jahre > 0 ? `${jahre} J. Erfahrung` : "—";
}

/**
 * Vorstellungstext wie im Profil-Modal („Über <Vorname>").
 *
 * Reihenfolge exakt wie dort: `about_de` → `motivation` → ein Satz aus
 * echten Feldern. Nichts wird erfunden (Święta zasada nr 1) — und nichts
 * wird nachgenerieren lassen: das Modal laesst mamamia alte Texte neu
 * schreiben, das ist ein bezahlter LLM-Aufruf und hat in einem Cron nichts
 * verloren.
 */
export function vorstellungstext(
  cg: MatchCaregiver,
  extra: CaregiverExtra | null,
  vorname: string,
): string {
  const about = (extra?.about_de ?? "").trim();
  if (about) return about;
  const motivation = (extra?.motivation ?? "").trim();
  if (motivation) return motivation;

  const jahre = erfahrungJahre(cg.care_experience);
  const wort = deutschWortAus(cg.germany_skill);
  const niveau = wort === "Grund" ? "Grundniveau"
    : wort === "Mittel" ? "mittlerem Niveau"
    : wort === "Gut" ? "gutem Niveau"
    : null;

  const teile: string[] = [];
  if (jahre > 0 && niveau) {
    teile.push(`${vorname} verfügt über ${jahre} ${jahre === 1 ? "Jahr" : "Jahre"} Erfahrung in der 24-Stunden-Betreuung und spricht Deutsch auf ${niveau}.`);
  } else if (jahre > 0) {
    teile.push(`${vorname} verfügt über ${jahre} ${jahre === 1 ? "Jahr" : "Jahre"} Erfahrung in der 24-Stunden-Betreuung.`);
  } else if (niveau) {
    teile.push(`${vorname} spricht Deutsch auf ${niveau}.`);
  }

  const einsaetze = cg.hp_total_jobs ?? 0;
  if (einsaetze > 0) {
    teile.push(`Mit ${einsaetze} erfolgreich abgeschlossenen ${einsaetze === 1 ? "Einsatz" : "Einsätzen"} über Primundus bringt sie bewährte Praxiserfahrung mit.`);
  }
  return teile.join(" ");
}

/**
 * Schneidet den Vorstellungstext an einer Wortgrenze und gibt ihn in zwei
 * Stufen zurueck: klar lesbar, dann blasser. Das ist die Ausblendung nach
 * unten — als ZWEI Textfarben statt als Verlauf-Overlay, weil Overlays
 * (position:absolute) in Gmail und Outlook wegfallen und der Text dort dann
 * hart abgeschnitten stuende. Zweifarbig funktioniert in jedem Client.
 */
export function textAusblenden(
  text: string,
  klarBis = 150,
  blassBis = 260,
): { klar: string; blass: string; gekuerzt: boolean } {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= klarBis) return { klar: t, blass: "", gekuerzt: false };

  const schnitt = (bis: number) => {
    if (t.length <= bis) return t.length;
    const raum = t.lastIndexOf(" ", bis);
    return raum > bis * 0.6 ? raum : bis;
  };
  const a = schnitt(klarBis);
  const b = schnitt(blassBis);
  return {
    klar: t.slice(0, a).trim(),
    blass: t.slice(a, b).trim(),
    gekuerzt: b < t.length,
  };
}

/** Wie deutschStufe.ts, aber ohne Import-Zyklus — dieselbe Skala. */
function deutschWortAus(skill: string | null | undefined): string | null {
  const map: Record<string, string> = {
    level_0: "Grund",
    level_1: "Grund",
    level_2: "Mittel",
    level_3: "Gut",
    level_4: "Gut",
  };
  return map[(skill ?? "").trim()] ?? null;
}

// ─── Datenbeschaffung ────────────────────────────────────────────────────

export interface HoleDeps {
  supabaseUrl: string;
  /** Service-Role- oder Anon-Key — nur fürs Supabase-Functions-Gateway. */
  key: string;
  token: string;
  jobOfferId: number | null;
  formularDaten: FormularDaten;
  fetchFn?: typeof fetch;
  now?: Date;
  /** false → kein serverseitiges Onboarding (EMPFEHLUNG_ONBOARD=0). */
  darfOnboarden?: boolean;
}

const TIMEOUT_MS = 12_000;

/**
 * Holt die Empfehlung. Gibt `null` zurück, wenn irgendetwas nicht klappt —
 * der Aufrufer fällt dann auf den bisherigen Mailtext zurück.
 */
export async function holeEmpfehlung(deps: HoleDeps): Promise<EmpfehlungErgebnis | null> {
  const f = deps.fetchFn ?? fetch;
  const now = deps.now ?? new Date();
  const darfOnboarden = deps.darfOnboarden !== false;

  if (!deps.token) return null;

  const kopf = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${deps.key}`,
    "apikey": deps.key,
  };

  try {
    // ① Session besorgen. onboard-to-mamamia ist idempotent: hat der Lead
    //    schon eine job_offer, ist das ein Cache-Treffer ohne mamamia-Write.
    //    Ohne job_offer legt es Kunde + Job an — genau das, was sonst der
    //    Browser Sekunden später tut. Deshalb der Schalter.
    if (!deps.jobOfferId && !darfOnboarden) return null;

    const onboardRes = await f(`${deps.supabaseUrl}/functions/v1/onboard-to-mamamia`, {
      method: "POST",
      headers: kopf,
      body: JSON.stringify({ token: deps.token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!onboardRes.ok) {
      console.warn(`[empfehlung] onboard HTTP ${onboardRes.status}`);
      return null;
    }
    const onboard = await onboardRes.json() as { session_token?: string; job_offer_id?: number };
    const sessionToken = onboard?.session_token;
    if (!sessionToken) {
      console.warn("[empfehlung] onboard ohne session_token");
      return null;
    }

    const proxy = async (action: string, variables: Record<string, unknown>) => {
      const res = await f(`${deps.supabaseUrl}/functions/v1/mamamia-proxy`, {
        method: "POST",
        headers: { ...kopf, "X-Session-Token": sessionToken },
        body: JSON.stringify({ action, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`${action} HTTP ${res.status}`);
      return await res.json();
    };

    // ② Matches holen. limit=200 wie im Portal — kleinere Seiten haben dort
    //    schon einmal 80 % der besten Kräfte verschluckt.
    const mRes = await proxy("listMatchings", { limit: 200 }) as {
      data?: { JobOfferMatchingsWithPagination?: { data?: Matching[] } };
      JobOfferMatchingsWithPagination?: { data?: Matching[] };
    };
    const roh =
      mRes?.data?.JobOfferMatchingsWithPagination?.data ??
      mRes?.JobOfferMatchingsWithPagination?.data ??
      [];
    if (!Array.isArray(roh) || roh.length === 0) return null;

    const fuenf = waehleFuenf(roh, deps.formularDaten.deutschkenntnisse, now);
    if (fuenf.length === 0) return null;

    // ③ Zusatzfelder nur für die EINE empfohlene Kraft (Raucherin,
    //    Führerschein, Nationalität stehen nicht in der Matching-Liste).
    //    Schlägt das fehl, bleiben eben zwei Gründe statt vier.
    let extra: CaregiverExtra | null = null;
    try {
      // Liefert neben driving_license auch about_de/motivation fuer die
      // Vorstellung — dieselbe Abfrage, die das Portal beim Oeffnen des
      // Profils macht. Ein Aufruf, kein zusaetzlicher.
      const cRes = await proxy("getCaregiver", { id: fuenf[0].caregiver.id }) as {
        data?: { Caregiver?: CaregiverExtra };
        Caregiver?: CaregiverExtra;
      };
      extra = cRes?.data?.Caregiver ?? cRes?.Caregiver ?? null;
    } catch (e) {
      console.warn("[empfehlung] getCaregiver fehlgeschlagen:", e instanceof Error ? e.message : String(e));
    }

    return baueEmpfehlung(fuenf[0], extra, deps.formularDaten, fuenf.length, now);
  } catch (e) {
    console.warn("[empfehlung] nicht verfügbar:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ─── HTML ────────────────────────────────────────────────────────────────
// Tabellen-Layout, Inline-Styles, keine modernen CSS-Techniken. Zweispaltig
// auf Desktop (Foto links, Text rechts); die Klassen `empf-foto` / `empf-text`
// stapeln unter 600 px über die Media-Query im Mail-Wrapper. Outlook ignoriert
// die Query und rendert die zwei Spalten — passt, weil dort 600 px fest sind.

const LABEL =
  "font-size:11px;font-weight:700;color:#9a8a73;letter-spacing:.08em;text-transform:uppercase;";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initialen(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

/**
 * @param photoCid  CID des eingebetteten Fotos (fetchInlinePhotoDeno). Null →
 *                  Initialen-Kachel. NIE die rohe S3-URL: die ist nach ~30 Min
 *                  tot und würde beim Kunden als kaputtes Bild ankommen.
 */
/** Korallrot der Website- und Portal-CTAs (PrimaryCTA.tsx, MatchCard). */
export const KORALLE = "#E76F63";

export function empfehlungHtml(
  e: Empfehlung,
  photoCid: string | null,
  profilUrl: string,
  alleUrl: string,
  sichtbarGesamt: number,
): string {
  const name = esc(e.anzeigeName);
  const vorname = esc(e.vorname);

  // Foto wie im Profil-Modal: 80 px, radius 16, weisser Rand.
  const foto = photoCid
    ? `<img src="cid:${photoCid}" alt="${name}" width="80" height="80" style="display:block;width:80px;height:80px;border-radius:16px;object-fit:cover;border:2px solid #ffffff;" />`
    : `<div style="width:80px;height:80px;border-radius:16px;background-color:#B5A184;color:#ffffff;font-size:28px;font-weight:700;line-height:80px;text-align:center;border:2px solid #ffffff;">${initialen(e.vorname)}</div>`;

  const alterChip = e.alter
    ? `<span style="font-size:14px;font-weight:400;color:#A1A1AA;">&nbsp;&nbsp;${e.alter} J.</span>`
    : "";

  const stufenChip = e.stufe
    ? `<span style="display:inline-block;font-size:11px;font-weight:700;color:#8B7355;background:#F5F5F6;border:1px solid #E4E4E7;border-radius:999px;padding:3px 10px;">${esc(e.stufe)}</span>`
    : "";

  /* Einsaetze auf einer EIGENEN Zeile unter Stufe und „Zum Profil" (Martin,
     31.08.: „das bricht komisch um mobil"). Neben der Stufe blieb auf dem
     iPhone kein Platz — „über Primundus" rutschte allein in die naechste
     Zeile und stand dort wie ein abgerissener Halbsatz. Ueber die volle
     Breite der Textspalte bleibt „4 Einsätze über Primundus" zusammen.

     Bei 0 bleibt die Zeile weg — dort heisst die Stufe ohnehin „Neu dabei"
     oder „Berufserfahren", und „0 Einsätze" waere das Gegenteil eines
     Vertrauenssignals. */
  const einsatzZeile = e.einsaetze > 0
    ? `<tr><td colspan="2" style="padding:6px 0 0;font-size:14px;line-height:1.4;color:#52525B;">${e.einsaetze} ${e.einsaetze === 1 ? "Einsatz" : "Einsätze"} über Primundus</td></tr>`
    : "";

  // Sprachbalken 1–3 wie im Profil-Modal, als Mini-Tabelle statt divs.
  const balken = [1, 2, 3]
    .map((i) => {
      const an = i <= e.deutschBalken;
      return `<td width="14" style="width:14px;padding-right:3px;"><div style="width:12px;height:6px;border-radius:3px;background:${an ? "#8B7355" : "#E4E4E7"};font-size:0;line-height:0;">&nbsp;</div></td>`;
    })
    .join("");

  const kachel = (label: string, inhalt: string) => `
                <td width="50%" style="width:50%;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #D4D4D8;border-radius:12px;background:#ffffff;">
                    <tr><td style="padding:10px 12px;">
                      <p style="margin:0 0 4px;font-size:13px;line-height:1.4;color:#71717A;">${label}</p>
                      ${inhalt}
                    </td></tr>
                  </table>
                </td>`;

  const deutschInhalt = e.deutschWort
    ? `<table cellpadding="0" cellspacing="0" role="presentation"><tr>${balken}<td style="padding-left:5px;font-size:16px;font-weight:700;color:#18181B;">${e.deutschWort}</td></tr></table>`
    : `<p style="margin:0;font-size:16px;font-weight:700;color:#18181B;">&mdash;</p>`;

  const hakenBlock = e.gruende.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:14px 0 0;">
        ${e.gruende.map((g) =>
          `<tr><td style="padding:0 0 7px;font-size:15px;line-height:1.5;color:#3F3F46;"><span style="color:#22A06B;font-weight:700;">&#10003;</span>&nbsp;&nbsp;${esc(g)}</td></tr>`
        ).join("")}
      </table>`
    : "";

  /* „Über <Vorname>" wie im Profil-Modal — und hier laeuft die Vorschau aus:
     erst klar, dann blass, dann Verlauf zu Weiss und der Knopf. Der Kunde
     sieht, dass da noch mehr steht, ohne dass wir es behaupten muessten. */
  const { klar, blass, gekuerzt } = textAusblenden(e.vorstellung);
  const vorstellungBlock = klar
    ? `
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 0 0;">
            <tr><td style="padding-top:16px;border-top:1px solid #EFEAE2;">
              <p style="margin:0 0 8px;font-size:17px;font-weight:700;line-height:1.4;color:#18181B;">Über ${vorname}</p>
              <p style="margin:0;font-size:16px;line-height:1.65;color:#18181B;">${esc(klar)}${
                blass ? ` <span style="color:#A9A9B0;">${esc(blass)}</span>` : ""
              }${gekuerzt ? `<span style="color:#D0D0D6;"> …</span>` : ""}</p>
            </td></tr>
          </table>`
    : "";

  /* Kopfleiste IM Kasten (Martin, 31.08.: „die Empfehlung müsste mehr im
     Kasten stehen oder am Rand"). Vorher standen Zähler und Überschrift als
     lose Zeilen darüber — sie gehörten optisch zum Fließtext und der Kasten
     fing erst darunter an. Jetzt trägt der Kasten seine eigene Überschrift,
     rechts die Anzahl. */
  const kopfleiste = `
          <tr>
            <td style="padding:13px 20px;background:#FAF8F4;border-bottom:1px solid #EBE2D2;border-radius:15px 15px 0 0;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${KORALLE};">Unsere Empfehlung</td>
          </tr>`;

  /* Ueberschrift ueber dem Kasten (Martin, 31.08.: „das koennte eine
     Ueberschrift sein, weil so sieht es nicht gut aus"). Als Fliesstext lief
     der Satz ueber zwei Zeilen und hing lose ueber dem Kasten. „Wir haben
     bereits … herausgesucht" faellt weg — das sagt schon die Einleitung der
     Mail; die Ueberschrift traegt nur noch die Zahl. */
  const einleitungSatz = sichtbarGesamt > 0
    ? `<p style="margin:0 0 14px;font-size:20px;font-weight:700;line-height:1.35;color:#2D1F0F;">${sichtbarGesamt} passende ${sichtbarGesamt === 1 ? "Betreuungskraft" : "Betreuungskräfte"} für Sie</p>`
    : "";

  const alleLink = sichtbarGesamt > 1
    ? `<p style="margin:12px 0 0;text-align:center;"><a href="${alleUrl}" target="_blank" style="color:#8B7355;text-decoration:underline;font-size:14px;font-weight:600;">Alle ${sichtbarGesamt} Betreuungskräfte ansehen &rarr;</a></p>`
    : "";

  /* Mehr Luft davor und danach + kraeftigerer Rand in Primundus-Braun statt
     Grau: der Block ging im Fliesstext unter (Martin). Zwei Pixel Rand und
     die warme Kopfleiste heben ihn heraus, ohne eine zweite Karte im Kasten
     zu bauen. */
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:32px 0 32px;">
      <tr><td>

        ${einleitungSatz}

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:2px solid #8B7355;border-radius:16px;background:#ffffff;">
          ${kopfleiste}
          <tr><td style="padding:20px;">

            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td class="empf-foto" width="80" style="width:80px;vertical-align:middle;">${foto}</td>
                <td class="empf-luecke" width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
                <td class="empf-text" style="vertical-align:middle;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="vertical-align:middle;">
                        <p style="margin:0 0 6px;font-size:20px;font-weight:700;line-height:1.3;color:#18181B;">${name}${alterChip}</p>
                        ${stufenChip}
                      </td>
                      <td class="empf-profil" style="vertical-align:middle;text-align:right;white-space:nowrap;padding-left:10px;">
                        <a class="profil-link" href="${profilUrl}" target="_blank" style="color:#8B7355;text-decoration:none;font-size:14px;font-weight:600;">Zum Profil&nbsp;&rsaquo;</a>
                      </td>
                    </tr>
                    ${einsatzZeile}
                  </table>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0 0;">
              <tr>
                ${kachel("Erfahrung", `<p style="margin:0;font-size:16px;font-weight:700;color:#8B7355;">${esc(e.erfahrungKurz)}</p>`)}
                <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                ${kachel("Deutschkenntnisse", deutschInhalt)}
              </tr>
            </table>

            ${hakenBlock}
            ${vorstellungBlock}

            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr><td style="padding:18px 0 0;" align="center">
                <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="${KORALLE}" style="background-color:${KORALLE};border-radius:12px;padding:15px 40px;">
                      <a href="${profilUrl}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">${vorname} ansehen&nbsp;&nbsp;&rarr;</a>
                    </td>
                  </tr>
                </table>
                <!--[if mso]></td></tr></table><![endif]-->
                ${alleLink}
              </td></tr>
            </table>

          </td></tr>
        </table>

      </td></tr>
    </table>`;
}

export function empfehlungText(
  e: Empfehlung,
  profilUrl: string,
  alleUrl: string,
  sichtbarGesamt: number,
): string {
  const zeilen: string[] = [];
  if (sichtbarGesamt > 0) {
    zeilen.push(
      `${sichtbarGesamt} PASSENDE ${sichtbarGesamt === 1 ? "BETREUUNGSKRAFT" : "BETREUUNGSKRÄFTE"} FÜR SIE`,
      "",
    );
  }
  zeilen.push("UNSERE EMPFEHLUNG", "", `${e.anzeigeName}${e.alter ? `, ${e.alter}` : ""}`);
  if (e.deutschWort) zeilen.push(`Deutsch: ${e.deutschWort}`);
  zeilen.push(`${e.stufe}: ${e.fakten.replaceAll("&middot;", "·")}`);
  if (e.vorstellung) {
    const { klar, blass, gekuerzt } = textAusblenden(e.vorstellung);
    zeilen.push("", `Über ${e.vorname}`, `${klar}${blass ? " " + blass : ""}${gekuerzt ? " …" : ""}`);
  }
  if (e.gruende.length > 0) {
    zeilen.push("");
    for (const g of e.gruende) zeilen.push(`  ✓ ${g}`);
  }
  zeilen.push("", `${e.vorname} ansehen: ${profilUrl}`);
  if (sichtbarGesamt > 1) {
    zeilen.push(`Alle ${sichtbarGesamt} Betreuungskräfte ansehen: ${alleUrl}`);
  }
  return zeilen.join("\n");
}

/** Ersatztext, wenn (noch) keine Empfehlung feststeht. Kein leerer Kasten. */
export function keineEmpfehlungHtml(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;background:#FAF8F4;border:1px solid #ebe2d2;border-radius:10px;">
      <tr><td style="padding:18px 24px;">
        <p style="margin:0 0 6px;${LABEL}color:#8B7355;">Passende Betreuungskräfte</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#555;">Wir prüfen gerade, welche Betreuungskräfte zu Ihrer Anfrage passen. Sobald Profile verfügbar sind, finden Sie diese in Ihrem Kundenportal &ndash; wir melden uns bei Ihnen.</p>
      </td></tr>
    </table>`;
}

export function keineEmpfehlungText(): string {
  return `PASSENDE BETREUUNGSKRÄFTE

Wir prüfen gerade, welche Betreuungskräfte zu Ihrer Anfrage passen. Sobald Profile verfügbar sind, finden Sie diese in Ihrem Kundenportal – wir melden uns bei Ihnen.`;
}
