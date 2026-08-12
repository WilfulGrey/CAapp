import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { X, Send, ShieldCheck, Clock } from 'lucide-react';
import type { Nurse } from '../../types';
import { displayName, initials } from './shared';

// ─── PflegekraftChat ─────────────────────────────────────────────────────────
//
// WICHTIG: trotz Komponenten-Name ist das KEIN klassischer Chat. Die
// Nachrichten gehen auf der anderen Seite via WhatsApp an die Pflegekraft;
// schnelle Hin- und Her-Fragmente würden WhatsApp-Spam-Detection triggern
// und die Pflegekraft mit Fragmenten zumüllen. Stattdessen: der Kunde
// schreibt EINE kompakte Nachricht, drückt manuell auf Senden, und sieht
// dann ein Warte-Panel statt eines weiteren Eingabefelds. Erst wenn die
// PK geantwortet hat, geht es weiter — der Kunde sieht den ganzen
// Verlauf und kann eine weitere Nachricht verfassen.
//
// Leitplanken (vom Kunden gefordert):
//   1. Keine Kontaktdaten (Telefon/E-Mail) und keine Gehalts-/Geldangaben —
//      solche Nachrichten werden NICHT gesendet (Schutz für beide Seiten,
//      Vergütung + Kontakt laufen ausschließlich über Primundus).
//   2. Nachrichten werden von Primundus automatisch übersetzt (Deutsch ⇄
//      Polnisch) und sind fürs Team sichtbar.
//
// Prototyp-Stand: die echte Anbindung an caregiver-chat (Edge Function)
// folgt in einem späteren PR — hier wird die Antwort der PK simuliert,
// damit man das Continuation-Verhalten im Preview testen kann.

type Sender = 'customer' | 'nurse';
interface Message {
  id: number;
  from: Sender;
  text: string;
  time: string;
  translated?: boolean;
}

// Leitplanke: erkennt Kontaktdaten + Geld-/Gehaltsangaben.
function checkBlocked(text: string): 'kontakt' | 'geld' | null {
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return 'kontakt';
  if (/\d{7,}/.test(text.replace(/\s/g, ''))) return 'kontakt';
  if (/\d[\d.,]*\s*(€|eur|euro)\b/i.test(text)) return 'geld';
  if (/(gehalt|lohn|bezahl|verdien|netto|brutto|schwarz|cash|bar\s*(zahl|geld))/i.test(text)) return 'geld';
  return null;
}

const BLOCK_MESSAGE: Record<'kontakt' | 'geld', string> = {
  kontakt: '🔒 Aus Sicherheitsgründen werden hier keine Kontaktdaten (Telefon/E-Mail) ausgetauscht. Den direkten Kontakt organisiert Primundus für Sie — Ihre Nachricht wurde nicht gesendet.',
  geld: '🔒 Fragen zu Gehalt oder Bezahlung klärt ausschließlich Primundus für Sie. Diese Nachricht wurde nicht gesendet.',
};

// Simulierte Antwort der PK (nur Preview — echtes Backend kommt später).
const SIMULATED_NURSE_REPLY = 'Vielen Dank für Ihre Nachricht. Ich melde mich gerne bei Ihnen zurück.';

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const PflegekraftChat: FC<{
  nurse: Nurse;
  onClose: () => void;
}> = ({ nurse, onClose }) => {
  const vorname = nurse.name.split(' ')[0];
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  // Verlauf der Konversation. Initial leer — erst wenn der Kunde
  // gesendet hat, erscheint seine Nachricht hier (zusammen mit ggf.
  // Antworten der PK). Kein Preview-Seed: das verfälscht die echte
  // Erstkontakt-UX.
  const [messages, setMessages] = useState<Message[]>([]);
  const idRef = useRef(1);

  // Eingabe-Default — bei der ERSTEN Nachricht "Hallo Maria,\n\n" als
  // höfliche Anrede vorbelegt. Bei Folge-Nachrichten (nach PK-Antwort)
  // starten wir mit leerem Feld, damit's nicht jedes Mal künstlich
  // begrüßend klingt.
  const [draft, setDraft] = useState(`Hallo ${vorname},\n\n`);
  const [blockReason, setBlockReason] = useState<'kontakt' | 'geld' | null>(null);

  // awaitingReply = der Kunde hat zuletzt geschrieben, jetzt warten wir
  // auf die PK. Eingabefeld ist während dieser Zeit ausgeblendet, damit
  // der Kunde keine WhatsApp-Spam-Kaskade lostritt.
  const lastMessage = messages[messages.length - 1];
  const awaitingReply = lastMessage?.from === 'customer';

  // Body-Scroll-Lock solange der Modal offen ist.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Verlauf scrollt nach unten, wenn neue Messages hinzukommen.
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const blocked = checkBlocked(text);
    if (blocked) {
      setBlockReason(blocked);
      return;
    }
    setBlockReason(null);
    setMessages(m => [...m, { id: idRef.current++, from: 'customer', text, time: nowHHMM() }]);
    setDraft('');
    // Simulierte PK-Antwort nach 1,8s (nur Preview / Prototyp).
    setTimeout(() => {
      setMessages(m => [...m, {
        id: idRef.current++,
        from: 'nurse',
        text: SIMULATED_NURSE_REPLY,
        time: nowHHMM(),
        translated: true,
      }]);
    }, 1800);
    // TODO: echte Anbindung an caregiver-chat (Edge-Function) hier einhängen.
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }} />
      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl h-[92dvh] sm:h-[88dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0" style={{ backgroundColor: `${nurse.color}12` }}>
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex-shrink-0">
                {nurse.image ? (
                  <img src={nurse.image} alt={nurse.name} className="w-11 h-11 rounded-full object-cover border-2 border-white shadow" />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-white shadow"
                    style={{ backgroundColor: nurse.color }}>{inits}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 leading-tight">{name}</p>
                <p className="text-xs text-gray-500">Pflegekraft · {nurse.experience}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm flex-shrink-0">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Verlauf — nur wenn schon Nachrichten existieren */}
          {messages.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" style={{ background: '#F5F5F6' }}>
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    m.from === 'customer'
                      ? 'bg-[#8B7355] text-white rounded-br-md'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                  }`}>
                    <p className="text-[14px] whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    <div className={`flex items-center gap-2 mt-1.5 ${m.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[10px] ${m.from === 'customer' ? 'text-white/70' : 'text-gray-400'}`}>{m.time}</span>
                      {m.translated && (
                        <span className="text-[10px] text-[#8B7355]">übersetzt</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          {/* Eingabe ODER Warte-Panel — nie beides gleichzeitig */}
          {awaitingReply ? (
            <div className="flex-shrink-0 px-5 py-5 bg-[#F5F5F6] border-t border-gray-200">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#EBE2D5] flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-[#8B7355]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#3D2B1F] mb-1">
                    Ihre Nachricht wurde gesendet
                  </p>
                  <p className="text-[13px] text-gray-600 leading-relaxed">
                    {vorname} antwortet schnellstmöglich. Wir benachrichtigen Sie per E-Mail, sobald die Antwort da ist.
                  </p>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Erste Nachricht: ausführliche Compose-UI (Titel + Hinweis +
               großes Feld + "Hallo Maria,"-Prefill). Soll den Kunden bewusst
               auf "eine kompakte Nachricht" einstellen statt Chat-Pingen. */
            <div className="flex-1 overflow-y-auto px-5 py-5 bg-white">
              <p className="text-[13px] font-semibold text-[#3D2B1F] mb-1">
                Ihre Nachricht an {vorname}
              </p>
              <p className="text-[12px] text-gray-500 mb-3 leading-relaxed">
                Bitte fassen Sie Ihr Anliegen in einer kompakten Nachricht — so kann {vorname} gezielt antworten.
              </p>
              <textarea
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (blockReason) setBlockReason(null); }}
                rows={8}
                placeholder={`z.B. „Ich wollte Sie fragen, ob …"`}
                className="w-full resize-none border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10"
              />
              {blockReason && (
                <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-800 leading-relaxed">
                  {BLOCK_MESSAGE[blockReason]}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                <span>Keine Telefonnummern, E-Mails oder Gehaltsfragen — das klärt Primundus für Sie.</span>
              </div>
              <button
                onClick={send}
                disabled={!draft.trim()}
                className={`mt-4 w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-semibold transition-colors ${
                  draft.trim() ? 'bg-[#8B7355] hover:bg-[#766145] text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
                Frage senden
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                Die Nachricht wird automatisch übersetzt und ist auch für Ihr Primundus-Betreuungsteam sichtbar.
              </p>
            </div>
          ) : (
            /* Folge-Nachrichten: kompakte Chat-Eingabe (Feld + Senden-Icon).
               Kein Compose-Hint, kein Re-Prefill — der Kunde ist im Thread.
               Per Send geht weiterhin EINE WhatsApp-Nachricht raus, danach
               greift wieder der Warte-Lock — kein Spam-Risiko trotz Chat-Look. */
            <div className="flex-shrink-0 px-4 pt-3 pb-3 bg-white border-t border-gray-100">
              {blockReason && (
                <div className="mb-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-800 leading-relaxed">
                  {BLOCK_MESSAGE[blockReason]}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); if (blockReason) setBlockReason(null); }}
                  rows={1}
                  placeholder={`Nachricht an ${vorname}…`}
                  className="flex-1 resize-none border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 max-h-32"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim()}
                  aria-label="Senden"
                  className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    draft.trim() ? 'bg-[#8B7355] hover:bg-[#766145] text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                Übersetzt &amp; für Ihr Primundus-Betreuungsteam sichtbar.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
