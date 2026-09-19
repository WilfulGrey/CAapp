/**
 * Landingpage /wechsel (Registry #81, Martin 18.09.2026): „bei der Kampagne
 * geht es doch eher darum, unzufrieden mit ihrer Pflegekraft oder Agentur
 * oder ist das zu teuer? … eigene Landingpage vermutlich."
 *
 * Für Familien, die SCHON eine 24-Stunden-Kraft über einen anderen Anbieter
 * haben. Die Seite verspricht nur, was belegt ist: Bestpreisgarantie im
 * Wortlaut der Konstante, Vertragsfakten aus `vertrag-content.ts`, Anreise
 * und Bewerbungen wie auf der Startseite. Kein Wettbewerbername, kein
 * „günstiger als", kein „verdient mehr" (nicht belegbar, zieht Bewerberinnen).
 * Pur (kein React/Next) — Root-Vitest importiert es direkt.
 */
import { GARANTIE } from './kraefte-vorschau';

export const WECHSEL = {
  meta: {
    title: 'Anbieter wechseln: 24-Stunden-Pflege in 2 Minuten vergleichen | PRIMUNDUS',
    description: 'Zu teuer oder unzufrieden mit Ihrer 24-Stunden-Pflege? Sehen Sie in 2 Minuten, was Sie bei Primundus zahlen – eigene Pflegekräfte, keine Vermittlungsgebühr, täglich kündbar.',
  },
  kicker: 'Schon eine 24-Stunden-Kraft im Haus?',
  h1: 'Zu teuer? Unzufrieden? Vergleichen Sie in 2 Minuten.',
  /** Zwei Anker wie im Hero der Startseite: Preis und Pflegekräfte. */
  unterzeile: {
    vor: 'Ihr Preis steht nach 8 Fragen, ',
    anker1: 'ohne Kontaktdaten',
    mitte: '. Danach sehen Sie, ',
    anker2: 'welche Pflegekräfte verfügbar sind',
    nach: '\u00A0– ',
    ende: 'Anreise in 3 Tagen möglich.',
  },
  knopf: 'Preis in 2 Minuten vergleichen\u00A0→',
  aenderung: {
    titel: 'Was sich ändert, wenn Sie wechseln',
    punkte: [
      {
        titel: 'Der Preis',
        text: `Eigene Pflegekräfte, keine Vermittlungsgebühr. Dazu die ${GARANTIE.wort}: ${GARANTIE.zusage} ${GARANTIE.ablauf}`,
      },
      {
        titel: 'Die Bindung',
        text: 'Kein Vertrag vor Ihrer Auswahl. Täglich kündbar, taggenau abgerechnet, Zahlung erst ab Anreise.',
      },
      {
        titel: 'Die Pflegekraft',
        text: 'Sie sehen Profile mit Foto, Erfahrung und Deutsch-Stufe und wählen selbst. Fällt eine Kraft aus, stellen wir Ersatz, in der Regel innerhalb von drei Tagen. Für Tage ohne Betreuung zahlen Sie nichts.',
      },
      {
        titel: 'Der Ansprechpartner',
        text: 'Persönlicher Ansprechpartner 7 Tage die Woche, mit der Erfahrung aus über 60.000 Einsätzen.',
      },
    ],
  },
  ablauf: {
    titel: 'So läuft der Wechsel',
    schritte: [
      { titel: 'Preis berechnen', text: '8 Fragen, 2 Minuten. Der Preis erscheint sofort, ohne Kontaktdaten.' },
      { titel: 'Pflegekräfte ansehen', text: 'Nach dem Speichern sehen Sie passende Profile und laden ein, wer Ihnen gefällt. Bewerbungen kommen am selben Werktag.' },
      { titel: 'Kündigungsfrist prüfen', text: 'Schauen Sie in Ihren aktuellen Vertrag. Wir legen die Anreise auf Ihren Wunschtermin, möglich ist sie in 3 Tagen.' },
      { titel: 'Übergabe', text: 'Ihre bisherige Kraft reist ab, unsere reist an. Ab dem Anreisetag zahlen Sie, taggenau.' },
    ],
  },
  fragen: {
    titel: 'Fragen vor dem Wechsel',
    liste: [
      {
        frage: 'Kann meine jetzige Pflegekraft bei Ihnen weitermachen?',
        antwort: 'In der Regel nicht, sie ist bei Ihrer Agentur angestellt. Bei uns wählen Sie aus eigenen, fest angestellten Pflegekräften – mit Profil, Foto und Deutsch-Stufe.',
      },
      {
        frage: 'Was kostet der Wechsel?',
        antwort: 'Nichts. Keine Aufnahmegebühr, keine Vermittlungsgebühr. Sie zahlen ab dem Anreisetag, taggenau.',
      },
      {
        frage: 'Wie schnell geht es?',
        antwort: 'Anreise in 3 Tagen möglich. Wann genau, richtet sich nach Ihrem Wunschtermin und der Kündigungsfrist Ihres Vertrags.',
      },
      {
        frage: 'Und wenn die neue Kraft nicht passt?',
        antwort: 'Dann tauschen wir die Pflegekraft aus. Und der Vertrag bleibt täglich kündbar.',
      },
      {
        frage: 'Sie zahlen heute weniger als unseren Preis?',
        antwort: `Dann legen Sie uns das Angebot vor. ${GARANTIE.zusage} Was vergleichbar heißt, steht in der ${GARANTIE.wort}.`,
      },
    ],
  },
} as const;
