// Anreise-Mail (Registry #119): reine Logik — keine I/O, keine Imports aus
// index.ts. Entscheidet aus der final_confirmation eines gebuchten Jobs, ob
// die Agentur die Anreise der Pflegekraft vollstaendig eingetragen hat, und
// liefert dann die Daten fuer die Kundenmail plus einen Schluessel, an dem
// der Cron erkennt, ob sich etwas geaendert hat.
//
// Quelle ist NUR der Datensatz `arrival` (ConfirmationArrival = "Dane
// dojazdu" der Agentur: Verkehrsmittel, Datum, Zeitfenster, Notiz). Felder auf
// prod gemessen vom CGA-Portal (2026-08-20). Formate werden nicht geraten:
// passt etwas nicht zu YYYY-MM-DD bzw. HH:MM, geht keine Mail raus.

export interface ArrivalCaregiver {
  id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_retouched_promo?: { aws_url: string | null } | null;
  avatar_retouched?: { aws_url: string | null } | null;
  avatar?: { aws_url: string | null } | null;
}

export interface ArrivalConfirmation {
  id?: number | null;
  rejected_at?: string | null;
  // Termin der Confirmation (UpdateConfirmationDates). Weicht er vom Datum
  // im Anreise-Datensatz ab, ist einer der beiden veraltet → keine Mail.
  arrival_date?: string | null;
  caregiver?: ArrivalCaregiver | null;
  contract_patient?: { street_number?: string | null; zip_code?: string | null; city?: string | null } | null;
  arrival?: {
    arrival_date?: string | null;
    arrival_time_from?: string | null;
    arrival_time_to?: string | null;
    note?: string | null;
    updated_at?: string | null;
    arrival_type?: { id?: number | null; type?: string | null } | null;
  } | null;
}

/** Was der Cron an die Bridge schickt (landet 1:1 in der Queue-Zeile). */
export interface AnreiseDaten {
  confirmation_id: number;
  arrival_key: string;
  anreise_datum: string; // YYYY-MM-DD
  anreise_von: string; // HH:MM
  anreise_bis: string | null; // HH:MM
  verkehrsmittel: string; // Rohwert aus mamamia (Minibus / Sindbad / Own transport)
  hinweis: string | null;
  einsatzort_strasse: string | null;
  einsatzort_plz_ort: string | null;
}

// Die Agentur speichert oft und korrigiert kurz danach — erst wenn der
// Datensatz so lange ruht, geht die Mail raus (sonst Mail + "Geänderte…").
export const ANREISE_RUHE_MS = 10 * 60 * 1000;

const DATUM = /^(\d{4}-\d{2}-\d{2})/;
const ZEIT = /^(\d{2}:\d{2})/;

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function datum(v: string | null | undefined): string | null {
  return DATUM.exec((v ?? "").trim())?.[1] ?? null;
}

function zeit(v: string | null | undefined): string | null {
  return ZEIT.exec((v ?? "").trim())?.[1] ?? null;
}

/** Berliner Kalendertag + Uhrzeit (die Anreise ist ein Berliner Termin). */
export function berlinJetzt(jetzt: Date): { datum: string; zeit: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(jetzt).map((x) => [x.type, x.value]),
  );
  return { datum: `${p.year}-${p.month}-${p.day}`, zeit: `${p.hour}:${p.minute}` };
}

/** Berliner Datum `tage` Tage vor `jetzt` (Kandidaten-Fenster). */
export function berlinDatumMinus(jetzt: Date, tage: number): string {
  return berlinJetzt(new Date(jetzt.getTime() - tage * 86_400_000)).datum;
}

export function anreiseAusConfirmation(
  jobId: number,
  fc: ArrivalConfirmation | null | undefined,
  jetzt: Date,
): { daten: AnreiseDaten } | { grund: string } {
  if (!fc || typeof fc.id !== "number") return { grund: "keine_confirmation" };
  if (text(fc.rejected_at)) return { grund: "storniert" };
  // Die Mail nennt die Pflegekraft beim Namen — ohne ihn keine Mail.
  if (typeof fc.caregiver?.id !== "number" || !text(fc.caregiver.first_name)) return { grund: "keine_pflegekraft" };
  const a = fc.arrival;
  if (!a) return { grund: "keine_anreise" };

  const tag = datum(a.arrival_date);
  const von = zeit(a.arrival_time_from);
  const bis = zeit(a.arrival_time_to);
  const typ = text(a.arrival_type?.type);
  if (!text(a.arrival_date) || !text(a.arrival_time_from) || !typ) return { grund: "unvollstaendig" };
  if (!tag || !von || (text(a.arrival_time_to) && !bis)) return { grund: "format" };

  const termin = datum(fc.arrival_date);
  if (termin && termin !== tag) return { grund: "datum_konflikt" };

  const heute = berlinJetzt(jetzt);
  if (tag < heute.datum || (tag === heute.datum && heute.zeit >= von)) return { grund: "vorbei" };

  const roh = text(a.updated_at);
  if (roh) {
    let ms = Date.parse(roh);
    if (!Number.isFinite(ms)) ms = Date.parse(roh.replace(" ", "T"));
    if (Number.isFinite(ms) && jetzt.getTime() - ms < ANREISE_RUHE_MS) return { grund: "frisch" };
  }

  const cp = fc.contract_patient ?? null;
  const plzOrt = [text(cp?.zip_code), text(cp?.city)].filter(Boolean).join(" ");
  // Die Notiz gehoert NICHT in den Schluessel: Michał (09.10.) — neue Mail
  // nur bei Datum, Uhrzeit oder Verkehrsmittel.
  const key = [jobId, fc.id, tag, von, bis ?? "", a.arrival_type?.id ?? typ].join("|");
  return {
    daten: {
      confirmation_id: fc.id,
      arrival_key: key,
      anreise_datum: tag,
      anreise_von: von,
      anreise_bis: bis,
      verkehrsmittel: typ,
      hinweis: text(a.note),
      einsatzort_strasse: text(cp?.street_number),
      einsatzort_plz_ort: plzOrt || null,
    },
  };
}

/** ANREISE_MAILS: aus (Standard) | test (Mails ans Team) | live (an Kunden). */
export type AnreiseModus = "aus" | "test" | "live";

export function anreiseModus(wert: string | undefined): AnreiseModus {
  const v = (wert ?? "").trim().toLowerCase();
  return v === "test" || v === "live" ? v : "aus";
}
