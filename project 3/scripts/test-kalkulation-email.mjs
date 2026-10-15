// Die Route rechnet mit formularDaten neu (lib/calculation.ts). Seit 15.10.2026 (Entscheidung 3,
// lib/eigenanteil.ts) ohne Entlastungsbudget: 2.500 − 599 (Pflegegeld PG 3) − 333,33 (Steuer) = 1.567,67 €.
const testKalkulation = {
  totalGross: 2500,
  eigenanteil: 1567.67,
  zuschüsse: {
    gesamt: 932.33,
    pflegegeld: 599,
    steuervorteil: 333.33,
  },
};

const testPayload = {
  email: 'kostenrechner@primundus.de',
  kalkulation: testKalkulation,
  formularDaten: {
    pflegegrad: 3,
    patientCount: '1-person',
    mobility: 'mobil',
    nightCare: 'nein',
    germanLevel: 'grundlegend',
    experience: 'einsteiger',
    householdOthers: 'nein',
  },
};

console.log('📧 Teste Kalkulation-E-Mail API...\n');
console.log('Payload:', JSON.stringify(testPayload, null, 2));
console.log('\n🚀 Sende Request...\n');

const startTime = Date.now();

try {
  const response = await fetch('http://localhost:3000/api/kalkulation-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testPayload),
  });

  const duration = Date.now() - startTime;
  console.log(`⏱️  Response erhalten nach ${duration}ms\n`);

  console.log('Status:', response.status, response.statusText);

  const data = await response.json();
  console.log('\n📦 Response Data:');
  console.log(JSON.stringify(data, null, 2));

  if (response.ok) {
    console.log('\n✅ Test erfolgreich!');
    console.log('Lead ID:', data.leadId);
    console.log('E-Mail gesendet:', data.emailSent);
  } else {
    console.error('\n❌ Test fehlgeschlagen!');
    console.error('Fehler:', data.error);
  }
} catch (error) {
  const duration = Date.now() - startTime;
  console.error(`\n❌ Fehler nach ${duration}ms:`, error.message);
}
