// Monatliche Kostenaufschlüsselung für 24h-Pflege-Einsätze.
//
// Vorher inline in AngebotPruefenModal.tsx — extrahiert weil dieselbe
// Logik auch im Portal (Beispielrechnung unter dem Preis-Kasten) gebraucht
// wird. Beide Stellen sollen GENAU dieselben Beträge zeigen, damit der
// Kunde nicht beim Wechsel von der Übersicht zur Bewerbungs-Prüfung
// "andere Zahlen" sieht.
//
// Regeln (vom Vermittler bestätigt):
//   • Tagessatz × Anzahl Tage pro Monat
//   • Erster Monat: Anreisekosten (i.d.R. 125 €)
//   • Letzter Monat: Abreisekosten (i.d.R. 125 €)
//   • Sommerzuschlag Juli/August: 200 € pro vollem Monat, anteilig sonst
//   • Feiertagszuschlag (= doppelter Tagessatz extra) an deutschen
//     Feiertagen: Karfreitag, Ostersonntag, Ostermontag, 1. Mai,
//     Heiligabend, 1. + 2. Weihnachtstag, Silvester, Neujahr

const MONAT_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Sommerzuschlag: 200 € pro voller Sommer-Monat (Juli / August), anteilig
// 200/30 €/Tag wenn der Monat nur teilweise im Einsatz-Zeitraum liegt.
const SOMMER_MONTHS = new Set([6, 7]); // Juli=6, August=7 (0-indexed)
const SOMMER_PER_MONTH = 200;
const SOMMER_PER_DAY = SOMMER_PER_MONTH / 30;

/**
 * Parse DE-Datum "12.06.2026" → Date. Tag/Monat/Jahr-Format, falls Format
 * abweicht oder ungültig → null. Wird im Portal/Modal gebraucht weil die
 * CAapp-internen Application-Objekte noch deutsches Datumsformat haben
 * (im Gegensatz zu Mamamia, das ISO YYYY-MM-DD liefert).
 */
export function parseDeDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

// Osterdatum nach Anonymous Gregorian Algorithm (Meeus/Jones/Butcher).
// Gibt den Ostersonntag eines Jahres als Date zurück.
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

// Deutsche Feiertage mit Zuschlag (vom User definiert). Bewegliche Feiertage
// (Karfreitag, Ostersonntag, Ostermontag) werden über easterSunday() berechnet.
export function holidaysForYear(year: number): { name: string; date: Date }[] {
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

/**
 * Berechnet die monatliche Aufstellung von Anreisedatum bis Abreisedatum.
 *   - Erster Monat: Tage ab Anreise bis Monatsende + Anreisekosten
 *   - Mittlere Monate: volle Tage
 *   - Letzter Monat: Tage bis Abreise + Abreisekosten
 *   - Sommerzuschlag (Juli/August): voller Monat = 200 €, anteilig sonst
 *   - Feiertagszuschlag: pro deutschem Feiertag im Einsatz × feiertagszuschlag €/Tag
 *
 * Wenn Anreise/Abreise nicht parsbar oder Reihenfolge falsch → leeres Array
 * (UI rendert dann nichts statt hardcoded Mock-Daten zu zeigen).
 */
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

  // Alle Feiertage für die im Einsatz-Range vorkommenden Jahre einsammeln
  // und auf den Range filtern. Crossing year boundaries handled.
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
    // Zuschlag konfiguriert ist, sonst spamen wir die UI mit 0 €-Zeilen).
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

/**
 * Formatiert ein Date als DE-Datum "TT.MM.JJJJ" — der Aufrufer braucht
 * das, weil buildMonthlyBreakdown selbst nur Strings akzeptiert (durch
 * die historische Application-Datenstruktur).
 */
export function formatDeDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}
