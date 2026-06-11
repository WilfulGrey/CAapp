// Server-seitiger Generator für den unterschriebenen Dienstleistungsvertrag
// als selbst-enthaltenes, druckbares HTML-Dokument. Wird beim Buchen
// (application_accepted_internal) erzeugt und (a) für die Bridge-Logik
// gebraucht + (b) per `buildVertragAttachmentPdf` zu PDF gerendert und an
// Kunde + Team gemailt.
//
// Historischer Hinweis: bis 11.06.2026 wurde das HTML 1:1 als Mail-Anhang
// versendet. Das hatte zwei Probleme — HTML-Attachments werden von vielen
// Mail-Clients (Outlook, Gmail) als verdächtig flagged und der Vertrag
// war nicht gerichtsfest archivierbar. Daher rendern wir jetzt via
// puppeteer + @sparticuz/chromium zu echtem PDF (siehe unten).

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

const PARAGRAPHEN_1: { titel: string; punkte: string[] }[] = [
  {
    titel: '§ 1 Vertragsgegenstand',
    punkte: [
      'Der DL erbringt zeitlich überwiegend Leistungen im Bereich der hauswirtschaftlichen Versorgung und unterstützt den LE bei der Ausübung alltäglicher Aktivitäten. Zusätzlich erbringt der DL in zeitlich geringerem Umfang Leistungen im Bereich der Grundpflege im Sinne des SGB XI. Eine detaillierte Beschreibung dieser Leistungen erfolgt in Anlage 2 dieses Vertrages, wobei die Art, Dauer und die Häufigkeit der Betreuung vom jeweiligen Gesundheitszustand des Leistungsempfängers abhängen. Der zeitliche Aufwand der vereinbarten grundpflegerischen Leistungen darf 50 Prozent der gesamten Leistung nicht überschreiten.',
      'Der DL erklärt, dass notwendige medizinische Behandlungspflege nach SGB V (z. B. Injektionen, Wundversorgung, u. a.) sich ausdrücklich nicht im Umfang der Dienstleistungen befindet und nicht im Rahmen dieses Vertrages ausgeführt wird.',
      'Der DL verpflichtet sich, die ihm in Auftrag gegebenen Dienstleistungen mit höchster Sorgfalt sowie durch die volle Anwendung seiner Kenntnisse und Erfahrungen zu erbringen.',
      'Im Fall einer Verhinderung der Betreuungsperson ist der DL berechtigt, die Betreuungsperson schnellstmöglich (in der Regel innerhalb von 3 Tagen) zu wechseln.',
      'Bei begründetem und nachvollziehbarem Wunsch des AG wird der DL einen Austausch der Betreuungsperson vornehmen (Zeitraum mindestens eine Woche).',
      'Die eingesetzten Betreuungspersonen können nicht durch den AG zu anderen Zwecken eingeteilt oder verliehen werden.',
      'Mängel und Beschwerden müssen dem DL unverzüglich schriftlich angezeigt werden.',
      'Der AG erstellt keine Dienst-/Freizeitpläne, übt kein Direktionsrecht aus und bindet die Betreuungsperson nicht in eigene Betriebsabläufe ein.',
      'Die wöchentliche durchschnittliche Arbeitszeit darf 40 Stunden nicht überschreiten.',
      'Der AG stellt der Betreuungsperson die Mitbenutzung eines Telefons sowie Internet zur Verfügung.',
    ],
  },
  {
    titel: '§ 2 Unterbringung / Verpflegung / Transfer',
    punkte: [
      'Der AG verpflichtet sich, der Betreuungsperson ausreichenden, unentgeltlichen Wohnraum zur alleinigen, privaten Nutzung zur Verfügung zu stellen (ausreichend möbliert, beheizt, verschließbar, hygienisch einwandfrei, mit Tageslichtfenster).',
      'Der AG trägt alle Kosten der Leistungserbringung, Ernährungs- und Lebenshaltungskosten sowie die Kosten für die mit der Betreuung verbundenen Mittel und Geräte.',
      'Der AG verpflichtet sich, am vereinbarten Ankunftstag die Betreuungsperson am nächstgelegenen Ankunftsort auf eigene Kosten abzuholen.',
    ],
  },
];

const PARAGRAPHEN_2: { titel: string; punkte: string[] }[] = [
  {
    titel: '§ 5 Haftung des Dienstleisters',
    punkte: [
      'Der DL erklärt, dass die von ihm beauftragten Betreuungspersonen über eine Haftpflichtversicherung verfügen.',
      'Der DL haftet für Schäden an Leib, Leben oder Gesundheit nach den gesetzlichen Vorschriften und jeweils bis zu EUR 1.000.000,00 pro Schadenfall.',
      'Der DL und die Betreuungspersonen leisten keine medizinische Behandlungspflege im Sinne des SGB V.',
      'Im Falle der Übergabe eines Kraftfahrzeugs an die Betreuungsperson können keine Ansprüche gegenüber dem DL geltend gemacht werden.',
    ],
  },
  {
    titel: '§ 6 Datenschutz / Vertraulichkeitsvereinbarung',
    punkte: [
      'Beide Parteien verpflichten sich zum Schutz aller personenbezogenen Daten gemäß der EU-DSGVO.',
      'Der DL verarbeitet anvertraute personenbezogene Daten nur soweit erforderlich.',
      'Der AG verpflichtet sich zur vollen Verschwiegenheit gegenüber Dritten.',
      'Der AG und der LE willigen ein, dass die zur Erfüllung des Vertrages notwendigen Daten erhoben, gespeichert, verarbeitet und an Mitarbeiter und Betreuungspersonen weitergegeben werden dürfen.',
    ],
  },
  {
    titel: '§ 7 Wettbewerbsverbot',
    punkte: [
      'Für die Betreuungspersonen gilt während der Vertragsdauer und bis 12 Monate nach Beendigung ein Konkurrenz- und Wettbewerbsverbot.',
      'Im Falle einer schuldhaften Annahme eines Auftrages durch eine Betreuungsperson beim AG verpflichtet sich der AG, eine Vertragsstrafe in Höhe von EUR 5.000,00 zu zahlen.',
    ],
  },
  {
    titel: '§ 8 Widerrufsrecht',
    punkte: [
      'Dem AG steht das Recht zu, diesen Vertrag ohne Angabe von Gründen innerhalb von 14 Tagen in Textform zu widerrufen. Die Widerrufsfrist beginnt mit Unterzeichnung dieses Vertrages. Widerruf an: Primundus Deutschland (VITANAS CARE LTD HOME SK), ul. Poznańska 21/48, 00-685 Warszawa.',
      'Im Falle eines wirksamen Widerrufs sind die beiderseits empfangenen Leistungen zurückzugewähren (Wertersatz, z. B. entstandene Reisekosten, pauschal EUR 125,00).',
      'Der AG bestätigt durch Unterzeichnung, dass er ausdrücklich verlangt, dass die Leistungserbringung vor Ablauf der Widerrufsfrist beginnt.',
    ],
  },
  {
    titel: '§ 9 Einhaltung der Sozialversicherungspflichten',
    punkte: [
      'Der DL erklärt, dass er alle Tätigkeiten nach den gültigen Gesetzen (EU-Dienstleistungsrichtlinie, Arbeitnehmer-Entsendegesetz) rechtmäßig befolgt.',
      'Die Vergütung des Personals richtet sich nach dem deutschen Mindestlohn.',
      'Die Betreuungspersonen sind nach polnischem Sozialversicherungsrecht versichert und mit A1-Bescheinigungen der ZUS entsandt.',
    ],
  },
  {
    titel: '§ 10 Schlussbestimmungen',
    punkte: [
      'Änderungen und Ergänzungen bedürfen der Schriftform. Rechnungen und Korrespondenz werden an die E-Mailadresse des AG auf Seite 1 gesendet. Eine E-Mail ist gemäß diesem Vertrag ebenfalls Schriftform. Sollten einzelne Bestimmungen unwirksam sein, gelten die übrigen fort. Der AG bestätigt mit seiner Unterschrift, den gesamten Inhalt des Vertrages gelesen zu haben. Mündliche Nebenabreden bestehen nicht. Der Vertrag unterliegt deutschem Recht.',
    ],
  },
];

// § 3 + § 4 mit dynamischen Feldern (Vertragsbeginn / Tagessatz).
function paragraph3(beginn: string, abreise: string): { titel: string; punkte: string[] } {
  return {
    titel: '§ 3 Vertragsdauer / Vertragskündigung',
    punkte: [
      `Der Vertrag beginnt voraussichtlich am ${beginn} und wird auf unbestimmte Zeit geschlossen.`,
      'Der AG verlangt vom DL ausdrücklich, dass dieser mit der Leistungserbringung bereits vor Ablauf der Widerrufsfrist gemäß § 8 beginnt.',
      'Der Vertrag kann von beiden Seiten ohne Einhaltung einer Kündigungsfrist gekündigt werden (täglich kündbar).',
      'Die Kündigung bedarf zu ihrer Wirksamkeit zwingend der Textform (Brief, Fax, E-Mail).',
      'Der AG gewährt dem DL eine Frist von maximal 3 Tagen zur Organisation der Rückreise sowie während dieser Frist weiterhin Unterkunft und Verpflegung.',
      'Die Abwesenheit des LE am Leistungsort bis zu 7 Tagen lässt den Vertragsbestand unberührt. Ab dem 8. Tag ruht der Vertrag kostenlos.',
      'Bei Beschwerden ist der DL unverzüglich zu informieren. Eine Minderung kann nur erfolgen, wenn der Grund innerhalb von 5 Tagen angezeigt wurde.',
      `Geplanter Einsatz-Zeitraum (Rotation): ${beginn} – voraussichtlich ${abreise}. Der Vertrag selbst ist täglich kündbar (§ 3.3).`,
    ],
  };
}

function paragraph4(tagessatz: string): { titel: string; punkte: string[] } {
  return {
    titel: '§ 4 Vergütung',
    punkte: [
      `Der DL erhält für die vereinbarten Dienstleistungen eine Vergütung von ${tagessatz} pro Tag (Tagessatz) zzgl. einer Reisekostenpauschale i.H.v. EUR 125,00 pro Fahrt.`,
      'Die Vergütung wird berechnet ab dem Tag der Ankunft der Betreuungsperson am Leistungsort.',
      'Beginnt oder endet die Vertragslaufzeit im Laufe eines Monats, erfolgt eine anteilige Berechnung.',
      'Die Rechnungen werden monatlich zum 15. ausgestellt und sind bis spätestens 7 Tage nach Erhalt zu überweisen.',
      'Der Anreisetag und der Abreisetag werden als volle Dienstleistungstage berechnet.',
      'An gesetzlichen Feiertagen wird der doppelte Tagessatz berechnet.',
      'In den Sommermonaten Juli und August wird ein Sommerzuschlag von 6,67 € pro Tag berechnet.',
      'Nach aktueller Gesetzeslage ist auf die Dienstleistungen keine gesetzliche Mehrwertsteuer zu entrichten.',
    ],
  };
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderParagraphen(liste: { titel: string; punkte: string[] }[]): string {
  return liste
    .map(
      (p) => `
      <section class="para">
        <h2>${esc(p.titel)}</h2>
        <ol>${p.punkte.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      </section>`,
    )
    .join('');
}

export interface VertragHtmlOptions {
  signaturName: string;
  signedAt?: string; // menschenlesbarer Zeitstempel, z.B. "05.06.2026 um 14:30 Uhr"
  auditNote?: string; // z.B. "IP 1.2.3.4 · Vertragsversion v1.0"
}

export function buildVertragHtml(daten: VertragInput, opts: VertragHtmlOptions): string {
  const datum = esc(daten.datum || '');
  const ag = daten.ag ?? {};
  const le = daten.le ?? null;
  const beginn = esc(daten.vertragsbeginn || '—');
  const abreise = esc(daten.voraussAbreise || '—');
  const tagessatz = esc(daten.tagessatz || '—');
  const dlName = esc(daten.dl?.name || 'Kamila Bilska-Wabik');
  const dlRolle = esc(daten.dl?.rolle || 'Vitanas Group');
  const ort = esc(ag.ort || '');
  const signaturName = esc(opts.signaturName);
  const signedAt = esc(opts.signedAt || '');
  const signDatum = opts.signedAt ? esc(opts.signedAt.split(' um ')[0]) : datum;

  const parteiZeile = (label: string, value?: string) =>
    `<div class="pz"><span class="pl">${esc(label)}</span><span class="pv">${esc(value || '—')}</span></div>`;

  const leBlock = le
    ? `${parteiZeile('Name', le.name)}${parteiZeile('Straße + Nr.', le.strasse)}${parteiZeile('PLZ / Ort', [le.plz, le.ort].filter(Boolean).join(' '))}`
    : `<div class="pz"><span class="pv" style="font-style:italic;color:#777;">identisch mit Auftraggeber</span></div>`;

  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dienstleistungsvertrag – Primundus</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.55; margin: 0; background: #f3f4f6; }
  .doc { max-width: 800px; margin: 24px auto; background: #fff; padding: 40px 48px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: .06em; color: #6B5444; }
  .datum { font-size: 12px; color: #6b7280; }
  h1 { text-align: center; font-size: 24px; margin: 16px 0 4px; }
  .rule { width: 44px; height: 2px; background: #B5A184; margin: 6px auto 24px; }
  .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; margin: 10px 0; background: #FAF8F4; }
  .box .tag { font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #6b7280; margin-bottom: 6px; }
  .pz { display: flex; gap: 12px; padding: 3px 0; font-size: 14px; }
  .pl { width: 130px; flex-shrink: 0; color: #6b7280; font-size: 12px; }
  .pv { font-weight: 600; }
  .eck { border:1px solid #eee; border-radius:10px; overflow:hidden; margin: 16px 0; }
  .eck .row { display:flex; justify-content:space-between; padding:8px 14px; border-top:1px solid #f1f1f1; font-size:14px; }
  .eck .row:first-child { border-top:0; }
  .eck .k { color:#6b7280; }
  .eck .v { font-weight:700; }
  .eck .green { background:#ecfdf5; }
  .eck .green .k { color:#166534; font-weight:600; }
  .eck .green .v { color:#15803d; }
  .center { text-align:center; color:#6b7280; font-size:12px; margin:8px 0; }
  .para { margin: 18px 0; page-break-inside: avoid; }
  .para h2 { font-size: 15px; color: #6B5444; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 0 0 8px; }
  ol { margin: 0; padding-left: 20px; }
  li { font-size: 13px; margin-bottom: 6px; text-align: justify; }
  .sign { display:flex; gap:40px; margin-top: 14px; }
  .sign .col { flex:1; }
  .sign .name { font-family: "Snell Roundhand", "Segoe Script", "Brush Script MT", cursive; font-size: 24px; height: 40px; display:flex; align-items:flex-end; }
  .sign .name.dl { color:#1f3a8a; }
  .sign .cap { border-top:1px solid #9ca3af; padding-top:4px; font-size: 11px; color:#6b7280; }
  .signed { border:1px solid #bbf7d0; background:#f0fdf4; border-radius:10px; padding:14px 16px; margin-top:16px; }
  .signed .h { font-weight:700; color:#166534; margin-bottom:4px; }
  .signed .t { font-size:12px; color:#15803d; }
  .audit { font-size:11px; color:#6b7280; margin-top:6px; }
  @media print { body { background:#fff; } .doc { box-shadow:none; margin:0; max-width:none; padding:24px; } }
</style></head>
<body><div class="doc">
  <div class="head">
    <span class="brand">PRIMUNDUS</span>
    <span class="datum">Datum: ${datum}</span>
  </div>
  <h1>Dienstleistungsvertrag</h1>
  <div class="rule"></div>

  <div class="eck">
    <div class="row"><span class="k">Auftraggeber</span><span class="v">${esc(ag.name)}</span></div>
    <div class="row"><span class="k">Leistungsempfänger</span><span class="v">${esc(le ? le.name : ag.name)}</span></div>
    <div class="row"><span class="k">Vertragsbeginn</span><span class="v">${beginn}</span></div>
    <div class="row"><span class="k">Tagessatz</span><span class="v">${tagessatz} / Tag</span></div>
    <div class="row green"><span class="k">Kündigung</span><span class="v">✓ Täglich kündbar</span></div>
  </div>

  <p class="center">geschlossen zwischen den folgenden Vertragsparteien</p>

  <div class="box">
    <div class="tag">AUFTRAGGEBER (AG)</div>
    ${parteiZeile('Name / Firma', ag.name)}
    ${parteiZeile('Straße + Nr.', ag.strasse)}
    ${parteiZeile('PLZ / Ort', [ag.plz, ag.ort].filter(Boolean).join(' '))}
    ${parteiZeile('E-Mail', ag.email)}
    ${parteiZeile('Telefon', ag.telefon)}
  </div>
  <div class="box">
    <div class="tag">LEISTUNGSEMPFÄNGER (LE) — FALLS ABWEICHEND VOM AG</div>
    ${leBlock}
  </div>
  <div class="box">
    <div class="tag">DIENSTLEISTER (DL)</div>
    <div class="pv">PRIMUNDUS Deutschland</div>
    <div style="font-size:12px;color:#6b7280;">VITANAS CARE LTD HOME SK · ul. Poznańska 21/48, 00-685 Warszawa · NIP: 7011301447 · REGON: 544074862</div>
  </div>

  ${renderParagraphen(PARAGRAPHEN_1)}
  ${renderParagraphen([paragraph3(daten.vertragsbeginn || '—', daten.voraussAbreise || '—')])}
  ${renderParagraphen([paragraph4(daten.tagessatz || '—')])}
  ${renderParagraphen(PARAGRAPHEN_2)}

  <section class="para">
    <h2>Unterschriften</h2>
    <div class="sign">
      <div class="col">
        <div class="name">${signaturName}</div>
        <div class="cap">${ort}${ort ? ', ' : ''}${signDatum} · Unterschrift Auftraggeber</div>
      </div>
      <div class="col">
        <div class="name dl">${dlName}</div>
        <div class="cap">i. A. ${dlName}, ${dlRolle} · Warszawa, ${datum}</div>
      </div>
    </div>
    <div class="signed">
      <div class="h">✓ Vertrag rechtsverbindlich unterschrieben</div>
      <div class="t">Elektronisch signiert von <strong>${signaturName}</strong>${signedAt ? ` am <strong>${signedAt}</strong>` : ''}.</div>
      <div class="audit">Einfache elektronische Signatur${opts.auditNote ? ` · ${esc(opts.auditNote)}` : ''}</div>
    </div>
  </section>
</div></body></html>`;
}

// Baut den nodemailer-Attachment-Eintrag für den Vertrag — als ECHTES PDF
// (gerendert via Headless Chrome aus dem styled HTML). Wird async, weil
// puppeteer.launch + page.pdf insgesamt ~1-3s dauern; Aufrufer (Bridge-
// POST in app/api/lead-event/route.ts) ist eh in einem async-Kontext.
//
// Render-Setup nutzt @sparticuz/chromium (vorgepacktes Chrome-Binary für
// Vercel/Render serverless) in Production und lokales /usr/bin/chromium
// in Dev — identisches Muster wie der alte (deaktivierte) PDF-Generator
// im Backup `pdf-generator-puppeteer.ts.bak`.
//
// Fallback bei Render-Fehler: gibt das HTML-Attachment zurück damit die
// Mail nicht ganz scheitert (Mail ohne Anhang wäre noch schlimmer als
// Mail mit HTML-Anhang). Fehler wird gelogged für spätere Diagnose.
export async function buildVertragAttachmentPdf(
  daten: VertragInput,
  opts: VertragHtmlOptions,
): Promise<{ filename: string; content: Buffer | string; contentType: string }> {
  const html = buildVertragHtml(daten, opts);
  // Dynamische Imports — bevor die Mail-Generierung lädt, wollen wir den
  // Cold-Start nicht durch Chrome-Init verlangsamen.
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
    // Inline-HTML ohne externe Ressourcen — `domcontentloaded` reicht.
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
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
      try {
        await browser.close();
      } catch {
        // browser.close() kann hängen — kein blocking Problem.
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
