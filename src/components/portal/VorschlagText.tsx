// Freitext mit Vorschlägen zum Antippen (Martin 10.11.2026): „die Antworten angucken, die Kunden bisher gegeben haben …
// vereinheitlichen … als Vorauswahl … wenn man sie anklickt, dann kommen sie als Text einfach in dieses Textfeld rein … man
// sieht das Textfeld nicht … der Kunde kann das trotzdem noch vervollständigen“.
// Gespeichert wird wie bisher NUR der Text: Mapper, mamamia und SA-Portal bleiben unverändert, alte Freitexte bleiben stehen.
// Ein Vorschlag gilt als gewählt, solange er als eigener Abschnitt im Text steht (getrennt durch Komma, Semikolon oder neue
// Zeile; ein Punkt am Ende zählt nicht mit). Erneutes Antippen schneidet genau diesen Abschnitt heraus, der übrige Text des
// Kunden bleibt Zeichen für Zeichen stehen. Das Textfeld erscheint erst mit dem ersten Tipp (oder sobald Text da ist) und
// bleibt dann.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';

const TRENNER = /([,;\n])/;
const kern = (abschnitt: string) => abschnitt.trim().replace(/\.+$/, '').trim();
const gleich = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' }) === 0;

/** Ist der Vorschlag als eigener Abschnitt im Text? (Groß-/Kleinschreibung egal) */
export function enthaeltVorschlag(text: string, vorschlag: string): boolean {
  return text.split(TRENNER).some((teil, i) => i % 2 === 0 && gleich(kern(teil), vorschlag));
}

/** Vorschlag anhängen („…, Vorschlag“) oder, wenn er schon drinsteht, nur diesen Abschnitt samt einem Trenner herausnehmen. */
export function schalteVorschlag(text: string, vorschlag: string): string {
  const teile = text.split(TRENNER); // gerade Stellen = Abschnitte, ungerade = Trenner
  const i = teile.findIndex((teil, j) => j % 2 === 0 && gleich(kern(teil), vorschlag));
  if (i >= 0) {
    // Den Trenner davor mitnehmen, beim ersten Abschnitt den danach.
    const von = i > 0 ? i - 1 : i;
    const bis = i > 0 ? i : Math.min(i + 1, teile.length - 1);
    const rest = [...teile.slice(0, von), ...teile.slice(bis + 1)].join('');
    return rest.replace(/^[\s,;]+/, '').replace(/[\s,;]+$/, '');
  }
  const basis = text.replace(/[\s,;]+$/, '');
  return basis ? `${basis}, ${vorschlag}` : vorschlag;
}

/** Vorschläge ohne die, die gerade nicht passen (z. B. „Auto“ ohne Führerschein) — außer sie stehen schon im Text, damit der
 *  Kunde sie wieder herausnehmen kann. */
export function passendeVorschlaege(liste: readonly string[], text: string, unpassend: readonly string[]): string[] {
  return liste.filter((v) => !unpassend.includes(v) || enthaeltVorschlag(text, v));
}

export function VorschlagText({ wert, onWert, vorschlaege, name, feldKlasse, weiterText = 'Weiteres' }: {
  wert: string;
  onWert: (text: string) => void;
  /** Häufigste Antworten der Kunden, vereinheitlicht (Zählung siehe `VORSCHLAEGE`). */
  vorschlaege: readonly string[];
  /** Name des Textfelds für Vorleseprogramme (die Frage). */
  name: string;
  feldKlasse: string;
  weiterText?: string;
}) {
  const [offen, setOffen] = useState(() => wert.trim() !== '');
  const feld = useRef<HTMLTextAreaElement>(null);
  const fokus = useRef(false);
  // Kam Text von außen (Entwurf, Mamamia), bleibt das Feld offen, auch wenn der Kunde es danach leert.
  useEffect(() => { if (wert.trim() !== '') setOffen(true); }, [wert]);
  const zeigen = offen || wert.trim() !== '';
  // Feld wächst mit dem Text (eine Zeile, solange ein Vorschlag drinsteht), statt gleich zwei leere Zeilen zu zeigen;
  // auch nach dem Drehen des Handys neu messen.
  useLayoutEffect(() => {
    const el = feld.current;
    if (!el) return;
    const messen = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 3}px`; };
    messen();
    // Nach „Weiteres“ gleich zum Schreiben bereit.
    if (fokus.current) { fokus.current = false; el.focus(); }
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [wert, zeigen]);
  // Ohne Symbol in der Zeile und in beiden Zuständen gleich breit: drei kurze Vorschläge passen in eine Zeile, und eine Auswahl
  // schiebt nichts in die nächste. Gewählt wie die Auswahl-Chips: dunkler Rahmen, getönte Fläche, Haken als Abzeichen an der
  // Ecke. Hover nur mit Maus (sonst bleibt der Rahmen nach dem Tipp auf dem Handy halb markiert).
  const pille = 'relative inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-2.5 py-1.5 text-left text-[15px] font-medium leading-[1.25] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-taupe';
  const hover = '[@media(hover:hover)]:hover:border-pm-taupe-light';
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
              className={`${pille} ${an ? 'border-pm-taupe-ink bg-pm-taupe/[0.18] text-pm-ink' : `border-pm-chip bg-white text-pm-body ${hover}`}`}
            >
              {v}
              {an && (
                <span aria-hidden="true" className="absolute -right-1.5 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-pm-taupe-ink text-white ring-2 ring-white">
                  <Check className="h-3 w-3" strokeWidth={3.5} />
                </span>
              )}
            </button>
          );
        })}
        {!zeigen && (
          <button
            type="button"
            onClick={() => { fokus.current = true; setOffen(true); }}
            className={`${pille} border-dashed border-pm-chip bg-white text-pm-body ${hover}`}
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
          // Zeilenwechsel als Komma: Nach dem Absenden zeigt „Angaben ändern“ Nacht und Einkäufe in einem einzeiligen Feld,
          // das Umbrüche wegwirft („ToilettengangTrinken geben“). Prüfung vor dem Live-Gang 10.11.2026.
          onChange={(e) => onWert(e.target.value.replace(/[ \t]*\r?\n[\s]*/g, ', '))}
          aria-label={name}
          rows={1}
          className={`${feldKlasse} mt-2.5 resize-none overflow-hidden`}
        />
      )}
    </div>
  );
}

/** Vorschläge je Freitextfeld, aus den bisherigen Antworten der Kunden zusammengefasst (Prod, 166 gespeicherte Bögen, gezählt
 *  10.11.2026, nur Anzahlen ausgewertet) und in den Wörtern, die Kunden selbst schreiben und die der Pflegechecker
 *  (CG-App-Entwurf makieta-v59.html) und primundus.de benutzen; klein, was mitten im Satz klein steht („geduldig“, „zu Fuß“).
 *  Möglichst zwei Zeilen bei 390 px samt „Weiteres“ (Martin: „ohne dass es aufbläht“); alles andere schreibt der Kunde über
 *  „Weiteres“ dazu. Nichts, was eine eigene Frage schon abfragt (Demenz, Inkontinenz, Einkäufe, Mobilität, Rauchen), und
 *  nichts aus der Behandlungspflege (Medikamente geben, Spritzen, Katheter): das übernimmt ein Pflegedienst
 *  (primundus.de/leistungen, Mustervertrag Anlage 2). In Klammern: Nennungen. */
export const VORSCHLAEGE = {
  // 75 Antworten: Toilette 59, Beruhigen 5, Umlagern 5, Windel/Einlagen 3 (Trinken 3 → „Weiteres“).
  nacht: ['Toilettengang', 'Beruhigen', 'Umlagern', 'Einlagen wechseln'],
  // 91 Antworten: Herz 20 (davon Herzschwäche/-insuffizienz 14), Parkinson 14, Diabetes 14, Schlaganfall 5 (Bluthochdruck 6,
  // Osteoporose 3 → „Weiteres“; Demenz 12 = eigene Frage).
  diagnosen: ['Herzschwäche', 'Parkinson', 'Diabetes', 'Schlaganfall'],
  // 70 Antworten: Demenz-Erfahrung 31, geduldig/einfühlsam 18, ruhig 12, tierlieb 8 (kocht gern 7 → „Weiteres“).
  wuensche: ['Erfahrung mit Demenz', 'geduldig', 'ruhige Person', 'tierlieb'],
  // 78 Antworten: zu Fuß 39, Auto 37, Fahrrad 17, Bus/Bahn 14.
  einkaeufe: ['zu Fuß', 'Auto', 'Fahrrad', 'Bus & Bahn'],
  // 127 Antworten: Körperpflege 102, Kochen 92, Haushalt 67, Gesellschaft 42, Spaziergänge 27 (Wäsche 21, Arzt 16 →
  // „Weiteres“; Einkaufen 34 = eigene Frage).
  aufgaben: ['Körperpflege', 'Kochen', 'Haushalt', 'Gesellschaft leisten', 'Spaziergänge'],
} as const;
