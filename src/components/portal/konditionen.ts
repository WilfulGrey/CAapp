// Vertragskosten-Logik (monatliche Aufstellung + Zuschläge) — EINZIGE Quelle
// der Wahrheit, gemeinsam genutzt von AngebotPruefenModal (Bewerbungsprüfung)
// und BookedScreen (gebuchter Einsatz), damit die Geld-Berechnung nicht
// auseinanderdriftet.

// Parse DE-Datum "12.06.2026" → Date. Tag/Monat/Jahr-Format, falls Format
// abweicht oder ungültig → null.
export function parseDeDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

export const MONAT_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Sommerzuschlag: 200 € pro voller Sommer-Monat (Juli / August), anteilig
// 200/30 €/Tag wenn der Monat nur teilweise im Einsatz-Zeitraum liegt.
const SOMMER_MONTHS = new Set([6, 7]); // Juli=6, August=7 (0-indexed)
const SOMMER_PER_MONTH = 200;
const SOMMER_PER_DAY = SOMMER_PER_MONTH / 30;

// Osterdatum nach Anonymous Gregorian Algorithm (Meeus/Jones/Butcher).
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Deutsche Feiertage mit Zuschlag. Bewegliche Feiertage (Karfreitag,
// Ostersonntag, Ostermontag) über easterSunday() berechnet.
function holidaysForYear(year: number): { name: string; date: Date }[] {
  const easter = easterSunday(year);
  const karfreitag = new Date(easter); karfreitag.setDate(easter.getDate() - 2);
  const ostermontag = new Date(easter); ostermontag.setDate(easter.getDate() + 1);
  return [
    { name: 'Karfreitag',         date: karfreitag },
    { name: 'Ostersonntag',       date: easter },
    { name: 'Ostermontag',        date: ostermontag },
    { name: '1. Mai',             date: new Date(year, 4, 1) },
    { name: 'Heiligabend',        date: new Date(year, 11, 24) },
    { name: '1. Weihnachtstag',   date: new Date(year, 11, 25) },
    { name: '2. Weihnachtstag',   date: new Date(year, 11, 26) },
    { name: 'Silvester',          date: new Date(year, 11, 31) },
    { name: 'Neujahr',            date: new Date(year, 0, 1) },
  ];
}

export interface SummaryRow {
  monat: string;
  betrag: number;
  details: string[];
}

// Berechnet die monatliche Aufstellung von Anreisedatum bis Abreisedatum.
// - Erster Monat: Tage ab Anreise bis Monatsende + Anreisekosten
// - Mittlere Monate: volle Tage
// - Letzter Monat: Tage bis Abreise + Abreisekosten
// - Sommerzuschlag (Juli/August): voller Monat = 200 €, anteilig sonst
// - Feiertagszuschlag: pro deutschem Feiertag im Einsatz × feiertagszuschlag €/Tag
// Wenn ein Datum nicht parsbar → leeres Array (UI rendert dann nichts statt
// hardcoded Mock-Daten zu zeigen).
export function buildMonthlyBreakdown(
  anreiseStr: string,
  abreiseStr: string,
  tagessatz: number,
  anreisekosten: number,
  abreisekosten: number,
  feiertagszuschlag: number,
): SummaryRow[] {
  const start = parseDeDate(anreiseStr);
  const end = parseDeDate(abreiseStr);
  if (!start || !end || end < start) return [];

  const allHolidays: { name: string; date: Date }[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    allHolidays.push(...holidaysForYear(y));
  }
  const holidaysInRange = allHolidays.filter(h => h.date >= start && h.date <= end);

  const rows: SummaryRow[] = [];
  let cursorYear = start.getFullYear();
  let cursorMonth = start.getMonth();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();

  // Safety-Bound: max 24 Monate (gegen Endlosschleifen bei pathologischen Inputs).
  for (let i = 0; i < 24; i++) {
    const daysInMonth = new Date(cursorYear, cursorMonth + 1, 0).getDate();
    const isFirstMonth = i === 0;
    const isLastMonth = cursorYear === endYear && cursorMonth === endMonth;

    const dayFrom = isFirstMonth ? start.getDate() : 1;
    const dayTo = isLastMonth ? end.getDate() : daysInMonth;
    const tage = dayTo - dayFrom + 1;

    const details: string[] = [`${tagessatz} €/Tag × ${tage} ${tage === 1 ? 'Tag' : 'Tage'}`];
    let betrag = tagessatz * tage;

    if (isFirstMonth && anreisekosten > 0) {
      details.push(`+ ${anreisekosten} € Anreise`);
      betrag += anreisekosten;
    }
    if (isLastMonth && abreisekosten > 0) {
      details.push(`+ ${abreisekosten} € Abreise`);
      betrag += abreisekosten;
    }

    // Sommerzuschlag (Juli / August)
    if (SOMMER_MONTHS.has(cursorMonth)) {
      const isFullSummerMonth = tage === daysInMonth;
      const sommer = isFullSummerMonth
        ? SOMMER_PER_MONTH
        : Math.round(SOMMER_PER_DAY * tage);
      details.push(isFullSummerMonth
        ? `+ ${sommer} € Sommerzuschlag`
        : `+ ${sommer} € Sommerzuschlag (${tage} ${tage === 1 ? 'Tag' : 'Tage'})`);
      betrag += sommer;
    }

    // Feiertagszuschlag — pro Feiertag im aktuellen Monat (nur wenn ein
    // Zuschlag konfiguriert ist).
    if (feiertagszuschlag > 0) {
      const holidaysThisMonth = holidaysInRange.filter(
        h => h.date.getFullYear() === cursorYear && h.date.getMonth() === cursorMonth,
      );
      for (const h of holidaysThisMonth) {
        details.push(`+ ${feiertagszuschlag} € ${h.name}`);
        betrag += feiertagszuschlag;
      }
    }

    rows.push({
      monat: `${MONAT_NAMES_DE[cursorMonth]} ${cursorYear}`,
      betrag: Math.round(betrag),
      details,
    });

    if (isLastMonth) break;
    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }
  return rows;
}

// Prüft ob ein Einsatz-Zeitraum tatsächlich Sommer-Monate (Juli/August)
// berührt und welche Feiertage reinfallen — für die konditionale Footnote.
export function computeZuschlagRelevance(anreiseStr: string, abreiseStr: string): {
  hasSummer: boolean;
  relevantHolidayNames: string[];
} {
  const start = parseDeDate(anreiseStr);
  const end = parseDeDate(abreiseStr);
  if (!start || !end || end < start) return { hasSummer: false, relevantHolidayNames: [] };

  let hasSummer = false;
  let y = start.getFullYear();
  let m = start.getMonth();
  for (let i = 0; i < 24; i++) {
    if (SOMMER_MONTHS.has(m)) hasSummer = true;
    if (y === end.getFullYear() && m === end.getMonth()) break;
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }

  const all: { name: string; date: Date }[] = [];
  for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) {
    all.push(...holidaysForYear(yr));
  }
  const seen = new Set<string>();
  const relevantHolidayNames: string[] = [];
  for (const h of all.filter(h => h.date >= start && h.date <= end).sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (!seen.has(h.name)) {
      seen.add(h.name);
      relevantHolidayNames.push(h.name);
    }
  }
  return { hasSummer, relevantHolidayNames };
}
