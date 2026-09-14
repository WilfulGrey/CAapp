/**
 * Wachstum auf einen Blick (Martin, 14.09.2026: „ich brauche das als
 * Standardansicht und zwar grafisch. Kundenverlauf, Anfragenverlauf,
 * Profil-Verlauf").
 *
 * Reine Rechenlogik ohne Datenbank — dadurch testbar. Die Definitionen sind
 * dieselben wie im Wachstumsbericht vom 14.09.2026:
 *
 * - Anfrage: echter Lead (kein Test, keine interne Adresse), getrennt nach
 *   eigen und eingekauft (`source` beginnt mit `portal:`).
 * - Profil fertig: das ERSTE der Ereignisse `patient_data_saved`,
 *   `application_received` oder `caregiver_invited`. Bewerbung und Einladung
 *   zählen mit, weil das Team Profile im SA-Portal anlegen kann — dann fehlt
 *   `patient_data_saved`, aber eine Bewerbung gibt es nur auf ein fertiges
 *   Profil. Ein Team-Profil ohne Bewerbung bleibt unsichtbar, die Zahl ist
 *   also eine Untergrenze.
 * - Kunde im Einsatz: an jedem Tag von der Anreise bis zur Abreise eines
 *   gebuchten oder abgeschlossenen Einsatzes (`lead_jobs`, täglich aus
 *   mamamia). Je Kunde höchstens einmal pro Tag, auch beim Wechsel der
 *   Pflegekraft. Kunden, die das Team direkt in mamamia anlegt, kennt diese
 *   Tabelle nicht.
 */

export type WLead = {
  id: string;
  source?: string | null;
  ist_test?: boolean | null;
  email?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  created_at: string;
};
export type WEreignis = { lead_id: string | null; event_type: string; created_at: string };
export type WEinsatz = { lead_id: string | null; status: string | null; anreise: string | null; abreise: string | null };

export const PROFIL_EREIGNISSE = ['patient_data_saved', 'application_received', 'caregiver_invited'];
export const EINSATZ_STATUS = ['gebucht', 'abgeschlossen'];

/** Ab hier gibt es Portal, Profile und Einsätze (Portal-Start 14.05.2026). */
export const WACHSTUM_START = '2026-05-01';

/** Zielmarke fertige Profile je Tag (Martin, 11.09.2026: 2–3 je Tag). */
export const PROFIL_ZIEL_JE_TAG = 2;

/** Gleiche Regeln wie isRealLead im Morgen-Report
 *  (supabase/functions/daily-analytics-report/queries.ts) plus ist_test. */
export function istEchterLead(l: WLead): boolean {
  if (l.ist_test) return false;
  const e = String(l.email ?? '').toLowerCase();
  const v = String(l.vorname ?? '').toLowerCase();
  const n = String(l.nachname ?? '').toLowerCase();
  if (v.includes('test') || n.includes('test') || e.includes('test')) return false;
  if (e.includes('mailinator') || e.includes('example.com')) return false;
  if (e.includes('wyzzi') || e.includes('mamamia')) return false;
  if (e.endsWith('@primundus.de')) return false;
  return true;
}

export const istEingekauftQuelle = (source?: string | null) =>
  String(source ?? '').toLowerCase().startsWith('portal:');

const BERLIN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Kalendertag in Berlin als "YYYY-MM-DD" — ein Lead um 00:30 Uhr gehört zum neuen Tag. */
export const berlinTag = (zeit: string | Date) => BERLIN.format(typeof zeit === 'string' ? new Date(zeit) : zeit);

const tagZahl = (t: string) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))) / 86400000;
const zahlTag = (z: number) => new Date(z * 86400000).toISOString().slice(0, 10);

/** Montag der Woche, zu der der Tag gehört. */
export function wochenStart(t: string): string {
  const z = tagZahl(t);
  const wochentag = (new Date(z * 86400000).getUTCDay() + 6) % 7; // Mo = 0
  return zahlTag(z - wochentag);
}

export const tagPlus = (t: string, n: number) => zahlTag(tagZahl(t) + n);

export type Woche = {
  /** Montag der Woche. */
  start: string;
  /** Tage der Woche im gezeigten Zeitraum (erste und laufende Woche sind kürzer). */
  tage: number;
  laufend: boolean;
  anfragenEigen: number;
  anfragenGekauft: number;
  profileEigen: number;
  profileGekauft: number;
  /** Kunden im Einsatz im Schnitt je Tag dieser Woche. */
  kundenSchnitt: number;
  neueKunden: number;
};
export type Tag = { tag: string; kunden: number };
export type Kacheln = {
  kundenHeute: number;
  kundenVor30: number;
  anfragen7Eigen: number;
  anfragen7Gekauft: number;
  profile7Eigen: number;
  profile7Gekauft: number;
  neueKunden30: number;
};
export type Wachstum = { von: string; heute: string; wochen: Woche[]; tage: Tag[]; kacheln: Kacheln };

export function wachstum(input: {
  leads: WLead[];
  ereignisse: WEreignis[];
  einsaetze: WEinsatz[];
  von: string;
  heute: string;
}): Wachstum {
  const { von, heute } = input;
  const imZeitraum = (t: string) => t >= von && t <= heute;

  const echt = new Map<string, boolean>(); // id → eingekauft?
  for (const l of input.leads) if (istEchterLead(l)) echt.set(l.id, istEingekauftQuelle(l.source));

  // Wochen anlegen
  const wochen = new Map<string, Woche>();
  for (let s = wochenStart(von); s <= heute; s = tagPlus(s, 7)) {
    const erster = s < von ? von : s;
    const letzter = tagPlus(s, 6) > heute ? heute : tagPlus(s, 6);
    wochen.set(s, {
      start: s, tage: tagZahl(letzter) - tagZahl(erster) + 1, laufend: heute <= tagPlus(s, 6),
      anfragenEigen: 0, anfragenGekauft: 0, profileEigen: 0, profileGekauft: 0, kundenSchnitt: 0, neueKunden: 0,
    });
  }
  const woche = (t: string) => wochen.get(wochenStart(t));

  // Anfragen
  const anfrageTag = new Map<string, string>();
  for (const l of input.leads) {
    if (!echt.has(l.id)) continue;
    const t = berlinTag(l.created_at);
    anfrageTag.set(l.id, t);
    if (!imZeitraum(t)) continue;
    const w = woche(t);
    if (!w) continue;
    if (echt.get(l.id)) w.anfragenGekauft++;
    else w.anfragenEigen++;
  }

  // Profile: erstes passendes Ereignis je Lead
  const profilZeit = new Map<string, string>();
  for (const e of input.ereignisse) {
    if (!e.lead_id || !echt.has(e.lead_id) || !PROFIL_EREIGNISSE.includes(e.event_type)) continue;
    const bisher = profilZeit.get(e.lead_id);
    if (!bisher || e.created_at < bisher) profilZeit.set(e.lead_id, e.created_at);
  }
  const profilTag = new Map<string, string>();
  for (const [id, zeit] of Array.from(profilZeit)) {
    const t = berlinTag(zeit);
    profilTag.set(id, t);
    if (!imZeitraum(t)) continue;
    const w = woche(t);
    if (!w) continue;
    if (echt.get(id)) w.profileGekauft++;
    else w.profileEigen++;
  }

  // Kunden im Einsatz: Einsatztage je Kunde vereinigen
  const tageJeKunde = new Map<string, Set<number>>();
  const bisZahl = tagZahl(heute);
  for (const j of input.einsaetze) {
    if (!j.lead_id || !echt.has(j.lead_id) || !j.anreise || !EINSATZ_STATUS.includes(String(j.status))) continue;
    const a = tagZahl(j.anreise.slice(0, 10));
    const b = Math.min(j.abreise ? tagZahl(j.abreise.slice(0, 10)) : bisZahl, bisZahl);
    if (b < a) continue;
    const set = tageJeKunde.get(j.lead_id) ?? new Set<number>();
    for (let z = a; z <= b; z++) set.add(z);
    tageJeKunde.set(j.lead_id, set);
  }
  const kundenJeTag = new Map<number, number>();
  const ersterTag = new Map<string, number>();
  for (const [id, set] of Array.from(tageJeKunde)) {
    let min = Infinity;
    for (const z of Array.from(set)) {
      kundenJeTag.set(z, (kundenJeTag.get(z) ?? 0) + 1);
      if (z < min) min = z;
    }
    ersterTag.set(id, min);
  }
  const tage: Tag[] = [];
  for (let z = tagZahl(von); z <= bisZahl; z++) {
    const t = zahlTag(z);
    const k = kundenJeTag.get(z) ?? 0;
    tage.push({ tag: t, kunden: k });
    const w = woche(t);
    if (w) w.kundenSchnitt += k;
  }
  for (const w of Array.from(wochen.values())) w.kundenSchnitt = w.tage > 0 ? Math.round((w.kundenSchnitt / w.tage) * 10) / 10 : 0;
  for (const z of Array.from(ersterTag.values())) {
    const t = zahlTag(z);
    if (!imZeitraum(t)) continue;
    const w = woche(t);
    if (w) w.neueKunden++;
  }

  // Kacheln: rollierend, heute eingeschlossen
  const ab7 = tagPlus(heute, -6), ab30 = tagPlus(heute, -29);
  const zaehle = (m: Map<string, string>, ab: string, gekauft: boolean) =>
    Array.from(m).filter(([id, t]) => t >= ab && t <= heute && echt.get(id) === gekauft).length;
  const kacheln: Kacheln = {
    kundenHeute: kundenJeTag.get(bisZahl) ?? 0,
    kundenVor30: kundenJeTag.get(bisZahl - 30) ?? 0,
    anfragen7Eigen: zaehle(anfrageTag, ab7, false),
    anfragen7Gekauft: zaehle(anfrageTag, ab7, true),
    profile7Eigen: zaehle(profilTag, ab7, false),
    profile7Gekauft: zaehle(profilTag, ab7, true),
    neueKunden30: Array.from(ersterTag.values()).filter((z) => z >= tagZahl(ab30) && z <= bisZahl).length,
  };

  return { von, heute, wochen: Array.from(wochen.values()), tage, kacheln };
}
