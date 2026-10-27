/**
 * Trichter je Kanal (Registry #142, Martin 27.10.2026: „ja mach" zum Masterplan
 * „Zielgröße fertige Profile, Zielkorridor 60–80 € je Profil, bis 100 € akzeptabel").
 *
 * Kette je Anfrage: Anfrage → Portal geöffnet → Bogen im Bild → Bogen begonnen →
 * Profil vollständig (selbst) → Team-Profil-Indiz → Profile gesamt → Einladung →
 * Bewerbung → Buchung. Dazu Kosten je Kanal aus den echten Google-Kosten je Kampagne
 * (`ads_kosten_kampagne_tag`) und dem Stückpreis eingekaufter Anfragen.
 *
 * Reine Rechenlogik ohne Datenbank — dadurch testbar (src/__tests__/trichter.test.ts).
 * Die Definitionen sind dieselben wie im Referenz-Export vom 27.10.2026
 * (seo-reports/…/vorlage_2710/roh_export/x01_export.py); Abweichungen stehen unten
 * an der jeweiligen Stelle.
 *
 * DATENSCHUTZ: Kontaktfelder (Mail, Telefon, Name) und Klickkennungen dienen hier
 * nur der Test- und Doppelten-Erkennung. Nichts davon landet in `AnfrageZeile`, im
 * JSON oder in einer CSV. Die Anfrage-ID ist ein HMAC-Pseudonym, nie die Lead-ID.
 */
import { createHmac } from 'crypto';
import { PORTAL_PREISE } from './lead-kosten';
import { berlinTag, tagPlus } from './wachstum';

// ─── Feste Werte ──────────────────────────────────────────────────────────

/** Google-Kampagnen mit eigenem Kanal (utm_campaign = Kampagnen-ID). */
export const KAMPAGNEN: Record<string, 'High Intent' | 'PM'> = {
  '23745538003': 'High Intent',
  '23585162828': 'PM',
};

/** Kampagnenname, solange ads_kosten_kampagne_tag noch keinen liefert (Namen wie im Google-Konto). */
export const KAMPAGNEN_NAMEN: Record<string, string> = {
  '23745538003': 'High Intent',
  '23585162828': 'PM-Deutschland_int_Kosten',
};

/** Reihenfolge der Kanäle in Tabellen und Dateien. */
export const KANAELE = [
  'High Intent', 'PM', 'Google sonstige', 'Google ohne Zuordnung',
  'Website', 'KI-Assistent', 'direkt', 'eingekauft', 'sonstige',
] as const;
export type Kanal = (typeof KANAELE)[number];

/** Kanäle, deren Kosten aus Google stammen. */
const GOOGLE_KANAELE: Kanal[] = ['High Intent', 'PM', 'Google sonstige', 'Google ohne Zuordnung'];

/** „Bogen im Bild", „Feld berührt", „Weiter blockiert" gibt es erst seit #805 (22.10.2026, 15:29 Berlin). */
export const MESS_AB_BOGEN = '2026-10-22T13:29:00Z';
/** „Profil einer Pflegekraft geöffnet" gibt es seit 14.10.2026 (Berlin). */
export const MESS_AB_PROFIL_GEOEFFNET = '2026-10-13T22:00:00Z';
/** Eine Kohorte ist reif, wenn die Anfrage mindestens so alt ist. */
export const REIFE_STUNDEN = 72;
/** Zielkorridor je Profil (Masterplan): bis 80 € grün, bis 100 € gelb, darüber rot. */
export const ZIEL_GRUEN_BIS = 80;
export const ZIEL_GELB_BIS = 100;
/** Weiter zurück liest die Seite nicht. */
export const MAX_TAGE_ZURUECK = 400;
export const STANDARD_TAGE = 30;

/** Ereignisse ohne Metadaten — nur Typ und Zeit werden gelesen. */
export const EREIGNISSE_OHNE_METADATEN = [
  'angebot_requested_duplicate', 'portal_opened', 'portal_reopened', 'formular_sichtbar',
  'feld_beruehrt', 'weiter_blockiert', 'patient_data_saved', 'patient_form_save_failed',
  'patient_form_location_unresolved', 'profil_geoeffnet', 'caregiver_invited', 'application_received',
];
/** Ereignisse, von denen EINZELNE Metadaten-Felder gebraucht werden. `portal_lead_eingekauft`
 *  trägt im vollen `metadata` den Portal-Datensatz (Krankheiten, Gewicht …) — deshalb wird nur
 *  `metadata->>portal` gelesen, nie das ganze Feld. */
export const EREIGNISSE_MIT_FELDERN = ['patient_form_step', 'website_einstieg', 'portal_lead_eingekauft'];
/** PostgREST-Auswahl für EREIGNISSE_MIT_FELDERN. */
export const FELDER_AUSWAHL =
  'lead_id, event_type, created_at, step:metadata->>step, herkunft:metadata->>herkunft, art:metadata->>art, portal:metadata->>portal';

/** Lead-Spalten, die der Server liest. Kontaktfelder nur für Tests und Doppelte. */
export const LEAD_SPALTEN =
  'id, created_at, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, gbraid, wbraid, ist_test, email, telefon, vorname, nachname';

// ─── Eingangstypen ────────────────────────────────────────────────────────

export type TLead = {
  id: string;
  created_at: string;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  ist_test?: boolean | null;
  email?: string | null;
  telefon?: string | null;
  vorname?: string | null;
  nachname?: string | null;
};
export type TEreignis = {
  lead_id: string | null;
  event_type: string;
  created_at: string;
  step?: string | number | null;
  herkunft?: string | null;
  art?: string | null;
  portal?: string | null;
};
export type TAnnahme = { lead_id: string | null; accepted_at: string | null; signed_at?: string | null };
export type KostenKampagneTag = {
  tag: string;
  kampagne_id: string;
  kampagne_name?: string | null;
  kosten_netto: number | string | null;
  klicks?: number | null;
  impressionen?: number | null;
};
export type KostenTag = { tag: string; kosten_netto: number | string | null };

// ─── Zeit ─────────────────────────────────────────────────────────────────

const BERLIN_ZEIT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** „YYYY-MM-DD HH:MM" in Berliner Zeit (wie der Referenz-Export). */
export function berlinZeit(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  const p: Record<string, string> = {};
  BERLIN_ZEIT.formatToParts(t).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Abstand Berlin − UTC in Millisekunden zum Zeitpunkt `ms`. */
function berlinVersatz(ms: number): number {
  const z = berlinZeit(new Date(ms).toISOString());
  const lokal = Date.UTC(Number(z.slice(0, 4)), Number(z.slice(5, 7)) - 1, Number(z.slice(8, 10)),
    Number(z.slice(11, 13)), Number(z.slice(14, 16)));
  return lokal - Math.floor(ms / 60000) * 60000;
}

/** Beginn eines Berliner Kalendertags als UTC-Zeitpunkt (Sommer- und Winterzeit). */
export function berlinTagBeginn(tag: string): Date {
  const mitternachtUtc = Date.UTC(Number(tag.slice(0, 4)), Number(tag.slice(5, 7)) - 1, Number(tag.slice(8, 10)));
  let ms = mitternachtUtc - berlinVersatz(mitternachtUtc);
  ms = mitternachtUtc - berlinVersatz(ms);
  return new Date(ms);
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/**
 * Letzter Tag, dessen Anfragen alle mindestens REIFE_STUNDEN alt sind: der Tag vor dem
 * Berliner Tag der Grenze (jetzt − 72 h). Der Tag der Grenze selbst hat immer noch
 * Anfragen nach ihr — auch um Mitternacht, dann beginnt er genau an der Grenze.
 */
export function reifBis(jetzt: Date): string {
  return tagPlus(berlinTag(new Date(jetzt.getTime() - REIFE_STUNDEN * 3600_000)), -1);
}

// ─── Zeitraum ─────────────────────────────────────────────────────────────

const TAG_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const gueltigerTag = (t: string) => TAG_FORMAT.test(t) && !isNaN(Date.parse(`${t}T00:00:00Z`))
  && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

export type Zeitraum = { von: string; bis: string; hinweis: string | null };

/**
 * von/bis aus der Adresse. Ohne Angabe: die letzten 30 Tage bis heute. Weiter als 400 Tage
 * zurück wird auf 400 gekürzt (mit Hinweis), ein Ende in der Zukunft auf heute.
 */
export function pruefeZeitraum(vonRoh: string | null, bisRoh: string | null, heute: string):
  { ok: true; wert: Zeitraum } | { ok: false; fehler: string } {
  const bisText = (bisRoh ?? '').trim() || heute;
  const vonText = (vonRoh ?? '').trim() || tagPlus(bisText > heute ? heute : bisText, -(STANDARD_TAGE - 1));
  if (!gueltigerTag(vonText) || !gueltigerTag(bisText)) return { ok: false, fehler: 'Datum ungültig (JJJJ-MM-TT).' };
  let von = vonText;
  let bis = bisText > heute ? heute : bisText;
  let hinweis: string | null = null;
  const fruehestens = tagPlus(heute, -MAX_TAGE_ZURUECK);
  if (von < fruehestens) {
    von = fruehestens;
    hinweis = `Der Zeitraum reicht höchstens ${MAX_TAGE_ZURUECK} Tage zurück und beginnt deshalb am ${von}.`;
  }
  if (von > bis) return { ok: false, fehler: 'Der Beginn liegt nach dem Ende.' };
  return { ok: true, wert: { von, bis, hinweis } };
}

/** Alle Tage von–bis einschließlich. */
export function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = [];
  for (let t = von; t <= bis; t = tagPlus(t, 1)) tage.push(t);
  return tage;
}

// ─── Tests und Doppelte ───────────────────────────────────────────────────

/** Prüfquellen aus der Entwicklung (Registry #13 ff.). */
const TEST_QUELLEN = new Set(['equip-check', 'equip-probe', 'matrix-10-test', 'preserve-fix-test', 'manual-debug']);

/**
 * Test-Anfrage? Gleiche Regel wie der Referenz-Export: Kennzeichen `ist_test`, eigene
 * Mail-Domains, „Test" als Wortanfang im Namen, Prüfquellen.
 *
 * Bewusst NICHT `istEchterLead` aus lib/wachstum.ts: die Regel wirft jede Mail mit „test"
 * irgendwo in der Adresse raus. Am 14.09.2026 traf das eine echte Google-Anfrage mit
 * Bewerbungen (Adresse der Form „xxxxtestx@…"). Die Seite würde dann eine Anfrage weniger
 * zählen als der Abgleich.
 */
export function istTestAnfrage(l: TLead): boolean {
  if (l.ist_test) return true;
  const mail = String(l.email ?? '').toLowerCase();
  if (['@mamamia.app', '@primundus.de', '@wyzzi.net', '@example.', 'mailinator'].some((d) => mail.includes(d))) return true;
  if (/(^|[^\p{L}\p{N}_])test/iu.test(`${l.vorname ?? ''} ${l.nachname ?? ''}`)) return true;
  return TEST_QUELLEN.has(String(l.source ?? ''));
}

/** Telefonnummer vergleichbar machen: Ziffern, ohne +49/0049 und führende Null, letzte 9 Ziffern. */
export function telefonSchluessel(roh: string | null | undefined): string {
  let d = String(roh ?? '').replace(/\D/g, '');
  if (d.startsWith('0049')) d = d.slice(4);
  else if (d.startsWith('49')) d = d.slice(2);
  if (d.length < 6) return '';
  return d.replace(/^0+/, '').slice(-9);
}

/**
 * Doppelte Anfragen: gleiche Mail, Telefonnummer (normalisiert) oder gclid wie eine FRÜHERE
 * echte Anfrage — auch eine vor dem gewählten Zeitraum. Ergebnis: Lead-ID → erste frühere
 * Anfrage. `alle` muss alle Leads bis zum Ende des Zeitraums enthalten.
 */
export function doppelteAnfragen(alle: TLead[]): Map<string, TLead> {
  const sortiert = alle.filter((l) => !istTestAnfrage(l))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id.localeCompare(b.id));
  const erster = new Map<string, TLead>();
  const doppelt = new Map<string, TLead>();
  for (const l of sortiert) {
    const schluessel: string[] = [];
    const mail = String(l.email ?? '').trim().toLowerCase();
    if (mail) schluessel.push(`m:${mail}`);
    const tel = telefonSchluessel(l.telefon);
    if (tel) schluessel.push(`t:${tel}`);
    if (l.gclid) schluessel.push(`g:${l.gclid}`);
    let frueheste: TLead | null = null;
    for (const k of schluessel) {
      const f = erster.get(k);
      if (f && (!frueheste || ms(f.created_at) < ms(frueheste.created_at))) frueheste = f;
    }
    if (frueheste) doppelt.set(l.id, frueheste);
    for (const k of schluessel) if (!erster.has(k)) erster.set(k, l);
  }
  return doppelt;
}

// ─── Kanal ────────────────────────────────────────────────────────────────

const KI_QUELLEN = ['chatgpt', 'perplexity', 'copilot', 'gemini', 'claude', 'openai'];
/** Kennungen aus der Adresse sind Fremdtext: nur kurze, harmlose Zeichen weitergeben. */
const kennung = (s: string | null | undefined) => {
  const t = String(s ?? '').trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(t) ? t : (t ? 'unlesbar' : '');
};

/**
 * Kanal einer Anfrage. Reihenfolge wie im Referenz-Export: eingekauft → Google → KI-Assistent →
 * Website → sonstige Kennung → direkt.
 *
 * Google: Kampagne aus `utm_campaign` (= Kampagnen-ID). Der Referenz-Export nahm sie aus
 * `click_view`; das gibt es serverseitig nicht. Abweichung: Die Kampagne steht erst ab dem
 * 07.09.2026 am Lead (Migration 20260909110000), lückenlos erst ab dem 11.09. (letzte Google-
 * Anfrage ohne Kampagne: 10.09., 16:12) — ältere landen in „Google ohne Zuordnung".
 */
export function kanalJeAnfrage(l: TLead, ereignisse: TEreignis[]): { kanal: Kanal; herkunft: string } {
  const quelle = String(l.source ?? '');
  const us = String(l.utm_source ?? '').toLowerCase();
  if (quelle.toLowerCase().startsWith('portal:') || ereignisse.some((e) => e.event_type === 'portal_lead_eingekauft')) {
    return { kanal: 'eingekauft', herkunft: 'eingekauft (Portal)' };
  }
  if (l.gclid || l.gbraid || l.wbraid) {
    const uc = String(l.utm_campaign ?? '').trim();
    const id = Object.keys(KAMPAGNEN).find((k) => uc.includes(k));
    const kanal: Kanal = id ? KAMPAGNEN[id] : /^\d+$/.test(uc) ? 'Google sonstige' : 'Google ohne Zuordnung';
    return { kanal, herkunft: 'Google Ads' };
  }
  if (KI_QUELLEN.some((k) => us.includes(k))) return { kanal: 'KI-Assistent', herkunft: `KI-Assistent (${kennung(us)})` };
  if (quelle.startsWith('website:')) {
    const neu = ereignisse.find((e) => e.event_type === 'website_einstieg' && e.art === 'neu');
    return { kanal: 'Website', herkunft: `Website primundus.de (Herkunft ${kennung(neu?.herkunft) || 'unbekannt'})` };
  }
  if (us) return { kanal: 'sonstige', herkunft: `sonstige Kennung (${kennung(us)}/${kennung(l.utm_medium)})` };
  return { kanal: 'direkt', herkunft: 'Rechner direkt (ohne Kennung)' };
}

/** Portal einer eingekauften Anfrage (für den Stückpreis): aus `source`, sonst aus dem Ereignis. */
export function portalJeAnfrage(l: TLead, ereignisse: TEreignis[]): string | null {
  const q = String(l.source ?? '').trim().toLowerCase();
  if (q.startsWith('portal:')) return q.slice('portal:'.length) || null;
  const e = ereignisse.find((x) => x.event_type === 'portal_lead_eingekauft' && x.portal);
  return e?.portal ? String(e.portal).toLowerCase() : null;
}

// ─── Kette je Anfrage ─────────────────────────────────────────────────────

/** Eine Zeile je Anfrage — nur Prozessdaten. `leadId` bleibt im Server (nie in CSV/JSON). */
export type AnfrageZeile = {
  leadId: string;
  anfrageId: string;
  zeit: string;
  tag: string;
  kanal: Kanal;
  herkunft: string;
  googleKennung: '' | 'gclid' | 'wbraid/gbraid';
  kampagneId: string;
  anzeigenId: string;
  keyword: string;
  portal: string | null;
  doppelt: boolean;
  doppeltZu: string;
  doppeltZuVorZeitraum: boolean | null;
  rechnerDoppelt: boolean;
  portalGeoeffnet: boolean;
  portalErstmals: string;
  portalBesuche: number;
  profilGeoeffnet: boolean | null; // null = nicht gemessen
  bogenGemessen: boolean;
  bogenImBild: boolean;
  feldBeruehrt: boolean;
  weiterBlockiert: number;
  bogenBegonnen: boolean;
  hoechsterSchritt: number | null;
  ersterSchritt: string;
  profilSelbst: boolean;
  profilZeit: string;
  profilMinuten: number | null;
  teamIndiz: boolean;
  speicherfehler: number;
  einladungen: number;
  ersteEinladung: string;
  bewerbungen: number;
  ersteBewerbung: string;
  buchung: boolean;
  buchungZeit: string;
  vertragUnterschrieben: string;
  reif: boolean;
};

/** Pseudonym der Anfrage: „A-" + 12 Hex-Zeichen HMAC-SHA256. Ohne Geheimnis nicht umkehrbar. */
export function pseudonym(leadId: string, geheimnis: string): string {
  return 'A-' + createHmac('sha256', geheimnis).update(`trichter-export:${leadId}`).digest('hex').slice(0, 12);
}

export function anfrageZeilen(input: {
  /** Alle Leads bis zum Ende des Zeitraums (für Doppelte). */
  alle: TLead[];
  ereignisse: TEreignis[];
  annahmen: TAnnahme[];
  von: string;
  bis: string;
  jetzt: Date;
  pseudo: (leadId: string) => string;
}): { zeilen: AnfrageZeile[]; tests: number } {
  const doppelt = doppelteAnfragen(input.alle);
  const imZeitraum = input.alle.filter((l) => { const t = berlinTag(l.created_at); return t >= input.von && t <= input.bis; });
  const tests = imZeitraum.filter(istTestAnfrage).length;

  const jeLead = new Map<string, TEreignis[]>();
  input.ereignisse.forEach((e) => {
    if (!e.lead_id) return;
    const liste = jeLead.get(e.lead_id) ?? [];
    liste.push(e);
    jeLead.set(e.lead_id, liste);
  });
  const annahmenJeLead = new Map<string, TAnnahme[]>();
  input.annahmen.forEach((a) => {
    if (!a.lead_id) return;
    const liste = annahmenJeLead.get(a.lead_id) ?? [];
    liste.push(a);
    annahmenJeLead.set(a.lead_id, liste);
  });
  const reifGrenze = input.jetzt.getTime() - REIFE_STUNDEN * 3600_000;

  const zeilen = imZeitraum.filter((l) => !istTestAnfrage(l)).map((l): AnfrageZeile => {
    const es = (jeLead.get(l.id) ?? []).slice().sort((a, b) => ms(a.created_at) - ms(b.created_at));
    const typ = (t: string) => es.filter((e) => e.event_type === t);
    const erst = (t: string) => typ(t)[0]?.created_at ?? null;
    const { kanal, herkunft } = kanalJeAnfrage(l, es);
    const anfrageMs = ms(l.created_at);
    const gemessen = anfrageMs >= ms(MESS_AB_BOGEN);
    const schritte = typ('patient_form_step').map((e) => Number(e.step) || 0);
    const profilT = erst('patient_data_saved');
    const besuche = typ('portal_opened').concat(typ('portal_reopened'));
    const annahme = (annahmenJeLead.get(l.id) ?? []).slice()
      .sort((a, b) => String(a.accepted_at ?? '').localeCompare(String(b.accepted_at ?? '')))[0];
    const dv = doppelt.get(l.id);
    const google = !!(l.gclid || l.gbraid || l.wbraid);
    const nurZiffern = (s: string | null | undefined) => (/^\d{1,20}$/.test(String(s ?? '').trim()) ? String(s).trim() : '');
    return {
      leadId: l.id,
      anfrageId: input.pseudo(l.id),
      zeit: berlinZeit(l.created_at),
      tag: berlinTag(l.created_at),
      kanal,
      herkunft,
      googleKennung: l.gclid ? 'gclid' : (l.gbraid || l.wbraid) ? 'wbraid/gbraid' : '',
      kampagneId: google ? nurZiffern(l.utm_campaign) : '',
      anzeigenId: google ? nurZiffern(l.utm_content) : '',
      keyword: google ? keywordBereinigen(l.utm_term) : '',
      portal: kanal === 'eingekauft' ? portalJeAnfrage(l, es) : null,
      doppelt: !!dv,
      doppeltZu: dv ? input.pseudo(dv.id) : '',
      doppeltZuVorZeitraum: dv ? berlinTag(dv.created_at) < input.von : null,
      rechnerDoppelt: typ('angebot_requested_duplicate').length > 0,
      portalGeoeffnet: besuche.length > 0,
      portalErstmals: besuche.length ? berlinZeit(besuche.map((e) => e.created_at).sort((a, b) => ms(a) - ms(b))[0]) : '',
      portalBesuche: besuche.length,
      profilGeoeffnet: typ('profil_geoeffnet').length > 0 ? true : anfrageMs >= ms(MESS_AB_PROFIL_GEOEFFNET) ? false : null,
      bogenGemessen: gemessen,
      bogenImBild: gemessen && typ('formular_sichtbar').length > 0,
      feldBeruehrt: gemessen && typ('feld_beruehrt').length > 0,
      weiterBlockiert: gemessen ? typ('weiter_blockiert').length : 0,
      bogenBegonnen: schritte.length > 0,
      hoechsterSchritt: schritte.length ? Math.max(...schritte) : null,
      ersterSchritt: berlinZeit(erst('patient_form_step')),
      profilSelbst: !!profilT,
      profilZeit: berlinZeit(profilT),
      profilMinuten: profilT ? Math.round((ms(profilT) - anfrageMs) / 60000) : null,
      teamIndiz: !profilT && (typ('caregiver_invited').length > 0 || typ('application_received').length > 0),
      speicherfehler: typ('patient_form_save_failed').length + typ('patient_form_location_unresolved').length,
      einladungen: typ('caregiver_invited').length,
      ersteEinladung: berlinZeit(erst('caregiver_invited')),
      bewerbungen: typ('application_received').length,
      ersteBewerbung: berlinZeit(erst('application_received')),
      buchung: !!annahme?.accepted_at,
      buchungZeit: berlinZeit(annahme?.accepted_at),
      vertragUnterschrieben: berlinZeit(annahme?.signed_at),
      reif: anfrageMs <= reifGrenze,
    };
  });
  zeilen.sort((a, b) => a.zeit.localeCompare(b.zeit) || a.anfrageId.localeCompare(b.anfrageId));
  return { zeilen, tests };
}

/**
 * Keyword aus utm_term: das gebuchte Keyword. utm_term ist ein Adressparameter und kann frei
 * gesetzt werden — deshalb nur Buchstaben, Ziffern, Leerzeichen, „+“, „-“ und „.“, höchstens
 * 6 Wörter, und nichts, was nach Kontaktdaten aussieht. Sonst bleibt das Feld leer.
 */
export function keywordBereinigen(roh: string | null | undefined): string {
  const t = String(roh ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  if (!t || t.includes('@') || /\d{6,}/.test(t.replace(/\s/g, ''))) return '';
  if (!/^[\p{L}\p{N} +.-]+$/u.test(t) || t.split(' ').length > 6) return '';
  return t;
}

// ─── Kosten ───────────────────────────────────────────────────────────────

const zahl = (v: number | string | null | undefined) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const rund = (n: number) => Math.round(n * 100) / 100;

export type KostenLage = {
  /** Tabelle ads_kosten_kampagne_tag gibt es (Migration eingespielt). */
  tabelleDa: boolean;
  /** Tage (vor heute) ohne Kampagnen-Kosten, obwohl Google an dem Tag Kosten hatte. */
  fehlendeTage: string[];
  /** Kosten je Tag und Kanal aus der Kampagnen-Tabelle. */
  jeTag: Map<string, Partial<Record<Kanal, number>>>;
  /** Google gesamt je Tag aus ads_kosten_tag (Gegenprobe). */
  googleTag: Map<string, number>;
  /** Tage (vor heute) ohne Zeile in ads_kosten_tag. */
  fehlendeTageGesamt: string[];
};

/** Kampagne → Kanal: High Intent, PM, sonst „Google sonstige". */
export const kanalDerKampagne = (id: string): Kanal => KAMPAGNEN[String(id)] ?? 'Google sonstige';

/**
 * Kosten je Tag und Google-Kanal. Ein Tag gilt als vorhanden, wenn es Kampagnen-Zeilen gibt
 * oder der Google-Tag 0 € kostete (dann gibt es keine Zeile mit Einblendungen). Heute fehlt
 * immer — die Kosten schreibt erst der Morgenbericht von morgen.
 */
export function kostenLage(input: {
  kampagne: KostenKampagneTag[] | null;
  gesamt: KostenTag[] | null;
  von: string;
  bis: string;
  heute: string;
}): KostenLage {
  const jeTag = new Map<string, Partial<Record<Kanal, number>>>();
  (input.kampagne ?? []).forEach((z) => {
    const t = String(z.tag).slice(0, 10);
    const k = kanalDerKampagne(z.kampagne_id);
    const tag = jeTag.get(t) ?? {};
    tag[k] = rund((tag[k] ?? 0) + zahl(z.kosten_netto));
    jeTag.set(t, tag);
  });
  const googleTag = new Map<string, number>();
  (input.gesamt ?? []).forEach((z) => googleTag.set(String(z.tag).slice(0, 10), zahl(z.kosten_netto)));
  const vergangen = tageZwischen(input.von, input.bis).filter((t) => t < input.heute);
  return {
    tabelleDa: input.kampagne !== null,
    fehlendeTage: input.kampagne === null ? vergangen
      : vergangen.filter((t) => !jeTag.has(t) && googleTag.get(t) !== 0),
    jeTag,
    googleTag,
    fehlendeTageGesamt: vergangen.filter((t) => !googleTag.has(t)),
  };
}

/** Farbe gegen den Zielkorridor. */
export function zielFarbe(jeProfil: number | null): 'gruen' | 'gelb' | 'rot' | null {
  if (jeProfil === null) return null;
  return jeProfil <= ZIEL_GRUEN_BIS ? 'gruen' : jeProfil <= ZIEL_GELB_BIS ? 'gelb' : 'rot';
}

// ─── Summen ───────────────────────────────────────────────────────────────

export type Stufen = {
  anfragen: number;
  davonDoppelt: number;
  ohneDoppelte: number;
  portalGeoeffnet: number;
  /** Anfragen, bei denen „Bogen im Bild" gemessen wurde (seit 22.10.2026, 15:29). */
  bogenGemessen: number;
  bogenImBild: number;
  bogenBegonnen: number;
  profilSelbst: number;
  teamIndiz: number;
  /** selbst + Team-Indiz; das Indiz setzt „kein patient_data_saved" voraus, also keine Doppelzählung. */
  profileGesamt: number;
  mitEinladung: number;
  mitBewerbung: number;
  buchungen: number;
};

export type KanalSumme = Stufen & {
  kanal: Kanal | 'Google gesamt' | 'Zusammen';
  /** Kosten netto in Euro; null = nicht bekannt (keine Kosten oder Kosten fehlen für Tage). */
  kosten: number | null;
  kostenArt: 'google' | 'einkauf' | null;
  /** null bei unbekannten Kosten, ohne Profil (dann bei Kosten > 0 Farbe „rot“) oder bei `jeProfilOffen`. */
  jeProfil: number | null;
  jeProfilSelbst: number | null;
  farbe: 'gruen' | 'gelb' | 'rot' | null;
  farbeSelbst: 'gruen' | 'gelb' | 'rot' | null;
  /**
   * Kosten je Profil nicht belastbar: Im Zeitraum gibt es Google-Anfragen ohne Kampagne.
   * Ihre Kosten stecken in High Intent / PM, ihre Profile nicht — der Nenner wäre zu klein.
   */
  jeProfilOffen: boolean;
};

export type TagZeile = Stufen & { tag: string; kanal: Kanal; kosten: number | null; jeProfilOffen: boolean; reif: boolean };

type Farbe = KanalSumme['farbe'];

/**
 * Kosten je Profil mit Farbe. Kosten > 0 ohne ein einziges Profil ist der schlechteste Fall
 * und darf nicht wie „keine Kosten“ aussehen: Wert null, Farbe rot.
 */
function jeProfilMitFarbe(kosten: number | null, profile: number, offen: boolean): { wert: number | null; farbe: Farbe } {
  if (offen || kosten === null) return { wert: null, farbe: null };
  if (profile === 0) return { wert: null, farbe: kosten > 0 ? 'rot' : null };
  const wert = rund(kosten / profile);
  return { wert, farbe: zielFarbe(wert) };
}

const leer = (): Stufen => ({
  anfragen: 0, davonDoppelt: 0, ohneDoppelte: 0, portalGeoeffnet: 0, bogenGemessen: 0, bogenImBild: 0,
  bogenBegonnen: 0, profilSelbst: 0, teamIndiz: 0, profileGesamt: 0, mitEinladung: 0, mitBewerbung: 0, buchungen: 0,
});

function zaehle(s: Stufen, z: AnfrageZeile) {
  s.anfragen++;
  if (z.doppelt) s.davonDoppelt++; else s.ohneDoppelte++;
  if (z.portalGeoeffnet) s.portalGeoeffnet++;
  if (z.bogenGemessen) s.bogenGemessen++;
  if (z.bogenImBild) s.bogenImBild++;
  if (z.bogenBegonnen) s.bogenBegonnen++;
  if (z.profilSelbst) s.profilSelbst++;
  if (z.teamIndiz) s.teamIndiz++;
  if (z.profilSelbst || z.teamIndiz) s.profileGesamt++;
  if (z.einladungen > 0) s.mitEinladung++;
  if (z.bewerbungen > 0) s.mitBewerbung++;
  if (z.buchung) s.buchungen++;
}

const teile = (kosten: number | null, n: number) => (kosten !== null && n > 0 ? rund(kosten / n) : null);

/** Stückpreis einer eingekauften Anfrage; null = kein Preis hinterlegt. */
export const stueckpreis = (portal: string | null) => (portal && portal in PORTAL_PREISE ? PORTAL_PREISE[portal] : null);

export type Trichter = {
  kanaele: KanalSumme[];
  /**
   * Alle Google-Kanäle zusammen (auch „ohne Zuordnung“). Nur, wenn es mehr als einen
   * Google-Kanal gibt oder Anfragen ohne Kampagne — dann ist das die belastbare Zahl je Profil.
   */
  googleGesamt: KanalSumme | null;
  zusammen: KanalSumme;
  tage: TagZeile[];
  /** Portale ohne Stückpreis (mit 0 € gerechnet). */
  ohnePreis: string[];
  google: { tageskosten: number; kampagnenkosten: number | null };
  /** Google-Anfragen ohne Kampagne (utm_campaign fehlt; vor dem 11.09.2026). */
  ohneZuordnung: number;
};

/**
 * Summen je Kanal über die Zeilen (Kohorte nach Anfragetag) und Kosten über die Tage
 * `tage`. Google-Kanäle bekommen Kosten nur, wenn für KEINEN Tag des Zeitraums Kampagnen-
 * Kosten fehlen — Teilsummen würden die Kosten je Profil zu gut aussehen lassen. Aus dem
 * gleichen Grund kein Wert je Profil für einzelne Kampagnen, solange es Google-Anfragen ohne
 * Kampagne gibt: deren Kosten stecken in den Kampagnen, deren Profile nicht (Nenner zu klein).
 */
export function trichterSummen(zeilen: AnfrageZeile[], lage: KostenLage, tage: string[]): Trichter {
  const tagSet = new Set(tage);
  const rel = zeilen.filter((z) => tagSet.has(z.tag));
  const fehlend = lage.fehlendeTage.filter((t) => tagSet.has(t));
  const googleVollstaendig = lage.tabelleDa && fehlend.length === 0;
  const ohneZuordnungZeilen = rel.filter((z) => z.kanal === 'Google ohne Zuordnung');
  const tageOhneZuordnung = new Set(ohneZuordnungZeilen.map((z) => z.tag));
  const kampagnenNennerOffen = ohneZuordnungZeilen.length > 0;
  const istKampagne = (k: Kanal) => k === 'High Intent' || k === 'PM' || k === 'Google sonstige';
  const ohnePreis = new Set<string>();

  const jeKanal = new Map<Kanal, Stufen & { einkauf: number }>();
  const jeTagKanal = new Map<string, Stufen & { einkauf: number; tag: string; kanal: Kanal }>();
  rel.forEach((z) => {
    const s = jeKanal.get(z.kanal) ?? { ...leer(), einkauf: 0 };
    zaehle(s, z);
    const schl = `${z.tag}|${z.kanal}`;
    const t = jeTagKanal.get(schl) ?? { ...leer(), einkauf: 0, tag: z.tag, kanal: z.kanal };
    zaehle(t, z);
    if (z.kanal === 'eingekauft') {
      const p = stueckpreis(z.portal);
      if (p === null) ohnePreis.add(z.portal ?? 'unbekannt');
      s.einkauf += p ?? 0;
      t.einkauf += p ?? 0;
    }
    jeKanal.set(z.kanal, s);
    jeTagKanal.set(schl, t);
  });

  // Tage mit Google-Kosten, aber ohne Anfrage im Kanal, gehören in die Tagestabelle.
  tage.forEach((tag) => {
    const k = lage.jeTag.get(tag);
    if (!k) return;
    (Object.keys(k) as Kanal[]).forEach((kanal) => {
      const schl = `${tag}|${kanal}`;
      if (!jeTagKanal.has(schl) && (k[kanal] ?? 0) > 0) jeTagKanal.set(schl, { ...leer(), einkauf: 0, tag, kanal });
      if (!jeKanal.has(kanal) && (k[kanal] ?? 0) > 0) jeKanal.set(kanal, { ...leer(), einkauf: 0 });
    });
  });

  const googleKosten = (kanal: Kanal, nurTage: string[]) =>
    nurTage.reduce((s, t) => s + (lage.jeTag.get(t)?.[kanal] ?? 0), 0);

  const summeMitKosten = (
    kanal: KanalSumme['kanal'], s: Stufen, kosten: number | null, kostenArt: KanalSumme['kostenArt'], offen: boolean,
  ): KanalSumme => {
    const gesamt = jeProfilMitFarbe(kosten, s.profileGesamt, offen);
    const selbst = jeProfilMitFarbe(kosten, s.profilSelbst, offen);
    return {
      ...s, kanal, kosten, kostenArt,
      jeProfil: gesamt.wert, jeProfilSelbst: selbst.wert, farbe: gesamt.farbe, farbeSelbst: selbst.farbe,
      jeProfilOffen: offen,
    };
  };

  const mitKosten = (kanal: Kanal, s: Stufen & { einkauf: number }): KanalSumme => {
    let kosten: number | null = null;
    let kostenArt: KanalSumme['kostenArt'] = null;
    if (kanal === 'eingekauft') { kosten = rund(s.einkauf); kostenArt = 'einkauf'; }
    else if (istKampagne(kanal)) {
      kostenArt = 'google';
      kosten = googleVollstaendig ? rund(googleKosten(kanal, tage)) : null;
    }
    const { einkauf: _e, ...stufen } = s;
    return summeMitKosten(kanal, stufen, kosten, kostenArt, istKampagne(kanal) && kampagnenNennerOffen);
  };

  const kanaele = KANAELE.filter((k) => jeKanal.has(k)).map((k) => mitKosten(k, jeKanal.get(k)!));

  const tageskosten = rund(tage.reduce((s, t) => s + (lage.googleTag.get(t) ?? 0), 0));
  const kampagnenkosten = googleVollstaendig
    ? rund(tage.reduce((s, t) => s + Object.values(lage.jeTag.get(t) ?? {}).reduce((a, b) => a + (b ?? 0), 0), 0))
    : null;

  /* Google gesamt: alle vier Google-Kanäle, Kosten = alle Kampagnen. Zähler und Nenner sind
     hier vollständig, auch wenn Anfragen keine Kampagne tragen. */
  const googleZeilen = kanaele.filter((k) => GOOGLE_KANAELE.includes(k.kanal as Kanal));
  let googleGesamt: KanalSumme | null = null;
  if (googleZeilen.length > 1 || kampagnenNennerOffen) {
    const s = leer();
    rel.filter((z) => GOOGLE_KANAELE.includes(z.kanal)).forEach((z) => zaehle(s, z));
    googleGesamt = summeMitKosten('Google gesamt', s, kampagnenkosten, 'google', false);
  }

  /* Zusammen: alle Kosten durch alle Profile, auch die der Kanäle ohne Kosten (Website,
     direkt, KI). Deshalb ohne Farbe — der Wert steht nicht gegen den Zielkorridor, solange
     Martin nicht festgelegt hat, worauf sich „60–80 € je Profil“ bezieht. Fehlen Google-Kosten
     und gibt es Google-Anfragen, bleibt auch „Zusammen“ leer (sonst nur der Einkauf). */
  const summe = leer();
  rel.forEach((z) => zaehle(summe, z));
  const bekannt = kanaele.filter((k) => k.kosten !== null);
  const googleFehlt = kanaele.some((k) => k.kostenArt === 'google' && k.kosten === null)
    || (!googleVollstaendig && rel.some((z) => GOOGLE_KANAELE.includes(z.kanal)));
  const kostenZusammen = googleFehlt ? null : rund(bekannt.reduce((s, k) => s + (k.kosten ?? 0), 0));
  const zusammen: KanalSumme = {
    ...summeMitKosten('Zusammen', summe, kostenZusammen, null, false),
    farbe: null, farbeSelbst: null,
  };

  const tageZeilen: TagZeile[] = Array.from(jeTagKanal.values()).map((t) => {
    const { einkauf, tag, kanal, ...stufen } = t;
    let kosten: number | null = null;
    if (kanal === 'eingekauft') kosten = rund(einkauf);
    else if (istKampagne(kanal) && lage.jeTag.has(tag)) {
      kosten = rund(lage.jeTag.get(tag)?.[kanal] ?? 0);
    }
    return { ...stufen, tag, kanal, kosten, jeProfilOffen: istKampagne(kanal) && tageOhneZuordnung.has(tag), reif: false };
  }).sort((a, b) => a.tag.localeCompare(b.tag) || KANAELE.indexOf(a.kanal) - KANAELE.indexOf(b.kanal));

  return {
    kanaele, googleGesamt, zusammen, tage: tageZeilen, ohnePreis: Array.from(ohnePreis),
    google: { tageskosten, kampagnenkosten }, ohneZuordnung: ohneZuordnungZeilen.length,
  };
}

/** Hinweise in Klartext für die Seite. */
export function hinweise(input: {
  lage: KostenLage; von: string; bis: string; heute: string; reifBis: string; trichter: Trichter;
  /** Für den Morgen-Hinweis (Kosten von gestern kommen erst mit dem Morgenbericht). */
  jetzt?: Date;
}): string[] {
  const h: string[] = [];
  const { lage, trichter } = input;
  const tag = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.`;
  if (!lage.tabelleDa) {
    h.push('Kosten je Kampagne liegen noch nicht vor (Tabelle ads_kosten_kampagne_tag fehlt in der Datenbank). High Intent und PM stehen deshalb ohne Kosten.');
  } else if (lage.fehlendeTage.length > 0) {
    const f = lage.fehlendeTage;
    h.push(`Kosten je Kampagne fehlen für ${f.length} ${f.length === 1 ? 'Tag' : 'Tage'} (${tag(f[0])}${f.length > 1 ? `–${tag(f[f.length - 1])}` : ''}). Google-Kosten je Kanal bleiben deshalb leer.`);
    const gestern = tagPlus(input.heute, -1);
    const stunde = input.jetzt ? Number(berlinZeit(input.jetzt.toISOString()).slice(11, 13)) : NaN;
    if (f.length === 1 && f[0] === gestern && stunde < 9) {
      h.push('Die Kosten von gestern schreibt der Morgenbericht gegen 06:00 Uhr. Wer die Zahlen vorher braucht, wählt den Zeitraum bis vorgestern.');
    }
  }
  if (lage.fehlendeTageGesamt.length > 0) {
    h.push(`Google-Tageskosten fehlen für ${lage.fehlendeTageGesamt.length} Tage — die Gegenprobe ist unvollständig.`);
  }
  if (input.bis >= input.heute) h.push('Heute ist ohne Google-Kosten: die schreibt erst der Morgenbericht von morgen.');
  const g = trichter.google;
  if (g.kampagnenkosten !== null && Math.abs(g.kampagnenkosten - g.tageskosten) > 1 && lage.fehlendeTageGesamt.length === 0) {
    h.push(`Gegenprobe: Google gesamt laut Tageskosten ${g.tageskosten.toFixed(2)} €, laut Kampagnen ${g.kampagnenkosten.toFixed(2)} €.`);
  }
  if (input.bis > input.reifBis) {
    const ab = tagPlus(input.reifBis, 1) > input.von ? tagPlus(input.reifBis, 1) : input.von;
    h.push(`Anfragen ab ${tag(ab)} sind jünger als ${REIFE_STUNDEN} Stunden: Profile und vor allem Buchungen kommen dort noch dazu.`);
  }
  if (input.von < berlinTag(MESS_AB_BOGEN)) h.push('„Bogen im Bild" wird erst seit 22.10.2026, 15:29 Uhr gemessen; die Quote bezieht sich nur auf Anfragen ab dann.');
  if (trichter.ohneZuordnung > 0) {
    const n = trichter.ohneZuordnung;
    h.push(`${n} Google-${n === 1 ? 'Anfrage trägt' : 'Anfragen tragen'} keine Kampagne (erst ab 11.09.2026 trägt jede Google-Anfrage ihre Kampagne) und ${n === 1 ? 'steht' : 'stehen'} unter „Google ohne Zuordnung“. Ihre Kosten stecken in High Intent und PM, ihre Profile nicht. € je Profil je Kampagne bleibt deshalb leer; belastbar ist „Google gesamt“.`);
  }
  if (trichter.ohnePreis.length > 0) h.push(`Ohne hinterlegten Einkaufspreis und daher mit 0 € gerechnet: ${trichter.ohnePreis.join(', ')}.`);
  return h;
}

/** Reife-Kennzeichen an die Tageszeilen. */
export function mitReife(tage: TagZeile[], reifBisTag: string): TagZeile[] {
  return tage.map((t) => ({ ...t, reif: t.tag <= reifBisTag }));
}

// ─── CSV ──────────────────────────────────────────────────────────────────

/** Ein Feld für Excel: Semikolon-sicher, ohne Formel-Anfang. */
function feld(v: string | number | boolean | null | undefined): string {
  let s = v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'ja' : 'nein') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (kopf: string[], zeilen: (string | number | boolean | null)[][]) =>
  '﻿' + [kopf, ...zeilen].map((z) => z.map(feld).join(';')).join('\r\n') + '\r\n';

/** Spalten der Anfragen-CSV — eine Erlaubnisliste. Was hier nicht steht, geht nicht raus. */
export const ANFRAGEN_SPALTEN = [
  'anfrage_id', 'anfrage_zeit', 'anfrage_tag', 'kanal', 'herkunft', 'google_kennung', 'kampagne_id', 'google_kampagne',
  'anzeigen_id', 'keyword', 'doppelte_anfrage', 'doppelt_zu', 'doppelt_zu_vor_zeitraum', 'rechner_doppelt_abgeschickt',
  'portal_geoeffnet', 'portal_erstmals', 'portal_besuche', 'pflegekraft_profil_geoeffnet', 'bogen_im_bild',
  'bogen_feld_beruehrt', 'bogen_weiter_blockiert', 'schritt_gespeichert', 'hoechster_schritt', 'erster_schritt_zeit',
  'profil_vollstaendig', 'profil_zeit', 'profil_minuten_nach_anfrage', 'team_profil_indiz', 'profil_gesamt',
  'speicherfehler', 'einladungen', 'erste_einladung', 'bewerbungen', 'erste_bewerbung', 'buchung', 'buchung_zeit',
  'vertrag_unterschrieben', 'reif_72h',
];

export function anfragenCsv(zeilen: AnfrageZeile[], kampagnenNamen: Record<string, string> = {}): string {
  const ng = (gemessen: boolean, v: string | number | boolean) => (gemessen ? v : 'nicht gemessen');
  return csv(ANFRAGEN_SPALTEN, zeilen.map((z) => [
    z.anfrageId, z.zeit, z.tag, z.kanal, z.herkunft, z.googleKennung, z.kampagneId,
    z.kampagneId ? (kampagnenNamen[z.kampagneId] ?? KAMPAGNEN_NAMEN[z.kampagneId] ?? '') : '',
    z.anzeigenId, z.keyword, z.doppelt, z.doppeltZu, z.doppeltZuVorZeitraum === null ? '' : z.doppeltZuVorZeitraum,
    z.rechnerDoppelt, z.portalGeoeffnet, z.portalErstmals, z.portalBesuche,
    z.profilGeoeffnet === null ? 'nicht gemessen' : z.profilGeoeffnet,
    ng(z.bogenGemessen, z.bogenImBild), ng(z.bogenGemessen, z.feldBeruehrt), ng(z.bogenGemessen, z.weiterBlockiert),
    z.bogenBegonnen, z.hoechsterSchritt ?? '', z.ersterSchritt, z.profilSelbst, z.profilZeit, z.profilMinuten ?? '',
    z.teamIndiz, z.profilSelbst || z.teamIndiz, z.speicherfehler, z.einladungen, z.ersteEinladung, z.bewerbungen,
    z.ersteBewerbung, z.buchung, z.buchungZeit, z.vertragUnterschrieben, z.reif,
  ]));
}

export const TAGE_SPALTEN = [
  'anfrage_tag', 'kanal', 'anfragen', 'davon_doppelt', 'portal_geoeffnet', 'bogen_im_bild', 'bogen_begonnen',
  'profil_vollstaendig', 'team_profil_indiz', 'profile_gesamt', 'mit_einladung', 'mit_bewerbung', 'buchungen',
  'kosten_netto', 'kosten_je_profil', 'reif_72h',
];

const komma = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','));

export function tageCsv(tage: TagZeile[]): string {
  return csv(TAGE_SPALTEN, tage.map((t) => [
    t.tag, t.kanal, t.anfragen, t.davonDoppelt, t.portalGeoeffnet,
    t.bogenGemessen > 0 ? t.bogenImBild : 'nicht gemessen', t.bogenBegonnen, t.profilSelbst, t.teamIndiz,
    t.profileGesamt, t.mitEinladung, t.mitBewerbung, t.buchungen, komma(t.kosten), kostenJeProfilFeld(t), t.reif,
  ]));
}

/** Kosten je Profil eines Tages: Betrag, „kein Profil“ (Kosten ohne Profil) oder „nicht belastbar“. */
function kostenJeProfilFeld(t: TagZeile): string {
  if (t.kosten === null) return '';
  if (t.jeProfilOffen) return 'nicht belastbar';
  if (t.profileGesamt === 0) return t.kosten > 0 ? 'kein Profil' : '';
  return komma(teile(t.kosten, t.profileGesamt));
}

// ─── Laden ────────────────────────────────────────────────────────────────

/** PostgREST liefert höchstens 1.000 Zeilen je Abruf: Seite für Seite lesen (sortiert, damit nichts doppelt kommt). */
export const SEITE = 1000;
export async function alleSeiten<T>(
  abruf: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  const zeilen: T[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await abruf(von, von + SEITE - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    zeilen.push(...(data ?? []));
    if (!data || data.length < SEITE) return zeilen;
  }
}

/** Fehlt eine Tabelle? (PostgREST PGRST205, Postgres 42P01) */
export const tabelleFehlt = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  const text = e instanceof Error ? e.message : String(e);
  return code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(text);
};

/** Liste in Stücke teilen (Lead-IDs je Abfrage, damit die Adresse kurz bleibt). */
export function stuecke<T>(liste: T[], groesse: number): T[][] {
  const s: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) s.push(liste.slice(i, i + groesse));
  return s;
}
