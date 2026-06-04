import { useState } from 'react';
import type { FC, ReactNode } from 'react';

// ─── Prototyp: Online-signierbarer Dienstleistungsvertrag (Stufe A) ──────────
// Basis = primundus-mustervertrag.pdf, originalgetreu als HTML nachgebaut.
// NUR Kundendaten + Zeitraum (Vertragsbeginn) + Betrag (Tagessatz) werden an
// den dafür vorgesehenen Stellen eingesetzt — sichtbar hervorgehoben via <Fill>.
// Signatur: einfache elektronische Signatur (getippter Name + verbindliche
// Bestätigung + Zeitstempel). Dummy-Daten — echte Anbindung später.

// Hervorgehobenes, dynamisch befülltes Feld.
const Fill: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="font-semibold text-gray-900 bg-[#FBF1D5] rounded px-1 py-0.5 whitespace-nowrap">{children}</span>
);

interface VertragsDaten {
  datum: string;
  ag: { name: string; strasse: string; plz: string; ort: string; email: string; telefon: string };
  le: { name: string; strasse: string; plz: string; ort: string } | null; // null = identisch mit AG
  vertragsbeginn: string;   // Anreisedatum
  voraussAbreise: string;   // geplante Rotations-Abreise (informativ)
  tagessatz: string;        // z. B. "EUR 95,00"
  // Dienstleister-Seite: vorsigniert (Faksimile). signaturImg = URL/Data-URI
  // des hinterlegten Unterschrift-Scans (im Prototyp Platzhalter-SVG).
  dl: { name: string; rolle: string; signaturImg?: string };
}

const DUMMY: VertragsDaten = {
  datum: '04.06.2026',
  ag: { name: 'Steffen Krumbholz', strasse: 'Musterstraße 12', plz: '80331', ort: 'München', email: 'steffen@example.de', telefon: '089 1234567' },
  le: { name: 'Gerda Krumbholz', strasse: 'Musterstraße 12', plz: '80331', ort: 'München' },
  vertragsbeginn: '19.05.2026',
  voraussAbreise: '19.07.2026',
  tagessatz: 'EUR 95,00',
  dl: { name: 'Ilka Wysocki', rolle: 'Bevollmächtigte' }, // signaturImg → echter Scan später
};

// Statische §§ aus dem Mustervertrag. §3.1 und §4.1 werden separat (mit
// dynamischen Feldern) gerendert; hier nur die rein statischen Punkte.
const PARAGRAPHEN: { titel: string; punkte: string[] }[] = [
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

const Paragraphen: FC<{ liste: { titel: string; punkte: string[] }[] }> = ({ liste }) => (
  <>
    {liste.map((p) => (
      <section key={p.titel} className="mb-5">
        <h2 className="text-[15px] font-bold text-[#6B5444] mb-2 pb-1 border-b border-gray-200">{p.titel}</h2>
        <ol className="space-y-1.5">
          {p.punkte.map((t, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-gray-700 flex gap-2">
              <span className="text-gray-400 flex-shrink-0">{i + 1}.</span>
              <span className="text-justify">{t}</span>
            </li>
          ))}
        </ol>
      </section>
    ))}
  </>
);

const ParteiZeile: FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-3 py-1">
    <span className="text-[12px] text-gray-500 w-24 flex-shrink-0">{label}</span>
    {value ? <Fill>{value}</Fill> : <span className="flex-1 border-b border-gray-300">&nbsp;</span>}
  </div>
);

export const VertragSignieren: FC<{ daten?: VertragsDaten; onSigned?: () => void }> = ({ daten = DUMMY, onSigned }) => {
  const [name, setName] = useState('');
  const [ort, setOrt] = useState(daten.ag.ort);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [widerruf, setWiderruf] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [vollOffen, setVollOffen] = useState(false);

  const canSign = name.trim().length >= 3 && bestaetigt && widerruf;
  const sign = () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    setSignedAt(`${dd}.${mm}.${now.getFullYear()} um ${hh}:${mi} Uhr`);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-3">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Dokument-Kopf */}
        <div className="px-6 sm:px-10 pt-8 pb-6">
          <div className="flex items-start justify-between mb-6">
            <img src="https://kostenrechner.primundus.de/images/Primundus-Logo_V6.png" alt="Primundus" className="h-7 w-auto" />
            <span className="text-[12px] text-gray-500">Datum: <Fill>{daten.datum}</Fill></span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Dienstleistungsvertrag</h1>
            <div className="w-10 h-0.5 bg-[#B5A184] mx-auto my-2" />
          </div>
        </div>

        {/* Eckdaten — immer sichtbar (kompakt) */}
        <div className="px-6 sm:px-10 py-5 border-t border-gray-100">
          <p className="text-[13px] text-gray-600 mb-4">Ihr Betreuungsvertrag ist bereit. Prüfen Sie die Eckdaten und unterschreiben Sie unten online.</p>
          <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100 mb-3">
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Auftraggeber</span><span className="text-sm font-semibold text-gray-700 text-right">{daten.ag.name}</span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Leistungsempfänger</span><span className="text-sm font-semibold text-gray-700 text-right">{daten.le ? daten.le.name : daten.ag.name}</span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Vertragsbeginn</span><span className="text-sm font-semibold text-gray-700"><Fill>{daten.vertragsbeginn}</Fill></span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Tagessatz</span><span className="text-sm font-bold text-gray-900"><Fill>{daten.tagessatz}</Fill>&nbsp;/ Tag</span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Kündigung</span><span className="text-sm font-semibold text-gray-700">Täglich</span></div>
          </div>
          <button onClick={() => setVollOffen((v) => !v)} className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-[#6B5444] py-3 transition-colors">
            {vollOffen ? '▲ Vollständigen Vertrag ausblenden' : '▼ Vollständigen Vertrag ansehen'}
          </button>
        </div>

        {vollOffen && (
        <>
        {/* Vollständiger Vertrag: Vertragsparteien + §§ */}
        <div className="px-6 sm:px-10 py-6 border-t border-gray-100">
          <p className="text-center text-[12px] text-gray-500 mb-4">geschlossen zwischen den folgenden Vertragsparteien</p>
          {/* Vertragsparteien */}
          <div className="rounded-xl border border-gray-200 bg-[#FAF8F4] px-4 py-3 mb-3">
            <p className="text-[11px] font-bold tracking-wider text-gray-500 mb-1">AUFTRAGGEBER (AG)</p>
            <ParteiZeile label="Name / Firma" value={daten.ag.name} />
            <ParteiZeile label="Straße + Nr." value={daten.ag.strasse} />
            <div className="flex items-baseline gap-3 py-1">
              <span className="text-[12px] text-gray-500 w-24 flex-shrink-0">PLZ / Ort</span>
              <Fill>{daten.ag.plz} {daten.ag.ort}</Fill>
            </div>
            <ParteiZeile label="E-Mail" value={daten.ag.email} />
            <ParteiZeile label="Telefon" value={daten.ag.telefon} />
          </div>
          <p className="text-center text-[12px] text-gray-500 mb-3">im Folgenden <strong>Auftraggeber (AG)</strong> genannt</p>

          <div className="rounded-xl border border-gray-200 bg-[#FAF8F4] px-4 py-3 mb-3">
            <p className="text-[11px] font-bold tracking-wider text-gray-500 mb-1">LEISTUNGSEMPFÄNGER (LE) — FALLS ABWEICHEND VOM AG</p>
            {daten.le ? (
              <>
                <ParteiZeile label="Name" value={daten.le.name} />
                <ParteiZeile label="Straße + Nr." value={daten.le.strasse} />
                <div className="flex items-baseline gap-3 py-1">
                  <span className="text-[12px] text-gray-500 w-24 flex-shrink-0">PLZ / Ort</span>
                  <Fill>{daten.le.plz} {daten.le.ort}</Fill>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-gray-400 italic py-1">identisch mit Auftraggeber</p>
            )}
          </div>
          <p className="text-center text-[12px] text-gray-500 mb-3">im Folgenden <strong>Leistungsempfänger (LE)</strong> genannt</p>
          <p className="text-center text-[13px] font-semibold text-gray-600 mb-3">— und —</p>

          <div className="rounded-xl border border-gray-200 bg-[#FAF8F4] px-4 py-3 mb-2">
            <p className="text-[11px] font-bold tracking-wider text-gray-500 mb-1">DIENSTLEISTER (DL)</p>
            <p className="text-[15px] font-bold text-gray-900">PRIMUNDUS Deutschland</p>
            <p className="text-[12px] text-gray-600">VITANAS CARE LTD HOME SK · ul. Poznańska 21/48, 00-685 Warszawa</p>
            <p className="text-[12px] text-gray-600">NIP: 7011301447 · REGON: 544074862</p>
          </div>
          <p className="text-center text-[12px] text-gray-500">im Folgenden <strong>Dienstleister (DL oder PRIMUNDUS)</strong> genannt.</p>
        </div>

        {/* Vertragstext */}
        <div className="px-6 sm:px-10 py-6 border-t border-gray-100">
          <Paragraphen liste={PARAGRAPHEN} />

          {/* § 3 — mit dynamischem Vertragsbeginn */}
          <section className="mb-5">
            <h2 className="text-[15px] font-bold text-[#6B5444] mb-2 pb-1 border-b border-gray-200">§ 3 Vertragsdauer / Vertragskündigung</h2>
            <ol className="space-y-1.5 text-[13px] leading-relaxed text-gray-700">
              <li className="flex gap-2"><span className="text-gray-400">1.</span><span className="text-justify">Der Vertrag beginnt voraussichtlich am <Fill>{daten.vertragsbeginn}</Fill> und wird <Fill>auf unbestimmte Zeit</Fill> geschlossen.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">2.</span><span className="text-justify">Der AG verlangt vom DL ausdrücklich, dass dieser mit der Leistungserbringung bereits vor Ablauf der Widerrufsfrist gemäß § 8 beginnt.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">3.</span><span className="text-justify">Der Vertrag kann von beiden Seiten ohne Einhaltung einer Kündigungsfrist gekündigt werden.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">4.</span><span className="text-justify">Die Kündigung bedarf zu ihrer Wirksamkeit zwingend der Textform (Brief, Fax, E-Mail).</span></li>
              <li className="flex gap-2"><span className="text-gray-400">5.</span><span className="text-justify">Der AG gewährt dem DL eine Frist von maximal 3 Tagen zur Organisation der Rückreise sowie während dieser Frist weiterhin Unterkunft und Verpflegung.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">6.</span><span className="text-justify">Die Abwesenheit des LE am Leistungsort bis zu 7 Tagen lässt den Vertragsbestand unberührt. Ab dem 8. Tag ruht der Vertrag kostenlos.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">7.</span><span className="text-justify">Bei Beschwerden ist der DL unverzüglich zu informieren. Eine Minderung kann nur erfolgen, wenn der Grund innerhalb von 5 Tagen angezeigt wurde.</span></li>
            </ol>
            <p className="text-[12px] text-gray-500 mt-2">Geplanter Einsatz-Zeitraum (Rotation): <Fill>{daten.vertragsbeginn} – voraussichtlich {daten.voraussAbreise}</Fill>. Der Vertrag selbst ist täglich kündbar (§ 3.3).</p>
          </section>

          {/* § 4 — mit dynamischem Tagessatz */}
          <section className="mb-5">
            <h2 className="text-[15px] font-bold text-[#6B5444] mb-2 pb-1 border-b border-gray-200">§ 4 Vergütung</h2>
            <ol className="space-y-1.5 text-[13px] leading-relaxed text-gray-700">
              <li className="flex gap-2"><span className="text-gray-400">1.</span><span className="text-justify">Der DL erhält für die vereinbarten Dienstleistungen eine Vergütung von <Fill>{daten.tagessatz}</Fill> pro Tag (Tagessatz) zzgl. einer Reisekostenpauschale i.H.v. EUR 125,00 pro Fahrt.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">2.</span><span className="text-justify">Die Vergütung wird berechnet ab dem Tag der Ankunft der Betreuungsperson am Leistungsort.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">3.</span><span className="text-justify">Beginnt oder endet die Vertragslaufzeit im Laufe eines Monats, erfolgt eine anteilige Berechnung.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">4.</span><span className="text-justify">Die Rechnungen werden monatlich zum 15. ausgestellt und sind bis spätestens 7 Tage nach Erhalt zu überweisen.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">7.</span><span className="text-justify">Der Anreisetag und der Abreisetag werden als volle Dienstleistungstage berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">8.</span><span className="text-justify">An gesetzlichen Feiertagen wird der doppelte Tagessatz berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">9.</span><span className="text-justify">In den Sommermonaten Juli und August wird ein Sommerzuschlag von 6,67 € pro Tag berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">10.</span><span className="text-justify">Nach aktueller Gesetzeslage ist auf die Dienstleistungen keine gesetzliche Mehrwertsteuer zu entrichten.</span></li>
            </ol>
          </section>

          <Paragraphen liste={PARAGRAPHEN_2} />
        </div>
        </>
        )}

        {/* Unterschrift + Online-Signatur */}
        <div className="px-6 sm:px-10 py-6 border-t border-gray-100 bg-[#FAFAF9]">
          <h2 className="text-[15px] font-bold text-[#6B5444] mb-4">Unterschriften</h2>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="h-12 flex items-end">
                {signedAt
                  ? <span className="text-xl text-gray-900" style={{ fontFamily: 'cursive' }}>{name}</span>
                  : <span className="text-gray-300 text-sm italic">noch nicht unterschrieben</span>}
              </div>
              <div className="border-t border-gray-400 pt-1 text-[11px] text-gray-500">
                <Fill>{ort}</Fill>, {signedAt ? <Fill>{signedAt.split(' um ')[0]}</Fill> : daten.datum} · Unterschrift Auftraggeber
              </div>
            </div>
            <div>
              <div className="h-12 flex items-end">
                {daten.dl.signaturImg ? (
                  <img src={daten.dl.signaturImg} alt="Unterschrift Primundus" className="h-11 w-auto" />
                ) : (
                  /* Platzhalter-Faksimile — wird durch den hinterlegten Scan ersetzt. */
                  <svg viewBox="0 0 210 56" className="h-11 w-auto" aria-label="Unterschrift Primundus (Faksimile)">
                    <path d="M8,40 C18,8 26,8 30,28 C33,42 40,44 46,30 C50,20 56,18 60,30 C64,42 72,44 80,30 C86,20 94,18 100,32 C104,42 112,42 120,28 C128,16 138,18 146,32 C152,42 162,40 172,26 C180,16 190,22 202,30" fill="none" stroke="#1f3a8a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14,47 C66,53 142,53 200,44" fill="none" stroke="#1f3a8a" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                  </svg>
                )}
              </div>
              <div className="border-t border-gray-400 pt-1 text-[11px] text-gray-500">i. A. {daten.dl.name}, {daten.dl.rolle} · Warszawa, {daten.datum}</div>
            </div>
          </div>

          {signedAt ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4">
              <p className="text-sm font-bold text-green-800 mb-1">✓ Vertrag rechtsverbindlich unterschrieben</p>
              <p className="text-[12px] text-green-700 leading-relaxed">
                Elektronisch signiert von <strong>{name}</strong> am <strong>{signedAt}</strong>.
                Sie erhalten umgehend eine Kopie des unterschriebenen Vertrags per E-Mail an {daten.ag.email}.
              </p>
              <p className="text-[11px] text-green-600/80 mt-2">
                Audit: einfache elektronische Signatur · Zeitstempel + IP protokolliert · Vertragsversion v1.0
              </p>
              {onSigned && (
                <button onClick={onSigned}
                  className="mt-3 w-full rounded-xl bg-[#8B7355] hover:bg-[#766145] text-white text-sm font-bold py-3 transition-colors">
                  Weiter zum Portal →
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border-2 border-[#8B7355]/30 bg-white px-4 py-4">
              <p className="text-sm font-bold text-gray-800 mb-1">Jetzt online unterschreiben</p>
              <p className="text-[12px] text-gray-500 mb-4">Tippen Sie Ihren vollständigen Namen — das gilt als Ihre rechtsverbindliche elektronische Unterschrift.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">Vollständiger Name (Unterschrift)</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10" />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">Ort</label>
                  <input value={ort} onChange={(e) => setOrt(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10" />
                </div>
              </div>
              <label className="flex items-start gap-2.5 mb-2.5 cursor-pointer" onClick={() => setBestaetigt((v) => !v)}>
                <input type="checkbox" checked={bestaetigt} readOnly className="mt-0.5 accent-[#8B7355] w-4 h-4" />
                <span className="text-[12px] text-gray-600 leading-relaxed">Ich habe den gesamten Vertragsinhalt gelesen und unterschreibe diesen Dienstleistungsvertrag hiermit rechtsverbindlich elektronisch.</span>
              </label>
              <label className="flex items-start gap-2.5 mb-4 cursor-pointer" onClick={() => setWiderruf((v) => !v)}>
                <input type="checkbox" checked={widerruf} readOnly className="mt-0.5 accent-[#8B7355] w-4 h-4" />
                <span className="text-[12px] text-gray-600 leading-relaxed">Ich verlange ausdrücklich, dass die Betreuung bereits vor Ablauf der 14-tägigen Widerrufsfrist beginnt (§ 8). Die Widerrufsbelehrung habe ich erhalten.</span>
              </label>
              <button onClick={sign} disabled={!canSign}
                className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-colors ${canSign ? 'bg-[#2A9D5C] hover:bg-[#248a50]' : 'bg-gray-300 cursor-not-allowed'}`}>
                Rechtsverbindlich &amp; kostenpflichtig unterschreiben
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
