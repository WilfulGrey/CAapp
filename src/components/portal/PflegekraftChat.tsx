import { useState, useRef, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { X, Send, ShieldCheck, Globe } from 'lucide-react';
import type { Nurse } from '../../types';
import { displayName, initials } from './shared';
import { listChat, sendChat, markChatSeen, type ChatMessageDTO } from '../../lib/caregiverChat';

// ─── Prototyp: Chat mit der beworbenen Pflegekraft ───────────────────────────
// Freier Chat, ABER mit zwei Leitplanken (vom Kunden gefordert):
//   1. Keine Kontaktdaten (Telefon/E-Mail) und keine Gehalts-/Geldangaben —
//      solche Nachrichten werden NICHT gesendet (Schutz für beide Seiten,
//      Vergütung + Kontakt laufen ausschließlich über Primundus).
//   2. Nachrichten wirken direkt an die Pflegekraft, werden aber von Primundus
//      automatisch übersetzt (Deutsch ⇄ Polnisch) und sind fürs Team sichtbar.
// Dummy-Daten / simulierte Antworten — echte Anbindung (Mamamia) später.

type Sender = 'customer' | 'caregiver' | 'system';
interface ChatMessage {
  id: number;
  from: Sender;
  text: string;
  time?: string;
  translated?: boolean; // Pflegekraft-Nachricht aus dem Polnischen übersetzt
}

const SUGGESTIONS = [
  'Ab wann können Sie anreisen?',
  'Haben Sie Erfahrung mit Demenz?',
  'Sprechen Sie etwas Deutsch?',
  'Haben Sie einen Führerschein?',
  'Kochen Sie auch gerne?',
];

// Simulierte Antworten der Pflegekraft (Prototyp). Werden zufällig nach
// Index gewählt, damit kein Date/Random-Determinismus nötig ist.
const NURSE_REPLIES = [
  'Sehr gerne! Damit habe ich schon viel Erfahrung und gehe sehr geduldig vor. 🙂',
  'Ja, das passt gut für mich — ich freue mich auf die Aufgabe.',
  'Das kann ich Ihnen anbieten. Ich richte mich gern nach Ihren Wünschen.',
  'Vielen Dank für Ihre Frage! Ja, das ist überhaupt kein Problem.',
  'Natürlich. Ich koche gerne und kann mich auch an Diät-Wünsche halten.',
];

// Leitplanke: erkennt Kontaktdaten + Geld-/Gehaltsangaben.
function checkBlocked(text: string): 'kontakt' | 'geld' | null {
  // E-Mail
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return 'kontakt';
  // Telefon: 7+ Ziffern am Stück (nach Entfernen von Leerzeichen). Datums-
  // angaben wie "19.05.2026" bleiben unberührt (Punkte werden NICHT entfernt).
  if (/\d{7,}/.test(text.replace(/\s/g, ''))) return 'kontakt';
  // Geldbetrag mit Währung (kein \b nach €, da € kein Wortzeichen ist)
  if (/\d[\d.,]*\s*(?:€|eur|euro)/i.test(text)) return 'geld';
  // Gehalts-/Bezahl-Schlagworte (auch ohne Zahl)
  if (/(gehalt|lohn|bezahl|verdien|netto|brutto|schwarz|cash|bar\s*(zahl|geld))/i.test(text)) return 'geld';
  return null;
}

const BLOCK_MESSAGE: Record<'kontakt' | 'geld', string> = {
  kontakt: '🔒 Aus Sicherheitsgründen werden hier keine Kontaktdaten (Telefon/E-Mail) ausgetauscht. Den direkten Kontakt organisiert Primundus für Sie — Ihre Nachricht wurde nicht gesendet.',
  geld: '🔒 Fragen zu Gehalt oder Bezahlung klärt ausschließlich Primundus für Sie. Diese Nachricht wurde nicht gesendet.',
};

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : '';
}

function fromDTO(dto: ChatMessageDTO): ChatMessage {
  return { id: dto.id, from: dto.from, text: dto.text, time: fmtTime(dto.at), translated: dto.translated };
}

export const PflegekraftChat: FC<{
  nurse: Nurse;
  onClose: () => void;
  // Echt-Modus: mit Lead-Token wird gegen die caregiver-chat Edge-Function
  // gearbeitet (laden/senden/pollen). Ohne Token (Preview) bleibt es ein
  // Dummy-Chat mit simulierten Antworten.
  token?: string;
  applicationId?: number;
  caregiverId?: number;
}> = ({ nurse, onClose, token, applicationId, caregiverId }) => {
  const realMode = !!token;
  const vorname = nurse.name.split(' ')[0];
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  // Preview: Dummy-Begrüßung. Echt-Modus: leer starten, Verlauf via list laden.
  const [messages, setMessages] = useState<ChatMessage[]>(
    realMode
      ? []
      : [{
          id: 1,
          from: 'caregiver',
          text: `Guten Tag! Ich freue mich sehr über Ihr Interesse. Wenn Sie Fragen an mich haben, schreiben Sie mir gerne. 🙂`,
          time: nowHHMM(),
          translated: true,
        }],
  );
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(realMode);
  const [sending, setSending] = useState(false);
  const idRef = useRef(2);
  const replyRef = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Body-Scroll-Lock solange der Chat offen ist.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  // Echt-Modus: Verlauf laden + auf neue (übersetzte) Antworten pollen.
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const dtos = await listChat(token, applicationId);
      setMessages(dtos.map(fromDTO));
      // Alles aktuell Geladene gilt als gesehen → In-App Badge zurücksetzen.
      const maxId = dtos.reduce((mx, d) => Math.max(mx, d.id), 0);
      markChatSeen(token, applicationId, maxId);
    } catch (e) {
      console.error('listChat failed:', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, applicationId]);

  useEffect(() => {
    if (!realMode) return;
    refresh();
    const iv = setInterval(refresh, 8000);
    return () => clearInterval(iv);
  }, [realMode, refresh]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    // Client-Guardrail = sofortige UX; serverseitig nochmals autoritativ.
    const blocked = checkBlocked(text);
    if (blocked) {
      setMessages((m) => [...m, { id: idRef.current++, from: 'system', text: BLOCK_MESSAGE[blocked] }]);
      return; // Eingabe bleibt erhalten, damit der Kunde sie anpassen kann
    }

    if (realMode && token) {
      setDraft('');
      setSending(true);
      sendChat(token, text, applicationId, caregiverId)
        .then((res) => {
          if (res.ok) {
            setMessages((m) => [...m, fromDTO(res.message)]);
          } else {
            // Serverseitiger Guardrail hat zusätzlich geblockt.
            setMessages((m) => [...m, { id: idRef.current++, from: 'system', text: res.message }]);
          }
        })
        .catch((e) => {
          console.error('sendChat failed:', (e as Error).message);
          setMessages((m) => [...m, { id: idRef.current++, from: 'system', text: 'Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.' }]);
        })
        .finally(() => setSending(false));
      return;
    }

    // Preview/Dummy: simulierte Antwort der Pflegekraft nach kurzer Tippzeit.
    setMessages((m) => [...m, { id: idRef.current++, from: 'customer', text, time: nowHHMM() }]);
    setDraft('');
    setTyping(true);
    const reply = NURSE_REPLIES[replyRef.current % NURSE_REPLIES.length];
    replyRef.current += 1;
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: idRef.current++, from: 'caregiver', text: reply, time: nowHHMM(), translated: true }]);
    }, 1600);
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
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
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
            {/* Übersetzungs-Hinweis */}
            <div className="flex items-center gap-2 px-5 pb-3 text-[12px] text-gray-600">
              <Globe className="w-3.5 h-3.5 text-[#8B7355] flex-shrink-0" />
              <span>Nachrichten werden von Primundus automatisch übersetzt (Deutsch&nbsp;⇄&nbsp;Polnisch).</span>
            </div>
          </div>

          {/* Verlauf */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" style={{ background: '#FAFAF9' }}>
            {loading && (
              <div className="flex justify-center py-6">
                <svg className="w-5 h-5 animate-spin text-[#8B7355]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            )}
            {!loading && realMode && messages.length === 0 && (
              <div className="text-center text-[13px] text-gray-500 px-6 py-8 leading-relaxed">
                Stellen Sie {vorname} Ihre erste Frage — z.B. zur Anreise oder Erfahrung.
                <br />Wir übersetzen Ihre Nachricht und leiten sie weiter.
              </div>
            )}
            {messages.map((m) => {
              if (m.from === 'system') {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="max-w-[88%] rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-800 leading-relaxed text-center">
                      {m.text}
                    </div>
                  </div>
                );
              }
              const isCustomer = m.from === 'customer';
              return (
                <div key={m.id} className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isCustomer ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      isCustomer
                        ? 'bg-[#8B7355] text-white rounded-br-md'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                    }`}>
                      {m.text}
                    </div>
                    <div className={`flex items-center gap-1.5 mt-1 px-1 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                      {m.time && <span className="text-[10px] text-gray-400">{m.time}</span>}
                      {m.translated && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#8B7355]">
                          <Globe className="w-2.5 h-2.5" /> übersetzt
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {typing && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md shadow-sm px-4 py-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Vorschlags-Fragen */}
          <div className="flex-shrink-0 px-4 pt-2.5 pb-1 border-t border-gray-100 bg-white">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="flex-shrink-0 rounded-full border border-[#8B7355]/30 bg-[#F8F7F5] hover:bg-[#EBE2D5] text-[#6B5444] text-[12px] font-medium px-3 py-1.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Eingabe + Leitplanken-Hinweis */}
          <div className="flex-shrink-0 px-4 pt-1 pb-3 bg-white border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <span>Bitte keine Telefonnummern, E-Mails oder Gehaltsfragen — das klärt Primundus für Sie.</span>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}
                rows={1}
                placeholder={`Nachricht an ${vorname}…`}
                className="flex-1 resize-none border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 max-h-28"
              />
              <button
                onClick={() => send(draft)}
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
              Dieser Chat ist auch für Ihr Primundus-Betreuungsteam sichtbar.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
