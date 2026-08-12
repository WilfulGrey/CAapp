import { useState } from 'react';
import type { FC, ReactNode } from 'react';

// ─── Prototyp: Online-signierbarer Dienstleistungsvertrag (Stufe A) ──────────
// Basis = primundus-mustervertrag.pdf, originalgetreu als HTML nachgebaut.
// NUR Kundendaten + Zeitraum (Vertragsbeginn) + Betrag (Tagessatz) werden an
// den dafür vorgesehenen Stellen eingesetzt — sichtbar hervorgehoben via <Fill>.
// Signatur: einfache elektronische Signatur (getippter Name + verbindliche
// Bestätigung + Zeitstempel). Dummy-Daten — echte Anbindung später.

// Dynamisch befülltes Feld — bewusst OHNE Hervorhebung (liest sich wie
// normaler Vertragstext). Nur Durchreichen.
const Fill: FC<{ children: ReactNode }> = ({ children }) => <>{children}</>;

export interface VertragsDaten {
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
  dl: { name: 'Kamila Bilska-Wabik', rolle: 'Vitanas Group' }, // signaturImg → echter Scan später
};

// Statische §§ — Wortlaut 1:1 dem Mustervertrag (dist/primundus-mustervertrag.pdf)
// und parallel zum Server-PDF-Generator project 3/lib/vertrag.ts. WICHTIG:
// wenn der Mustervertrag aktualisiert wird, BEIDE Stellen updaten.
//
// § 3 + § 4 werden separat gerendert (dynamische Felder: Vertragsbeginn,
// Tagessatz, Einsatz-Zeitraum); hier nur die rein statischen §§.

interface Punkt {
  text: string;
  subList?: string[];
}

const PARAGRAPHEN: { titel: string; punkte: Punkt[] }[] = [
  {
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
      // § 1 pkt 10 (telefon/internet dla opiekunki) usunięty 2026-08-12 —
      // Vertragsversion v1.1; trzymać w sync z project 3/lib/vertrag-content.ts.
    ],
  },
  {
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
  },
];

const PARAGRAPHEN_2: { titel: string; punkte: Punkt[] }[] = [
  {
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
  },
  {
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
  },
  {
    titel: '§ 7 Wettbewerbsverbot',
    punkte: [
      {
        text: 'Für die Betreuungspersonen gilt sowohl während der Vertragsdauer als auch bis 12 Monate nach Beendigung ein Konkurrenz- und Wettbewerbsverbot. Es ist nicht gestattet, ein mittelbares oder unmittelbares Rechtsverhältnis zu einer Betreuungsperson des DL zu begründen.',
      },
      {
        text: 'Im Falle einer schuldhaften Annahme eines Auftrages durch eine Betreuungsperson beim AG mit Ausschließung des DL, verpflichtet sich der AG, eine Vertragsstrafe in Höhe von EUR 5.000,00 zu zahlen.',
      },
    ],
  },
  {
    titel: '§ 8 Widerrufsrecht',
    punkte: [
      {
        text: 'Dem AG steht das Recht zu, diesen Vertrag ohne Angabe von Gründen innerhalb von 14 Tagen in Textform zu widerrufen. Die Widerrufsfrist beginnt mit Unterzeichnung dieses Vertrages. Widerruf an: Primundus Deutschland (VITANAS CARE LTD HOME SK), ul. Poznańska 21/48, 00-685 Warszawa.',
      },
      {
        text: 'Im Falle eines wirksamen Widerrufs sind die beiderseits empfangenen Leistungen zurückzugewähren. Der AG ist verpflichtet, dem DL Wertersatz zu leisten (z. B. entstandene Reisekosten, pauschal EUR 125,00).',
      },
      {
        text: 'Der AG bestätigt durch Unterzeichnung, dass er ausdrücklich verlangt, dass die Leistungserbringung vor Ablauf der Widerrufsfrist beginnt.',
      },
    ],
  },
  {
    titel: '§ 9 Einhaltung der gültigen Sozialversicherungspflichten',
    punkte: [
      {
        text: 'Der DL erklärt, dass er alle auszuführenden Tätigkeiten nach den gültigen Gesetzen, insbesondere der EU-Dienstleistungsrichtlinie und dem Arbeitnehmer-Entsendegesetz, rechtmäßig befolgt.',
      },
      { text: 'Die Vergütung des Personals richtet sich nach dem deutschen Mindestlohn.' },
      {
        text: 'Die von ihm beauftragten Betreuungspersonen sind ordnungsgemäß nach polnischem Sozialversicherungsrecht versichert und mit A1-Bescheinigungen der polnischen Sozialversicherungsanstalt (ZUS) entsandt.',
      },
    ],
  },
  {
    titel: '§ 10 Schlussbestimmungen',
    punkte: [
      { text: 'Änderungen und Ergänzungen bedürfen der Schriftform.' },
      {
        text: 'Rechnungen und Korrespondenz werden an die E-Mailadresse des AG auf Seite 1 gesendet.',
      },
      { text: 'Eine E-Mail ist gemäß diesem Vertrag ebenfalls Schriftform.' },
      { text: 'Sollten einzelne Bestimmungen unwirksam sein, gelten die übrigen fort.' },
      {
        text: 'Der AG bestätigt mit seiner Unterschrift den gesamten Inhalt des Vertrages gelesen zu haben.',
      },
      { text: 'Mündliche Nebenabreden bestehen nicht.' },
      { text: 'Der Vertrag unterliegt deutschem Recht.' },
    ],
  },
];

const Paragraphen: FC<{ liste: { titel: string; punkte: Punkt[] }[] }> = ({ liste }) => (
  <>
    {liste.map((p) => (
      <section key={p.titel} className="mb-5 print:break-inside-avoid">
        <h2 className="text-[15px] font-bold text-[#6B5444] mb-2 pb-1 border-b border-gray-200">{p.titel}</h2>
        <ol className="space-y-1.5">
          {p.punkte.map((punkt, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-gray-700">
              <div className="flex gap-2">
                <span className="text-gray-400 flex-shrink-0">{i + 1}.</span>
                <span className="text-justify">{punkt.text}</span>
              </div>
              {punkt.subList && (
                <ul className="mt-1.5 ml-6 space-y-1">
                  {punkt.subList.map((s, j) => (
                    <li key={j} className="flex gap-2 text-[12.5px] text-gray-600">
                      <span className="text-[#B5A184] flex-shrink-0">▸</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    ))}
  </>
);

// ─── Anlagen 1 + 2 ───────────────────────────────────────────────────────
// Werden im Mustervertrag-PDF auf separaten Seiten gerendert. Im Web als
// eigene Sektionen unter den §§; beim Print mit break-before:page auf neue
// Seite.

const AnlagenSektion: FC<{ daten: VertragsDaten }> = ({ daten: _daten }) => (
  <>
    <section className="mb-5 print:break-before-page print:break-inside-avoid">
      <h2 className="text-[15px] font-bold text-[#6B5444] mb-1">Anlage 1 zum Dienstleistungsvertrag</h2>
      <p className="text-[12px] text-[#6B5444] font-semibold mb-2 pb-1 border-b border-gray-200">
        Hinweise zum Datenschutz (EU-DSGVO) und Einwilligungserklärung
      </p>
      <div className="space-y-2 text-[13px] leading-relaxed text-gray-700 text-justify">
        <p>
          PRIMUNDUS ist verantwortlich für den Schutz, Sicherheit und Verwaltung Ihrer Daten. Kontakt: <strong>datenschutz@primundus.de</strong>
        </p>
        <p>
          Die angegebenen personenbezogenen Daten, insbesondere Name, Anschrift, Telefonnummer, Bankdaten, Gesundheitsdaten und familiäre Daten, werden auf Grundlage der geltenden EU-DSGVO ausschließlich zum Zwecke der Durchführung des entstehenden Vertragsverhältnisses erhoben und verarbeitet.
        </p>
        <p>
          Ihre Vertragsdaten speichern wir gemäß den gesetzlichen Vorgaben. Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Sperrung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit sowie das Recht auf Beschwerde bei einer zuständigen Aufsichtsbehörde. Unsere Datenschutzerklärung finden Sie unter www.primundus.de.
        </p>
        <div className="mt-3 p-3 bg-[#FAF8F4] border-l-2 border-[#B5A184] rounded-r">
          <strong>Einwilligung zur Datennutzung zu Werbezwecken:</strong>
          <br />
          Ich bin damit einverstanden, dass PRIMUNDUS mir postalisch / per E-Mail / Telefon / Fax Informationen und Angebote zum Zwecke der Eigenwerbung zusendet.
        </div>
      </div>
    </section>

    <section className="mb-5 print:break-before-page print:break-inside-avoid">
      <h2 className="text-[15px] font-bold text-[#6B5444] mb-1">Anlage 2 zum Dienstleistungsvertrag</h2>
      <p className="text-[12px] text-[#6B5444] font-semibold mb-2 pb-1 border-b border-gray-200">Leistungsumfang</p>
      <p className="text-[13px] leading-relaxed text-gray-700 text-justify mb-3">
        Die Vertragspartner vereinbaren, dass folgende Leistungen im Rahmen des abgeschlossenen Dienstleistungsvertrages erbracht werden. Beide Parteien sind sich darüber einig, dass zeitlich überwiegend nur Leistungen im Bereich der hauswirtschaftlichen Versorgung erbracht werden.
      </p>

      <p className="text-[13px] font-bold text-gray-800 mb-1.5">
        Hauswirtschaftliche Leistungen <span className="font-normal text-gray-500 text-[12px]">(zeitlich überwiegend)</span>
      </p>
      <ul className="space-y-1 mb-4">
        {[
          'Alle notwendigen Maßnahmen zur Aufrechterhaltung einer eigenständigen Haushaltsführung',
          'Ordnung und Reinigung der vom LE genutzten Zimmer/Räume (Fensterreinigung, Garage, Heizräume und Außengebäude ausgeschlossen)',
          'Einkaufen',
          'Spülen des alltäglichen Geschirrs',
          'Waschen und Wechseln der Wäsche sowie Kleidung',
          'Zubereitung von Speisen und Getränken',
          'Pflege von Zimmerpflanzen',
          'Begleitung bei Spaziergängen',
          'Versorgung von Haustieren',
          'Aktivierende Tätigkeiten und Besorgungen (z. B. Begleitung bei Kulturveranstaltungen, Spiele etc.)',
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] text-gray-700 leading-relaxed">
            <span className="text-[#B5A184] flex-shrink-0">▸</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-[13px] font-bold text-gray-800 mb-1.5">
        Grundpflege nach § 14 Abs. 4 Nr. 1–3 SGB XI <span className="font-normal text-gray-500 text-[12px]">(zeitlich nicht überwiegend)</span>
      </p>
      <ul className="space-y-1 mb-3">
        {[
          'Körperpflege (z. B. Waschen, Duschen, Baden, Rasieren, Mund- und Zahnpflege, Hautpflege)',
          'Hilfe bei der Nahrungsaufnahme',
          'Hilfe bei der Mobilität (z. B. Aufstehen, Zubettgehen, An- und Auskleiden, Treppensteigen)',
          'Begleitung von Arztbesuchen',
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] text-gray-700 leading-relaxed">
            <span className="text-[#B5A184] flex-shrink-0">▸</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-[12px] italic text-gray-500">
        Ausdrücklich ausgenommen: Leistungen der medizinischen Behandlungspflege nach SGB V.
      </p>
    </section>
  </>
);

const ParteiZeile: FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-3 py-1">
    <span className="text-[12px] text-gray-500 w-24 flex-shrink-0">{label}</span>
    {value ? <Fill>{value}</Fill> : <span className="flex-1 border-b border-gray-300">&nbsp;</span>}
  </div>
);

export const VertragSignieren: FC<{
  daten?: VertragsDaten;
  onSigned?: (name: string) => void;
  // embedded = ohne eigenen Seiten-Rahmen (z.B. in einem Modal-Schritt);
  // die Unterschrift schließt dann direkt ab (kein Zwischen-„Weiter").
  embedded?: boolean;
  // signDisabled = Unterschrift-Button sperren (z.B. solange übergeordnete
  // Pflichtfelder im Modal noch nicht vollständig sind).
  signDisabled?: boolean;
  // Bereits unterschriebener Vertrag — read-only Präsentation im gebuchten
  // Portal. initialSignedName setzt die Unterschrift, readOnly blendet das
  // Signatur-Panel aus (nur noch die „unterschrieben"-Bestätigung sichtbar).
  initialSignedName?: string;
  initialSignedAt?: string;
  readOnly?: boolean;
}> = ({ daten = DUMMY, onSigned, embedded, signDisabled, initialSignedName, initialSignedAt, readOnly }) => {
  const [name, setName] = useState(initialSignedName ?? '');
  const [ort, setOrt] = useState(daten.ag.ort);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [widerruf, setWiderruf] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(
    initialSignedName ? (initialSignedAt ?? 'bereits unterschrieben') : null,
  );
  // Read-only Ansicht: vollständigen Vertrag direkt aufgeklappt zeigen, damit
  // der Kunde den unterschriebenen Vertrag komplett einsehen kann.
  const [vollOffen, setVollOffen] = useState(!!readOnly);

  const canSign = name.trim().length >= 3 && bestaetigt && widerruf;
  const sign = () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    setSignedAt(`${dd}.${mm}.${now.getFullYear()} um ${hh}:${mi} Uhr`);
    // Eingebettet (Modal): Unterschrift schließt direkt ab.
    if (embedded && onSigned) onSigned(name);
  };

  const inner = (
      <div className={`${embedded ? 'bg-white' : 'max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden'} print:max-w-none print:mx-0 print:my-0 print:rounded-none print:border-0 print:shadow-none print:overflow-visible`}>
        {/* @page rules + Tailwind-Print-Override: A4-Format, sauberer Hintergrund,
            Page-break-Steuerung. Wirkt nur beim Drucken (Cmd+P → Als PDF speichern). */}
        <style>{`
          @media print {
            @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
            html, body { background: #fff !important; }
            /* Browser-default Header/Footer (URL/Datum) wegblenden — Chrome+Safari
               lassen das nicht aus CSS, daher Hinweis im Dialog; aber das ist
               OS-Druckdialog-Sache. Hier nur was wir kontrollieren können. */
          }
        `}</style>
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

        {/* Eckdaten — UX-Übersicht für den Kunden im Web. Beim Druck (Cmd+P
            → Als PDF speichern) komplett ausgeblendet, weil der gedruckte
            Vertrag 1:1 dem statischen Mustervertrag entsprechen muss
            (kein Eckdaten-Vorblock im Original). */}
        <div className="px-6 sm:px-10 py-5 border-t border-gray-100 print:hidden">
          <p className="text-[13px] text-gray-600 mb-4">{readOnly ? 'Ihr unterschriebener Betreuungsvertrag — hier sehen Sie alle Eckdaten und den vollständigen Vertragstext.' : 'Ihr Betreuungsvertrag ist bereit. Prüfen Sie die Eckdaten und unterschreiben Sie unten online.'}</p>
          <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100 mb-3">
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Auftraggeber</span><span className="text-sm font-semibold text-gray-700 text-right">{daten.ag.name}</span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Leistungsempfänger</span><span className="text-sm font-semibold text-gray-700 text-right">{daten.le ? daten.le.name : daten.ag.name}</span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Vertragsbeginn</span><span className="text-sm font-semibold text-gray-700"><Fill>{daten.vertragsbeginn}</Fill></span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-500">Tagessatz</span><span className="text-sm font-bold text-gray-900"><Fill>{daten.tagessatz}</Fill>&nbsp;/ Tag</span></div>
            <div className="flex items-center justify-between px-4 py-2.5 bg-green-50"><span className="text-sm font-semibold text-green-800 flex-shrink-0">Kündigung</span><span className="text-sm font-bold text-green-700 text-right">✓ Täglich kündbar</span></div>
          </div>
          <button onClick={() => setVollOffen((v) => !v)} className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-[#6B5444] py-3 transition-colors">
            {vollOffen ? '▲ Vollständigen Vertrag ausblenden' : '▼ Vollständigen Vertrag ansehen'}
          </button>
        </div>

        {/* Vollständiger Vertrag: Vertragsparteien + §§
            Im Web nur sichtbar wenn vollOffen=true; beim Print IMMER sichtbar
            (print:block), damit der Kunde beim "Als PDF speichern" auch
            zugeklappt den vollen Vertrag bekommt. */}
        <div className={vollOffen ? '' : 'hidden print:block'}>
        {/* Vertragsparteien */}
        <div className="px-6 sm:px-10 py-6 border-t border-gray-100">
          <p className="text-center text-[12px] text-gray-500 mb-4">geschlossen zwischen den folgenden Vertragsparteien</p>
          {/* Vertragsparteien */}
          <div className="rounded-xl border border-gray-200 bg-[#FAF8F4] px-4 py-3 mb-3 print:break-inside-avoid">
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

          <div className="rounded-xl border border-gray-200 bg-[#FAF8F4] px-4 py-3 mb-3 print:break-inside-avoid">
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

          <div className="rounded-xl border border-gray-200 bg-[#FAF8F4] px-4 py-3 mb-2 print:break-inside-avoid">
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

          {/* § 3 — Vertragsdauer / Vertragskündigung. Punkt 1 mit dynamischem
              Vertragsbeginn, sonst 1:1 Mustervertrag. Footnote unten zeigt
              den konkreten Einsatz-Zeitraum dieser Buchung (nicht im
              Mustervertrag, aber Buchungs-spezifisch nützlich). */}
          <section className="mb-5 print:break-inside-avoid">
            <h2 className="text-[15px] font-bold text-[#6B5444] mb-2 pb-1 border-b border-gray-200">§ 3 Vertragsdauer / Vertragskündigung</h2>
            <ol className="space-y-1.5 text-[13px] leading-relaxed text-gray-700">
              <li className="flex gap-2"><span className="text-gray-400">1.</span><span className="text-justify">Der Vertrag beginnt voraussichtlich am <Fill>{daten.vertragsbeginn}</Fill> und wird <Fill>auf unbestimmte Zeit</Fill> geschlossen.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">2.</span><span className="text-justify">Der AG verlangt vom DL ausdrücklich, dass dieser mit der Leistungserbringung bereits vor Ablauf der Widerrufsfrist gemäß § 8 beginnt.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">3.</span><span className="text-justify">Der Vertrag kann von beiden Seiten ohne Einhaltung einer Kündigungsfrist gekündigt werden.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">4.</span><span className="text-justify">Die Kündigung bedarf zu ihrer Wirksamkeit zwingend der Textform (Brief, Fax, E-Mail).</span></li>
              <li className="flex gap-2"><span className="text-gray-400">5.</span><span className="text-justify">Der Auftraggeber gewährt dem Dienstleister eine Frist von maximal 3 Tagen zur Organisation der Rückreise der Betreuungsperson sowie während dieser Frist weiterhin Unterkunft und Verpflegung.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">6.</span><span className="text-justify">Die Abwesenheit des LE am Leistungsort bis zu 7 Tagen lässt den Vertragsbestand unberührt. Ab dem 8. Tag ruht der Vertrag kostenlos für den AG bis die Betreuung wieder fortgesetzt wird.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">7.</span><span className="text-justify">Bei Beschwerden über die Erbringung der vereinbarten Leistungen ist der DL unverzüglich zu informieren. Eine Minderung kann nur erfolgen, wenn der Minderungsgrund innerhalb von 5 Tagen angezeigt wurde und zwischen den Parteien unstrittig ist.</span></li>
            </ol>
            <p className="text-[12px] text-gray-500 mt-2 p-2 bg-[#FAF8F4] border-l-2 border-[#B5A184] rounded-r">Geplanter Einsatz-Zeitraum (Rotation): <Fill>{daten.vertragsbeginn} – voraussichtlich {daten.voraussAbreise}</Fill>. Der Vertrag selbst ist täglich kündbar (§ 3.3).</p>
          </section>

          {/* § 4 — Vergütung. Punkt 1 mit dynamischem Tagessatz, sonst 1:1
              Mustervertrag — alle 12 Punkte (vorher nur 8). */}
          <section className="mb-5 print:break-inside-avoid">
            <h2 className="text-[15px] font-bold text-[#6B5444] mb-2 pb-1 border-b border-gray-200">§ 4 Vergütung</h2>
            <ol className="space-y-1.5 text-[13px] leading-relaxed text-gray-700">
              <li className="flex gap-2"><span className="text-gray-400">1.</span><span className="text-justify">Der DL erhält für die vereinbarten Dienstleistungen eine Vergütung von <Fill>{daten.tagessatz}</Fill> pro Tag (Tagessatz) zzgl. einer Reisekostenpauschale i.H.v. EUR 125,00 pro Fahrt.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">2.</span><span className="text-justify">Die Vergütung wird berechnet ab dem Tag der Ankunft der Betreuungsperson am Leistungsort.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">3.</span><span className="text-justify">Beginnt oder endet die Vertragslaufzeit im Laufe eines Monats, erfolgt eine anteilige Berechnung der vereinbarten Vergütung.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">4.</span><span className="text-justify">Die Rechnungen werden monatlich zum 15. ausgestellt. Der Rechnungsbetrag ist bis spätestens 7 Tage nach Erhalt zu überweisen.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">5.</span><span className="text-justify">Sollten sich die Betreuungsbedürfnisse der zu betreuenden Person ändern, behält sich der DL das Recht zur Anpassung des Honorars vor.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">6.</span><span className="text-justify">Im Falle einer Arbeitsunfähigkeit der Betreuungsperson wird für die Zeit der Verhinderung kein Honorar berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">7.</span><span className="text-justify">Der Anreisetag und der Abreisetag werden als volle Dienstleistungstage berechnet. Bei einem Personalwechsel wird der volle Tagessatz für beide Betreuungspersonen berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">8.</span><span className="text-justify">An gesetzlichen Feiertagen wird der doppelte Tagessatz berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">9.</span><span className="text-justify">In den Sommermonaten Juli und August wird ein Sommerzuschlag von 6,67 € pro Tag berechnet.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">10.</span><span className="text-justify">Nach der aktuellen Gesetzeslage ist auf die Dienstleistungen des DL keine gesetzliche Mehrwertsteuer zu entrichten.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">11.</span><span className="text-justify">Bei Zahlungsverzug hat der DL das Recht, Dritte mit der Rechnungsabwicklung zu beauftragen und Verzugszinsen in Höhe von 5 Prozent p. a. über dem jeweiligen Basiszinssatz zu berechnen.</span></li>
              <li className="flex gap-2"><span className="text-gray-400">12.</span><span className="text-justify">Der DL ist berechtigt, bei ausbleibender Zahlung die Betreuungsperson ersatzlos abreisen zu lassen und den Vertrag außerordentlich fristlos zu kündigen.</span></li>
            </ol>
          </section>

          <Paragraphen liste={PARAGRAPHEN_2} />

          {/* Anlage 1 (DSGVO) + Anlage 2 (Leistungsumfang). Im Web als
              direkt anschließende Sektionen, beim Print mit
              break-before:page auf neue Seite (wie im Mustervertrag). */}
          <AnlagenSektion daten={daten} />
        </div>
        </div>

        {/* Unterschrift + Online-Signatur */}
        <div className="px-6 sm:px-10 py-6 border-t border-gray-100 bg-[#FAFAF9] print:bg-white print:break-inside-avoid">
          <h2 className="text-[15px] font-bold text-[#6B5444] mb-4">Unterschriften</h2>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="h-12 flex items-end">
                {name.trim()
                  ? <span className="text-2xl text-[#1f3a8a]" style={{ fontFamily: '"Snell Roundhand","Segoe Script","Brush Script MT",cursive' }}>{name}</span>
                  : <span className="text-gray-300 text-sm italic">noch nicht unterschrieben</span>}
              </div>
              <div className="border-t border-gray-400 pt-1 text-[11px] text-gray-500">
                <Fill>{ort}</Fill>, <Fill>{signedAt && signedAt !== 'bereits unterschrieben' ? signedAt.split(' um ')[0] : daten.datum}</Fill> · Unterschrift Auftraggeber
              </div>
            </div>
            <div>
              <div className="h-12 flex items-end">
                {daten.dl.signaturImg ? (
                  <img src={daten.dl.signaturImg} alt={`Unterschrift ${daten.dl.name}`} className="h-11 w-auto" />
                ) : (
                  /* Standard: schöne Schreibschrift-Unterschrift (kein Bild). */
                  <span className="text-2xl text-[#1f3a8a]" style={{ fontFamily: '"Snell Roundhand","Segoe Script","Brush Script MT",cursive' }}>{daten.dl.name}</span>
                )}
              </div>
              <div className="border-t border-gray-400 pt-1 text-[11px] text-gray-500">i. A. {daten.dl.name}, {daten.dl.rolle} · Warszawa, {daten.datum}</div>
            </div>
          </div>

          {signedAt ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 print:break-inside-avoid">
              <p className="text-sm font-bold text-green-800 mb-1">✓ Vertrag rechtsverbindlich unterschrieben</p>
              <p className="text-[12px] text-green-700 leading-relaxed">
                Elektronisch signiert von <strong>{name}</strong>{signedAt && signedAt !== 'bereits unterschrieben' ? <> am <strong>{signedAt}</strong></> : ''}.
                {readOnly
                  ? ` Eine Kopie des unterschriebenen Vertrags wurde an ${daten.ag.email} gesendet.`
                  : ` Sie erhalten umgehend eine Kopie des unterschriebenen Vertrags per E-Mail an ${daten.ag.email}.`}
              </p>
              <p className="text-[11px] text-green-600/80 mt-2">
                Audit: einfache elektronische Signatur · Zeitstempel + IP protokolliert · Vertragsversion v1.1
              </p>
              {onSigned && !embedded && !readOnly && (
                <button onClick={() => onSigned(name)}
                  className="mt-3 w-full rounded-xl bg-[#8B7355] hover:bg-[#766145] text-white text-sm font-bold py-3 transition-colors">
                  Weiter zum Portal →
                </button>
              )}
            </div>
          ) : (
            /* Signatur-Panel ist UI, beim Print nicht relevant (Kunde druckt
               den fertigen Vertrag, nicht das Unterschrift-Formular). */
            <div className="rounded-xl border-2 border-[#8B7355]/30 bg-white px-4 py-4 print:hidden">
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
              <label className="flex items-start gap-2.5 mb-2.5 cursor-pointer">
                <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} className="mt-0.5 accent-[#8B7355] w-4 h-4" />
                <span className="text-[12px] text-gray-600 leading-relaxed">Ich habe den gesamten Vertragsinhalt gelesen und unterschreibe diesen Dienstleistungsvertrag hiermit rechtsverbindlich elektronisch.</span>
              </label>
              <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
                <input type="checkbox" checked={widerruf} onChange={(e) => setWiderruf(e.target.checked)} className="mt-0.5 accent-[#8B7355] w-4 h-4" />
                <span className="text-[12px] text-gray-600 leading-relaxed">Ich verlange ausdrücklich, dass die Betreuung bereits vor Ablauf der 14-tägigen Widerrufsfrist beginnt (§ 8). Die Widerrufsbelehrung habe ich erhalten.</span>
              </label>
              {signDisabled && (
                <p className="text-[12px] text-amber-600 mb-2 text-center">Bitte oben zuerst die Kundendaten vollständig ausfüllen.</p>
              )}
              <button onClick={sign} disabled={!canSign || signDisabled}
                className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-colors ${(canSign && !signDisabled) ? 'bg-[#2A9D5C] hover:bg-[#248a50]' : 'bg-gray-300 cursor-not-allowed'}`}>
                Kostenpflichtig unterschreiben
              </button>
            </div>
          )}
        </div>
      </div>
  );

  return embedded ? inner : (
    <div className="min-h-screen bg-gray-100 py-6 px-3 print:min-h-0 print:bg-white print:py-0 print:px-0">{inner}</div>
  );
};
