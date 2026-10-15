const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length) {
    env[key.trim()] = values.join('=').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestLead() {
  const testKalkulation = {
    // Form wie lib/calculation.ts (berechneZuschüsse) sie heute liefert. Seit 15.10.2026 (Entscheidung 3,
    // lib/eigenanteil.ts) zählt das Entlastungsbudget nie zum Eigenanteil: 2.700 − 347 − 333,33 = 2.019,67 €.
    bruttopreis: 2700,
    eigenanteil: 2019.67,
    zuschüsse: {
      gesamt: 680.33,
      items: [
        {
          name: 'pflegegeld',
          label: 'Pflegegeld',
          betrag_monatlich: 347,
          betrag_jaehrlich: 4164,
          in_kalkulation: true,
          beschreibung: 'Monatliches Pflegegeld'
        },
        {
          name: 'entlastungsbudget_neu',
          label: 'Entlastungsbudget (3.539 Euro/Jahr ab Pflegegrad 2)',
          betrag_monatlich: 294.92,
          betrag_jaehrlich: 3539,
          in_kalkulation: false,
          beschreibung: ''
        },
        {
          name: 'steuervorteil',
          label: 'Steuerliche Absetzbarkeit',
          betrag_monatlich: 333.33,
          betrag_jaehrlich: 4000,
          in_kalkulation: true,
          beschreibung: ''
        }
      ]
    },
    aufschluesselung: [
      {
        kategorie: 'betreuung_fuer',
        label: '1 Person',
        aufschlag: 0,
        antwort: '1-person'
      },
      {
        kategorie: 'pflegegrad',
        label: 'Pflegegrad 2',
        aufschlag: 0,
        antwort: 2
      },
      {
        kategorie: 'weitere_personen',
        label: 'Keine weiteren Personen',
        aufschlag: 0,
        antwort: 'nein'
      },
      {
        kategorie: 'mobilitaet',
        label: 'Rollator',
        aufschlag: 150,
        antwort: 'rollator'
      },
      {
        kategorie: 'nachteinsaetze',
        label: 'Gelegentlich',
        aufschlag: 200,
        antwort: 'gelegentlich'
      },
      {
        kategorie: 'deutschkenntnisse',
        label: 'Kommunikativ',
        aufschlag: 100,
        antwort: 'kommunikativ'
      },
      {
        kategorie: 'erfahrung',
        label: 'Erfahren',
        aufschlag: 150,
        antwort: 'erfahren'
      }
    ],
    formularDaten: {
      betreuung_fuer: '1-person',
      pflegegrad: 2,
      weitere_personen: 'nein',
      mobilitaet: 'rollator',
      nachteinsaetze: 'gelegentlich',
      deutschkenntnisse: 'kommunikativ',
      erfahrung: 'erfahren'
    }
  };

  const { data, error } = await supabase
    .from('leads')
    .insert({
      email: 'test@example.com',
      vorname: 'Max Mustermann',
      telefon: '+49 123 456789',
      status: 'info_requested',
      kalkulation: testKalkulation
    })
    .select()
    .single();

  if (error) {
    console.error('Fehler beim Erstellen des Test-Leads:', error);
  } else {
    console.log('✅ Test-Lead erfolgreich erstellt!');
    console.log('Lead-ID:', data.id);
    console.log('\n📍 Öffnen Sie: /admin/leads/' + data.id);
    console.log('Dort sehen Sie:');
    console.log('  - "PDF herunterladen" Button (oben rechts)');
    console.log('  - "Bearbeiten" Button (bei Eingaben des Kunden)');
  }
}

createTestLead();
