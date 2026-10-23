// „Passt Ihnen das Angebot?" — die Entscheidung direkt unter der Kostenkarte (Martin 25.09.2026:
// „nach dem Angebot sollte der Kunde gefragt werden, ob ihm das Angebot zusagt und dann verbindlich
// Bewerbungen anfragen durch Ausfüllen der Patientendaten").
//
// Ersetzt die schwebende Blase `AngebotsFeedback` (12.08.) und den Kasten „Noch 2 Minuten". Die
// Antworten und ihre Meldung bleiben dieselben: Event `angebots_feedback` mit
// `passt_nicht | spaeter | loslegen`. Der erste Tap auf „Später"/„Passt nicht" geht STILL raus
// (sichert die Antwort, falls der Kunde abbricht), die Team-Mail hängt am endgültigen Aufruf,
// der genau einmal kommt (Martin, 12.08.: „eine, nicht zwei").
//
// Wer schon geantwortet hat (Stempel `pm_feedback_<token>`, Ruhezeit wie bei der Blase), sieht
// nicht noch einmal die Frage, sondern nur den Weg zu den Bewerbungen.
import { useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EYEBROW } from '../ui/SectionHeader';
import { BERATERIN, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';

export type FeedbackAnswer = 'passt_nicht' | 'spaeter' | 'loslegen';

export const GRUENDE = ['Zu teuer', 'Pflegekräfte passen nicht', 'Doch ein Heim', 'Anders gelöst'];
export const ZEITPUNKTE = ['In 2–4 Wochen', 'In 1–3 Monaten', 'Noch unklar'];

const auswahl =
  'min-h-[44px] px-4 rounded-full border-[1.5px] border-pm-chip bg-white text-[15px] text-pm-body ' +
  'hover:border-pm-taupe-light transition-colors text-left';

export function AngebotFrage({
  beantwortet, onAnswer, onAnfragen, onErledigt, onBestpreis,
}: {
  /** Schon geantwortet (Stempel in der Ruhezeit) → nur der Weg zu den Bewerbungen. */
  beantwortet: boolean;
  /** `endgueltig=false`: nur aufzeichnen, keine Team-Mail. `true`: genau einmal am Ende. */
  onAnswer: (answer: FeedbackAnswer, detail: string | undefined, endgueltig: boolean) => void;
  /** Springt ins Formular („Ja, Bewerbungen erhalten"). */
  onAnfragen: () => void;
  /** Antwort abgeschlossen → Stempel setzen. */
  onErledigt: () => void;
  /** „Zu teuer" → Bestpreisgarantie zeigen. */
  onBestpreis: () => void;
}) {
  const [answer, setAnswer] = useState<FeedbackAnswer | null>(null);
  const [fertig, setFertig] = useState<{ answer: FeedbackAnswer; detail?: string } | null>(null);
  // Endgültig gemeldete Antwort. Dieselbe Antwort geht nur einmal raus (eine Team-Mail),
  // ein Umentscheiden („Passt nicht" → „Doch Bewerbungen erhalten") wird gemeldet — eine
  // Korrektur zu verschlucken wäre schlimmer als ein Eintrag zu viel (Martin, 12.08.).
  const gemeldet = useRef<FeedbackAnswer | null>(null);

  const abschliessen = (a: FeedbackAnswer, d?: string) => {
    if (gemeldet.current !== a) {
      if (gemeldet.current === null) onErledigt();
      gemeldet.current = a;
      onAnswer(a, d, true);
    }
    setFertig({ answer: a, detail: d });
  };

  const ja = () => { abschliessen('loslegen'); onAnfragen(); };
  const waehle = (a: FeedbackAnswer) => { setAnswer(a); onAnswer(a, undefined, false); };

  // „Bewerbungen erhalten" statt „anfragen" (Martin 26.09.): der Knopf nennt, was der Kunde
  // bekommt. Kein „Suche starten": passende Pflegekräfte zeigen wir ja schon.
  const anfragenKnopf = (
    <Button breit onClick={ja} className="px-2 whitespace-nowrap">Ja, Bewerbungen erhalten</Button>
  );
  const linkKlasse = 'inline-flex min-h-[44px] items-center font-semibold text-pm-taupe-ink underline underline-offset-4';

  // Schon beantwortet (frühere Sitzung) oder gerade „Ja": nur noch der Weg nach vorn.
  if ((beantwortet && !answer && !fertig) || fertig?.answer === 'loslegen') {
    return (
      <Card className="p-5">
        <p className={EYEBROW}>Ihre Bewerbungen</p>
        <p className="mt-1.5 text-[19px] font-extrabold leading-[1.25] text-pm-ink">Bewerbungen erhalten</p>
        <p className="mt-2 mb-4 text-[14.5px] leading-[1.5] text-pm-muted">
          Beschreiben Sie in 2 Minuten die Pflegesituation. Dann bewerben sich passende Pflegekräfte bei Ihnen.
        </p>
        <Button breit onClick={onAnfragen} className="px-2 whitespace-nowrap">Zur Pflegesituation</Button>
      </Card>
    );
  }

  if (fertig) {
    const zuTeuer = fertig.detail === 'Zu teuer';
    return (
      <Card className="p-5">
        <p className="text-[16px] font-bold text-pm-ink">Danke für Ihre Rückmeldung.</p>
        {zuTeuer ? (
          <p className="mt-2 text-[14.5px] leading-[1.5] text-pm-muted">
            Haben Sie ein günstigeres, vergleichbares Angebot? Dann gilt unsere{' '}
            <button type="button" onClick={onBestpreis} className={linkKlasse}>Bestpreisgarantie</button>.
          </p>
        ) : (
          <p className="mt-2 text-[14.5px] leading-[1.5] text-pm-muted">
            Fragen beantwortet {BERATERIN} gern:{' '}
            <a href={TELEFON_HREF} className={linkKlasse}>Anrufen</a>{' '}oder{' '}
            <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" className={linkKlasse}>WhatsApp</a>.
          </p>
        )}
        <div className="mt-4">
          <Button breit variante="sekundaer" onClick={ja} className="px-2 whitespace-nowrap">Doch Bewerbungen erhalten</Button>
        </div>
      </Card>
    );
  }

  // Rückfrage zu „Vielleicht später" / „Passt nicht" — überspringbar.
  if (answer) {
    const frage = answer === 'passt_nicht' ? 'Woran liegt es?' : 'Wann passt es Ihnen besser?';
    const optionen = answer === 'passt_nicht' ? GRUENDE : ZEITPUNKTE;
    return (
      <Card className="p-5">
        <p className="text-[17px] font-bold text-pm-ink">{frage}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {optionen.map(o => (
            <button key={o} type="button" onClick={() => abschliessen(answer, o)} className={auswahl}>{o}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-5">
          {/* Vertippt? Zurück zu den drei Antworten (Martin, 12.08.). */}
          <button type="button" onClick={() => setAnswer(null)} className={linkKlasse}>Zurück</button>
          <button type="button" onClick={() => abschliessen(answer)} className={linkKlasse}>Überspringen</button>
        </div>
      </Card>
    );
  }

  return (
    <Card ton="hervorgehoben" className="p-5">
      <p className={EYEBROW}>Ihre Entscheidung</p>
      <p className="mt-1.5 text-[21px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink">Passt Ihnen das Angebot?</p>
      <p className="mt-2 mb-4 text-[14.5px] leading-[1.5] text-pm-muted">
        Dann beschreiben Sie in 2 Minuten die Pflegesituation, vieles ist schon ausgefüllt. Danach
        bewerben sich passende Pflegekräfte bei Ihnen, mit Foto, Erfahrung, Anreisetermin und Preis.
      </p>
      {anfragenKnopf}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Button variante="sekundaer" groesse="sm" onClick={() => waehle('spaeter')} className="px-2 whitespace-nowrap">Vielleicht später</Button>
        <Button variante="sekundaer" groesse="sm" onClick={() => waehle('passt_nicht')} className="px-2 whitespace-nowrap">Passt nicht</Button>
      </div>
    </Card>
  );
}
