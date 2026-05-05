import { jsPDF } from 'jspdf';

interface LeadData {
  vorname?: string;
  nachname?: string;
  email?: string;
}

interface FormularDaten {
  betreuung_fuer?: string;
  pflegegrad?: number;
  weitere_personen?: string;
  mobilitaet?: string;
  nachteinsaetze?: string;
  deutschkenntnisse?: string;
  erfahrung?: string;
}

interface Aufschluesselung {
  kategorie: string;
  antwort: string;
  label: string;
  aufschlag: number;
}

interface Zuschuss {
  name?: string;
  label: string;
  beschreibung?: string;
  betrag_monatlich: number;
  betrag_jaehrlich?: number;
  in_kalkulation?: boolean;
  hinweis?: string | null;
}

interface KalkulationData {
  bruttopreis?: number;
  eigenanteil?: number;
  zuschüsse?: {
    items?: Zuschuss[];
    gesamt?: number;
  };
  aufschluesselung?: Aufschluesselung[];
  formular_daten?: FormularDaten;
}

const formatEuro = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount || 0);
};

const formatDate = (date?: Date): string => {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date || new Date());
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const primaryColor: [number, number, number] = [139, 115, 85];
const textColor: [number, number, number] = [61, 61, 61];
const lightGray: [number, number, number] = [139, 139, 139];
const veryLightGray: [number, number, number] = [229, 227, 223];
const accentGreen: [number, number, number] = [45, 125, 45];

function addHeader(doc: jsPDF, leadData?: LeadData) {
  doc.setFontSize(20);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Primundus', 20, 15);

  doc.setFontSize(9);
  doc.setTextColor(...lightGray);
  doc.setFont('helvetica', 'normal');
  doc.text('24h-Pflege & Betreuung', 20, 20);

  const today = new Date();
  const validUntil = addDays(today, 14);

  doc.setFontSize(8);
  doc.setTextColor(...lightGray);
  doc.text(`Erstellt am: ${formatDate(today)}`, 200, 15, { align: 'right' });
  doc.text(`Bestpreis-Garantie gueltig bis: ${formatDate(validUntil)}`, 200, 19, { align: 'right' });

  if (leadData?.vorname) {
    doc.setFontSize(9);
    doc.text(`${leadData.vorname} ${leadData.nachname || ''}`, 200, 23, { align: 'right' });
  }

  doc.setDrawColor(...veryLightGray);
  doc.setLineWidth(0.3);
  doc.line(20, 26, 200, 26);
}

function addFooter(doc: jsPDF, pageNumber: number) {
  const pageHeight = doc.internal.pageSize.height;

  doc.setDrawColor(...veryLightGray);
  doc.setLineWidth(0.3);
  doc.line(20, pageHeight - 20, 200, pageHeight - 20);

  doc.setFontSize(7);
  doc.setTextColor(...lightGray);
  doc.setFont('helvetica', 'normal');

  doc.text('Primundus GmbH | www.primundus.de', 110, pageHeight - 15, { align: 'center' });
  doc.text('Diese Kalkulation ist 14 Tage gueltig. Alle Angaben sind Richtwerte.', 110, pageHeight - 11, { align: 'center' });
  doc.text(`Seite ${pageNumber}`, 200, pageHeight - 7, { align: 'right' });
}

function getFormularLabel(key: string, value: any): string {
  const labels: Record<string, Record<string, string>> = {
    betreuung_fuer: {
      'einzelperson': 'Einzelperson',
      'ehepaar': 'Ehepaar',
    },
    mobilitaet: {
      'selbststaendig': 'Selbststaendig',
      'eingeschraenkt_rollator': 'Eingeschraenkt - Rollator',
      'rollstuhl': 'Rollstuhl',
      'bettlaegerig': 'Bettlaegerig',
    },
    nachteinsaetze: {
      'keine': 'Keine',
      'gelegentlich': 'Gelegentlich',
      'regelmaessig': 'Regelmaessig',
    },
    deutschkenntnisse: {
      'basis': 'Basis',
      'kommunikativ': 'Kommunikativ',
      'fliessend': 'Fliessend',
    },
    erfahrung: {
      'keine_erfahrung': 'Keine Erfahrung',
      'erfahren': 'Erfahren',
      'spezialisiert': 'Spezialisiert',
    },
  };

  return labels[key]?.[value] || String(value);
}

function addPage1(doc: jsPDF, kalkulation: KalkulationData, leadData?: LeadData): number {
  addHeader(doc, leadData);

  let y = 35;

  doc.setFontSize(18);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Ihre persoenliche Kostenübersicht', 20, y);

  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('IHRE ANGABEN', 20, y);

  y += 6;
  doc.setDrawColor(...veryLightGray);
  doc.setLineWidth(0.3);
  doc.roundedRect(20, y, 170, 30, 1.5, 1.5, 'S');

  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'normal');

  const formData = kalkulation.formular_daten;
  if (formData) {
    const leftCol = [
      ['Betreuung fuer:', getFormularLabel('betreuung_fuer', formData.betreuung_fuer)],
      ['Pflegegrad:', String(formData.pflegegrad || '-')],
      ['Mobilitaet:', getFormularLabel('mobilitaet', formData.mobilitaet)],
    ];

    const rightCol = [
      ['Nachteinsaetze:', getFormularLabel('nachteinsaetze', formData.nachteinsaetze)],
      ['Deutschkenntnisse:', getFormularLabel('deutschkenntnisse', formData.deutschkenntnisse)],
      ['Erfahrung:', getFormularLabel('erfahrung', formData.erfahrung)],
    ];

    leftCol.forEach(([label, value], i) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, y + (i * 6));
      doc.setFont('helvetica', 'normal');
      doc.text(value, 60, y + (i * 6));
    });

    rightCol.forEach(([label, value], i) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 110, y + (i * 6));
      doc.setFont('helvetica', 'normal');
      doc.text(value, 155, y + (i * 6));
    });
  }

  y += 25;

  doc.setFontSize(11);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('KOSTEN\u00dcBERSICHT', 20, y);

  y += 6;
  const boxHeight = 60;
  doc.setDrawColor(...veryLightGray);
  doc.roundedRect(20, y, 170, boxHeight, 1.5, 1.5, 'S');

  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'normal');
  doc.text('Monatlicher Bruttopreis', 25, y);
  doc.text(formatEuro(kalkulation.bruttopreis || 0), 185, y, { align: 'right' });

  y += 8;
  doc.setDrawColor(...lightGray);
  doc.setLineWidth(0.2);
  doc.line(25, y, 185, y);

  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Direkt anrechenbare Zuschuesse:', 25, y);

  const zuschuesseInKalk = (kalkulation.zuschüsse?.items || []).filter(z => z.in_kalkulation);

  zuschuesseInKalk.forEach((z) => {
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`  ${z.label}`, 27, y);
    doc.text(`- ${formatEuro(z.betrag_monatlich)}`, 185, y, { align: 'right' });
  });

  y += 8;
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.line(25, y, 185, y);

  y += 8;
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('IHR MONATLICHER EIGENANTEIL', 25, y);
  doc.setFontSize(14);
  doc.text(formatEuro(kalkulation.eigenanteil || 0), 185, y, { align: 'right' });

  y += 10;
  doc.setFontSize(7);
  doc.setTextColor(...lightGray);
  doc.setFont('helvetica', 'italic');
  const hinweisText = 'Zzgl. Kost & Logis fuer die Pflegekraft (Verpflegung und eigenes Zimmer). An- und Abreisekosten\nsowie Feiertagszuschlaege fallen nach Aufwand an.';
  const lines = doc.splitTextToSize(hinweisText, 160);
  doc.text(lines, 25, y);

  y += 20;

  if (kalkulation.aufschluesselung && kalkulation.aufschluesselung.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text('PREISZUSAMMENSETZUNG', 20, y);

    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...lightGray);
    doc.setFont('helvetica', 'normal');
    doc.text('So setzt sich Ihr Preis zusammen:', 20, y);

    y += 6;
    const aufschluesselung = kalkulation.aufschluesselung.filter(a => a.aufschlag > 0);
    const priceBoxHeight = 8 + (aufschluesselung.length + 1) * 6 + 8;

    doc.setDrawColor(...veryLightGray);
    doc.roundedRect(20, y, 170, priceBoxHeight, 1.5, 1.5, 'S');

    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(...textColor);

    const basisPreis = kalkulation.bruttopreis! - aufschluesselung.reduce((sum, a) => sum + a.aufschlag, 0);

    doc.text('Grundpreis 24h-Betreuung', 25, y);
    doc.text(formatEuro(basisPreis), 185, y, { align: 'right' });

    aufschluesselung.forEach((item) => {
      y += 6;
      doc.text(`${item.label}`, 25, y);
      doc.text(`+ ${formatEuro(item.aufschlag)}`, 185, y, { align: 'right' });
    });

    y += 8;
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(25, y, 185, y);

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Bruttopreis', 25, y);
    doc.text(formatEuro(kalkulation.bruttopreis || 0), 185, y, { align: 'right' });
  }

  addFooter(doc, 1);

  return y;
}

function addPage2(doc: jsPDF, kalkulation: KalkulationData, leadData?: LeadData) {
  doc.addPage();
  addHeader(doc, leadData);

  let y = 35;

  doc.setFontSize(18);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Zuschuesse & Foerdermöglichkeiten', 20, y);

  y += 7;
  doc.setFontSize(8);
  doc.setTextColor(...lightGray);
  doc.setFont('helvetica', 'normal');
  const introText = 'Die Finanzierung wird durch verschiedene Leistungen der Pflegeversicherung und steuerliche\nVorteile unterstuetzt. Nachfolgend alle Zuschuesse - unterteilt in Leistungen, die Ihren\nmonatlichen Eigenanteil direkt reduzieren, und weitere Foerdermöglichkeiten.';
  doc.text(introText, 20, y);

  y += 15;

  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('A. Zuschuesse, die Ihren Eigenanteil direkt reduzieren', 20, y);

  y += 8;

  const zuschuesseInKalk = (kalkulation.zuschüsse?.items || []).filter(z => z.in_kalkulation);

  zuschuesseInKalk.forEach((z, index) => {
    if (y > 250) {
      doc.addPage();
      addHeader(doc, leadData);
      y = 35;
    }

    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}. ${z.label} - ${formatEuro(z.betrag_monatlich)} / Monat`, 20, y);

    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const beschreibung = doc.splitTextToSize(z.beschreibung || '', 170);
    doc.text(beschreibung, 20, y);
    y += beschreibung.length * 3.5;

    if (z.name === 'pflegegeld' && kalkulation.formular_daten?.pflegegrad) {
      y += 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Pflegegeld nach Pflegegrad:', 20, y);

      y += 4;
      const pflegegeldTable = [
        ['Pflegegrad 1', 'kein Anspruch'],
        ['Pflegegrad 2', '347 EUR'],
        ['Pflegegrad 3', '599 EUR'],
        ['Pflegegrad 4', '800 EUR'],
        ['Pflegegrad 5', '990 EUR'],
      ];

      pflegegeldTable.forEach(([grad, betrag]) => {
        doc.setFont('helvetica', 'normal');
        const isActive = grad === `Pflegegrad ${kalkulation.formular_daten?.pflegegrad}`;
        if (isActive) {
          doc.setTextColor(...primaryColor);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(...textColor);
        }
        doc.text(grad, 25, y);
        doc.text(betrag + (isActive ? ' <- Ihr Pflegegrad' : ''), 60, y);
        y += 4;
      });

      doc.setTextColor(...textColor);
    }

    if (z.name === 'entlastungsbudget_neu' && kalkulation.formular_daten?.pflegegrad) {
      y += 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Entlastungsbudget nach Pflegegrad:', 20, y);

      y += 4;
      const entlastungsTable = [
        ['Pflegegrad 1', 'kein Anspruch'],
        ['Pflegegrad 2', '3.539 EUR/Jahr (295 EUR/Monat)'],
        ['Pflegegrad 3', '3.539 EUR/Jahr (295 EUR/Monat)'],
        ['Pflegegrad 4', '3.539 EUR/Jahr (295 EUR/Monat)'],
        ['Pflegegrad 5', '3.539 EUR/Jahr (295 EUR/Monat)'],
      ];

      entlastungsTable.forEach(([grad, betrag]) => {
        doc.setFont('helvetica', 'normal');
        const isActive = grad === `Pflegegrad ${kalkulation.formular_daten?.pflegegrad}`;
        if (isActive) {
          doc.setTextColor(...primaryColor);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(...textColor);
        }
        doc.text(grad, 25, y);
        doc.text(betrag + (isActive ? ' <- Ihr Pflegegrad' : ''), 60, y);
        y += 4;
      });

      doc.setTextColor(...textColor);
    }

    if (z.hinweis) {
      y += 3;
      doc.setFontSize(7);
      doc.setTextColor(...lightGray);
      doc.setFont('helvetica', 'italic');
      const hinweisLines = doc.splitTextToSize(`Hinweis: ${z.hinweis}`, 170);
      doc.text(hinweisLines, 20, y);
      y += hinweisLines.length * 3;
    }

    y += 6;
  });

  if (y > 240) {
    doc.addPage();
    addHeader(doc, leadData);
    y = 35;
  }

  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('B. Weitere Foerdermöglichkeiten', 20, y);

  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(...lightGray);
  doc.setFont('helvetica', 'italic');
  doc.text('Die folgenden Leistungen reduzieren nicht direkt Ihren Eigenanteil, stehen aber zusaetzlich zur Verfuegung.', 20, y);

  y += 8;

  const zuschuesseNichtInKalk = (kalkulation.zuschüsse?.items || []).filter(z => !z.in_kalkulation);

  zuschuesseNichtInKalk.forEach((z, index) => {
    if (y > 250) {
      doc.addPage();
      addHeader(doc, leadData);
      y = 35;
    }

    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');

    let title = `${zuschuesseInKalk.length + index + 1}. ${z.label}`;
    if (z.betrag_monatlich > 0) {
      title += ` - ${formatEuro(z.betrag_monatlich)} / Monat`;
    } else if (z.betrag_jaehrlich && z.betrag_jaehrlich > 0) {
      title += ` - bis zu ${formatEuro(z.betrag_jaehrlich)} / Jahr`;
    }

    doc.text(title, 20, y);

    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const beschreibung = doc.splitTextToSize(z.beschreibung || '', 170);
    doc.text(beschreibung, 20, y);
    y += beschreibung.length * 3.5;

    if (z.hinweis) {
      y += 2;
      doc.setFontSize(7);
      doc.setTextColor(...lightGray);
      doc.setFont('helvetica', 'italic');
      const hinweisLines = doc.splitTextToSize(`Hinweis: ${z.hinweis}`, 170);
      doc.text(hinweisLines, 20, y);
      y += hinweisLines.length * 3;
      doc.setTextColor(...textColor);
    }

    y += 5;
  });

  addFooter(doc, 2);
}

function addPage3(doc: jsPDF, leadData?: LeadData) {
  doc.addPage();
  addHeader(doc, leadData);

  let y = 35;

  doc.setFontSize(18);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('So funktioniert die 24-Stunden-Pflege', 20, y);

  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Was ist 24-Stunden-Pflege?', 20, y);

  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'normal');
  const wasIstText = 'Bei der haeuslichen 24-Stunden-Betreuung zieht eine qualifizierte Betreuungskraft bei Ihnen ein\nund unterstuetzt die pflegebedürftige Person im taeglichen Leben. Die Pflegekraft lebt und arbeitet\nfuer einen vereinbarten Zeitraum (6-8 Wochen) mit Ihnen und wird dann von einer eingearbeiteten\nKollegin abgeloest.\n\nDer Begriff "24-Stunden-Pflege" bedeutet nicht, dass die Betreuungskraft rund um die Uhr arbeitet.\nDie taegliche Arbeitszeit umfasst vereinbarte Stunden plus Bereitschaftszeiten. Ruhezeiten und\nFreizeit muessen eingehalten werden.';
  doc.text(wasIstText, 20, y);

  y += 42;

  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Was leisten unsere Pflegekraefte?', 20, y);

  y += 6;

  const leistungen = [
    {
      titel: 'Grundpflege',
      punkte: [
        'Koerperpflege und Hygiene (Waschen, Duschen, Baden)',
        'An- und Auskleiden',
        'Unterstuetzung bei der Mobilitaet',
        'Hilfe bei der Nahrungsaufnahme',
        'Inkontinenzversorgung',
      ],
    },
    {
      titel: 'Haushaltsfuehrung',
      punkte: [
        'Kochen und Zubereitung der Mahlzeiten',
        'Einkaufen und Besorgungen',
        'Waesche waschen und buegeln',
        'Reinigung der Wohnung',
      ],
    },
    {
      titel: 'Alltagsbetreuung & Aktivierung',
      punkte: [
        'Gesellschaft leisten und Gespraeche fuehren',
        'Gemeinsame Spaziergaenge und Ausfluege',
        'Begleitung zu Arztterminen',
        'Unterstuetzung bei sozialen Kontakten',
        'Vorlesen, Spiele, gemeinsame Aktivitaeten',
      ],
    },
  ];

  leistungen.forEach((bereich) => {
    if (y > 240) {
      doc.addPage();
      addHeader(doc, leadData);
      y = 35;
    }

    doc.setFontSize(9);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(bereich.titel, 20, y);

    y += 4;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');

    bereich.punkte.forEach((punkt) => {
      doc.text(`• ${punkt}`, 22, y);
      y += 3.5;
    });

    y += 2;
  });

  if (y > 220) {
    doc.addPage();
    addHeader(doc, leadData);
    y = 35;
  }

  doc.setFontSize(9);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Nicht enthalten: Medizinische Behandlungspflege', 20, y);

  y += 4;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const medText = 'Medizinische Leistungen wie Medikamentengabe, Injektionen, Infusionen oder Wundversorgung werden\nbei Bedarf ergaenzend von einem ambulanten Pflegedienst erbracht. Die Kosten werden in der Regel\nvon der Pflegekasse ueber Pflegesachleistungen abgedeckt.';
  doc.text(medText, 20, y);

  y += 15;

  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Voraussetzungen fuer die 24h-Betreuung', 20, y);

  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'normal');
  const voraussText = 'Damit die Betreuung von Beginn an gut funktioniert, sollten folgende Voraussetzungen gegeben sein:';
  doc.text(voraussText, 20, y);

  y += 6;

  const voraussetzungen = [
    {
      titel: 'Eigenes Zimmer fuer die Pflegekraft',
      text: 'Die Betreuungskraft benoetigt ein eigenes Zimmer als Rueckzugsort - fuer Pausen, Freizeit\nund erholsamen Schlaf.',
    },
    {
      titel: 'Freie Kost und Logis',
      text: 'Die Pflegekraft wird von Ihnen verkoestigt und wohnt kostenfrei. Rechnen Sie mit ca.\n150-250 EUR monatlich zusaetzlich fuer Lebensmittel.',
    },
    {
      titel: 'Offenheit und gegenseitiger Respekt',
      text: 'Die Pflegekraft wird Teil Ihres Alltags. Je wertschaetzender das Miteinander, desto\nbesser die Betreuung.',
    },
  ];

  voraussetzungen.forEach((v) => {
    if (y > 245) {
      doc.addPage();
      addHeader(doc, leadData);
      y = 35;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`• ${v.titel}`, 22, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(v.text, 24, y);
    y += 8;
  });

  addFooter(doc, 3);
}

function addPage4(doc: jsPDF, leadData?: LeadData, vertragsToken?: string) {
  doc.addPage();
  addHeader(doc, leadData);

  let y = 35;

  doc.setFontSize(18);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Ihre Vorteile mit Primundus', 20, y);

  y += 10;

  const vorteile = [
    {
      titel: 'Bestpreis-Garantie',
      text: 'Wir garantieren Ihnen den besten Preis. Finden Sie ein vergleichbares Angebot guenstiger,\npassen wir unseren Preis an. Diese Kalkulation ist 14 Tage reserviert.',
    },
    {
      titel: 'Sie zahlen erst, wenn die Pflegekraft arbeitet',
      text: 'Kein finanzielles Risiko. Keine Vorauszahlung, keine Anzahlung, keine Kaution. Erst wenn\ndie Betreuungskraft bei Ihnen eingezogen ist, beginnt die Abrechnung.',
    },
    {
      titel: 'Täglich kündbar - keine Mindestlaufzeit',
      text: 'Sie sind an keinen langfristigen Vertrag gebunden. Die Abrechnung erfolgt taggenau - Sie\nzahlen nur fuer tatsaechlich geleistete Tage.',
    },
    {
      titel: 'Direktanbieter - keine Vermittlung',
      text: 'Primundus ist kein Vermittler. Unsere Pflegekraefte sind direkt bei uns angestellt. Wir\nbilden sie aus und fuehren einen 6-Punkte-Qualitaetscheck durch.',
    },
    {
      titel: 'Testsieger & Service-Champion',
      text: 'Ausgezeichnet als Testsieger durch DIE WELT (2021) und als Service-Champion. 4,98 von 5\nSternen auf ProvenExpert.',
    },
    {
      titel: '20+ Jahre Erfahrung - 10.000+ Einsaetze',
      text: 'Seit ueber 20 Jahren betreuen wir Pflegebeduerftige in ganz Deutschland.',
    },
  ];

  vorteile.forEach((v) => {
    if (y > 240) {
      doc.addPage();
      addHeader(doc, leadData);
      y = 35;
    }

    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.text(`✓ ${v.titel}`, 20, y);

    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'normal');
    doc.text(v.text, 22, y);

    y += 10;
  });

  if (y > 200) {
    doc.addPage();
    addHeader(doc, leadData);
    y = 35;
  }

  y += 5;
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('So einfach geht\'s - Ihr Weg zur Betreuung', 20, y);

  y += 8;

  const schritte = [
    'Angebot anfordern - Sie haben diesen Schritt bereits gemacht.',
    'Persoenliche Beratung - Ein Berater bespricht mit Ihnen alle Details.',
    'Pflegekraft auswaehlen - Sie erhalten 2-3 passende Vorschlaege.',
    'Betreuung beginnt - In der Regel innerhalb von 5 Werktagen.',
  ];

  schritte.forEach((schritt, i) => {
    doc.setFontSize(9);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(`Schritt ${i + 1}:`, 25, y);

    doc.setFont('helvetica', 'normal');
    const text = doc.splitTextToSize(schritt, 140);
    doc.text(text, 45, y);

    y += 8;
  });

  y += 10;

  doc.setFillColor(...primaryColor);
  doc.roundedRect(20, y, 170, 50, 2, 2, 'F');

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Bereit fuer den naechsten Schritt?', 110, y + 10, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Beauftragen Sie Ihre 24h-Pflege jetzt online -', 110, y + 18, { align: 'center' });
  doc.text('einfach und in wenigen Minuten:', 110, y + 23, { align: 'center' });

  if (vertragsToken) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`www.primundus.de/vertrag/${vertragsToken}`, 110, y + 30, { align: 'center' });
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Oder rufen Sie uns an: Tel. 0800 123 456 78 (Mo-So 8-20 Uhr)', 110, y + 37, { align: 'center' });

  doc.setFontSize(7);
  doc.text('✓ Sie zahlen erst, wenn die Pflegekraft arbeitet', 110, y + 43, { align: 'center' });
  doc.text('✓ Täglich kündbar - taggenaue Abrechnung', 110, y + 47, { align: 'center' });

  addFooter(doc, 4);
}

export async function generateKalkulationPDF(
  kalkulation: KalkulationData,
  leadData?: LeadData,
  vertragsToken?: string
): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  addPage1(doc, kalkulation, leadData);
  addPage2(doc, kalkulation, leadData);
  addPage3(doc, leadData);
  addPage4(doc, leadData, vertragsToken);

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  return pdfBuffer;
}
