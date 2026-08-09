// Zentrale Firmendaten — EINZIGE Quelle. Firmenwechsel = nur hier ändern.
//
// Regel (Firmenwechsel 2026-08: Vitanas → Primundus Sp. z o.o.):
//  • marke — Marketing-/Markenname „Primundus Deutschland" (DE-Filiale):
//    Mails, Footer, Print, Kalkulation. Bleibt kundenfreundlich.
//  • firma — vollständiger Rechtsname „PRIMUNDUS Sp. z o.o." (+ KRS/NIP):
//    NUR auf notwendigen Dokumenten & Rechtsseiten (Vertrag, Impressum,
//    Datenschutz).
export const COMPANY = {
  marke: 'Primundus Deutschland',
  firma: 'PRIMUNDUS Sp. z o.o.',
  strasse: 'Poznańska 21/48',
  plz: '00-685',
  ort: 'Warschau',
  land: 'Polen',
  krs: '0001259402',
  nip: '7011326714',
  geschaeftsfuehrer: 'Karolina Jakubowska',
  funktion: 'Geschäftsführerin',
  telefon: '089 200 000 830',
  email: 'info@primundus.de',
  web: 'www.primundus.de',
} as const;

/** "Poznańska 21/48, 00-685 Warschau, Polen" */
export const COMPANY_ADDRESS =
  `${COMPANY.strasse}, ${COMPANY.plz} ${COMPANY.ort}, ${COMPANY.land}`;
