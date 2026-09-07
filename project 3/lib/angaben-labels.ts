// Labels der Kalkulator-Angaben — PURE Modul (kein Next, kein Supabase), damit
// der Root-vitest ihn cross-importieren darf (CLAUDE.md §Tests) und die
// Admin-Route wie die Mails dieselben Wörter benutzen. Historisch lebte LABELS
// lokal in email.ts:getEingangsbestaetigungEmailTemplate (Registry #55).

// Die 9 fd-Keys (Spiegel von angaben-diff.FD_KEYS — hier, damit die Admin-Seite
// nur ein Modul importiert).
export const FD_LABEL_KEYS = [
  'betreuung_fuer', 'pflegegrad', 'weitere_personen', 'mobilitaet', 'nachteinsaetze',
  'deutschkenntnisse', 'erfahrung', 'fuehrerschein', 'geschlecht',
] as const;

export const LABELS: Record<string, Record<string, string>> = {
  betreuung_fuer: { '1-person': '1 Person', 'ehepaar': '2 Personen' },
  mobilitaet: { 'mobil': 'Mobil', 'rollator': 'Eingeschränkt – Rollator', 'rollstuhl': 'Rollstuhl', 'bettlaegerig': 'Bettlägerig' },
  nachteinsaetze: { 'nein': 'Nein', 'gelegentlich': 'Gelegentlich', 'taeglich': 'Täglich (1×)', 'mehrmals': 'Mehrmals nachts' },
  // `sehr-gut-sa` (600 €/Mo, level_4) schreibt nur das SA-Portal — Registry #30.
  deutschkenntnisse: { 'grundlegend': 'Grundlegend', 'kommunikativ': 'Kommunikativ', 'sehr-gut': 'Gut', 'sehr-gut-sa': 'Sehr gut (SA-Portal)' },
  fuehrerschein: { 'egal': 'Egal', 'ja': 'Ja', 'nein': 'Nein / nicht unbedingt' },
  geschlecht: { 'egal': 'Egal', 'weiblich': 'Weiblich', 'maennlich': 'Männlich' },
  erfahrung: { 'einsteiger': 'Einsteiger', 'erfahren': 'Erfahren', 'sehr-erfahren': 'Sehr erfahren' },
  weitere_personen: { 'ja': 'Ja', 'nein': 'Nein' },
  care_start_timing: { 'sofort': 'Sofort (4–7 Werktage)', '2-4-wochen': 'In 2–4 Wochen', '1-2-monate': 'In 1–2 Monaten', 'spaeter': 'Zu einem späteren Zeitpunkt', 'unklar': 'Ich informiere mich nur' },
};

// Feldnamen für die Kundenmail „Aktualisiertes Angebot" (changed[].name) und
// die Admin-Statuszeile — im selben Wortlaut wie das SA-Portal sie liefert.
export const FELD_NAMEN: Record<string, string> = {
  care_start_timing: 'Betreuungsbeginn',
  betreuung_fuer: 'Betreuung für',
  pflegegrad: 'Pflegegrad',
  weitere_personen: 'Weitere Personen im Haushalt',
  mobilitaet: 'Mobilität',
  nachteinsaetze: 'Nachteinsätze',
  deutschkenntnisse: 'Deutschkenntnisse',
  erfahrung: 'Erfahrung',
  fuehrerschein: 'Führerschein',
  geschlecht: 'Geschlecht der Betreuungskraft',
};

// Anzeigewert einer Angabe. `pflegegrad` ist eine Zahl (0 = natives „Kein
// Pflegegrad", Registry #13e); leer/unbekannt ⇒ „—".
export function angabenLabel(key: string, val: unknown): string {
  if (val == null || val === '') return '—';
  if (key === 'pflegegrad') {
    const n = Number(val);
    return n === 0 ? 'Kein Pflegegrad' : `Pflegegrad ${val}`;
  }
  return LABELS[key]?.[String(val)] ?? String(val);
}
