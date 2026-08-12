import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { X } from 'lucide-react';

// Rückmeldung zum Angebot — als schwebende Frage von Ilka, unten rechts.
//
// Warum überhaupt: Ob ein Kunde noch im Rennen ist, erfahren wir sonst gar
// nicht oder erst spät und geraten. Er selbst weiß es in dem Moment, in dem er
// Preis und Pflegekräfte gesehen hat.
//
// Warum schwebend statt im Fluss (Martin, 12.08.): Als Kasten unter dem
// Formular saß die Frage ~3000 px weit unten — gesehen hat sie fast niemand.
// Und mit Ilkas Gesicht ist es keine Umfrage mehr, sondern ein Mensch, der
// fragt; das beantwortet man eher.
//
// Wortlaut: Martins eigener (Passt nicht / Vielleicht später / Interessant).
// Ein Zwischenstand fragte nach der SITUATION statt nach dem Angebot („Wie
// sieht es bei Ihnen aus?") — theoretisch ehrlicher zu beantworten, praktisch
// zu vage: Der Kunde weiß nicht, worauf sich die Frage bezieht (Martin,
// 12.08.: „die erste Frage ist komisch"). Die Frage nennt jetzt ihren
// Gegenstand, und die drei Antworten passen wörtlich darauf.
//
// Die Rückfrage kommt ERST nach der ersten Antwort und ist überspringbar.
// Fragt man das „warum" gleich mit, springen Leute ab — und dann fehlt auch
// das erste Signal, das eigentlich wertvolle.

export type FeedbackAnswer = 'passt_nicht' | 'spaeter' | 'loslegen';

const GRUENDE = ['Zu teuer', 'Pflegekräfte passen nicht', 'Doch ein Heim', 'Anders gelöst'];
const ZEITPUNKTE = ['In 2–4 Wochen', 'In 1–3 Monaten', 'Noch unklar'];

const PHONE_HREF = 'tel:+4989200000830';
const WHATSAPP_HREF = 'https://wa.me/4989200000830';

const chip =
  'text-[15px] px-3.5 py-2 rounded-full border transition-colors text-left ' +
  'border-[#D4D4D8] bg-white text-[#3F3F46] hover:bg-[#EFEFF1] active:scale-[0.98]';

export const AngebotsFeedback: FC<{
  /** Rückmeldung melden. `endgueltig=false` beim ersten Tap: nur aufzeichnen,
   *  keine Team-Mail. `endgueltig=true` genau EINMAL am Ende — nach dem Detail,
   *  nach „Überspringen" oder beim Wegklicken. So bekommt das Team eine Mail
   *  pro Kunde statt zwei, und eine abgebrochene Rückmeldung geht trotzdem
   *  nicht verloren. */
  onAnswer: (answer: FeedbackAnswer, detail: string | undefined, endgueltig: boolean) => void;
  /** Springt ins Formular (gleiches Ziel wie „Pflegesituation beschreiben ↓"). */
  onGoToForm: () => void;
  /** Wegklicken — der Aufrufer blendet die Blase dann für die Sitzung aus. */
  onDismiss: () => void;
}> = ({ onAnswer, onGoToForm, onDismiss }) => {
  const [answer, setAnswer] = useState<FeedbackAnswer | null>(null);
  const [done, setDone] = useState(false);
  // Erst zusammengeklappt: nur Ilka + ein Satz. Wer sofort ein Formular ins
  // Bild geschoben bekommt, klickt es weg, ohne es gelesen zu haben.
  const [offen, setOffen] = useState(false);

  // Nach der Antwort kurz bestätigen, dann von selbst verschwinden — der
  // Kunde soll die Blase nicht noch wegräumen müssen.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDismiss, 2600);
    return () => clearTimeout(t);
  }, [done, onDismiss]);

  // Genau EIN endgültiges Melden pro Sitzung — sonst löst „Detail wählen"
  // und danach das automatische Schließen zwei Mails aus.
  const abgeschlossen = useRef(false);
  const abschliessen = (a: FeedbackAnswer, d?: string) => {
    if (abgeschlossen.current) return;
    abgeschlossen.current = true;
    onAnswer(a, d, true);
  };

  const pick = (a: FeedbackAnswer) => {
    setAnswer(a);
    // Still: sichert die Antwort, falls der Kunde jetzt abbricht.
    onAnswer(a, undefined, false);
  };

  const detail = (d: string) => {
    if (answer) abschliessen(answer, d);
    setDone(true);
  };

  // Überspringen oder Wegklicken NACH einer Antwort ist auch ein Abschluss —
  // ohne das bliebe es bei der stillen Aufzeichnung und das Team erführe nie
  // davon.
  const schliessen = () => {
    if (answer) abschliessen(answer);
    onDismiss();
  };

  // Vertippt? Zurueck zu den drei Antworten (Martin, 12.08.). Das bereits
  // gesendete Event bleibt stehen — es wird nicht dedupliziert, die spaetere
  // Antwort ueberschreibt sie fachlich. Eine Korrektur zu verschlucken waere
  // schlimmer als ein Eintrag zu viel.
  const zurueck = (
    <button
      type="button"
      onClick={() => setAnswer(null)}
      className="text-[14px] underline underline-offset-2"
      style={{ color: '#A1A1AA' }}
    >
      ← Zurück
    </button>
  );

  // ── Zusammengeklappt: Gesicht + ein Satz ──────────────────────────────
  if (!offen) {
    return (
      <div className="fixed z-40 right-4 bottom-4 left-4 sm:left-auto sm:max-w-[330px] flex justify-end"
           style={{ animation: 'fadeIn 0.25s ease-out' }}>
        <div className="flex items-end gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setOffen(true)}
            className="flex-1 sm:flex-none flex items-center gap-3 rounded-2xl pl-2 pr-3 py-2 text-left shadow-lg transition-transform active:scale-[0.98]"
            style={{ background: '#FFFFFF', border: '1px solid #D4D4D8' }}
          >
            <img src="/ilka.webp" alt="" className="w-11 h-11 rounded-full object-cover object-top flex-shrink-0 border border-[#E9E9EB]" />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold leading-tight" style={{ color: '#18181B' }}>
                Was sagen Sie zum Angebot?
              </span>
              <span className="block text-[12.5px] leading-tight mt-0.5" style={{ color: '#8B7355' }}>
                Ilka · kurze Antwort hilft
              </span>
            </span>
          </button>
          {/* Wegklicken muss ohne Umweg gehen — sonst ist die Blase eine Falle. */}
          <button
            type="button"
            onClick={schliessen}
            aria-label="Nicht jetzt"
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md"
            style={{ background: '#FFFFFF', border: '1px solid #D4D4D8' }}
          >
            <X className="w-4 h-4" style={{ color: '#71717A' }} />
          </button>
        </div>
      </div>
    );
  }

  const Rahmen: FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="fixed z-40 inset-x-4 bottom-4 sm:inset-x-auto sm:right-4 sm:w-[360px]"
         style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}>
      <div className="rounded-2xl px-5 py-4 shadow-2xl" style={{ background: '#FFFFFF', border: '1px solid #D4D4D8' }}>
        <div className="flex items-start gap-3 mb-3">
          <img src="/ilka.webp" alt="" className="w-10 h-10 rounded-full object-cover object-top flex-shrink-0 border border-[#E9E9EB]" />
          <p className="text-[12.5px] leading-tight flex-1 pt-1" style={{ color: '#8B7355' }}>
            Ilka Wysocki · Ihre Beraterin
          </p>
          <button
            type="button"
            onClick={schliessen}
            aria-label="Schließen"
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#F5F5F6' }}
          >
            <X className="w-4 h-4" style={{ color: '#71717A' }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  if (done) {
    return (
      <Rahmen>
        <p className="text-[15px] leading-relaxed" style={{ color: '#18181B' }}>
          Danke, das hilft mir weiter.
        </p>
      </Rahmen>
    );
  }

  // ── Zweig „loslegen": KEIN Fragebogen, sondern der nächste Schritt ─────
  // Wer gerade Ja gesagt hat, bekommt keine Umfrage. Anrufen und WhatsApp
  // stehen als leise Zeile darunter, nicht als gleichwertige Knöpfe —
  // vier Buttons nebeneinander wären ein Menü, kein Abschluss.
  if (answer === 'loslegen') {
    return (
      <Rahmen>
        {/* „Freut mich" — sie hat gefragt, sie darf sich auch freuen.
            Ohne das setzt die Antwort direkt mit einer Aufgabe ein.
            „Infos zur Pflegesituation" statt „die Pflegesituation" (Martin,
            12.08.): Es fehlt eine Auskunft, nicht ein Zustand. */}
        <p className="text-[16px] font-bold mb-1.5" style={{ color: '#18181B' }}>
          Freut mich! Dann fehlen nur noch Infos zur Pflegesituation.
        </p>
        {/* Kurz und leicht (Martin, 12.08.: „zu technisch"). Draußen sind
            „Angaben aus dem Kostenrechner übernommen" und die Minutenzahl —
            das erste beschreibt unser System, nicht seinen Nutzen, das
            zweite erledigt „kurz" schon. Übrig bleibt, was er tun soll und
            was danach passiert. */}
        <p className="text-[15px] leading-relaxed mb-4" style={{ color: '#71717A' }}>
          Kurz Situation und Wünsche beschreiben, dann bewerben sich passende
          Pflegekräfte bei Ihnen — unverbindlich.
        </p>
        <button
          type="button"
          onClick={() => { abschliessen('loslegen'); onGoToForm(); onDismiss(); }}
          className="w-full py-3 text-[16px] font-bold rounded-xl bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-sm transition-colors"
        >
          Jetzt vervollständigen →
        </button>
        <p className="text-[15px] mt-3" style={{ color: '#71717A' }}>
          Lieber zusammen mit mir?{' '}
          <a href={PHONE_HREF} className="font-semibold underline underline-offset-2" style={{ color: '#8B7355' }}>Anrufen</a>
          {' '}oder{' '}
          <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2" style={{ color: '#8B7355' }}>WhatsApp</a>
        </p>
        <div className="mt-3">{zurueck}</div>
      </Rahmen>
    );
  }

  // ── Rückfragen zu den beiden anderen Zweigen ──────────────────────────
  if (answer) {
    const frage = answer === 'passt_nicht' ? 'Danke. Woran liegt es?' : 'Wann soll ich mich wieder melden?';
    const optionen = answer === 'passt_nicht' ? GRUENDE : ZEITPUNKTE;
    return (
      <Rahmen>
        <p className="text-[16px] font-bold mb-3" style={{ color: '#18181B' }}>{frage}</p>
        <div className="flex flex-wrap gap-2">
          {optionen.map(o => (
            <button key={o} type="button" onClick={() => detail(o)} className={chip}>{o}</button>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3">
          {zurueck}
          <button
            type="button"
            onClick={() => { if (answer) abschliessen(answer); setDone(true); }}
            className="text-[14px] underline underline-offset-2"
            style={{ color: '#A1A1AA' }}
          >
            Überspringen
          </button>
        </div>
      </Rahmen>
    );
  }

  // ── Aufgeklappt, noch keine Antwort ───────────────────────────────────
  return (
    <Rahmen>
      <p className="text-[16px] font-bold mb-1" style={{ color: '#18181B' }}>
        Was sagen Sie zu unserem Angebot?
      </p>
      {/* Nimmt die Sorge, dass daraus ein Fragebogen wird — das ist die
          eigentliche Hemmschwelle beim ersten Tap. Und es spricht ILKA:
          neben ihrem Gesicht klang „Eine Antwort genügt" wie ein Automat
          (Martin, 12.08.: „nicht menschlich verständlich"). */}
      <p className="text-[15px] mb-4" style={{ color: '#71717A' }}>Eine kurze Antwort hilft mir weiter.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => pick('passt_nicht')} className={chip}>Passt nicht</button>
        <button type="button" onClick={() => pick('spaeter')} className={chip}>Vielleicht später</button>
        <button
          type="button"
          onClick={() => pick('loslegen')}
          className={chip + ' !border-[#8B7355] !text-[#6B5444] font-semibold'}
        >
          Interessant
        </button>
      </div>
    </Rahmen>
  );
};
