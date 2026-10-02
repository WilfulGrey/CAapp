// Registry #110 (Fall Hunkirchen, 28.09.2026): Die Pflegeagentur lehnte die
// angenommene Bewerbung 26 s nach der Buchung ab — die Buchung (Confirmation)
// blieb stehen, in Mamamia sah drei Tage lang alles gebucht aus. Bewusste
// Stornos durch SA oder CGA laufen in Mamamia als `confirmation_rejected` und
// alarmieren NICHT (Entscheidung Michał 02.10.2026). Alarm nur, wenn die
// Bewerbung still verschwindet, die Buchung aber stehen bleibt.
//
// Quelle: Mamamias Änderungsprotokoll je Kunde (CustomerLogsWithPagination,
// neueste zuerst). Geprüft wird NUR nach Struktur (title, logable_type,
// logable_id, created_at) — nie nach Meldungstext (Święta zasada 1.5).
// Rein, ohne I/O; die Abfrage macht checkStilleRuecknahmen in index.ts.

export interface LogEintrag {
  title: string | null;
  logable_type: string | null;
  logable_id: number | string | null;
  /** UTC, z. B. "2026-09-28T09:34:01.000000Z". `data.rejected_at` ist Ortszeit — nie vergleichen. */
  created_at: string;
  custom_author_name?: string | null;
  /** JSON als String (so liefert es Mamamia) oder schon geparst. */
  data?: string | Record<string, unknown> | null;
}

export interface BeobachteteZeile {
  application_id: number;
  mamamia_confirmation_id: number | null;
  accepted_at: string;
}

export interface Ruecknahme {
  rejected_at: string;
  von: string | null;
  reject_type: string | null;
  reject_message: string | null;
  confirmation_created_at: string;
}

export interface Pruefung {
  treffer: Ruecknahme | null;
  /** Unbekannte Titel an C oder A — still, aber zu loggen (neue Mamamia-Ereignisse). */
  unbekannt: string[];
}

/** Unsere Buchung entsteht durch StoreConfirmation NACH dem Insert der Zeile; Panel-Buchungen und adoptierte Fremd-Confirmations liegen davor. */
export const BUCHUNG_TOLERANZ_MS = 2 * 60_000;
/** Geschwister-Absagen („andere Bewerbung angenommen") entstehen in derselben Transaktion wie confirmation_created — im Protokoll dieselbe Sekunde. */
export const GESCHWISTER_MARGE_MS = 5_000;
/** Zeit für ein zweistufiges bewusstes Storno (erst Bewerbung, dann Buchung). */
export const KARENZ_MS = 60 * 60_000;

const C_LAUFEND = new Set(["confirmation_created", "confirmation_dates_changed", "confirmation_updated"]);
const A_BEKANNT = new Set(["application_created", "application_updated", "application_rejected"]);

const still = (unbekannt: string[] = []): Pruefung => ({ treffer: null, unbekannt });

// undefined = Parsefehler, null = kein data
function daten(e: LogEintrag): Record<string, unknown> | null | undefined {
  if (e.data == null) return null;
  if (typeof e.data === "object") return e.data;
  try {
    const v = JSON.parse(e.data);
    return v && typeof v === "object" ? v as Record<string, unknown> : null;
  } catch {
    return undefined;
  }
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function stilleRuecknahme(eintraege: LogEintrag[], row: BeobachteteZeile, jetzt: number): Pruefung {
  const a = row.application_id;
  const c = row.mamamia_confirmation_id;
  // Ohne Buchung nichts zu prüfen; a === c = Anker „Vertrag nachträglich" (keine echte Bewerbung).
  if (c == null || a === c) return still();

  const zu = (typ: string, id: number) =>
    eintraege.filter((e) => e.logable_type === typ && Number(e.logable_id) === id);
  const zuC = zu("confirmation", c);
  const zuA = zu("application", a);

  // Regel 2: C ist UNSERE Buchung (nicht adoptiert, nicht aus dem Panel vor der Unterschrift).
  const angelegt = zuC.find((e) => e.title === "confirmation_created");
  const tC = angelegt ? Date.parse(angelegt.created_at) : NaN;
  const tAcc = Date.parse(row.accepted_at);
  if (!Number.isFinite(tC) || !Number.isFinite(tAcc) || tC < tAcc - BUCHUNG_TOLERANZ_MS) return still();

  // Regel 3: C weder storniert noch gelöscht noch umgehängt.
  const unbekannt: string[] = [];
  for (const e of zuC) {
    const titel = e.title ?? "";
    if (!C_LAUFEND.has(titel)) {
      if (titel !== "confirmation_rejected") unbekannt.push(`confirmation:${titel}`);
      return still(unbekannt);
    }
    if (titel === "confirmation_updated") {
      const d = daten(e);
      if (d === undefined) return still([`confirmation:${titel}:data`]);
      const umgehaengt = d?.application_id as { new?: unknown } | undefined;
      if (umgehaengt && typeof umgehaengt === "object" && "new" in umgehaengt && Number(umgehaengt.new) !== a) {
        return still();
      }
    }
  }

  // Regel 4: die Bewerbung wurde NACH der Buchung abgelehnt.
  for (const e of zuA) {
    if (!A_BEKANNT.has(e.title ?? "") && Date.parse(e.created_at) > tC) unbekannt.push(`application:${e.title}`);
  }
  const absagen = zuA
    .filter((e) => e.title === "application_rejected")
    .map((e) => ({ e, t: Date.parse(e.created_at) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((x, y) => x.t - y.t);
  if (absagen.length === 0 || absagen[0].t <= tC + GESCHWISTER_MARGE_MS) return still(unbekannt);

  // Regel 5: Karenz — der nächste Lauf prüft neu.
  const erste = absagen[0];
  if (jetzt - erste.t < KARENZ_MS) return still(unbekannt);

  const d = daten(erste.e) ?? null;
  return {
    treffer: {
      rejected_at: new Date(erste.t).toISOString(),
      von: text(erste.e.custom_author_name),
      reject_type: text(d?.reject_type),
      reject_message: text(d?.reject_message),
      confirmation_created_at: new Date(tC).toISOString(),
    },
    unbekannt,
  };
}

/** Weiterblättern, solange der älteste geholte Eintrag nicht vor `grenzeMs` liegt und Mamamia mehr hat. */
export function brauchtWeitereSeite(seite: LogEintrag[], geholt: number, total: number, grenzeMs: number): boolean {
  if (seite.length === 0 || geholt >= total) return false;
  const aeltester = Math.min(...seite.map((e) => Date.parse(e.created_at)).filter(Number.isFinite));
  return !(aeltester < grenzeMs);
}

/** Startpunkt wandert alle 15 min um eins weiter — bei Zeitnot fehlen nicht immer dieselben Kunden. */
export function rotiere<T>(liste: T[], jetzt: number, taktMs = 15 * 60_000): T[] {
  if (liste.length === 0) return [];
  const start = Math.floor(jetzt / taktMs) % liste.length;
  return [...liste.slice(start), ...liste.slice(0, start)];
}

// Dry-Run per Default. Bei JEDEM Aufruf gelesen (nicht im Bootstrap, nicht über
// requireEnv): `supabase secrets set WITHDRAWN_ALARM_LIVE=1` wirkt ohne Redeploy,
// ein fehlendes Secret lässt die Function nicht sterben (Staging bleibt still).
export function withdrawnAlarmIsLive(): boolean {
  const v = (Deno.env.get("WITHDRAWN_ALARM_LIVE") ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
