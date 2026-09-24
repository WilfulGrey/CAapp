// Häufige Fragen der Angebotsseite (Portal-Redesign Teil 3): Akkordeon mit feinen Trennlinien,
// die ersten vier sichtbar, der Rest hinter „N weitere Fragen". Fragen, Antworten und
// Reihenfolge unverändert aus CustomerPortalPage übernommen.
import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';

export const FAQ: { q: string; a: ReactNode }[] = [
  /* Reihenfolge (Martin, 13.08.): Sprach-Niveaus ZUERST — die
     Stufen (Grund/Mittel/Gut) stehen auf jeder Pflegekraft-Karte,
     also ist das die Frage, die der Kunde beim Lesen der Liste
     zuerst hat. Der Rest folgt dem Weg: Einladen → Vertrag →
     Kündigung → Abrechnung → … */
  /* Sprach-Stufen-Antwort als JSX statt String, damit wir die
     Bar-Indikatoren genauso rendern können wie im Profil/Liste
     (statt der Unicode-Punkte ●). Konsistente Optik im ganzen
     Portal. Quelltext der Sätze identisch zur Modal-FAQ
     (LANGUAGE_LEVELS in CustomerNurseModal). */
  {
    q: 'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?',
    a: (
      <div className="text-[15px] leading-[1.7] text-pm-body space-y-3">
        <p>Eine grobe Orientierung — kein Sprach-Zertifikat. Die genaue Kommunikation hängt immer auch vom Tempo, der Mundart und der Geduld beider Seiten ab.</p>
        {[
          { bars: 1, label: 'Grund', desc: 'einzelne Wörter und einfache Sätze. Für eine Verständigung im Alltag braucht es Geduld, Gesten und etwas Vorbereitung; differenzierte Gespräche sind in der Regel nicht möglich.' },
          { bars: 2, label: 'Mittel', desc: 'einfache Alltagsthemen lassen sich besprechen, gängige Anweisungen werden meist verstanden. Bei komplexeren Themen (Diagnosen, Behörden, Telefonate) kann es zu Rückfragen oder Missverständnissen kommen.' },
          { bars: 3, label: 'Gut', desc: 'die Verständigung im Alltag und in der Pflege funktioniert in der Regel zuverlässig. Auch ausführlichere Gespräche sind möglich; sehr seltene Fachbegriffe, schnelles Sprechen oder Dialekt können dennoch Nachfragen erfordern.' },
        ].map((lvl) => (
          <div key={lvl.label} className="flex items-start gap-3">
            <div className="flex gap-0.5 pt-2.5 flex-shrink-0">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className={`w-3 h-1.5 rounded-full ${i < lvl.bars ? 'bg-pm-taupe' : 'bg-pm-line'}`} />
              ))}
            </div>
            <p><span className="font-semibold text-pm-ink">{lvl.label}</span> — {lvl.desc}</p>
          </div>
        ))}
        <p>Wenn Sprachsicherheit besonders wichtig ist (z. B. Demenz, schwerhörige oder spracheingeschränkte Patienten), sprechen Sie uns gerne an — wir helfen bei der Einordnung.</p>
      </div>
    ),
  },
  { q: 'Was bedeutet „Einladen"?', a: 'Wenn Ihnen eine Pflegekraft gefällt, laden Sie sie ein, sich bei Ihnen zu bewerben. Dafür müssen Sie nur kurz die Pflegesituation vervollständigen — damit wir Ihnen passende, verfügbare Pflegekräfte zeigen können. Alles unverbindlich; ein Vertrag entsteht erst, wenn Sie ein konkretes Angebot annehmen.' },
  { q: 'Gehe ich mit dem Einladen einen Vertrag ein?', a: 'Nein — das Einladen und Anschauen von Profilen ist vollständig unverbindlich. Ein Vertrag kommt erst zustande, wenn Sie ein konkretes Angebot ausdrücklich annehmen.' },
  { q: 'Kann ich jederzeit kündigen?', a: 'Ja, täglich kündbar — ohne Mindestlaufzeit und ohne Angabe von Gründen. Kosten entstehen ausschließlich für Tage, an denen die Pflegekraft tatsächlich vor Ort ist.' },
  { q: 'Wie funktioniert die Abrechnung?', a: 'Tagesgenau: Sie zahlen nur für geleistete Betreuungstage. Die Rechnung für den laufenden Monat wird jeweils zur Monatsmitte erstellt — transparent, nachvollziehbar, ohne versteckte Posten.' },
  { q: 'Wie lange bleibt die Pflegekraft — und wie läuft der Wechsel?', a: 'Pflegekräfte bleiben im Durchschnitt 6 bis 8 Wochen. Zur Mitte des Einsatzes beginnen wir bereits mit der Planung der Nachfolge, damit der Übergang nahtlos klappt. Sie müssen sich um nichts kümmern — Primundus organisiert den gesamten Wechsel.' },
  { q: 'Was passiert, wenn die Pflegekraft ausfällt?', a: 'Primundus kümmert sich umgehend um eine qualifizierte Vertretung. Ihr persönlicher Ansprechpartner informiert Sie proaktiv und begleitet die Übergabe.' },
  { q: 'Wie werden Reisekosten abgerechnet?', a: 'Die Reisekosten betragen pauschal 125 € pro Strecke — also je einmal bei der Anreise und bei der Abreise. Weitere versteckte Reisekosten gibt es nicht.' },
  { q: 'Ist das legal?', a: 'Ja, vollständig. Die Pflegekräfte sind sozialversicherungspflichtig bei uns angestellt und werden von uns nach Deutschland entsandt. Für jeden Einsatz liegt eine offizielle A1-Bescheinigung vor — der Nachweis der Sozialversicherungspflicht im Herkunftsland.' },
  { q: 'Mit wem wird der Vertrag geschlossen?', a: 'Der Betreuungsvertrag wird mit der PRIMUNDUS Sp. z o.o. geschlossen — der Gesellschaft hinter Primundus Deutschland und Ihrem Vertragspartner für die gesamte Betreuung. Die Pflegekräfte sind bei uns sozialversicherungspflichtig angestellt und werden offiziell nach Deutschland entsandt.' },
  { q: 'Welche Kosten entstehen insgesamt?', a: 'Es gibt vier Kostenpunkte: Die monatlichen Betreuungskosten laut Ihrem Angebot. Anreise und Abreise pauschal je 125 €. Kost und Logis, die Sie der Pflegekraft frei zur Verfügung stellen. Fällt der Einsatz in einen Sommermonat (Juli oder August), kommen 200 €/Monat (bzw. 6,67 €/Tag) Sommerzuschlag hinzu. An folgenden Feiertagen wird der doppelte Tagessatz berechnet: Karfreitag, Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1. + 2. Weihnachtstag, Silvester und Neujahr. Darüber hinaus gibt es keinerlei versteckte Kosten.' },
  /* Sachleistungs-Frage (Martin, 13.08.): kommt in Beratungen
     regelmäßig. Fachlich: 24h-Betreuung im Entsendemodell ist
     KEINE ambulante Pflegesachleistung (§ 36 SGB XI, zugelassenen
     Pflegediensten vorbehalten) — der Kunde nutzt die
     GELDleistungen (Pflegegeld u. a.). Bewusst ohne Beträge: die
     stehen personalisiert im Angebot unter „Alle Kosten im
     Überblick" (Block „Was bleibt für Sie übrig"). */
  { q: 'Kann ich die Pflegesachleistungen der Pflegekasse dafür einsetzen?', a: 'Nein — die 24-Stunden-Betreuung zählt nicht als Pflegesachleistung; diese sind zugelassenen ambulanten Pflegediensten vorbehalten. Sie nutzen stattdessen die Geldleistungen Ihrer Pflegekasse, allen voran das Pflegegeld. Welche Leistungen in Ihrer Situation zusammenkommen, sehen Sie in Ihrem Angebot unter „Alle Kosten im Überblick".' },
];

const SICHTBAR = 4;

export function FaqListe() {
  const [offen, setOffen] = useState<number | null>(null);
  const [alle, setAlle] = useState(false);
  const liste = alle ? FAQ : FAQ.slice(0, SICHTBAR);
  return (
    <section>
      <SectionHeader eyebrow="Gut zu wissen" titel="Häufige Fragen" />
      <div className="mt-3.5 border-b border-pm-line">
        {liste.map((item, i) => {
          const auf = offen === i;
          return (
            <div key={item.q} className="border-t border-pm-line">
              <button
                type="button"
                onClick={() => setOffen(auf ? null : i)}
                aria-expanded={auf}
                className="w-full min-h-[56px] flex items-center justify-between gap-3.5 py-4 text-left"
              >
                <span className={`text-[15.5px] font-bold leading-[1.35] ${auf ? 'text-pm-taupe-ink' : 'text-pm-ink'}`}>{item.q}</span>
                <span className={`w-7 h-7 rounded-full border flex items-center justify-center flex-none transition-colors ${auf ? 'bg-pm-taupe border-pm-taupe text-white' : 'bg-white border-pm-line text-pm-taupe'}`}>
                  <Plus className={`w-3.5 h-3.5 transition-transform ${auf ? 'rotate-45' : ''}`} strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
              {auf && (
                <div className="pb-5 -mt-1">
                  {typeof item.a === 'string'
                    ? <p className="text-[15px] leading-[1.7] text-pm-body whitespace-pre-line">{item.a}</p>
                    : item.a}
                </div>
              )}
            </div>
          );
        })}
        {!alle && FAQ.length > SICHTBAR && (
          <button
            type="button"
            onClick={() => setAlle(true)}
            className="w-full min-h-[56px] flex items-center justify-between gap-3.5 py-4 border-t border-pm-line text-left text-[15.5px] font-semibold text-pm-taupe-ink"
          >
            {FAQ.length - SICHTBAR} weitere Fragen
            <span className="w-7 h-7 rounded-full border border-pm-line bg-white flex items-center justify-center flex-none text-pm-taupe">
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
