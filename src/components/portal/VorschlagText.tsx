// Freitext mit Vorschlägen zum Antippen (Martin 10.11.2026): „die Antworten angucken, die Kunden bisher gegeben haben …
// vereinheitlichen … als Vorauswahl … wenn man sie anklickt, dann kommen sie als Text einfach in dieses Textfeld rein … man
// sieht das Textfeld nicht … der Kunde kann das trotzdem noch vervollständigen“.
// Gespeichert wird wie bisher NUR der Text: Mapper, mamamia und SA-Portal bleiben unverändert, alte Freitexte bleiben stehen.
// Ein Vorschlag gilt als gewählt, solange er als eigener, durch Komma getrennter Eintrag im Text steht; erneutes Antippen
// nimmt ihn wieder heraus. Das Textfeld erscheint erst mit dem ersten Tipp (oder wenn schon Text da ist) und bleibt dann.
import { useLayoutEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

const eintraege = (text: string) => text.split(',').map((t) => t.trim()).filter(Boolean);
const gleich = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' }) === 0;

/** Ist der Vorschlag als eigener Eintrag im Text? (Groß-/Kleinschreibung egal) */
export function enthaeltVorschlag(text: string, vorschlag: string): boolean {
  return eintraege(text).some((e) => gleich(e, vorschlag));
}

/** Vorschlag anhängen („…, Vorschlag“) oder, wenn er schon drinsteht, herausnehmen. */
export function schalteVorschlag(text: string, vorschlag: string): string {
  if (enthaeltVorschlag(text, vorschlag)) return eintraege(text).filter((e) => !gleich(e, vorschlag)).join(', ');
  const basis = text.replace(/[\s,]+$/, '');
  return basis ? `${basis}, ${vorschlag}` : vorschlag;
}

export function VorschlagText({ wert, onWert, vorschlaege, name, platzhalter, feldKlasse, weiterText = 'Weiteres' }: {
  wert: string;
  onWert: (text: string) => void;
  /** Häufigste Antworten der Kunden, vereinheitlicht (Zählung siehe `VORSCHLAEGE`). */
  vorschlaege: readonly string[];
  /** Name des Textfelds für Vorleseprogramme (die Frage). */
  name: string;
  platzhalter?: string;
  feldKlasse: string;
  weiterText?: string;
}) {
  const [offen, setOffen] = useState(() => wert.trim() !== '');
  const feld = useRef<HTMLTextAreaElement>(null);
  const fokus = useRef(false);
  const zeigen = offen || wert.trim() !== '';
  // Feld wächst mit dem Text (eine Zeile, solange ein Vorschlag drinsteht), statt gleich zwei leere Zeilen zu zeigen.
  useLayoutEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 3}px`;
    // Nach „Weiteres“ gleich zum Schreiben bereit.
    if (fokus.current) { fokus.current = false; el.focus(); }
  }, [wert, zeigen]);
  // Ohne Symbol und in beiden Zuständen gleich breit: drei kurze Vorschläge passen in eine Zeile, und eine Auswahl schiebt
  // nichts in die nächste Zeile. Gewählt = dunkler Rahmen und getönte Fläche wie die Auswahl-Chips.
  const pille = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-2.5 py-1.5 text-left text-[15px] font-medium leading-[1.25] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe';
  return (
    <div data-vorschlag-text>
      <div className="flex flex-wrap gap-2">
        {vorschlaege.map((v) => {
          const an = enthaeltVorschlag(wert, v);
          return (
            <button
              key={v}
              type="button"
              aria-pressed={an}
              onClick={() => { setOffen(true); onWert(schalteVorschlag(wert, v)); }}
              className={`${pille} ${an ? 'border-pm-taupe-ink bg-pm-taupe/[0.18] text-pm-ink' : 'border-pm-chip bg-white text-pm-body hover:border-pm-taupe-light'}`}
            >
              {v}
            </button>
          );
        })}
        {!zeigen && (
          <button
            type="button"
            onClick={() => { fokus.current = true; setOffen(true); }}
            className={`${pille} border-dashed border-pm-chip bg-white text-pm-body hover:border-pm-taupe-light`}
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5 flex-none text-pm-muted" strokeWidth={2.5} />
            {weiterText}
          </button>
        )}
      </div>
      {zeigen && (
        <textarea
          ref={feld}
          value={wert}
          onChange={(e) => onWert(e.target.value)}
          aria-label={name}
          placeholder={platzhalter}
          rows={1}
          className={`${feldKlasse} mt-2.5 resize-none overflow-hidden`}
        />
      )}
    </div>
  );
}

/** Vorschläge je Freitextfeld, aus den bisherigen Antworten der Kunden zusammengefasst (Prod, 166 gespeicherte Bögen, gezählt
 *  10.11.2026, nur Anzahlen ausgewertet) und in den Wörtern, die Kunden selbst schreiben und die der Pflegechecker
 *  (CG-App-Entwurf makieta-v59.html) und primundus.de benutzen. Höchstens zwei Zeilen bei 390 px samt „Weiteres“ (Martin:
 *  „ohne dass es aufbläht“); alles andere schreibt der Kunde über „Weiteres“ dazu. Nichts, was eine eigene Frage schon
 *  abfragt (Demenz, Inkontinenz, Einkäufe, Mobilität), und nichts aus der Behandlungspflege (Medikamente geben, Spritzen,
 *  Katheter): das übernimmt ein Pflegedienst (primundus.de/leistungen, Mustervertrag Anlage 2). In Klammern: Nennungen. */
export const VORSCHLAEGE = {
  // 75 Antworten: Toilette 59, Beruhigen 5, Umlagern 5, Windel/Einlagen 3 (Trinken 3 → „Weiteres“).
  nacht: ['Toilettengang', 'Beruhigen', 'Umlagern', 'Einlagen wechseln'],
  // 91 Antworten: Herz 20, Parkinson 14, Diabetes 14, Osteoporose/Sturz 8, Schlaganfall 5 (Demenz 12 = eigene Frage).
  diagnosen: ['Herzschwäche', 'Parkinson', 'Diabetes', 'Schlaganfall', 'Osteoporose'],
  // 70 Antworten: Demenz-Erfahrung 31, geduldig/einfühlsam 18, ruhig 12, tierlieb 8 (kocht gern 7 → „Weiteres“).
  wuensche: ['Erfahrung mit Demenz', 'Geduldig', 'Ruhig', 'Tierlieb'],
  // 78 Antworten: zu Fuß 39, Auto 37, Fahrrad 17, Bus/Bahn 14.
  einkaeufe: ['Zu Fuß', 'Auto', 'Fahrrad', 'Bus & Bahn'],
  // 127 Antworten: Körperpflege 102, Kochen 92, Haushalt 67, Gesellschaft 42, Spaziergänge 27 (Wäsche 21, Arzt 16 →
  // „Weiteres“; Einkaufen 34 = eigene Frage).
  aufgaben: ['Körperpflege', 'Kochen', 'Haushalt', 'Gesellschaft', 'Spaziergänge'],
} as const;
