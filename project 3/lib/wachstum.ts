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
  status?: string | null;
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
export type Wachstum = { von: string; heute: string; wochen: Woche[]; tage: Tag[] };

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
  for (const l of input.leads) {
    if (!echt.has(l.id)) continue;
    const t = berlinTag(l.created_at);
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
  for (const [id, zeit] of Array.from(profilZeit)) {
    const t = berlinTag(zeit);
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

  return { von, heute, wochen: Array.from(wochen.values()), tage };
}

/* ─── Potenzialentwicklung im laufenden Monat ─────────────────────────────
 *
 * Martin, 14.09.2026: „wie entwickelt sich das jetzt für den laufenden Monat?
 * Wie viel haben wir jetzt im Einsatz? Wie viele reisen diesen Monat noch an?
 * Wie viele reisen ab und wie viele haben wir in der Suche mit vollständigen
 * Profilen für diesen Monat … fixe plus die neuen als Superchart."
 *
 * - fest: Kunden mit gebuchtem oder abgeschlossenem Einsatz an diesem Tag. Bis
 *   heute ist das der Ist-Stand, danach die Buchungslage (geplante Abreise als
 *   Ende). Eine Abreise ohne gebuchte Nachfolge senkt die Kurve — genau das soll
 *   man sehen.
 * - Potenzial: Kunden mit fertigem Profil und offener Suche (`lead_jobs`
 *   Status `geplant`), gewünschter Start bis Monatsende, höchstens
 *   SUCH_FENSTER_TAGE überfällig (dann ab heute gezählt), nicht „nicht
 *   interessiert“ und in diesem Monat noch ohne Einsatz. Das ist die Obergrenze,
 *   keine Erwartung.
 */

export const SUCH_FENSTER_TAGE = 14;

export type PotenzialTag = { tag: string; fest: number; potenzial: number; vergangen: boolean };
export type Potenzial = {
  monat: string;
  heute: string;
  monatsEnde: string;
  tage: PotenzialTag[];
  jetzt: number;
  anreisenNeu: number;
  anreisenWechsel: number;
  abgaenge: number;
  festAmMonatsende: number;
  inSuche: number;
};

export function potenzial(input: {
  leads: WLead[];
  ereignisse: WEreignis[];
  einsaetze: WEinsatz[];
  heute: string;
}): Potenzial {
  const { heute } = input;
  const monat = heute.slice(0, 7);
  const monatsAnfang = `${monat}-01`;
  const monatsEnde = zahlTag(Date.UTC(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)), 0) / 86400000);
  const h = tagZahl(heute), me = tagZahl(monatsEnde), ma = tagZahl(monatsAnfang);

  const echt = new Map<string, WLead>();
  for (const l of input.leads) if (istEchterLead(l)) echt.set(l.id, l);

  // Belegte Tage je Kunde aus gebuchten/abgeschlossenen Einsätzen — geplante Abreise zählt als Ende
  const belegt = new Map<string, Set<number>>();
  const anreisen: { lead: string; tag: number }[] = [];
  for (const j of input.einsaetze) {
    if (!j.lead_id || !echt.has(j.lead_id) || !j.anreise || !EINSATZ_STATUS.includes(String(j.status))) continue;
    const a = tagZahl(j.anreise.slice(0, 10));
    const b = j.abreise ? tagZahl(j.abreise.slice(0, 10)) : me;
    if (b < a) continue;
    const set = belegt.get(j.lead_id) ?? new Set<number>();
    for (let z = a; z <= b; z++) set.add(z);
    belegt.set(j.lead_id, set);
    if (j.status === 'gebucht' && a > h && a <= me) anreisen.push({ lead: j.lead_id, tag: a });
  }
  const erster = new Map<string, number>(), letzter = new Map<string, number>();
  for (const [id, set] of Array.from(belegt)) {
    let min = Infinity, max = -Infinity;
    for (const z of Array.from(set)) { if (z < min) min = z; if (z > max) max = z; }
    erster.set(id, min); letzter.set(id, max);
  }
  const festAm = (z: number) => Array.from(belegt.values()).filter((s) => s.has(z)).length;

  // Anreisen nach heute bis Monatsende: neu, wenn es der erste Einsatztag des Kunden ist
  let anreisenNeu = 0, anreisenWechsel = 0;
  for (const a of anreisen) {
    if (erster.get(a.lead) === a.tag) anreisenNeu++;
    else anreisenWechsel++;
  }
  // Abgänge: Kunden, deren letzter gebuchter Tag zwischen heute und dem Vortag des Monatsendes liegt
  const abgaenge = Array.from(letzter.values()).filter((z) => z >= h && z < me).length;

  // In der Suche mit fertigem Profil
  const mitProfil = new Set<string>();
  for (const e of input.ereignisse) if (e.lead_id && PROFIL_EREIGNISSE.includes(e.event_type)) mitProfil.add(e.lead_id);
  const imMonatBelegt = (id: string) => {
    const s = belegt.get(id);
    if (!s) return false;
    for (let z = h; z <= me; z++) if (s.has(z)) return true;
    return false;
  };
  const suchStart = new Map<string, number>();
  for (const j of input.einsaetze) {
    if (j.status !== 'geplant' || !j.lead_id || !j.anreise) continue;
    const l = echt.get(j.lead_id);
    if (!l || l.status === 'nicht_interessiert' || !mitProfil.has(j.lead_id) || imMonatBelegt(j.lead_id)) continue;
    const a = tagZahl(j.anreise.slice(0, 10));
    if (a < h - SUCH_FENSTER_TAGE || a > me) continue;
    const start = Math.max(a, h);
    const bisher = suchStart.get(j.lead_id);
    suchStart.set(j.lead_id, bisher === undefined ? start : Math.min(bisher, start));
  }

  const tage: PotenzialTag[] = [];
  for (let z = ma; z <= me; z++) {
    const vergangen = z < h;
    const pot = vergangen ? 0 : Array.from(suchStart.values()).filter((s) => s <= z).length;
    tage.push({ tag: zahlTag(z), fest: festAm(z), potenzial: pot, vergangen });
  }

  return {
    monat, heute, monatsEnde, tage,
    jetzt: festAm(h),
    anreisenNeu, anreisenWechsel, abgaenge,
    festAmMonatsende: festAm(me),
    inSuche: suchStart.size,
  };
}

/* ─── Ergebnisrechnung je Monat ────────────────────────────────────────────
 *
 * Martin, 15.09.2026: „Wir wissen pro Kunde … die Provision (meist 550 Euro).
 * Davon gehen ca. 50 Euro an variablen Kosten an die CG-Kosten und dann die
 * Möglichkeit der manuellen Eingabe von Gemeinkosten pro Monat (Personal,
 * Steuerberater, Marketing etc.), damit wir dann sehen, wo wir stehen."
 *
 * - Provision und variable Kosten gelten je Kunde und vollem Monat; gerechnet
 *   wird je Einsatztag = Wert / 30 (wie der Tagessatz im Portal). Ein Kunde, der
 *   einen ganzen 31-Tage-Monat da ist, bringt also 31/30 der Provision.
 * - Einsatztage wie „Kunden im Einsatz“: je Kunde vereinigt. Im laufenden Monat
 *   zählen die gebuchten Tage bis Monatsende mit (Abreise ohne Nachfolge senkt
 *   die Zahl) — das ist die Hochrechnung, keine Prognose über neue Buchungen.
 * - Werbung kommt automatisch: Google-Anzeigen (`ads_kosten_tag`, netto) und
 *   eingekaufte Anfragen (Stückpreis je Portal, wie die Kosten-Seite). Google
 *   wird im laufenden Monat auf den ganzen Monat hochgerechnet, eingekaufte
 *   Anfragen zählen bis heute (der Einkauf läuft nicht gleichmäßig).
 * - Gemeinkosten trägt Martin je Monat ein. Ein Monat ohne eigenen Eintrag
 *   übernimmt den letzten früheren; vor dem ersten Eintrag gibt es keine.
 */

export const PROVISION_STANDARD = 550;
export const VARIABEL_STANDARD = 50;
export const MAX_POSTEN = 30;

export type Posten = { posten: string; betrag: number };
export type MonatsEinstellung = {
  /** Erster Tag des Monats, "YYYY-MM-01". */
  monat: string;
  provision_je_kunde: number;
  variabel_je_kunde: number;
  gemeinkosten: Posten[];
};
export type AdsKostenTag = { tag: string; kosten_netto: number | string | null };
export type ErgebnisMonat = {
  /** "YYYY-MM" */
  monat: string;
  tageImMonat: number;
  /** Laufender Monat: Einsatztage bis Monatsende gebucht, Google hochgerechnet. */
  laufend: boolean;
  einsatztage: number;
  kundenSchnitt: number;
  provisionJeKunde: number;
  variabelJeKunde: number;
  provision: number;
  variabel: number;
  deckungsbeitrag: number;
  werbungGoogle: number;
  werbungEingekauft: number;
  werbung: number;
  /** null: für diesen Monat gibt es (noch) keine Gemeinkosten. */
  gemeinkosten: number | null;
  posten: Posten[];
  /** Woher Provision, variable Kosten und Gemeinkosten kommen. */
  quelle: 'eigen' | 'uebernommen' | 'keine';
  /** "YYYY-MM" des Monats, dessen Eintrag übernommen wurde. */
  uebernommenAus: string | null;
  /** Deckungsbeitrag − Werbung − Gemeinkosten (fehlende Gemeinkosten = 0). */
  ergebnis: number;
  /** Kunden im Schnitt, ab denen Werbung und Gemeinkosten gedeckt sind; null ohne Gemeinkosten. */
  kostenGedecktAb: number | null;
};

const runden = (v: number) => Math.round(v * 100) / 100;
const monatsEndeVon = (monat: string) => zahlTag(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0) / 86400000);

export function ergebnisJeMonat(input: {
  leads: WLead[];
  einsaetze: WEinsatz[];
  adsKosten: AdsKostenTag[];
  einstellungen: MonatsEinstellung[];
  /** Stückpreis je Portal-Domain, netto (lib/lead-kosten.ts PORTAL_PREISE). */
  portalPreise: Record<string, number>;
  heute: string;
  von?: string;
}): ErgebnisMonat[] {
  const { heute } = input;
  const von = (input.von ?? WACHSTUM_START).slice(0, 7) + '-01';
  const laufenderMonat = heute.slice(0, 7);
  const ende = tagZahl(monatsEndeVon(laufenderMonat));

  const echt = new Set<string>();
  for (const l of input.leads) if (istEchterLead(l)) echt.add(l.id);

  // Einsatztage je Kunde: bis heute der Ist-Stand, danach die Buchung bis Monatsende
  const belegt = new Map<string, Set<number>>();
  for (const j of input.einsaetze) {
    if (!j.lead_id || !echt.has(j.lead_id) || !j.anreise || !EINSATZ_STATUS.includes(String(j.status))) continue;
    const a = tagZahl(j.anreise.slice(0, 10));
    const b = Math.min(j.abreise ? tagZahl(j.abreise.slice(0, 10)) : ende, ende);
    if (b < a) continue;
    const set = belegt.get(j.lead_id) ?? new Set<number>();
    for (let z = a; z <= b; z++) set.add(z);
    belegt.set(j.lead_id, set);
  }
  const tageJeMonat = new Map<string, number>();
  for (const set of Array.from(belegt.values())) {
    for (const z of Array.from(set)) {
      const m = zahlTag(z).slice(0, 7);
      tageJeMonat.set(m, (tageJeMonat.get(m) ?? 0) + 1);
    }
  }

  // Google-Kosten je Monat; im laufenden Monat nur volle Tage (vor heute) für den Tagesschnitt
  const google = new Map<string, { summe: number; tage: number }>();
  for (const r of input.adsKosten) {
    const t = String(r.tag).slice(0, 10);
    const m = t.slice(0, 7);
    if (m === laufenderMonat && t >= heute) continue;
    const g = google.get(m) ?? { summe: 0, tage: 0 };
    g.summe += Number(r.kosten_netto ?? 0);
    g.tage++;
    google.set(m, g);
  }

  // Eingekaufte Anfragen je Monat (wie die Kosten-Seite: alles außer Tests)
  const eingekauft = new Map<string, number>();
  for (const l of input.leads) {
    if (l.ist_test || !istEingekauftQuelle(l.source)) continue;
    const domain = String(l.source).slice('portal:'.length).toLowerCase();
    const m = berlinTag(l.created_at).slice(0, 7);
    eingekauft.set(m, (eingekauft.get(m) ?? 0) + (input.portalPreise[domain] ?? 0));
  }

  const eintraege = [...input.einstellungen]
    .map((e) => ({ ...e, monat: String(e.monat).slice(0, 7) }))
    .sort((a, b) => a.monat.localeCompare(b.monat));

  const monate: ErgebnisMonat[] = [];
  for (let m = von.slice(0, 7); m <= laufenderMonat; m = tagPlus(monatsEndeVon(m), 1).slice(0, 7)) {
    const tageImMonat = Number(monatsEndeVon(m).slice(8, 10));
    const laufend = m === laufenderMonat;
    const eigen = eintraege.find((e) => e.monat === m);
    const frueher = eigen ? undefined : eintraege.filter((e) => e.monat < m).pop();
    const e = eigen ?? frueher;
    const provisionJeKunde = e ? Number(e.provision_je_kunde) : PROVISION_STANDARD;
    const variabelJeKunde = e ? Number(e.variabel_je_kunde) : VARIABEL_STANDARD;
    const posten = e ? e.gemeinkosten.map((p) => ({ posten: p.posten, betrag: Number(p.betrag) })) : [];
    const gemeinkosten = e ? runden(posten.reduce((s, p) => s + p.betrag, 0)) : null;

    const einsatztage = tageJeMonat.get(m) ?? 0;
    const provision = runden((einsatztage * provisionJeKunde) / 30);
    const variabel = runden((einsatztage * variabelJeKunde) / 30);
    const deckungsbeitrag = runden(provision - variabel);

    const g = google.get(m);
    const werbungGoogle = !g ? 0 : runden(laufend ? (g.summe / g.tage) * tageImMonat : g.summe);
    const werbungEingekauft = runden(eingekauft.get(m) ?? 0);
    const werbung = runden(werbungGoogle + werbungEingekauft);

    const dbJeKundeImMonat = ((provisionJeKunde - variabelJeKunde) * tageImMonat) / 30;
    monate.push({
      monat: m, tageImMonat, laufend, einsatztage,
      kundenSchnitt: Math.round((einsatztage / tageImMonat) * 10) / 10,
      provisionJeKunde, variabelJeKunde, provision, variabel, deckungsbeitrag,
      werbungGoogle, werbungEingekauft, werbung,
      gemeinkosten, posten,
      quelle: eigen ? 'eigen' : frueher ? 'uebernommen' : 'keine',
      uebernommenAus: frueher ? frueher.monat : null,
      ergebnis: runden(deckungsbeitrag - werbung - (gemeinkosten ?? 0)),
      kostenGedecktAb: gemeinkosten === null || dbJeKundeImMonat <= 0
        ? null
        : Math.round(((werbung + gemeinkosten) / dbJeKundeImMonat) * 10) / 10,
    });
  }
  return monate;
}

/** Prüft, was der Admin für einen Monat speichern will. Liefert den sauberen Datensatz oder einen Fehlertext. */
export function pruefeMonatsEingabe(body: unknown): { ok: true; wert: MonatsEinstellung } | { ok: false; fehler: string } {
  if (!body || typeof body !== 'object') return { ok: false, fehler: 'Kein Inhalt.' };
  const b = body as Record<string, unknown>;
  const monat = String(b.monat ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return { ok: false, fehler: 'Monat fehlt oder ist ungültig (JJJJ-MM).' };
  // Zahlen oder "1200", "1200,50", "1200.5" — "1.200" ist mehrdeutig (Tausenderpunkt?) und wird abgelehnt statt als 1,2 gelesen
  const zahl = (v: unknown) => {
    if (typeof v === 'number') return v;
    const s = typeof v === 'string' ? v.trim() : '';
    return /^\d+([.,]\d{1,2})?$/.test(s) ? Number(s.replace(',', '.')) : NaN;
  };
  const provision = zahl(b.provision_je_kunde);
  const variabel = zahl(b.variabel_je_kunde);
  if (!Number.isFinite(provision) || provision < 0 || provision > 100000) return { ok: false, fehler: 'Provision je Kunde muss eine Zahl ab 0 sein.' };
  if (!Number.isFinite(variabel) || variabel < 0 || variabel > 100000) return { ok: false, fehler: 'Variable Kosten je Kunde müssen eine Zahl ab 0 sein.' };
  if (!Array.isArray(b.gemeinkosten)) return { ok: false, fehler: 'Gemeinkosten fehlen.' };
  if (b.gemeinkosten.length > MAX_POSTEN) return { ok: false, fehler: `Höchstens ${MAX_POSTEN} Posten je Monat.` };
  const posten: Posten[] = [];
  for (const p of b.gemeinkosten) {
    const roh = (p as Record<string, unknown>)?.betrag;
    const name = String((p as Record<string, unknown>)?.posten ?? '').trim().slice(0, 60);
    // Zeile ohne Betrag zählt nicht (auch ein vorgeschlagener Posten, den Martin leer lässt)
    if (roh === '' || roh === null || roh === undefined) continue;
    const betrag = zahl(roh);
    if (!name) return { ok: false, fehler: 'Jeder Posten mit Betrag braucht einen Namen.' };
    if (!Number.isFinite(betrag) || betrag < 0 || betrag > 10000000) return { ok: false, fehler: `Betrag für „${name}“ muss eine Zahl ab 0 sein.` };
    posten.push({ posten: name, betrag: runden(betrag) });
  }
  return { ok: true, wert: { monat: `${monat}-01`, provision_je_kunde: runden(provision), variabel_je_kunde: runden(variabel), gemeinkosten: posten } };
}
