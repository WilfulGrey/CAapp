/* Schickt EINE eingekaufte Test-Anfrage durch /api/portal-lead — mit den
 * Daten aus der echten Pflegehilfe-Mail (Anfrage 3196061), aber an eine
 * Adresse, die man selbst kontrolliert.
 *
 * NIE mit der E-Mail eines echten Leads laufen lassen: die Strecke legt
 * einen Lead an, cancelt dessen laufende Mailkette und haengt Events
 * darunter. Test-Adresse heisst Test-Adresse.
 *
 *   PORTAL_LEAD_KEY=... node scripts/test-portal-lead.mjs martin@wyzzi.net
 *   PORTAL_LEAD_KEY=... BASIS=http://localhost:3000 node scripts/... 
 */

const empfaenger = process.argv[2];
const key = process.env.PORTAL_LEAD_KEY;
const basis = process.env.BASIS || 'https://kostenrechner.primundus.de';

if (!empfaenger || !empfaenger.includes('@')) {
  console.error('Empfaenger fehlt:  node scripts/test-portal-lead.mjs du@example.org');
  process.exit(1);
}
if (!key) {
  console.error('PORTAL_LEAD_KEY fehlt (dieselbe Zeichenkette wie in der Render-Env).');
  process.exit(1);
}

/* Genau die Angaben aus der echten Anfrage — so sieht die Mail aus, die
 * ein Kunde bekaeme. Datum auf heute, damit die Altersgrenze greift wie
 * bei einem frisch eingekauften Lead. */
const anfrage = {
  portal: 'pflegehilfe.org',
  name: 'Frau Elke Preis',
  email: empfaenger,
  telefon: '+49 1731720012',
  erstellt_am: new Date().toISOString(),
  care_start_timing: 'sofort',
  portal_lead_id: '3196061',
  einkaufspreis: null,
  angaben: {
    betreuung_fuer: '1-person',
    weitere_personen: 'nein',
    pflegegrad: 1,
    mobilitaet: 'rollator',
    nachteinsaetze: 'nein',
    deutschkenntnisse: 'sehr-gut',
    erfahrung: 'wuenschenswert',
    fuehrerschein: 'nein',
    geschlecht: 'weiblich',
  },
  einwilligung: {
    text: 'Zustimmung zur Kontaktweitergabe an Partneranbieter, erteilt bei Verbund Pflegehilfe (pflegehilfe.org)',
    zeitpunkt: new Date().toISOString(),
  },
};

const res = await fetch(`${basis}/api/portal-lead`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-portal-key': key },
  body: JSON.stringify(anfrage),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  const j = JSON.parse(text);
  console.log(JSON.stringify(j, null, 2));
  if (j.lead_id) {
    console.log(`\nKundenportal: ${process.env.PORTAL || 'https://kundenportal.primundus.de'} — Link steht in der Mail.`);
    console.log(`Admin:        ${basis}/admin/leads/${j.lead_id}`);
  }
} catch {
  console.log(text.slice(0, 500));
}
