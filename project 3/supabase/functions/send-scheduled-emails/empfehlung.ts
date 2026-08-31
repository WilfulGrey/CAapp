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
  nationality?: { nationality?: string | null } | null;
}

/** Kostenrechner-Antworten (lead.kalkulation.formularDaten). */
export interface FormularDaten {
  deutschkenntnisse?: string | null;
  geschlecht?: string | null;
  fuehrerschein?: string | null;
  mobilitaet?: string | null;
  nachteinsaetze?: string | null;
  pflegegrad?: number | string | null;
}

export interface Empfehlung {
  caregiverId: number;
  /** „Maria" — Vorname, wie im Portal. Nie der Nachname. */
  vorname: string;
  alter: number | null;
  nationalitaet: string | null;
  deutschWort: string | null;
  erfahrungJahre: number;
  einsaetze: number;
  stufe: string;
  verfuegbarAb: string | null;
  fotoUrl: string | null;
  gruende: string[];
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

// ─── Matching-Gründe ─────────────────────────────────────────────────────
// NUR Merkmale, die aus echten Daten hervorgehen (Martin: keine erfundenen
// Prozentzahlen). Jede Zeile ist eine Aussage über DIESE Pflegekraft gegen
// DIESE Kundenangabe — nichts Allgemeines.
//
// BEWUSST NICHT DABEI, weil die Daten zum Sendezeitpunkt fehlen:
//   • Demenz-Erfahrung — der Kostenrechner fragt Demenz nicht ab (erst der
//     Patientenbogen im Portal). Ohne Kundenangabe kein Abgleich.
//   • Nachteinsätze — mamamia liefert am Caregiver kein Nacht-Merkmal.
//   • Mobilität/Rollator — `Caregiver.mobilities[].mobility` existiert, aber
//     die Werte sind nicht verifiziert. Święta zasada 1.5: kein Enum raten.
//     Nächster Kandidat, sobald die Werte einmal live geprüft sind.

const GESCHLECHT_WUNSCH: Record<string, string> = {
  weiblich: "female",
  maennlich: "male",
  männlich: "male",
};

export function matchGruende(
  cg: MatchCaregiver,
  extra: CaregiverExtra | null,
  fd: FormularDaten,
): string[] {
  const gruende: string[] = [];

  // 1. Sprache — preisrelevant und vom Kunden ausdrücklich gewählt.
  //    Nur wenn die Stufe wirklich bekannt ist UND exakt passt; der Filter
  //    lässt unbekannte Stufen durch, das ist noch kein Treffer.
  const noetig = requiredGermanyLevelForWish(fd.deutschkenntnisse);
  if (noetig && cg.germany_skill && cg.germany_skill === noetig) {
    gruende.push("Deutschkenntnisse entsprechen Ihrem Wunsch");
  }

  // 2. Geschlecht — nur wenn der Kunde eine Wahl getroffen hat („egal" nicht).
  const gewuenscht = GESCHLECHT_WUNSCH[(fd.geschlecht ?? "").toLowerCase().trim()];
  if (gewuenscht && cg.gender === gewuenscht) {
    gruende.push(
      gewuenscht === "female"
        ? "Weiblich – wie von Ihnen gewünscht"
        : "Männlich – wie von Ihnen gewünscht",
    );
  }

  // 3. Führerschein — nur wenn der Kunde ihn wollte.
  if ((fd.fuehrerschein ?? "").toLowerCase().trim() === "ja" && extra?.driving_license === "yes") {
    gruende.push("Führerschein vorhanden");
  }

  // 4. Erfahrung bei uns — die belastbarste Zahl, die wir haben.
  const jobs = cg.hp_total_jobs ?? 0;
  if (jobs >= 2) {
    gruende.push(`Bereits ${jobs} Betreuungseinsätze über Primundus`);
  }

  // 5. Nichtraucherin — nur bei ausdrücklichem „no", nie aus fehlenden Daten.
  if (extra?.smoking === "no") {
    gruende.push(cg.gender === "male" ? "Nichtraucher" : "Nichtraucherin");
  }

  return gruende.slice(0, 4);
}

// ─── Nationalität — Kopie aus src/lib/mamamia/mappers.ts ─────────────────

const NATIONALITAET_DE: Record<string, string> = {
  Polish: "Polen",
  Bulgarian: "Bulgarien",
  Romanian: "Rumänien",
  Slovak: "Slowakei",
  Czech: "Tschechien",
  Hungarian: "Ungarn",
  Ukrainian: "Ukraine",
  Lithuanian: "Litauen",
  Latvian: "Lettland",
  Estonian: "Estland",
  Croatian: "Kroatien",
  Slovenian: "Slowenien",
};

export function herkunftsland(nat: string | null | undefined): string | null {
  const roh = (nat ?? "").trim();
  if (!roh) return null;
  // Unbekannte Nationalität lieber weglassen als falsch übersetzen.
  return NATIONALITAET_DE[roh] ?? null;
}

// ─── Datum ───────────────────────────────────────────────────────────────

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * „14. September" — oder „sofort", wenn das Datum in der Vergangenheit
 * liegt. Ohne Datum: null, dann entfällt die Zeile.
 */
export function verfuegbarText(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const heute = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getTime() <= heute.getTime()) return "sofort";
  return `${d.getDate()}. ${MONATE[d.getMonth()]}`;
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
      alter: alter && alter > 17 && alter < 100 ? alter : null,
      nationalitaet: herkunftsland(extra?.nationality?.nationality),
      deutschWort: deutschWortAus(cg.germany_skill),
      erfahrungJahre: jahre,
      einsaetze,
      stufe: stufenWort(einsaetze, jahre),
      verfuegbarAb: verfuegbarText(cg.available_from, now),
      fotoUrl: fotoUrl(cg),
      gruende: matchGruende(cg, extra, fd),
    },
    sichtbarGesamt,
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
export function empfehlungHtml(
  e: Empfehlung,
  photoCid: string | null,
  profilUrl: string,
  alleUrl: string,
  sichtbarGesamt: number,
): string {
  const name = esc(e.vorname);
  const alterTeil = e.alter ? `, ${e.alter} Jahre` : "";

  const foto = photoCid
    ? `<img src="cid:${photoCid}" alt="${name}" width="104" style="display:block;width:104px;height:104px;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:104px;height:104px;border-radius:12px;background-color:#B5A184;color:#ffffff;font-size:36px;font-weight:700;line-height:104px;text-align:center;">${initialen(e.vorname)}</div>`;

  const zeilen: string[] = [];
  if (e.nationalitaet) zeilen.push(esc(e.nationalitaet));
  if (e.deutschWort) zeilen.push(`Deutsch: ${e.deutschWort}`);
  if (e.erfahrungJahre > 0) {
    zeilen.push(`${e.erfahrungJahre} ${e.erfahrungJahre === 1 ? "Jahr" : "Jahre"} Betreuungserfahrung`);
  }
  const daten = zeilen
    .map((z) => `<p style="margin:0 0 3px;font-size:14px;line-height:1.6;color:#555;">${z}</p>`)
    .join("");

  const verfuegbar = e.verfuegbarAb
    ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#2A9D5C;font-weight:600;">${
        e.verfuegbarAb === "sofort" ? "Sofort verfügbar" : `Verfügbar ab ${esc(e.verfuegbarAb)}`
      }</p>`
    : "";

  const gruendeBlock = e.gruende.length > 0
    ? `
      <tr>
        <td colspan="3" style="padding:18px 24px 4px;border-top:1px solid #ebe2d2;">
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#2D1F0F;font-weight:600;">Warum ${name} zu Ihren Angaben passt:</p>
          ${e.gruende.map((g) =>
            `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#2D1F0F;"><span style="color:#2A9D5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;${esc(g)}</p>`
          ).join("")}
        </td>
      </tr>`
    : "";

  // Der Hinweis auf die übrigen Kräfte verschwindet bei genau einem Match
  // vollständig — „Weitere 0" wäre schlimmer als gar nichts.
  const weitere = sichtbarGesamt - 1;
  const weitereBlock = weitere > 0
    ? `
          <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#555;text-align:center;">Weitere ${weitere} passende ${weitere === 1 ? "Betreuungskraft" : "Betreuungskräfte"} für Sie</p>
          <p style="margin:4px 0 0;text-align:center;"><a href="${alleUrl}" target="_blank" style="color:#8B7355;text-decoration:underline;font-size:14px;font-weight:600;">Alle passenden Betreuungskräfte ansehen &rarr;</a></p>`
    : "";

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;background:#FFFFFF;border:1px solid #ebe2d2;border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="3" style="padding:14px 24px 12px;background:#FAF8F4;border-bottom:1px solid #ebe2d2;">
          <p style="margin:0;${LABEL}color:#8B7355;">Unsere Empfehlung für Sie</p>
        </td>
      </tr>
      <tr>
        <td class="empf-foto" style="padding:22px 0 18px 24px;width:104px;vertical-align:top;">${foto}</td>
        <td class="empf-luecke" width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>
        <td class="empf-text" style="padding:22px 24px 18px 0;vertical-align:top;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#2D1F0F;line-height:1.25;">${name}<span style="font-size:15px;font-weight:400;color:#9a8a73;">${alterTeil}</span></p>
          ${daten}
          ${verfuegbar}
        </td>
      </tr>
      ${gruendeBlock}
      <tr>
        <td colspan="3" style="padding:18px 24px 22px;">
          <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;">
            <tr>
              <td align="center" bgcolor="#2A9D5C" style="background-color:#2A9D5C;background-image:linear-gradient(180deg,#34B36C 0%,#2A9D5C 100%);border-radius:10px;padding:15px 38px;">
                <a href="${profilUrl}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">${name} kennenlernen&nbsp;&nbsp;&rarr;</a>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
          ${weitereBlock}
        </td>
      </tr>
    </table>`;
}

export function empfehlungText(
  e: Empfehlung,
  profilUrl: string,
  alleUrl: string,
  sichtbarGesamt: number,
): string {
  const zeilen: string[] = [`UNSERE EMPFEHLUNG FÜR SIE`, ``, `${e.vorname}${e.alter ? `, ${e.alter} Jahre` : ""}`];
  if (e.nationalitaet) zeilen.push(e.nationalitaet);
  if (e.deutschWort) zeilen.push(`Deutsch: ${e.deutschWort}`);
  if (e.erfahrungJahre > 0) {
    zeilen.push(`${e.erfahrungJahre} ${e.erfahrungJahre === 1 ? "Jahr" : "Jahre"} Betreuungserfahrung`);
  }
  if (e.verfuegbarAb) {
    zeilen.push(e.verfuegbarAb === "sofort" ? "Sofort verfügbar" : `Verfügbar ab ${e.verfuegbarAb}`);
  }
  if (e.gruende.length > 0) {
    zeilen.push("", `Warum ${e.vorname} zu Ihren Angaben passt:`);
    for (const g of e.gruende) zeilen.push(`  ✓ ${g}`);
  }
  zeilen.push("", `${e.vorname} kennenlernen: ${profilUrl}`);
  const weitere = sichtbarGesamt - 1;
  if (weitere > 0) {
    zeilen.push(
      `Weitere ${weitere} passende ${weitere === 1 ? "Betreuungskraft" : "Betreuungskräfte"} für Sie.`,
      `Alle passenden Betreuungskräfte ansehen: ${alleUrl}`,
    );
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
