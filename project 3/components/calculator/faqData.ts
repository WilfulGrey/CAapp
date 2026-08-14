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
    question: "Was kostet eine 24-Stunden-Pflege ungefähr?",
    answer: "Die Kosten variieren je nach Pflegebedarf und Qualifikation der Betreuungskraft. In 2 Minuten sehen Sie sofort Ihr persönliches Angebot & passende Pflegekräfte – inklusive möglicher Zuschüsse durch die Pflegekasse, die den Eigenanteil erheblich senken können."
  },
  {
    question: "Wie schnell kann eine Betreuungskraft starten?",
    answer: "In der Regel können wir innerhalb von 4–7 Tagen eine passende Betreuungskraft vermitteln. Bei dringendem Bedarf auch schneller – sprechen Sie uns einfach an."
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
