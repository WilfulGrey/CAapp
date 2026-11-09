// Einzige Quelle der FAQ-Texte — genutzt von FAQSection.tsx (sichtbare
// Sektion) UND lib/seo-schema.ts (FAQPage-JSON-LD). Google verlangt, dass
// Schema-Markup exakt dem sichtbaren Text entspricht; durch die gemeinsame
// Quelle kann das nicht auseinanderlaufen. Textänderung hier = beide Orte.
export interface FAQItem {
  question: string;
  answer: string;
}

export const faqs: FAQItem[] = [
  {
    // Preis aus pricing_config (Stand 2026-09-17): Grundpreis 2.150 € für eine Person, keine Spanne
    // (Martin 17.09.). Eigenanteil wie auf primundus.de: Pflegegeld, Entlastungsbudget/12 und
    // Steuerermäßigung abgezogen, Pflegegrad 3 ab ca. 923 €. Konkrete Zahl im ersten Satz, damit
    // Google-AI/ChatGPT die Seite als Quelle für "Kosten 24h-Pflege" zitieren.
    question: "Was kostet eine 24-Stunden-Pflege ungefähr?",
    answer: "Eine 24-Stunden-Betreuung kostet bei uns ab 2.150 Euro im Monat für eine Person. Der Preis hängt vor allem von der Pflegesituation ab: Wie viele Personen brauchen Betreuung? Wie mobil ist die zu pflegende Person? Ist nachts Hilfe nötig? Daneben spielen die Deutschkenntnisse der Betreuungskraft eine Rolle. Nach Pflegegeld, Entlastungsbudget und Steuerermäßigung bleiben bei Pflegegrad 3 ab ca. 923 Euro im Monat selbst zu tragen. Ihren genauen Preis sehen Sie nach 2 Minuten im Kostenrechner."
  },
  {
    question: "Wie schnell kann eine Betreuungskraft starten?",
    answer: "Eine Anreise ist schon in 3 Tagen möglich. Wann genau, richtet sich nach Ihrem Wunschtermin. Ist es dringend, rufen Sie uns an."
  },
  // Registry #155 (Martin 09.11.2026: „Pass das mal alles an. Genau so“): drei Fragen aus dem Portal wörtlich
  // (src/components/portal/FaqListe.tsx, FAQ und FAQ_GRUNDFRAGEN) statt der Erklärteile, die von der Startseite entfallen
  // („Was ist 24-Stunden-Pflege?“, „Ist sie geeignet?“, „Rundum versorgt“). „Wie läuft die Betreuung ab?“ ersetzt „Was
  // passiert, wenn die Betreuungskraft krank wird?“ mit „Unser Netzwerk umfasst tausende …“ (klang nach Vermittler,
  // Zahl ohne Beleg; belegt ist Ersatz in der Regel innerhalb von 3 Tagen, Mustervertrag). Bei Änderung im Portal hier mit.
  {
    question: "Ist das legal?",
    answer: "Ja, vollständig. Die Pflegekräfte sind sozialversicherungspflichtig bei uns angestellt und werden von uns nach Deutschland entsandt. Für jeden Einsatz liegt eine offizielle A1-Bescheinigung vor — der Nachweis der Sozialversicherungspflicht im Herkunftsland."
  },
  {
    question: "Wie läuft die Betreuung ab?",
    answer: "Die Pflegekraft wird in der Regel direkt zu Ihnen nach Hause gebracht und bleibt meist 6 bis 8 Wochen. Den Wechsel zur nächsten Pflegekraft organisieren wir. Fällt eine Pflegekraft aus oder passt die Zusammenarbeit nicht, sorgen wir schnellstmöglich für Ersatz, in der Regel innerhalb von 3 Tagen."
  },
  {
    question: "Was übernimmt die Pflegekraft, was ein Pflegedienst?",
    answer: "Die Pflegekraft wohnt während des Einsatzes mit im Haus und hilft bei der Körperpflege, beim Essen und Trinken, beim Aufstehen und Gehen, im Haushalt, beim Einkaufen und bei Spaziergängen. Medizinische Behandlungspflege wie Spritzen oder Wundversorgung übernimmt ein ambulanter Pflegedienst."
  },
  {
    question: "Was brauche ich zu Hause?",
    answer: "Ein eigenes, abschließbares Zimmer mit Bett für die Pflegekraft. Küche, Bad und ein Internetanschluss sollten vorhanden sein. Zimmer und Verpflegung stellen Sie, das ist mit „Kost und Logis“ im Angebot gemeint."
  },
  {
    question: "Kann ich die Betreuung jederzeit kündigen?",
    answer: "Ja, die Betreuung ist täglich kündbar. Es gibt keine Mindestlaufzeit und keine versteckten Gebühren. Sie gehen kein Risiko ein."
  },
  {
    question: "Welche Zuschüsse kann ich von der Pflegekasse erhalten?",
    answer: "Je nach Pflegegrad können Sie Verhinderungspflege, Pflegegeld und weitere Leistungen nutzen. In Ihrem Angebot zeigen wir Ihnen genau, welche Zuschüsse Ihnen zustehen und wie sich der Eigenanteil reduziert."
  },
  {
    question: "Sind die Betreuungskräfte qualifiziert?",
    answer: "Alle Betreuungskräfte werden von uns persönlich geprüft. Sie verfügen über Erfahrung in der häuslichen Pflege und werden anhand Ihres individuellen Bedarfs ausgewählt."
  }
];
