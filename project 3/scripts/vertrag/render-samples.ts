// Syntetyczne edge-case'y do galerii sign-offu (gate 2): warianty, których
// nie ma w prod-goldenach. Wyjście: <dir>/sample-<nazwa>.pdf
//   cd "project 3" && npx tsx scripts/vertrag/render-samples.ts <dir>
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildVertragDocument, type VertragHtmlOptions, type VertragInput } from '../../lib/vertrag-content';
import { renderVertragPdf } from '../../lib/vertrag-pdf';

const CASES: Array<{ name: string; daten: VertragInput; opts: VertragHtmlOptions }> = [
  {
    name: 'le-identisch',
    daten: {
      datum: '06.08.2026',
      ag: { name: 'Erika Mustermann', strasse: 'Hauptstraße 1', plz: '10115', ort: 'Berlin', email: 'erika@example.de', telefon: '+49 30 123456' },
      le: null,
      vertragsbeginn: '01.09.2026',
      voraussAbreise: '31.10.2026',
      tagessatz: 'EUR 95,00',
    },
    opts: { signaturName: 'Erika Mustermann', signedAt: '06.08.2026 um 09:15 Uhr', auditNote: 'Vertragsversion v1.2' },
  },
  {
    name: 'polskie-znaki-dlugie',
    daten: {
      datum: '06.08.2026',
      ag: {
        name: 'Grzegorz Brzęczyszczykiewicz-Świątłodziedzicki',
        strasse: 'Königsallee 142a, Hinterhaus, 3. Obergeschoss links',
        plz: '40212',
        ort: 'Düsseldorf',
        email: 'grzegorz.brzeczyszczykiewicz.bardzo.dlugi.adres@example-firma-gmbh.de',
        telefon: '+49 211 99887766',
      },
      le: { name: 'Żaneta Źdźbło-Łąkowa', strasse: 'Szoße 1', plz: '01108', ort: 'Dresden' },
      vertragsbeginn: '24.08.2026',
      voraussAbreise: '13.10.2026',
      tagessatz: 'EUR 123,00',
    },
    opts: { signaturName: 'Grzegorz Brzęczyszczykiewicz-Świątłodziedzicki', signedAt: '06.08.2026 um 14:30 Uhr', auditNote: 'Vertragsversion v1.2' },
  },
  {
    name: 'wszystko-puste',
    daten: {},
    opts: { signaturName: '' },
  },
  {
    name: 'legacy-signedat',
    daten: {
      datum: '21.07.2026',
      ag: { name: 'Zenobia Test', ort: 'Kassel' },
      le: null,
      vertragsbeginn: '01.08.2026',
      voraussAbreise: '30.09.2026',
      tagessatz: 'EUR 101,00',
    },
    opts: { signaturName: 'Zenobia Test', signedAt: '21.07.2026, 17:15', auditNote: undefined },
  },
];

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: render-samples.ts <dir>');
  for (const c of CASES) {
    const buf = await renderVertragPdf(buildVertragDocument(c.daten, c.opts));
    const out = join(dir, `sample-${c.name}.pdf`);
    writeFileSync(out, buf);
    console.log(`ok: ${out} (${buf.length} B)`);
  }
}

main();
