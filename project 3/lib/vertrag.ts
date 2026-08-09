// Server-seitiger Generator für den unterschriebenen Dienstleistungsvertrag.
// Wird beim Buchen (application_accepted_internal) erzeugt und per
// `buildVertragAttachmentPdf` zu PDF gerendert → an Kunde + Team gemailt.
//
// LAYOUT-VORLAGE: dist/primundus-mustervertrag.pdf (8 Seiten). Wortlaut +
// Reihenfolge + Seitenstruktur sind 1:1 dem Original nachgebaut. Wenn das
// Original aktualisiert wird, muss /tmp/mustervertrag.txt neu extrahiert
// (pdftotext -layout) und dieser Generator angepasst werden.
//
// Historischer Hinweis: bis 11.06.2026 wurde HTML 1:1 als Mail-Anhang
// versendet. Outlook/Gmail flaggen HTML-Anhänge als verdächtig und der
// Vertrag war nicht gerichtsfest archivierbar. Daher rendern wir jetzt
// via puppeteer + @sparticuz/chromium zu echtem PDF (siehe unten).

import { COMPANY, COMPANY_ADDRESS } from './company';

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

// ─── Punkte aus dem Mustervertrag (1:1 verbatim) ────────────────────────
// Pro § ein Block. `subList` optional für Punkt 8 in § 1 (vier ▸-Bullets).

interface Punkt {
  text: string;
  subList?: string[];
}

interface Paragraph {
  titel: string;
  punkte: Punkt[];
  footnote?: string;
}

const PARA_1: Paragraph = {
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

const PARA_2: Paragraph = {
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

function paragraph3(beginn: string, abreise: string): Paragraph {
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

function paragraph4(tagessatz: string): Paragraph {
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

const PARA_5: Paragraph = {
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

const PARA_6: Paragraph = {
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

const PARA_7: Paragraph = {
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

const PARA_8: Paragraph = {
  titel: '§ 8 Widerrufsrecht',
  punkte: [
    {
      text: `Dem AG steht das Recht zu, diesen Vertrag ohne Angabe von Gründen innerhalb von 14 Tagen in Textform zu widerrufen. Die Widerrufsfrist beginnt mit Unterzeichnung dieses Vertrages. Widerruf an: ${COMPANY.firma}, ${COMPANY_ADDRESS}.`,
    },
    {
      text: 'Im Falle eines wirksamen Widerrufs sind die beiderseits empfangenen Leistungen zurückzugewähren. Der AG ist verpflichtet, dem DL Wertersatz zu leisten (z. B. entstandene Reisekosten, pauschal EUR 125,00).',
    },
    {
      text: 'Der AG bestätigt durch Unterzeichnung, dass er ausdrücklich verlangt, dass die Leistungserbringung vor Ablauf der Widerrufsfrist beginnt.',
    },
  ],
};

const PARA_9: Paragraph = {
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

const PARA_10: Paragraph = {
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

// ─── Helfer ──────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderParagraph(p: Paragraph): string {
  const items = p.punkte
    .map((punkt) => {
      const sub = punkt.subList
        ? `<ul class="sub">${punkt.subList.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
        : '';
      return `<li><span class="num"></span><span class="txt">${esc(punkt.text)}${sub}</span></li>`;
    })
    .join('');
  const footnote = p.footnote ? `<p class="footnote">${esc(p.footnote)}</p>` : '';
  return `
    <section class="para">
      <h2>${esc(p.titel)}</h2>
      <ol>${items}</ol>
      ${footnote}
    </section>`;
}

// ─── Bildung des HTML-Dokuments ──────────────────────────────────────────

export interface VertragHtmlOptions {
  signaturName: string;
  signedAt?: string; // menschenlesbarer Zeitstempel, z.B. "05.06.2026 um 14:30 Uhr"
  auditNote?: string; // z.B. "IP 1.2.3.4 · Vertragsversion v1.0"
}

// KANONISCHES Format des Unterschrifts-Zeitstempels: der Server-ISO-Moment
// (lead_application_acceptances.signed_at) in deutscher Ortszeit. NIEMALS
// getHours() o.ä. verwenden — Render läuft in UTC, das ergab "17:00 Uhr"
// statt 19:00 (Bug „zwei Verträge mit zwei Uhrzeiten", 2026-07-21). Alle
// Render-Pfade (Mail-Anhang, Storage-Kanon, Portal-Fallback) nutzen DIESE
// Funktion → ein Vertrag, eine Uhrzeit.
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

export function buildVertragHtml(daten: VertragInput, opts: VertragHtmlOptions): string {
  const datum = esc(daten.datum || '');
  const ag = daten.ag ?? {};
  const le = daten.le ?? null;
  const beginn = esc(daten.vertragsbeginn || '—');
  const abreise = esc(daten.voraussAbreise || '—');
  const tagessatz = esc(daten.tagessatz || '—');
  const dlName = esc(daten.dl?.name || COMPANY.geschaeftsfuehrer);
  const dlRolle = esc(daten.dl?.rolle || COMPANY.funktion);
  const ort = esc(ag.ort || '');
  const signaturName = esc(opts.signaturName);
  const signedAt = esc(opts.signedAt || '');
  const signDatum = opts.signedAt ? esc(opts.signedAt.split(' um ')[0]) : datum;

  const parteiZeile = (label: string, value?: string) =>
    `<div class="pz"><span class="pl">${esc(label)}</span><span class="pv">${esc(value || '—')}</span></div>`;

  const leBlock = le
    ? `${parteiZeile('Name', le.name)}${parteiZeile('Straße + Nr.', le.strasse)}${parteiZeile('PLZ / Ort', [le.plz, le.ort].filter(Boolean).join(' '))}`
    : `<div class="pz le-empty"><span class="pv italic">identisch mit Auftraggeber</span></div>`;

  // Layout 1:1 dem Mustervertrag (dist/primundus-mustervertrag.pdf, 8 Seiten):
  //  Seite 1: Header + Datum + "Dienstleistungsvertrag" + Vertragsparteien
  //  Seite 2: § 1 (10 Punkte) + § 2 Anfang
  //  Seite 3: § 2 Rest + § 3 (7 Punkte)
  //  Seite 4: § 4 (12 Punkte)
  //  Seite 5: § 5 + § 6 + § 7
  //  Seite 6: § 8 + § 9 + § 10 + Unterschriften
  //  Seite 7: Anlage 1 (DSGVO)
  //  Seite 8: Anlage 2 (Leistungsumfang)
  //
  // Footer "PRIMUNDUS | www.primundus.de | Seite X von 8" wird per Puppeteer
  // footerTemplate gerendert (echte Seitenzähler) — siehe
  // buildVertragAttachmentPdf weiter unten.
  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dienstleistungsvertrag – Primundus</title>
<style>
  @page { size: A4; margin: 18mm 22mm 24mm 22mm; }
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1f2937;
    font-size: 11.5pt;
    line-height: 1.65;
    margin: 0;
  }

  /* ─── Header (nur auf Seite 1) ─────────────────────────────────────── */
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #E5E7EB; padding-bottom: 10px; margin-bottom: 18px; }
  .head img.brand { height: 30px; }
  .head .datum { font-size: 10pt; color: #6b7280; }

  /* ─── Titel ───────────────────────────────────────────────────────── */
  h1 { text-align: center; font-size: 22pt; margin: 18px 0 0; font-weight: 700; color: #1f2937; letter-spacing: .5px; }
  .rule { width: 60px; height: 2px; background: #B5A184; margin: 10px auto 24px; }
  .intro-center { text-align: center; color: #6b7280; font-size: 11pt; margin: 0 0 18px; }

  /* ─── Parteien-Boxen ──────────────────────────────────────────────── */
  .parteien { break-inside: avoid; }
  .box {
    border: 1px solid #C9B89A;
    border-radius: 8px;
    padding: 14px 18px;
    margin: 8px 0;
    background: #fff;
    break-inside: avoid;
  }
  .box .tag {
    font-size: 9.5pt;
    font-style: italic;
    letter-spacing: .15em;
    color: #9ca3af;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  .box .firma { font-size: 13pt; font-weight: 700; color: #1f2937; }
  .box .firma-sub { font-size: 10.5pt; color: #4b5563; margin-top: 4px; }
  .pz { display: flex; gap: 14px; padding: 3px 0; font-size: 10.5pt; align-items: baseline; border-bottom: 1px dotted #E5E7EB; }
  .pz:last-child { border-bottom: 0; }
  .pz .pl { width: 130px; flex-shrink: 0; color: #9ca3af; font-size: 10pt; }
  .pz .pv { color: #1f2937; flex: 1; }
  .pz .pv.italic { font-style: italic; color: #9ca3af; }
  .pz.le-empty { padding: 8px 0; }

  /* "im Folgenden ... genannt" — Zwischenzeilen */
  .between {
    text-align: center;
    color: #6b7280;
    font-size: 10pt;
    margin: 6px 0 14px;
    break-inside: avoid;
  }
  .between strong { color: #1f2937; font-weight: 600; }
  .between.und {
    font-weight: 700;
    color: #6B5444;
    font-size: 11pt;
    margin: 14px 0;
    letter-spacing: .15em;
  }

  /* Wrapper: Box + ihre "im Folgenden..."-Zeile bleiben zusammen */
  .partei-block { break-inside: avoid; margin-bottom: 4px; }

  /* ─── §§-Paragraphen ──────────────────────────────────────────────── */
  /* KEIN break-inside:avoid — sonst springt jeder § auf eine neue Seite.
     Stattdessen Header (h2) per break-after:avoid bei seinem ersten <li>
     halten und einzelne <li> per break-inside:avoid intakt rendern. */
  .para { margin: 14px 0 12px; }
  .para h2 {
    font-size: 13.5pt;
    color: #6B5444;
    border-bottom: 1px solid #C9B89A;
    padding-bottom: 6px;
    margin: 0 0 10px;
    font-weight: 700;
    break-after: avoid-page;
  }
  .para ol {
    margin: 0;
    padding-left: 0;
    list-style: none;
    counter-reset: punkt;
  }
  .para ol > li {
    counter-increment: punkt;
    font-size: 11pt;
    line-height: 1.6;
    margin-bottom: 6px;
    padding-left: 28px;
    position: relative;
    text-align: justify;
    color: #1f2937;
    break-inside: avoid;
  }
  .para ol > li::before {
    content: counter(punkt) ".";
    position: absolute;
    left: 0;
    top: 0;
    color: #9ca3af;
    font-weight: 600;
    width: 22px;
    text-align: right;
  }
  .para ol > li .num { display: none; }
  .para ol > li .txt { display: block; }

  /* Sub-Liste für § 1 Punkt 8 (vier ▸-Bullets) */
  .para .sub {
    list-style: none;
    padding-left: 0;
    margin: 6px 0 0 0;
  }
  .para .sub li {
    padding-left: 18px;
    position: relative;
    font-size: 10.5pt;
    line-height: 1.55;
    margin-bottom: 3px;
    color: #374151;
    text-align: left;
  }
  .para .sub li::before {
    content: "▸";
    position: absolute;
    left: 0;
    top: 0;
    color: #B5A184;
  }

  .para .footnote {
    font-size: 10pt;
    color: #6b7280;
    margin: 10px 0 0;
    padding: 8px 12px;
    background: #FAF8F4;
    border-left: 3px solid #B5A184;
    border-radius: 0 4px 4px 0;
  }

  /* ─── Unterschriften ──────────────────────────────────────────────── */
  .signs-title {
    text-align: center;
    color: #6B5444;
    font-size: 12pt;
    font-weight: 700;
    margin: 26px 0 10px;
    letter-spacing: .1em;
  }
  .ort-datum {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    margin: 0 0 6px;
    break-inside: avoid;
  }
  .ort-datum .col { flex: 1; }
  .ort-datum .col .lbl { font-size: 9.5pt; color: #9ca3af; }
  .ort-datum .col .val { font-size: 11pt; color: #1f2937; border-bottom: 1px solid #C9B89A; padding: 4px 0 3px; }

  .sign-block { break-inside: avoid; margin-top: 18px; }
  .sign-grid {
    display: flex;
    gap: 40px;
  }
  .sign-grid .col { flex: 1; }
  .sign-grid .name-line {
    height: 50px;
    display: flex;
    align-items: flex-end;
    margin-bottom: 4px;
  }
  .sign-grid .name {
    font-family: "Snell Roundhand", "Lucida Handwriting", "Brush Script MT", cursive;
    font-size: 24pt;
    color: #1f3a8a;
    line-height: 1;
  }
  .sign-grid .cap {
    border-top: 1px solid #6b7280;
    padding-top: 5px;
    font-size: 9.5pt;
    color: #6b7280;
    line-height: 1.45;
  }
  .sign-grid .cap-sub {
    font-size: 9pt;
    color: #9ca3af;
    margin-top: 2px;
  }

  .audit-banner {
    margin-top: 20px;
    padding: 10px 14px;
    border: 1px solid #BBF7D0;
    background: #F0FDF4;
    border-radius: 6px;
    break-inside: avoid;
  }
  .audit-banner .h { font-weight: 700; color: #166534; font-size: 10.5pt; margin-bottom: 3px; }
  .audit-banner .t { font-size: 10pt; color: #15803d; line-height: 1.55; }
  .audit-banner .a { font-size: 9pt; color: #15803d; opacity: .8; margin-top: 4px; }

  /* ─── Anlagen ────────────────────────────────────────────────────── */
  .anlage {
    page-break-before: always;
    break-before: page;
  }
  .anlage h1.anlage-h {
    font-size: 17pt;
    color: #1f2937;
    text-align: left;
    margin: 0 0 6px;
    font-weight: 700;
  }
  .anlage .anlage-sub {
    font-size: 13pt;
    color: #6B5444;
    margin: 0 0 18px;
    font-weight: 600;
  }
  .anlage-rule { height: 1px; background: #C9B89A; margin: 0 0 18px; }
  .anlage p { font-size: 11pt; line-height: 1.7; color: #1f2937; margin: 0 0 12px; text-align: justify; }
  .anlage .lead-head {
    font-size: 12pt;
    font-weight: 700;
    color: #1f2937;
    margin: 18px 0 8px;
  }
  .anlage ul.checklist {
    list-style: none;
    padding-left: 0;
    margin: 4px 0 0;
  }
  .anlage ul.checklist li {
    padding-left: 22px;
    position: relative;
    font-size: 10.5pt;
    line-height: 1.6;
    margin-bottom: 4px;
    color: #1f2937;
  }
  .anlage ul.checklist li::before {
    content: "▸";
    position: absolute;
    left: 4px;
    top: 0;
    color: #B5A184;
    font-size: 11pt;
  }
  .anlage .einwilligung {
    margin: 16px 0;
    padding: 12px 14px;
    background: #FAF8F4;
    border-left: 3px solid #B5A184;
    border-radius: 0 4px 4px 0;
  }
  .anlage .footnote-anlage {
    margin-top: 10px;
    font-size: 10pt;
    color: #6b7280;
    font-style: italic;
  }
  .anlage .anlage-sign {
    margin-top: 36px;
    break-inside: avoid;
  }
</style></head>
<body>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITE 1: Header + Titel + Vertragsparteien
       ═══════════════════════════════════════════════════════════════ -->
  <div class="head">
    <img class="brand" src="https://kostenrechner.primundus.de/images/Primundus-Logo_V6.png" alt="Primundus">
    <span class="datum">Ort, Datum: ${ort}${ort ? ', ' : ''}${datum}</span>
  </div>

  <h1>Dienstleistungsvertrag</h1>
  <div class="rule"></div>

  <p class="intro-center">geschlossen zwischen den folgenden Vertragsparteien</p>

  <div class="parteien">
    <div class="partei-block">
      <div class="box">
        <div class="tag">Auftraggeber (AG)</div>
        ${parteiZeile('Name / Firma', ag.name)}
        ${parteiZeile('Straße + Nr.', ag.strasse)}
        ${parteiZeile('PLZ / Ort', [ag.plz, ag.ort].filter(Boolean).join(' '))}
        ${parteiZeile('E-Mail', ag.email)}
        ${parteiZeile('Telefon', ag.telefon)}
      </div>
      <p class="between">im Folgenden <strong>Auftraggeber (AG)</strong> genannt</p>
    </div>

    <div class="partei-block">
      <div class="box">
        <div class="tag">Leistungsempfänger (LE) — falls abweichend vom AG</div>
        ${leBlock}
      </div>
      <p class="between">im Folgenden <strong>Leistungsempfänger (LE)</strong> genannt</p>
    </div>

    <p class="between und">— und —</p>

    <div class="partei-block">
      <div class="box">
        <div class="tag">Dienstleister (DL)</div>
        <div class="firma">${COMPANY.firma}</div>
        <div class="firma-sub">${COMPANY_ADDRESS}</div>
        <div class="firma-sub">KRS: ${COMPANY.krs} · NIP: ${COMPANY.nip}</div>
      </div>
      <p class="between">im Folgenden <strong>Dienstleister (DL oder PRIMUNDUS)</strong> genannt.</p>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITEN 2-6: §§ 1 - 10
       ═══════════════════════════════════════════════════════════════ -->
  ${renderParagraph(PARA_1)}
  ${renderParagraph(PARA_2)}
  ${renderParagraph(paragraph3(daten.vertragsbeginn || '—', daten.voraussAbreise || '—'))}
  ${renderParagraph(paragraph4(daten.tagessatz || '—'))}
  ${renderParagraph(PARA_5)}
  ${renderParagraph(PARA_6)}
  ${renderParagraph(PARA_7)}
  ${renderParagraph(PARA_8)}
  ${renderParagraph(PARA_9)}
  ${renderParagraph(PARA_10)}

  <!-- Unterschriften (Ende Seite 6) -->
  <div class="sign-block">
    <div class="signs-title">Unterschriften</div>
    <div class="ort-datum">
      <div class="col"><div class="lbl">Ort</div><div class="val">${ort || '&nbsp;'}</div></div>
      <div class="col"><div class="lbl">Datum</div><div class="val">${signDatum || datum || '&nbsp;'}</div></div>
    </div>
    <div class="sign-grid">
      <div class="col">
        <div class="name-line"><span class="name">${signaturName}</span></div>
        <div class="cap">
          Ort, Datum, Unterschrift Auftraggeber
          <div class="cap-sub">(bzw. Bevollmächtigter oder gesetzlicher Vertreter)</div>
        </div>
      </div>
      <div class="col">
        <div class="name-line"><span class="name">${dlName}</span></div>
        <div class="cap">
          Ort, Datum, Unterschrift Dienstleister
          <div class="cap-sub">i. A. ${dlName}, ${dlRolle} · ${COMPANY.ort}, ${datum}</div>
        </div>
      </div>
    </div>

    <div class="audit-banner">
      <div class="h">✓ Vertrag rechtsverbindlich unterschrieben</div>
      <div class="t">Elektronisch signiert von <strong>${signaturName}</strong>${signedAt ? ` am <strong>${signedAt}</strong>` : ''}.</div>
      <div class="a">Einfache elektronische Signatur${opts.auditNote ? ` · ${esc(opts.auditNote)}` : ''}</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITE 7: Anlage 1 — Datenschutz
       ═══════════════════════════════════════════════════════════════ -->
  <section class="anlage">
    <h1 class="anlage-h">Anlage 1 zum Dienstleistungsvertrag</h1>
    <div class="anlage-sub">Hinweise zum Datenschutz (EU-DSGVO) und Einwilligungserklärung</div>
    <div class="anlage-rule"></div>

    <p>PRIMUNDUS ist verantwortlich für den Schutz, Sicherheit und Verwaltung Ihrer Daten. Kontakt: <strong>datenschutz@primundus.de</strong></p>

    <p>Die angegebenen personenbezogenen Daten, insbesondere Name, Anschrift, Telefonnummer, Bankdaten, Gesundheitsdaten und familiäre Daten, werden auf Grundlage der geltenden EU-DSGVO ausschließlich zum Zwecke der Durchführung des entstehenden Vertragsverhältnisses erhoben und verarbeitet.</p>

    <p>Ihre Vertragsdaten speichern wir gemäß den gesetzlichen Vorgaben. Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Sperrung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit sowie das Recht auf Beschwerde bei einer zuständigen Aufsichtsbehörde. Unsere Datenschutzerklärung finden Sie unter www.primundus.de.</p>

    <div class="einwilligung">
      <strong>Einwilligung zur Datennutzung zu Werbezwecken:</strong><br>
      Ich bin damit einverstanden, dass PRIMUNDUS mir postalisch / per E-Mail / Telefon / Fax Informationen und Angebote zum Zwecke der Eigenwerbung zusendet.
    </div>

    <div class="anlage-sign">
      <div class="ort-datum">
        <div class="col"><div class="lbl">Ort</div><div class="val">${ort || '&nbsp;'}</div></div>
        <div class="col"><div class="lbl">Datum</div><div class="val">${signDatum || datum || '&nbsp;'}</div></div>
      </div>
      <div class="sign-grid">
        <div class="col">
          <div class="name-line"><span class="name">${signaturName}</span></div>
          <div class="cap">
            Ort, Datum, Unterschrift Auftraggeber
            <div class="cap-sub">(bzw. Bevollmächtigter oder gesetzlicher Vertreter)</div>
          </div>
        </div>
        <div class="col"><!-- DL signiert hier nicht --></div>
      </div>
    </div>
  </section>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITE 8: Anlage 2 — Leistungsumfang
       ═══════════════════════════════════════════════════════════════ -->
  <section class="anlage">
    <h1 class="anlage-h">Anlage 2 zum Dienstleistungsvertrag</h1>
    <div class="anlage-sub">Leistungsumfang</div>
    <div class="anlage-rule"></div>

    <p>Die Vertragspartner vereinbaren, dass folgende Leistungen im Rahmen des abgeschlossenen Dienstleistungsvertrages erbracht werden. Beide Parteien sind sich darüber einig, dass zeitlich überwiegend nur Leistungen im Bereich der hauswirtschaftlichen Versorgung erbracht werden.</p>

    <div class="lead-head">Hauswirtschaftliche Leistungen <span style="font-weight:400;color:#6b7280;font-size:10.5pt;">(zeitlich überwiegend)</span></div>
    <ul class="checklist">
      <li>Alle notwendigen Maßnahmen zur Aufrechterhaltung einer eigenständigen Haushaltsführung</li>
      <li>Ordnung und Reinigung der vom LE genutzten Zimmer/Räume (Fensterreinigung, Garage, Heizräume und Außengebäude ausgeschlossen)</li>
      <li>Einkaufen</li>
      <li>Spülen des alltäglichen Geschirrs</li>
      <li>Waschen und Wechseln der Wäsche sowie Kleidung</li>
      <li>Zubereitung von Speisen und Getränken</li>
      <li>Pflege von Zimmerpflanzen</li>
      <li>Begleitung bei Spaziergängen</li>
      <li>Versorgung von Haustieren</li>
      <li>Aktivierende Tätigkeiten und Besorgungen (z. B. Begleitung bei Kulturveranstaltungen, Spiele etc.)</li>
    </ul>

    <div class="lead-head">Grundpflege nach § 14 Abs. 4 Nr. 1–3 SGB XI <span style="font-weight:400;color:#6b7280;font-size:10.5pt;">(zeitlich nicht überwiegend)</span></div>
    <ul class="checklist">
      <li>Körperpflege (z. B. Waschen, Duschen, Baden, Rasieren, Mund- und Zahnpflege, Hautpflege)</li>
      <li>Hilfe bei der Nahrungsaufnahme</li>
      <li>Hilfe bei der Mobilität (z. B. Aufstehen, Zubettgehen, An- und Auskleiden, Treppensteigen)</li>
      <li>Begleitung von Arztbesuchen</li>
    </ul>

    <p class="footnote-anlage">Ausdrücklich ausgenommen: Leistungen der medizinischen Behandlungspflege nach SGB V.</p>

    <div class="anlage-sign">
      <div class="ort-datum">
        <div class="col"><div class="lbl">Ort</div><div class="val">${ort || '&nbsp;'}</div></div>
        <div class="col"><div class="lbl">Datum</div><div class="val">${signDatum || datum || '&nbsp;'}</div></div>
      </div>
      <div class="sign-grid">
        <div class="col">
          <div class="name-line"><span class="name">${signaturName}</span></div>
          <div class="cap">
            Ort, Datum, Unterschrift Auftraggeber
            <div class="cap-sub">(bzw. Bevollmächtigter oder gesetzlicher Vertreter)</div>
          </div>
        </div>
        <div class="col">
          <div class="name-line"><span class="name">${dlName}</span></div>
          <div class="cap">
            Ort, Datum, Unterschrift Dienstleister
            <div class="cap-sub">i. A. ${dlName}, ${dlRolle} · ${COMPANY.ort}, ${datum}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

</body></html>`;
}

// ─── Footer-Template für Puppeteer (Seitenzähler) ────────────────────────
// Puppeteer's displayHeaderFooter + footerTemplate rendert pro Seite einen
// kleinen HTML-Block in den unteren Margin. <span class="pageNumber"> +
// <span class="totalPages"> sind Puppeteer-spezifische Platzhalter, die
// zur Render-Zeit ersetzt werden. ACHTUNG: Schrift-Größe muss explizit
// gesetzt sein, sonst rendert Chrome sie winzig (Default ist ~10px nur
// im Template-Kontext).

const PUPPETEER_FOOTER_TEMPLATE = `
<div style="
  font-size: 9pt;
  width: 100%;
  padding: 0 22mm;
  color: #9ca3af;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  display: flex;
  justify-content: space-between;
  align-items: center;
">
  <span><strong style="color:#6B5444;">PRIMUNDUS</strong> | www.primundus.de</span>
  <span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>
</div>`;

// Puppeteer braucht IRGENDEINEN headerTemplate, sonst rendert es einen
// Default-Header mit URL/Datum (ja, wirklich). Leerer Block = unsichtbar.
const PUPPETEER_HEADER_TEMPLATE = `<div></div>`;

// ─── PDF-Rendering (Mail-Anhang) ─────────────────────────────────────────
// Async, weil puppeteer.launch + page.pdf ~1-3s dauert. Aufrufer (Bridge-
// POST in app/api/lead-event/route.ts) ist eh in einem async-Kontext.
//
// @sparticuz/chromium in Production (Render serverless), lokales chromium
// in Dev. Bei Render-Fehler: HTML-Fallback, damit die Mail nicht ohne
// Anhang rausgeht.
export async function buildVertragAttachmentPdf(
  daten: VertragInput,
  opts: VertragHtmlOptions,
): Promise<{ filename: string; content: Buffer | string; contentType: string }> {
  const html = buildVertragHtml(daten, opts);
  let browser: import('puppeteer-core').Browser | null = null;
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    const isProduction = process.env.NODE_ENV === 'production';
    const launchOptions = isProduction
      ? await (async () => {
          const chromium = (await import('@sparticuz/chromium')).default;
          return {
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true as const,
          };
        })()
      : {
          headless: true as const,
          executablePath: '/usr/bin/chromium',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    // Logo wird von extern geladen → `load` wartet bis window.onload feuert
    // (inkl. aller <img>-Loads). Type-Def in puppeteer-core 22.x kennt nur
    // load/domcontentloaded; networkidle wäre robuster, ist aber nicht
    // im TS-Typ enthalten.
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    const pdfBuf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: PUPPETEER_HEADER_TEMPLATE,
      footerTemplate: PUPPETEER_FOOTER_TEMPLATE,
      // Margin.bottom muss Platz für den Footer lassen (~15-18mm)
      margin: { top: '12mm', right: '0', bottom: '18mm', left: '0' },
    });
    return {
      filename: 'Betreuungsvertrag_Primundus.pdf',
      content: Buffer.from(pdfBuf),
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.error(
      '[buildVertragAttachmentPdf] PDF-Render fehlgeschlagen, falle auf HTML-Anhang zurück:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      filename: 'Betreuungsvertrag_Primundus.html',
      content: html,
      contentType: 'text/html; charset=utf-8',
    };
  } finally {
    if (browser) {
      // Den OS-Prozess VOR close() greifen — nach close() liefert
      // browser.process() ggf. null.
      const proc = browser.process();
      try {
        // close() kann auf @sparticuz/chromium in einem langlebigen (Nicht-
        // Lambda) Render-Prozess hängen → mit Timeout rennen, damit der
        // Request nicht blockiert.
        await Promise.race([
          browser.close(),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      } catch {
        // ignore — Force-Kill unten räumt auf.
      }
      // Force-Kill: wenn close() den Chromium-Prozess nicht reaped hat, sammeln
      // sich Zombie-Chromiums über die Buchungen an → tägliches 512Mi-OOM auf
      // Render (genau das Symptom). SIGKILL stellt sicher, dass der Prozess
      // wirklich stirbt. No-op wenn der Prozess bereits tot ist.
      try {
        proc?.kill('SIGKILL');
      } catch {
        // bereits beendet / kein eigener Prozess (ws-Connection) — ignorieren.
      }
    }
  }
}

/** @deprecated Verwende `buildVertragAttachmentPdf` (async, echtes PDF).
 *  Diese Synchron-Variante liefert HTML — Mail-Clients flaggen das als
 *  verdächtig und der Anhang ist nicht gerichtsfest archivierbar.
 *  Behalten für Tests / Notfall-Rollback. */
export function buildVertragAttachment(daten: VertragInput, opts: VertragHtmlOptions) {
  return {
    filename: 'Betreuungsvertrag_Primundus.html',
    content: buildVertragHtml(daten, opts),
    contentType: 'text/html; charset=utf-8',
  };
}
