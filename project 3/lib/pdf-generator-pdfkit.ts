import PDFDocument from 'pdfkit';
import { format, addDays } from 'date-fns';
 
interface LeadData {
  betreuungFuer: string;
  pflegegrad: number;
  mobilitaet: string;
  nachteinsaetze: string;
  deutschkenntnisse: string;
  erfahrung: string;
  vertragsLink?: string;
}
 
interface KalkulationData {
  bruttopreis: number;
  pflegegeld: number;
  entlastungsbudgetMtl: number;
  steuervorteil: number;
  eigenanteil: number;
}
 
function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + ' €';
}
 
function formatDate(date: Date): string {
  return format(date, 'dd.MM.yyyy');
}
 
export async function generateKalkulationPDF(
  lead: LeadData,
  kalkulation: KalkulationData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 60,
          right: 60,
        },
      });
 
      const chunks: Buffer[] = [];
 
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
 
      const today = new Date();
      const gueltigBis = addDays(today, 14);
 
      const primaryColor = '#3D2B1F';
      const accentColor = '#B5A184';
      const greenColor = '#2D6A4F';
      const grayColor = '#666666';
      const lightGrayColor = '#999999';
 
      doc.fontSize(10).fillColor(grayColor);
      doc.text('PRIMUNDUS GMBH', 60, 50, { align: 'left' });
      doc.text(`Erstellt am: ${formatDate(today)}`, 400, 50, { align: 'right', width: 135 });
      doc.text(`Angebot gültig bis: ${formatDate(gueltigBis)}`, 400, 65, { align: 'right', width: 135 });
 
      doc.moveTo(60, 95).lineTo(535, 95).lineWidth(2).strokeColor(accentColor).stroke();
 
      doc.fontSize(20).fillColor(primaryColor);
      doc.text('Ihre persönliche Kostenübersicht', 60, 115);
 
      doc.fontSize(10).fillColor(grayColor);
      doc.text('IHRE ANGABEN', 60, 170);
      doc.moveTo(60, 185).lineTo(535, 185).lineWidth(0.5).strokeColor('#E8E0D6').stroke();
 
      const angabenY = 200;
      const leftCol = 60;
      const rightCol = 305;
      const rowHeight = 25;
 
      doc.fontSize(9).fillColor(grayColor);
 
      let row = 0;
      doc.text('Betreuung für', leftCol, angabenY + (row * rowHeight));
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(lead.betreuungFuer, leftCol + 140, angabenY + (row * rowHeight), { align: 'right', width: 100 });
 
      doc.fontSize(9).fillColor(grayColor);
      doc.text('Pflegegrad', rightCol, angabenY + (row * rowHeight));
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(String(lead.pflegegrad), rightCol + 140, angabenY + (row * rowHeight), { align: 'right', width: 100 });
 
      row++;
      doc.fontSize(9).fillColor(grayColor);
      doc.text('Mobilität', leftCol, angabenY + (row * rowHeight));
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(lead.mobilitaet, leftCol + 140, angabenY + (row * rowHeight), { align: 'right', width: 100 });
 
      doc.fontSize(9).fillColor(grayColor);
      doc.text('Nachteinsätze', rightCol, angabenY + (row * rowHeight));
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(lead.nachteinsaetze, rightCol + 140, angabenY + (row * rowHeight), { align: 'right', width: 100 });
 
      row++;
      doc.fontSize(9).fillColor(grayColor);
      doc.text('Deutschkenntnisse', leftCol, angabenY + (row * rowHeight));
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(lead.deutschkenntnisse, leftCol + 140, angabenY + (row * rowHeight), { align: 'right', width: 100 });
 
      doc.fontSize(9).fillColor(grayColor);
      doc.text('Erfahrung', rightCol, angabenY + (row * rowHeight));
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(lead.erfahrung, rightCol + 140, angabenY + (row * rowHeight), { align: 'right', width: 100 });
 
      doc.fontSize(10).fillColor(grayColor);
      doc.text('KOSTENÜBERSICHT', 60, 320);
      doc.moveTo(60, 335).lineTo(535, 335).lineWidth(0.5).strokeColor('#E8E0D6').stroke();
 
      const kostenY = 355;
      const kostenLeft = 70;
      const kostenRight = 525;
 
      doc.roundedRect(60, kostenY - 10, 475, 180, 5).fillAndStroke('#FDFBF7', '#E8E0D6');
 
      doc.fontSize(11).fillColor(primaryColor);
      doc.text('Monatlicher Bruttopreis', kostenLeft, kostenY);
      doc.text(formatEuro(kalkulation.bruttopreis), kostenLeft, kostenY, { align: 'right', width: 455 });
 
      doc.fontSize(9).fillColor(lightGrayColor);
      doc.text('Direkt anrechenbare Zuschüsse:', kostenLeft, kostenY + 25);
 
      doc.fontSize(10).fillColor(grayColor);
      const subLeft = kostenLeft + 15;
 
      doc.text(`Pflegegeld (Pflegegrad ${lead.pflegegrad})`, subLeft, kostenY + 45);
      doc.fillColor(greenColor);
      doc.text(`− ${formatEuro(kalkulation.pflegegeld)}`, subLeft, kostenY + 45, { align: 'right', width: 445 });
 
      doc.fontSize(10).fillColor(grayColor);
      doc.text('Entlastungsbudget (anteilig mtl.)', subLeft, kostenY + 65);
      doc.fillColor(greenColor);
      doc.text(`− ${formatEuro(kalkulation.entlastungsbudgetMtl)}`, subLeft, kostenY + 65, { align: 'right', width: 445 });
 
      doc.fontSize(10).fillColor(grayColor);
      doc.text('Steuervorteil (§35a EStG)', subLeft, kostenY + 85);
      doc.fillColor(greenColor);
      doc.text(`− ${formatEuro(kalkulation.steuervorteil)}`, subLeft, kostenY + 85, { align: 'right', width: 445 });
 
      doc.moveTo(kostenLeft, kostenY + 115).lineTo(kostenRight, kostenY + 115).lineWidth(2).strokeColor(accentColor).stroke();
 
      doc.fontSize(15).fillColor(primaryColor);
      doc.text('Ihr monatlicher Eigenanteil', kostenLeft, kostenY + 130);
      doc.text(formatEuro(kalkulation.eigenanteil), kostenLeft, kostenY + 130, { align: 'right', width: 455 });
 
      doc.fontSize(8).fillColor(lightGrayColor);
      doc.text(
        'Zzgl. Kost & Logis für die Pflegekraft (Verpflegung und eigenes Zimmer, ca. 150–250 €/Monat). An- und Abreisekosten sowie Feiertagszuschläge fallen nach Aufwand an.',
        60,
        kostenY + 185,
        { width: 475, align: 'justify', lineGap: 2 }
      );
 
      doc.moveTo(60, 750).lineTo(535, 750).lineWidth(0.5).strokeColor('#E8E0D6').stroke();
 
      doc.fontSize(7).fillColor(lightGrayColor);
      doc.text('Primundus GmbH · www.primundus.de · Tel. 0800 123 456 78', 60, 760);
      doc.text('Seite 1 von 1', 400, 760, { align: 'right', width: 135 });
 
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}