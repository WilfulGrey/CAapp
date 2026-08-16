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
    // Preisspanne aus der echten pricing_config (Stand 2026-08): Basis
    // 2.200 €, Vollausbau (Ehepaar, Deutsch L3, mehrmals nachts, …) ~3.500 €.
    // Konkrete Zahl im ersten Satz = Voraussetzung, dass Google-AI/ChatGPT
    // die Seite als Quelle für "Kosten 24h-Pflege" zitieren.
    question: "Was kostet eine 24-Stunden-Pflege ungefähr?",
    answer: "Eine 24-Stunden-Betreuung kostet bei uns meist zwischen 2.200 und 3.500 Euro im Monat. Der Preis hängt vor allem von der Pflegesituation ab: Wie viele Personen brauchen Betreuung? Wie mobil ist die zu pflegende Person? Ist nachts Hilfe nötig? Daneben spielen die Deutschkenntnisse der Betreuungskraft eine Rolle. Die Pflegekasse zahlt einen Teil dazu – je nach Pflegegrad bleiben oft rund 1.500 bis 2.500 Euro im Monat selbst zu tragen. Ihren genauen Preis sehen Sie nach 2 Minuten im Kostenrechner."
  },
  {
    question: "Wie schnell kann eine Betreuungskraft starten?",
    answer: "In der Regel können wir innerhalb von 4–7 Werktagen eine passende Betreuungskraft vermitteln. Bei dringendem Bedarf auch schneller – sprechen Sie uns einfach an."
  },
  {
    question: "Was passiert, wenn die Betreuungskraft krank wird?",
    answer: "Wir organisieren schnellstmöglich eine Ersatzkraft. Unser Netzwerk umfasst tausende geprüfte Betreuungskräfte, sodass wir in der Regel innerhalb kurzer Zeit Ersatz stellen können."
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
