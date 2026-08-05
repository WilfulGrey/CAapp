// TREŚĆ umowy (Betreuungsvertrag) jako czyste dane — bez HTML, bez pdfkit,
// bez jakichkolwiek importów. Single source of truth dla OBU rendererów:
//   - buildVertragHtml (lib/vertrag.ts — szablon HTML, fallback mailowy),
//   - renderVertragPdf (lib/vertrag-pdf.ts — kanoniczny PDF, pdfkit).
// Dzięki temu testowalne w root-vitest (CI robi npm ci tylko w root) i
// gwarantujące, że żaden napis dokumentu prawnego nie zginie przy zmianie
// silnika renderującego (refactor puppeteer→pdfkit, Registry #27).
//
// WORTLAUT: 1:1 z dist/primundus-mustervertrag.pdf (8 stron) — przy zmianie
// oryginału zaktualizować TUTAJ (oba renderery konsumują ten moduł).

// ─── Typy wejścia (przeniesione z lib/vertrag.ts — re-eksportowane tam) ──

export interface VertragPartei {
  name?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  email?: string;
  telefon?: string;
}

export interface VertragInput {
  datum?: string;
  ag?: VertragPartei;
  le?: VertragPartei | null; // null = identisch mit Auftraggeber
  vertragsbeginn?: string;
  voraussAbreise?: string;
  tagessatz?: string; // z.B. "EUR 95,00"
  dl?: { name?: string; rolle?: string };
}

export interface VertragHtmlOptions {
  signaturName: string;
  signedAt?: string; // menschenlesbarer Zeitstempel, z.B. "05.06.2026 um 14:30 Uhr"
  auditNote?: string; // z.B. "IP 1.2.3.4 · Vertragsversion v1.0"
}

// ─── Punkte aus dem Mustervertrag (1:1 verbatim) ────────────────────────
// Pro § ein Block. `subList` optional für Punkt 8 in § 1 (vier ▸-Bullets).

export interface Punkt {
  text: string;
  subList?: string[];
}

export interface Paragraph {
  titel: string;
  punkte: Punkt[];
  footnote?: string;
}

export const PARA_1: Paragraph = {
  titel: '§ 1 Vertragsgegenstand',
  punkte: [
    {
      text: 'Der DL erbringt zeitlich überwiegend Leistungen im Bereich der hauswirtschaftlichen Versorgung und unterstützt den LE bei der Ausübung alltäglicher Aktivitäten. Zusätzlich erbringt der DL in zeitlich geringerem Umfang Leistungen im Bereich der Grundpflege im Sinne des SGB XI. Eine detaillierte Beschreibung dieser Leistungen erfolgt in Anlage 2 dieses Vertrages, wobei die Art, Dauer und die Häufigkeit der Betreuung vom jeweiligen Gesundheitszustand des Leistungsempfängers abhängen. Der zeitliche Aufwand der vereinbarten grundpflegerischen Leistungen darf 50 Prozent der gesamten Leistung nicht überschreiten.',
    },
    {
      text: 'Der DL erklärt, dass notwendige medizinische Behandlungspflege nach SGB V (z. B. Injektionen, Wundversorgung, u. a.) sich ausdrücklich nicht im Umfang der Dienstleistungen befindet und nicht im Rahmen dieses Vertrages ausgeführt wird.',
    },
    {
      text: 'Der DL verpflichtet sich, die ihm in Auftrag gegebenen Dienstleistungen mit höchster Sorgfalt sowie durch die volle Anwendung seiner Kenntnisse und Erfahrungen zu erbringen.',
    },
    {
      text: 'Im Fall einer Verhinderung der Betreuungsperson ist der DL berechtigt, die Betreuungsperson schnellstmöglich (in der Regel innerhalb von 3 Tagen) zu wechseln.',
    },
    {
      text: 'Bei begründetem und nachvollziehbarem Wunsch des AG wird der DL einen Austausch der Betreuungsperson vornehmen. Für die Ausführung wird dem DL ein Zeitraum von mindestens einer Woche gewährt.',
    },
    {
      text: 'Die eingesetzten Betreuungspersonen des DL können nicht durch den AG zu anderen Zwecken eingeteilt oder an andere Leistungsorte verliehen werden.',
    },
    {
      text: 'Mängel und Beschwerden müssen dem DL unverzüglich schriftlich angezeigt werden.',
    },
    {
      text: 'Der DL erbringt seine Dienstleistungen gemäß den Vorschriften der EU am Leistungsort. Beide Vertragsparteien sind sich darüber einig:',
      subList: [
        'der AG erstellt weder Dienst- noch Freizeitpläne',
        'der AG übt keinen Einfluss auf Art und Weise der Aufgaben der Betreuungsperson aus',
        'der AG erteilt keine direkten und bindenden Weisungen und übt kein Direktionsrecht aus',
        'der AG bindet die Betreuungsperson nicht in eigene Betriebsabläufe ein',
      ],
    },
    {
      text: 'Die wöchentliche durchschnittliche Arbeitszeit darf 40 Stunden nicht überschreiten. Außerhalb der Arbeitszeit steht es der Betreuungsperson frei, den Leistungsort zu verlassen.',
    },
    {
      text: 'Der AG stellt der Betreuungsperson die Mitbenutzung eines Telefons für nationale Festnetztelefonate sowie Festnetztelefonate ins Heimatland und Internet zur Verfügung.',
    },
  ],
};

export const PARA_2: Paragraph = {
  titel: '§ 2 Unterbringung / Verpflegung / Transfer',
  punkte: [
    {
      text: 'Der AG verpflichtet sich, der Betreuungsperson ausreichenden, unentgeltlichen Wohnraum (z. B. ein Zimmer) zur alleinigen, privaten und freiwilligen Nutzung zur Verfügung zu stellen. Der Wohnraum muss ausreichend möbliert, beheizt, verschließbar und hygienisch einwandfrei mit einem Tageslichtfenster versehen sein.',
    },
    {
      text: 'Der AG trägt alle Kosten der Leistungserbringung, Ernährungs- und Lebenshaltungskosten sowie die Kosten für die mit der Betreuung verbundenen Mittel und Geräte.',
    },
    {
      text: 'Der AG verpflichtet sich, am vorher vereinbarten Ankunftstag die Betreuungsperson am nächstgelegenen Ankunftsort auf eigene Kosten abzuholen. Der DL haftet nicht für Verspätungen infolge der Busreisedauer oder persönlicher Angelegenheiten der Betreuungspersonen.',
    },
  ],
};

export function paragraph3(beginn: string, abreise: string): Paragraph {
  return {
    titel: '§ 3 Vertragsdauer / Vertragskündigung',
    punkte: [
      {
        text: `Der Vertrag beginnt voraussichtlich am ${beginn} und wird auf unbestimmte Zeit geschlossen.`,
      },
      {
        text: 'Der AG verlangt vom DL ausdrücklich, dass dieser mit der Leistungserbringung bereits vor Ablauf der Widerrufsfrist gemäß § 8 beginnt.',
      },
      {
        text: 'Der Vertrag kann von beiden Seiten ohne Einhaltung einer Kündigungsfrist gekündigt werden.',
      },
      {
        text: 'Die Kündigung bedarf zu ihrer Wirksamkeit zwingend der Textform (Brief, Fax, E-Mail).',
      },
      {
        text: 'Der Auftraggeber gewährt dem Dienstleister eine Frist von maximal 3 Tagen zur Organisation der Rückreise der Betreuungsperson sowie während dieser Frist weiterhin Unterkunft und Verpflegung.',
      },
      {
        text: 'Die Abwesenheit des LE am Leistungsort bis zu 7 Tagen lässt den Vertragsbestand unberührt. Ab dem 8. Tag ruht der Vertrag kostenlos für den AG bis die Betreuung wieder fortgesetzt wird.',
      },
      {
        text: 'Bei Beschwerden über die Erbringung der vereinbarten Leistungen ist der DL unverzüglich zu informieren. Eine Minderung kann nur erfolgen, wenn der Minderungsgrund innerhalb von 5 Tagen angezeigt wurde und zwischen den Parteien unstrittig ist.',
      },
    ],
    footnote: `Geplanter Einsatz-Zeitraum (Rotation): ${beginn} – voraussichtlich ${abreise}. Der Vertrag selbst ist täglich kündbar (§ 3.3).`,
  };
}

export function paragraph4(tagessatz: string): Paragraph {
  return {
    titel: '§ 4 Vergütung',
    punkte: [
      {
        text: `Der DL erhält für die vereinbarten Dienstleistungen eine Vergütung von ${tagessatz} pro Tag (Tagessatz) zzgl. einer Reisekostenpauschale i.H.v. EUR 125,00 pro Fahrt.`,
      },
      {
        text: 'Die Vergütung wird berechnet ab dem Tag der Ankunft der Betreuungsperson am Leistungsort.',
      },
      {
        text: 'Beginnt oder endet die Vertragslaufzeit im Laufe eines Monats, erfolgt eine anteilige Berechnung der vereinbarten Vergütung.',
      },
      {
        text: 'Die Rechnungen werden monatlich zum 15. ausgestellt. Der Rechnungsbetrag ist bis spätestens 7 Tage nach Erhalt zu überweisen.',
      },
      {
        text: 'Sollten sich die Betreuungsbedürfnisse der zu betreuenden Person ändern, behält sich der DL das Recht zur Anpassung des Honorars vor.',
      },
      {
        text: 'Im Falle einer Arbeitsunfähigkeit der Betreuungsperson wird für die Zeit der Verhinderung kein Honorar berechnet.',
      },
      {
        text: 'Der Anreisetag und der Abreisetag werden als volle Dienstleistungstage berechnet. Bei einem Personalwechsel wird der volle Tagessatz für beide Betreuungspersonen berechnet.',
      },
      {
        text: 'An gesetzlichen Feiertagen wird der doppelte Tagessatz berechnet.',
      },
      {
        text: 'In den Sommermonaten Juli und August wird ein Sommerzuschlag von 6,67 € pro Tag berechnet.',
      },
      {
        text: 'Nach der aktuellen Gesetzeslage ist auf die Dienstleistungen des DL keine gesetzliche Mehrwertsteuer zu entrichten.',
      },
      {
        text: 'Bei Zahlungsverzug hat der DL das Recht, Dritte mit der Rechnungsabwicklung zu beauftragen und Verzugszinsen in Höhe von 5 Prozent p. a. über dem jeweiligen Basiszinssatz zu berechnen.',
      },
      {
        text: 'Der DL ist berechtigt, bei ausbleibender Zahlung die Betreuungsperson ersatzlos abreisen zu lassen und den Vertrag außerordentlich fristlos zu kündigen.',
      },
    ],
  };
}

export const PARA_5: Paragraph = {
  titel: '§ 5 Haftung des Dienstleisters',
  punkte: [
    {
      text: 'Der DL erklärt, dass die von ihm beauftragten Betreuungspersonen über eine Haftpflichtversicherung verfügen.',
    },
    {
      text: 'Der Dienstleister haftet für Schäden an Leib, Leben oder Gesundheit nach den gesetzlichen Vorschriften und jeweils bis zu EUR 1.000.000,00 pro Schadenfall. Die Haftung für Schäden und Folgeschäden wird ausgeschlossen, wenn der Schaden in geringen Beschädigungen (bis zu EUR 100,00) besteht, die bei der Verrichtung alltäglicher Haushaltspflichten entstanden sind, oder wenn der Schaden einen normalen Verschleiß der Ausstattung darstellt.',
    },
    {
      text: 'Der DL und die Betreuungspersonen leisten keine medizinische Behandlungspflege im Sinne des SGB V und übernehmen keine Verantwortung für Umstände, die durch Nichteinhaltung ärztlicher Anordnungen durch den AG oder LE entstehen.',
    },
    {
      text: 'Im Falle der Übergabe eines Kraftfahrzeugs an die Betreuungsperson können keine Ansprüche gegenüber dem DL geltend gemacht werden.',
    },
  ],
};

export const PARA_6: Paragraph = {
  titel: '§ 6 Datenschutz / Vertraulichkeitsvereinbarung',
  punkte: [
    {
      text: 'Beide Parteien verpflichten sich zum Schutz aller personenbezogenen Daten gemäß der EU-DSGVO. Der DL verpflichtet sich zur vertraulichen Behandlung der persönlichen Daten des AG und LE.',
    },
    {
      text: 'Der DL verarbeitet anvertraute personenbezogene Daten nur soweit, als es zur Begründung, Durchführung oder Beendigung dieses Vertrages erforderlich ist.',
    },
    {
      text: 'Der AG verpflichtet sich zur vollen Verschwiegenheit gegenüber Dritten in Bezug auf sämtliche Daten, die im Zusammenhang mit der Erbringung der Dienstleistung erlangt werden.',
    },
    {
      text: 'Der AG und der LE willigen ein, dass die zur Erfüllung des Vertrages notwendigen Daten vom DL erhoben, gespeichert, verarbeitet und an seine Mitarbeiter und Betreuungspersonen weitergegeben werden dürfen.',
    },
  ],
};

export const PARA_7: Paragraph = {
  titel: '§ 7 Wettbewerbsverbot',
  punkte: [
    {
      text: 'Für die Betreuungspersonen gilt sowohl während der Vertragsdauer als auch bis 12 Monate nach Beendigung ein Konkurrenz- und Wettbewerbsverbot. Es ist nicht gestattet, ein mittelbares oder unmittelbares Rechtsverhältnis zu einer Betreuungsperson des DL zu begründen.',
    },
    {
      text: 'Im Falle einer schuldhaften Annahme eines Auftrages durch eine Betreuungsperson beim AG mit Ausschließung des DL, verpflichtet sich der AG, eine Vertragsstrafe in Höhe von EUR 5.000,00 zu zahlen.',
    },
  ],
};

export const PARA_8: Paragraph = {
  titel: '§ 8 Widerrufsrecht',
  punkte: [
    {
      text: 'Dem AG steht das Recht zu, diesen Vertrag ohne Angabe von Gründen innerhalb von 14 Tagen in Textform zu widerrufen. Die Widerrufsfrist beginnt mit Unterzeichnung dieses Vertrages. Widerruf an: Primundus Deutschland (VITANAS CARE LTD HOME SK), ul. Poznańska 21/48, 00-685 Warszawa.',
    },
    {
      text: 'Im Falle eines wirksamen Widerrufs sind die beiderseits empfangenen Leistungen zurückzugewähren. Der AG ist verpflichtet, dem DL Wertersatz zu leisten (z. B. entstandene Reisekosten, pauschal EUR 125,00).',
    },
    {
      text: 'Der AG bestätigt durch Unterzeichnung, dass er ausdrücklich verlangt, dass die Leistungserbringung vor Ablauf der Widerrufsfrist beginnt.',
    },
  ],
};

export const PARA_9: Paragraph = {
  titel: '§ 9 Einhaltung der gültigen Sozialversicherungspflichten',
  punkte: [
    {
      text: 'Der DL erklärt, dass er alle auszuführenden Tätigkeiten nach den gültigen Gesetzen, insbesondere der EU-Dienstleistungsrichtlinie und dem Arbeitnehmer-Entsendegesetz, rechtmäßig befolgt.',
    },
    {
      text: 'Die Vergütung des Personals richtet sich nach dem deutschen Mindestlohn.',
    },
    {
      text: 'Die von ihm beauftragten Betreuungspersonen sind ordnungsgemäß nach polnischem Sozialversicherungsrecht versichert und mit A1-Bescheinigungen der polnischen Sozialversicherungsanstalt (ZUS) entsandt.',
    },
  ],
};

export const PARA_10: Paragraph = {
  titel: '§ 10 Schlussbestimmungen',
  punkte: [
    { text: 'Änderungen und Ergänzungen bedürfen der Schriftform.' },
    {
      text: 'Rechnungen und Korrespondenz werden an die E-Mailadresse des AG auf Seite 1 gesendet.',
    },
    { text: 'Eine E-Mail ist gemäß diesem Vertrag ebenfalls Schriftform.' },
    {
      text: 'Sollten einzelne Bestimmungen unwirksam sein, gelten die übrigen fort.',
    },
    {
      text: 'Der AG bestätigt mit seiner Unterschrift den gesamten Inhalt des Vertrages gelesen zu haben.',
    },
    { text: 'Mündliche Nebenabreden bestehen nicht.' },
    { text: 'Der Vertrag unterliegt deutschem Recht.' },
  ],
};

// ─── Statyczne teksty poza §§ (verbatim z szablonu HTML) ─────────────────

export const DL_NAME_DEFAULT = 'Kamila Bilska-Wabik';
export const DL_ROLLE_DEFAULT = 'Vitanas Group';

export const T = {
  titel: 'Dienstleistungsvertrag',
  intro: 'geschlossen zwischen den folgenden Vertragsparteien',
  ortDatumPrefix: 'Ort, Datum: ',

  agTag: 'Auftraggeber (AG)',
  agLabels: {
    name: 'Name / Firma',
    strasse: 'Straße + Nr.',
    plzOrt: 'PLZ / Ort',
    email: 'E-Mail',
    telefon: 'Telefon',
  },
  betweenPrefix: 'im Folgenden ',
  agBetweenBold: 'Auftraggeber (AG)',
  betweenSuffix: ' genannt',

  leTag: 'Leistungsempfänger (LE) — falls abweichend vom AG',
  leLabels: { name: 'Name', strasse: 'Straße + Nr.', plzOrt: 'PLZ / Ort' },
  leIdentisch: 'identisch mit Auftraggeber',
  leBetweenBold: 'Leistungsempfänger (LE)',

  und: '— und —',

  dlTag: 'Dienstleister (DL)',
  dlFirma: 'PRIMUNDUS Deutschland',
  dlFirmaSub1: 'VITANAS CARE LTD HOME SK · ul. Poznańska 21/48, 00-685 Warszawa',
  dlFirmaSub2: 'NIP: 7011301447 · REGON: 544074862',
  dlBetweenBold: 'Dienstleister (DL oder PRIMUNDUS)',
  dlBetweenSuffix: ' genannt.',

  signsTitle: 'Unterschriften',
  lblOrt: 'Ort',
  lblDatum: 'Datum',
  capAg: 'Ort, Datum, Unterschrift Auftraggeber',
  capAgSub: '(bzw. Bevollmächtigter oder gesetzlicher Vertreter)',
  capDl: 'Ort, Datum, Unterschrift Dienstleister',

  auditHead: '✓ Vertrag rechtsverbindlich unterschrieben',
  auditSigniertVon: 'Elektronisch signiert von ',
  auditAm: ' am ',
  auditSub: 'Einfache elektronische Signatur',

  anlage1H: 'Anlage 1 zum Dienstleistungsvertrag',
  anlage1Sub: 'Hinweise zum Datenschutz (EU-DSGVO) und Einwilligungserklärung',
  anlage1P1Prefix: 'PRIMUNDUS ist verantwortlich für den Schutz, Sicherheit und Verwaltung Ihrer Daten. Kontakt: ',
  anlage1P1Email: 'datenschutz@primundus.de',
  anlage1P2:
    'Die angegebenen personenbezogenen Daten, insbesondere Name, Anschrift, Telefonnummer, Bankdaten, Gesundheitsdaten und familiäre Daten, werden auf Grundlage der geltenden EU-DSGVO ausschließlich zum Zwecke der Durchführung des entstehenden Vertragsverhältnisses erhoben und verarbeitet.',
  anlage1P3:
    'Ihre Vertragsdaten speichern wir gemäß den gesetzlichen Vorgaben. Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Sperrung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit sowie das Recht auf Beschwerde bei einer zuständigen Aufsichtsbehörde. Unsere Datenschutzerklärung finden Sie unter www.primundus.de.',
  einwilligungHead: 'Einwilligung zur Datennutzung zu Werbezwecken:',
  einwilligungText:
    'Ich bin damit einverstanden, dass PRIMUNDUS mir postalisch / per E-Mail / Telefon / Fax Informationen und Angebote zum Zwecke der Eigenwerbung zusendet.',

  anlage2H: 'Anlage 2 zum Dienstleistungsvertrag',
  anlage2Sub: 'Leistungsumfang',
  anlage2Intro:
    'Die Vertragspartner vereinbaren, dass folgende Leistungen im Rahmen des abgeschlossenen Dienstleistungsvertrages erbracht werden. Beide Parteien sind sich darüber einig, dass zeitlich überwiegend nur Leistungen im Bereich der hauswirtschaftlichen Versorgung erbracht werden.',
  hwHead: 'Hauswirtschaftliche Leistungen',
  hwNote: '(zeitlich überwiegend)',
  gpHead: 'Grundpflege nach § 14 Abs. 4 Nr. 1–3 SGB XI',
  gpNote: '(zeitlich nicht überwiegend)',
  anlage2Footnote: 'Ausdrücklich ausgenommen: Leistungen der medizinischen Behandlungspflege nach SGB V.',

  footerBrand: 'PRIMUNDUS',
  footerRest: ' | www.primundus.de',
} as const;

export const HW_CHECKLIST: readonly string[] = [
  'Alle notwendigen Maßnahmen zur Aufrechterhaltung einer eigenständigen Haushaltsführung',
  'Ordnung und Reinigung der vom LE genutzten Zimmer/Räume (Fensterreinigung, Garage, Heizräume und Außengebäude ausgeschlossen)',
  'Einkaufen',
  'Spülen des alltäglichen Geschirrs',
  'Waschen und Wechseln der Wäsche sowie Kleidung',
  'Zubereitung von Speisen und Getränken',
  'Pflege von Zimmerpflanzen',
  'Begleitung bei Spaziergängen',
  'Versorgung von Haustieren',
  'Aktivierende Tätigkeiten und Besorgungen (z. B. Begleitung bei Kulturveranstaltungen, Spiele etc.)',
];

export const GP_CHECKLIST: readonly string[] = [
  'Körperpflege (z. B. Waschen, Duschen, Baden, Rasieren, Mund- und Zahnpflege, Hautpflege)',
  'Hilfe bei der Nahrungsaufnahme',
  'Hilfe bei der Mobilität (z. B. Aufstehen, Zubettgehen, An- und Auskleiden, Treppensteigen)',
  'Begleitung von Arztbesuchen',
];

// ─── Kanoniczny format znacznika czasu podpisu ───────────────────────────
// (przeniesione z lib/vertrag.ts — patrz Bug #20 „zwei Verträge mit zwei
// Uhrzeiten": ZAWSZE Europe/Berlin z ISO serwera, NIGDY getHours()).
export function formatSignedAtBerlin(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('day')}.${g('month')}.${g('year')} um ${g('hour')}:${g('minute')} Uhr`;
}

// ─── Wspólna derywacja pól (RAW, bez HTML-escapingu) ─────────────────────
// Jedna implementacja reguł defaultów/fallbacków dla obu rendererów.
// HTML-owy szablon escapuje NA KOŃCU (esc() w lib/vertrag.ts) — dzięki temu
// zachowanie starego kodu (kolejność: raw split → esc) jest zachowane 1:1.

export interface VertragFelder {
  datum: string;
  ag: VertragPartei;
  le: VertragPartei | null;
  beginn: string;
  abreise: string;
  tagessatz: string;
  dlName: string;
  dlRolle: string;
  ort: string;
  signaturName: string;
  signedAt: string;
  signDatum: string; // reguła: signedAt.split(' um ')[0], fallback datum
  paragraphs: Paragraph[];
}

export function resolveVertragFelder(daten: VertragInput, opts: VertragHtmlOptions): VertragFelder {
  const datum = daten.datum || '';
  const beginn = daten.vertragsbeginn || '—';
  const abreise = daten.voraussAbreise || '—';
  const tagessatz = daten.tagessatz || '—';
  return {
    datum,
    ag: daten.ag ?? {},
    le: daten.le ?? null,
    beginn,
    abreise,
    tagessatz,
    dlName: daten.dl?.name || DL_NAME_DEFAULT,
    dlRolle: daten.dl?.rolle || DL_ROLLE_DEFAULT,
    ort: (daten.ag ?? {}).ort || '',
    signaturName: opts.signaturName,
    signedAt: opts.signedAt || '',
    signDatum: opts.signedAt ? opts.signedAt.split(' um ')[0] : datum,
    paragraphs: [
      PARA_1,
      PARA_2,
      paragraph3(beginn, abreise),
      paragraph4(tagessatz),
      PARA_5,
      PARA_6,
      PARA_7,
      PARA_8,
      PARA_9,
      PARA_10,
    ],
  };
}

// ─── Model blokowy dokumentu (wejście renderera pdfkit) ──────────────────

export type Run = { text: string; bold?: boolean };

export type PartyRow = { label: string; value: string; italicPlaceholder?: boolean };
export type SignCol = { name: string; caption: string; capSub: string };

export type VertragBlock =
  | { type: 'logoHeader'; rightText: string }
  | { type: 'docTitle'; text: string }
  | { type: 'centerNote'; runs: Run[]; variant: 'intro' | 'between' | 'und' }
  | { type: 'partyBox'; tag: string; rows?: PartyRow[]; firma?: { name: string; subs: string[] } }
  | { type: 'sectionHeading'; text: string }
  | { type: 'numberedItem'; n: number; text: string; sub?: string[] }
  | { type: 'footnoteBox'; text: string }
  | { type: 'paragraph'; runs: Run[]; variant?: 'anlageFootnote' }
  | { type: 'einwilligung'; head: string; text: string }
  | {
    type: 'signatureBlock';
    variant: 'main' | 'anlage1' | 'anlage2';
    ort: string;
    datum: string;
    left: SignCol;
    right: SignCol | null;
  }
  | { type: 'auditBanner'; heading: string; line: Run[]; sub: string }
  | { type: 'anlageHeading'; title: string; sub: string }
  | { type: 'leadHead'; text: string; note: string }
  | { type: 'checkItem'; text: string }
  | { type: 'pageBreak' };

export function buildVertragDocument(daten: VertragInput, opts: VertragHtmlOptions): VertragBlock[] {
  const f = resolveVertragFelder(daten, opts);
  const blocks: VertragBlock[] = [];

  const kv = (label: string, value?: string): PartyRow => ({ label, value: value || '—' });
  const between = (bold: string, suffix: string): VertragBlock => ({
    type: 'centerNote',
    variant: 'between',
    runs: [{ text: T.betweenPrefix }, { text: bold, bold: true }, { text: suffix }],
  });
  const signCols = (variant: 'main' | 'anlage1' | 'anlage2'): VertragBlock => ({
    type: 'signatureBlock',
    variant,
    ort: f.ort,
    // HTML: `${signDatum || datum || '&nbsp;'}` — signDatum ma już fallback
    // na datum w regule wyżej, więc ta suma odtwarza zachowanie 1:1.
    datum: f.signDatum || f.datum || '',
    left: { name: f.signaturName, caption: T.capAg, capSub: T.capAgSub },
    right:
      variant === 'anlage1'
        ? null
        : {
          name: f.dlName,
          caption: T.capDl,
          capSub: `i. A. ${f.dlName}, ${f.dlRolle} · Warszawa, ${f.datum}`,
        },
  });

  // Strona 1: header + tytuł + strony umowy
  blocks.push({ type: 'logoHeader', rightText: `${T.ortDatumPrefix}${f.ort}${f.ort ? ', ' : ''}${f.datum}` });
  blocks.push({ type: 'docTitle', text: T.titel });
  blocks.push({ type: 'centerNote', variant: 'intro', runs: [{ text: T.intro }] });

  blocks.push({
    type: 'partyBox',
    tag: T.agTag,
    rows: [
      kv(T.agLabels.name, f.ag.name),
      kv(T.agLabels.strasse, f.ag.strasse),
      kv(T.agLabels.plzOrt, [f.ag.plz, f.ag.ort].filter(Boolean).join(' ')),
      kv(T.agLabels.email, f.ag.email),
      kv(T.agLabels.telefon, f.ag.telefon),
    ],
  });
  blocks.push(between(T.agBetweenBold, T.betweenSuffix));

  blocks.push({
    type: 'partyBox',
    tag: T.leTag,
    rows: f.le
      ? [
        kv(T.leLabels.name, f.le.name),
        kv(T.leLabels.strasse, f.le.strasse),
        kv(T.leLabels.plzOrt, [f.le.plz, f.le.ort].filter(Boolean).join(' ')),
      ]
      : [{ label: '', value: T.leIdentisch, italicPlaceholder: true }],
  });
  blocks.push(between(T.leBetweenBold, T.betweenSuffix));

  blocks.push({ type: 'centerNote', variant: 'und', runs: [{ text: T.und }] });

  blocks.push({
    type: 'partyBox',
    tag: T.dlTag,
    firma: { name: T.dlFirma, subs: [T.dlFirmaSub1, T.dlFirmaSub2] },
  });
  blocks.push(between(T.dlBetweenBold, T.dlBetweenSuffix));

  // §§ 1-10
  for (const p of f.paragraphs) {
    blocks.push({ type: 'sectionHeading', text: p.titel });
    p.punkte.forEach((punkt, i) => {
      blocks.push({ type: 'numberedItem', n: i + 1, text: punkt.text, sub: punkt.subList });
    });
    if (p.footnote) blocks.push({ type: 'footnoteBox', text: p.footnote });
  }

  // Unterschriften + audit-banner (koniec części głównej)
  blocks.push(signCols('main'));
  {
    const line: Run[] = [{ text: T.auditSigniertVon }, { text: f.signaturName, bold: true }];
    if (f.signedAt) {
      line.push({ text: T.auditAm });
      line.push({ text: f.signedAt, bold: true });
    }
    line.push({ text: '.' });
    blocks.push({
      type: 'auditBanner',
      heading: T.auditHead,
      line,
      sub: `${T.auditSub}${opts.auditNote ? ` · ${opts.auditNote}` : ''}`,
    });
  }

  // Anlage 1
  blocks.push({ type: 'pageBreak' });
  blocks.push({ type: 'anlageHeading', title: T.anlage1H, sub: T.anlage1Sub });
  blocks.push({
    type: 'paragraph',
    runs: [{ text: T.anlage1P1Prefix }, { text: T.anlage1P1Email, bold: true }],
  });
  blocks.push({ type: 'paragraph', runs: [{ text: T.anlage1P2 }] });
  blocks.push({ type: 'paragraph', runs: [{ text: T.anlage1P3 }] });
  blocks.push({ type: 'einwilligung', head: T.einwilligungHead, text: T.einwilligungText });
  blocks.push(signCols('anlage1'));

  // Anlage 2
  blocks.push({ type: 'pageBreak' });
  blocks.push({ type: 'anlageHeading', title: T.anlage2H, sub: T.anlage2Sub });
  blocks.push({ type: 'paragraph', runs: [{ text: T.anlage2Intro }] });
  blocks.push({ type: 'leadHead', text: T.hwHead, note: T.hwNote });
  for (const item of HW_CHECKLIST) blocks.push({ type: 'checkItem', text: item });
  blocks.push({ type: 'leadHead', text: T.gpHead, note: T.gpNote });
  for (const item of GP_CHECKLIST) blocks.push({ type: 'checkItem', text: item });
  blocks.push({ type: 'paragraph', runs: [{ text: T.anlage2Footnote }], variant: 'anlageFootnote' });
  blocks.push(signCols('anlage2'));

  return blocks;
}

// ─── Płaski tekst dokumentu (testy parytetu: model ↔ HTML ↔ PDF) ─────────
// Zawiera WYŁĄCZNIE treść (bez numeracji punktów i bulletów ▸ — te w HTML
// żyją w CSS-counterach/::before i nie są tekstem dokumentu; renderer PDF
// dorysowuje je osobno, a ich obecność pilnują asercje w render-smoke).
export function documentPlainText(blocks: VertragBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'logoHeader':
        out.push(b.rightText);
        break;
      case 'docTitle':
        out.push(b.text);
        break;
      case 'centerNote':
        out.push(b.runs.map((r) => r.text).join(''));
        break;
      case 'partyBox':
        out.push(b.tag);
        if (b.rows) for (const r of b.rows) out.push([r.label, r.value].filter(Boolean).join(' '));
        if (b.firma) out.push(b.firma.name, ...b.firma.subs);
        break;
      case 'sectionHeading':
        out.push(b.text);
        break;
      case 'numberedItem':
        out.push(b.text);
        if (b.sub) out.push(...b.sub);
        break;
      case 'footnoteBox':
        out.push(b.text);
        break;
      case 'paragraph':
        out.push(b.runs.map((r) => r.text).join(''));
        break;
      case 'einwilligung':
        out.push(b.head, b.text);
        break;
      case 'signatureBlock':
        // Tytuł „Unterschriften" istnieje tylko nad głównym blokiem podpisów
        // (HTML: .signs-title; Anlagi go nie mają) — renderer PDF rysuje go
        // per variant, plaintext musi go emitować w tym samym miejscu.
        if (b.variant === 'main') out.push(T.signsTitle);
        out.push(T.lblOrt, b.ort, T.lblDatum, b.datum);
        out.push(b.left.name, b.left.caption, b.left.capSub);
        if (b.right) out.push(b.right.name, b.right.caption, b.right.capSub);
        break;
      case 'auditBanner':
        out.push(b.heading, b.line.map((r) => r.text).join(''), b.sub);
        break;
      case 'anlageHeading':
        out.push(b.title, b.sub);
        break;
      case 'leadHead':
        out.push(`${b.text} ${b.note}`);
        break;
      case 'checkItem':
        out.push(b.text);
        break;
      case 'pageBreak':
        break;
    }
  }
  return out.filter((s) => s.trim().length > 0).join('\n');
}
