/**
 * Versandplan der Partner-Akquise — pure Funktionen, damit testbar.
 *
 * Reihe (Martin, 11.09.2026): Hauptmail an Tag 0, Nachfass 1/2/3 an Tag 3/7/14.
 * Eine Mail geht nur, wenn sie in partner_mail_freigaben freigegeben ist.
 * Wer nicht mehr „aktiv“ ist (abgemeldet, angemeldet, geantwortet, …), bekommt
 * nichts mehr.
 *
 * Drosselung, damit IONOS das Postfach nicht sperrt und primundus.de nicht im
 * Spam landet: nur Mo–Fr 9–17 Uhr Berliner Zeit, höchstens 40 pro Stunde,
 * 10 pro Lauf, pro Firmen-Domain höchstens 5 am Tag und 1 pro Lauf
 * (Filialnetze wie aterima-care.de mit 46 Adressen).
 */

export type MailKey = "haupt" | "nf1" | "nf2" | "nf3";
export const REIHE: MailKey[] = ["haupt", "nf1", "nf2", "nf3"];

/** Abstand zur Hauptmail in Tagen. */
export const TAGE_NACH_HAUPT: Record<MailKey, number> = { haupt: 0, nf1: 3, nf2: 7, nf3: 14 };

/** Mindestabstand zur vorigen Mail, falls eine Freigabe später kam. */
export const MIN_ABSTAND_TAGE = 3;

export interface Grenzen {
  proLauf: number;
  proStunde: number;
  proDomainTag: number;
  startStunde: number;
  endStunde: number;
}

export const STANDARD_GRENZEN: Grenzen = {
  proLauf: 10,
  proStunde: 40,
  proDomainTag: 5,
  startStunde: 9,
  endStunde: 17,
};

/** Freemail-Domains sind verschiedene Firmen — keine Domain-Grenze. */
export const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "t-online.de",
  "yahoo.de", "yahoo.com", "mail.de", "outlook.de", "outlook.com", "hotmail.com",
  "hotmail.de", "icloud.com", "freenet.de", "aol.com", "online.de",
]);

export interface Kontakt {
  id: string;
  email: string;
  domain: string;
  status: string;
}

export interface Versand {
  kontakt_id: string;
  mail: MailKey;
  status: "reserviert" | "gesendet" | "fehler";
  erstellt_am: string;
  gesendet_am: string | null;
}

export interface Geplant {
  kontakt: Kontakt;
  mail: MailKey;
}

const TAG_MS = 24 * 60 * 60 * 1000;

/** Wochentag, Stunde und Kalendertag in Berliner Zeit. */
export function berlin(d: Date): { wochentag: number; stunde: number; datum: string } {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const hole = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  const tage: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    wochentag: tage[hole("weekday")] ?? 0,
    stunde: Number(hole("hour")) % 24,
    datum: `${hole("year")}-${hole("month")}-${hole("day")}`,
  };
}

export function imVersandfenster(jetzt: Date, g: Grenzen = STANDARD_GRENZEN): boolean {
  const { wochentag, stunde } = berlin(jetzt);
  return wochentag >= 1 && wochentag <= 5 && stunde >= g.startStunde && stunde < g.endStunde;
}

function zeitpunkt(v: Versand): number {
  return Date.parse(v.gesendet_am ?? v.erstellt_am);
}

/**
 * Die nächste fällige Mail eines Kontakts oder null.
 * Eine Zeile mit „reserviert“ oder „fehler“ blockiert die Reihe: Das schauen
 * wir uns an, statt automatisch nochmal zu senden.
 */
export function naechsteMail(
  kontakt: Kontakt,
  versand: Versand[],
  freigaben: Set<MailKey>,
  jetzt: Date,
): MailKey | null {
  if (kontakt.status !== "aktiv") return null;
  const gesendet = new Map<MailKey, number>();
  for (const v of versand) {
    if (v.kontakt_id !== kontakt.id) continue;
    if (v.status !== "gesendet") return null;
    gesendet.set(v.mail, zeitpunkt(v));
  }
  const offen = REIHE.find((m) => !gesendet.has(m));
  if (!offen || !freigaben.has(offen)) return null;
  if (offen === "haupt") return offen;

  const haupt = gesendet.get("haupt")!;
  const vorige = gesendet.get(REIHE[REIHE.indexOf(offen) - 1])!;
  const t = jetzt.getTime();
  if (t - haupt < TAGE_NACH_HAUPT[offen] * TAG_MS) return null;
  if (t - vorige < MIN_ABSTAND_TAGE * TAG_MS) return null;
  return offen;
}

/** Wer in diesem Lauf welche Mail bekommt. Leere Liste außerhalb des Fensters. */
export function planeLauf(
  jetzt: Date,
  kontakte: Kontakt[],
  versand: Versand[],
  freigaben: Set<MailKey>,
  g: Grenzen = STANDARD_GRENZEN,
): Geplant[] {
  if (!imVersandfenster(jetzt, g)) return [];

  const t = jetzt.getTime();
  const heute = berlin(jetzt).datum;
  const domainVon = new Map(kontakte.map((k) => [k.id, k.domain]));

  let letzteStunde = 0;
  const domainHeute = new Map<string, number>();
  for (const v of versand) {
    if (v.status === "fehler") continue;
    const z = zeitpunkt(v);
    if (t - z < 60 * 60 * 1000) letzteStunde++;
    if (berlin(new Date(z)).datum === heute) {
      const d = domainVon.get(v.kontakt_id) ?? "";
      domainHeute.set(d, (domainHeute.get(d) ?? 0) + 1);
    }
  }

  let budget = Math.min(g.proLauf, g.proStunde - letzteStunde);
  if (budget <= 0) return [];

  const proKontakt = new Map<string, Versand[]>();
  for (const v of versand) {
    const liste = proKontakt.get(v.kontakt_id) ?? [];
    liste.push(v);
    proKontakt.set(v.kontakt_id, liste);
  }

  // Fällige Mails sammeln; spätere Mails der Reihe zuerst, sonst Listenreihenfolge.
  const faellig: { k: Kontakt; m: MailKey; i: number }[] = [];
  kontakte.forEach((k, i) => {
    const m = naechsteMail(k, proKontakt.get(k.id) ?? [], freigaben, jetzt);
    if (m) faellig.push({ k, m, i });
  });
  faellig.sort((a, b) => REIHE.indexOf(b.m) - REIHE.indexOf(a.m) || a.i - b.i);

  const imLauf = new Set<string>();
  const plan: Geplant[] = [];
  for (const { k, m } of faellig) {
    if (budget <= 0) break;
    const frei = FREEMAIL.has(k.domain);
    if (!frei) {
      if (imLauf.has(k.domain)) continue;
      if ((domainHeute.get(k.domain) ?? 0) >= g.proDomainTag) continue;
      imLauf.add(k.domain);
      domainHeute.set(k.domain, (domainHeute.get(k.domain) ?? 0) + 1);
    }
    plan.push({ kontakt: k, mail: m });
    budget--;
  }
  return plan;
}
