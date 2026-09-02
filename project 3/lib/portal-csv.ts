/* ─── CSV-Anhang der Portal-Mail lesen ───────────────────────────────────
 *
 * Verbund Pflegehilfe haengt an jede Lead-Mail eine CSV-Datei mit dem
 * VOLLEN Datensatz (Zauner 01.09.: Anrede, Name, Telefon, Pflegegrad 3,
 * "Mobil ohne Hilfsmittel", Gewicht, Krankheiten … — waehrend der
 * Mailtext, zumal weitergeleitet, nur Bruchstuecke hergab und die
 * Annahme-Regeln teuer rieten). Die CSV ist deshalb die ERSTE Quelle;
 * der Mailtext bleibt fuer den Einwilligungsnachweis (der steht NUR dort)
 * und als Fallback fuer Mails ohne Anhang.
 *
 * Bewusst KEIN zweiter Feld-Mapper: aus der CSV-Zeile wird ein
 * "Label: Wert"-Text synthetisiert und durch das bestehende, getestete
 * parsePflegehilfe geschickt — eine Zuordnungstabelle, ein Verhalten,
 * ein unbekannt[]-Kanal. Spalten ohne Zuhause bei uns (Krankheiten,
 * Gewicht, Beziehung …) reisen als `zusatz` mit und landen append-only
 * im Ereignislog (portal_lead_eingekauft) — nichts geht verloren.
 */

/** Minimaler RFC-4180-Parser: Anfuehrungszeichen, "" als Escape und
 *  Zeilenumbrueche INNERHALB eines Felds (RequestDetail ist mehrzeilig).
 *  Genau das, woran ein split('\n') scheitern wuerde. */
export function parseCsv(text: string): string[][] {
  const zeilen: string[][] = [];
  let feld = '';
  let zeile: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; }
        else inQuotes = false;
      } else feld += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      zeile.push(feld); feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld); feld = '';
      if (zeile.length > 1 || zeile[0] !== '') zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.length > 1 || zeile[0] !== '') zeilen.push(zeile);
  return zeilen;
}

export interface CsvLeadZeile {
  /** Synthetischer "Label: Wert"-Text fuer parsePflegehilfe. */
  text: string;
  /** Alle nicht-leeren Spalten verbatim — fuers Ereignislog. */
  zusatz: Record<string, string>;
}

/** Eine Datenzeile der Pflegehilfe-CSV in Parser-Futter uebersetzen.
 *  Die synthetischen Zeilen stehen VOR dem RequestDetail-Block, damit
 *  feld() (erste Fundstelle gewinnt) die Spaltenwerte bevorzugt — z. B.
 *  schlaegt `Pflegegrad  Pflegegrad 3` den Suchfilter im Detailblock. */
export function csvZuLeadZeile(kopf: string[], zeile: string[]): CsvLeadZeile {
  const wert = (spalte: string): string => {
    const i = kopf.indexOf(spalte);
    return i >= 0 ? (zeile[i] ?? '').trim() : '';
  };

  const name = [wert('Sex'), wert('AcademicDegree'), wert('FirstName'), wert('SurName')]
    .filter(Boolean).join(' ');
  const plz = wert('RequestZipCode') || wert('ZipCode');
  const ort = wert('RequestRegion') || wert('City');

  const t: string[] = [];
  if (name) t.push(`Ansprechpartner\t${name}`);
  if (wert('Phone')) t.push(`Mobil\t${wert('Phone')}`);
  if (wert('Email')) t.push(`Email\t${wert('Email')}`);
  if (plz && ort) t.push(`DE-${plz} ${ort}`);
  if (wert('SeniorCareLevel')) t.push(`Pflegegrad\t${wert('SeniorCareLevel')}`);
  if (wert('SeniorMobility')) t.push(`Mobilität\t${wert('SeniorMobility')}`);
  if (wert('RequestNumber')) t.push(`Anfragen-Nr. ${wert('RequestNumber')}`);
  /* Senior-Spalten als Zeilen VOR dem Detailblock — dieselben Labels, die
     der Parser (und der Kontextblock) ohnehin liest. */
  if (wert('SeniorSex')) t.push(`Senior-Anrede	${wert('SeniorSex')}`);
  if (wert('SeniorFirstName')) t.push(`Senior-Vorname	${wert('SeniorFirstName')}`);
  if (wert('SeniorSurName')) t.push(`Senior-Nachname	${wert('SeniorSurName')}`);
  if (wert('SeniorMedicalProcess')) t.push(`Krankheiten	${wert('SeniorMedicalProcess')}`);
  if (wert('SeniorRelationship')) t.push(`Beziehung	${wert('SeniorRelationship')}`);
  if (wert('SeniorLiveSituation')) t.push(`Lebenssituation	${wert('SeniorLiveSituation')}`);
  if (wert('Availability')) t.push(`Erreichbarkeit	${wert('Availability')}`);
  if (wert('RequestDetail')) t.push(wert('RequestDetail'));

  const zusatz: Record<string, string> = {};
  kopf.forEach((spalte, i) => {
    const v = (zeile[i] ?? '').trim();
    if (v) zusatz[spalte] = v;
  });

  return { text: t.join('\n'), zusatz };
}
