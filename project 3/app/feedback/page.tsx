'use client';

import { useEffect, useState } from 'react';

// Rückmeldungs-Seite nach dem Angebot (/feedback?token=...).
//
// Aufgerufen aus der Bewertungs-Mail. Zwei Schritte, bewusst getrennt
// (gleiche Logik wie AngebotsFeedback im Portal): erst EINE Frage mit
// drei Antworten, danach erst das Detail. Fragt man beides gleichzeitig,
// springen Leute ab — und dann fehlt auch das erste, eigentlich wertvolle
// Signal.
//
// Was der Kunde bewertet, ist genau der Unterschied, den wir überall
// herausstellen: Preis UND Betreuungskräfte sehen, bevor irgendein Vertrag
// zustande kommt (Martins Wortlaut, 19.08.2026).
//
// Nach „hilfreich" bieten wir den Google-Bewertungslink an, nach „teils"
// oder „nein" ein Freitextfeld an Marta. Entscheidung Martin, 19.08.2026,
// bewusst und im Wissen darum, dass Google das Vorschalten einer Frage in
// seinen Bewertungsrichtlinien untersagt. Wer nach „teils"/„nein" trotzdem
// öffentlich schreiben will, findet den Weg über die Fußzeile — das kostet
// nichts und nimmt der Sache die Spitze.

type Antwort = 'hilfreich' | 'teils' | 'nein';

// Bewertungsziele stehen BEWUSST hart im Code und nicht in einer
// Umgebungsvariable.
//
// Vorher hingen beide an NEXT_PUBLIC_*. In Render war keine davon gesetzt,
// also war jede leer, beide Knoepfe verschwanden — und die Seite zeigte
// ein Dankeschoen voellig ohne Handlung. Genau an der Stelle, an der die
// Bewertungsmail den Kunden gerade um eine Bewertung gebeten hat. Der
// Ausfall war lautlos: keine Fehlermeldung, nur eine Seite, die fertig
// aussah. Gemeldet 26.08.2026, bestand seit dem Start des Funnels.
//
// NEXT_PUBLIC_* darf weiterhin ueberschreiben (z. B. fuer Staging), aber
// nie mehr der einzige Weg zu einer Adresse sein.
// Geprueft 26.08.2026: /evaluate/… antwortet 200 (Trustpilot-Schreibseite).
const TRUSTPILOT_REVIEW_URL = process.env.NEXT_PUBLIC_TRUSTPILOT_REVIEW_URL
  || 'https://de.trustpilot.com/evaluate/primundus.de';
// TODO Google: Martin muss sagen, WELCHES der drei Google-Profile die
// Bewertungen sammeln soll. Bis dahin traegt Trustpilot den Funnel allein.
const GOOGLE_REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || '';

const FARBE = {
  grund: '#F4F1EC',
  karte: '#FFFFFF',
  text: '#18181B',
  leise: '#71717A',
  rand: '#E9E9EB',
  randStark: '#D4D4D8',
  akzent: '#8B7355',
  akzentDunkel: '#6B5444',
  gut: '#22A06B',
} as const;

const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

export default function FeedbackSeite() {
  const [token, setToken] = useState<string | null>(null);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [text, setText] = useState('');
  const [gesendet, setGesendet] = useState(false);
  const [sendet, setSendet] = useState(false);

  const melden = (a: Antwort, detail?: string) => {
    // Token direkt aus der URL statt aus dem State: Beim Sprung aus der Mail
    // laeuft melden() im selben Durchlauf wie setToken — der State waere noch leer.
    const tk = token ?? new URLSearchParams(window.location.search).get('token');
    fetch('/api/lead-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tk,
        event: 'bewertungs_feedback',
        metadata: { feedback_answer: a, feedback_detail: detail || undefined },
      }),
    }).catch(() => {});
  };

  // Die Frage steht bereits in der Mail — wer dort klickt, kommt mit ?a=…
  // direkt im passenden Schritt an und muss nicht zweimal antworten.
  // Ohne den Parameter (Link weitergeleitet, Lesezeichen) zeigt die Seite
  // die Frage selbst, damit sie nie ins Leere läuft.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setToken(p.get('token'));
    const a = p.get('a');
    if (a === 'hilfreich' || a === 'teils' || a === 'nein') {
      setAntwort(a);
      melden(a);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jede Antwort wird sofort gemeldet — auch wenn der Kunde danach abbricht.
  // Der erste Tap ist die Information, auf die es ankommt.

  const waehlen = (a: Antwort) => {
    setAntwort(a);
    melden(a);
  };

  const absenden = () => {
    setSendet(true);
    melden(antwort!, text.trim());
    setTimeout(() => { setGesendet(true); setSendet(false); }, 400);
  };

  return (
    <main style={{ minHeight: '100vh', background: FARBE.grund, display: 'flex',
                   alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
                   fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 620, width: '100%' }}>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {/* transparente Fassung — das Header-Logo hat weissen Grund und
              saesse auf der grauen Flaeche als sichtbarer Kasten */}
          <img src="/images/primundus-logo-transparent.png" alt="Primundus"
               width={240} height={42} style={{ height: 38, width: 'auto' }} />
        </div>

        <div style={{ background: FARBE.karte, borderRadius: 20, border: `1px solid ${FARBE.rand}`,
                      boxShadow: '0 8px 30px rgba(61,43,31,0.08), 0 2px 6px rgba(61,43,31,0.04)',
                      padding: '30px 38px 34px' }}>

          {/* Marta gross und ohne Rahmen: Es soll aussehen, als schaue sie
              einen an — nicht wie ein Profilbildchen in einem Formular.
              Das Siegel steht klein daneben, ohne die Zeile zu beherrschen. */}
          <div style={{ display: 'flex', alignItems: 'flex-start',
                        justifyContent: 'space-between', gap: 18, marginBottom: 22 }}>
            {/* Die Quelle ist 320x480 (Hochformat). In ein Quadrat mit
                objectFit:'cover' gezwungen und mittig beschnitten faellt der
                Kopf oben heraus (gemeldet 26.08.2026). Ein Hochformat-Rahmen
                plus Beschnitt nach oben zeigt Gesicht und Schultern ganz. */}
            <img src="/images/marta-kapcio.jpg" alt="Marta Kapcio"
                 style={{ width: 96, height: 122, borderRadius: 16, objectFit: 'cover',
                          objectPosition: '50% 14%', flexShrink: 0 }} />
            <img src="/images/primundus_testsieger-2021.webp"
                 alt="Testsieger — Service-Studie DIE WELT und ServiceValue 2021"
                 style={{ height: 72, width: 'auto', flexShrink: 0, opacity: 0.9 }} />
          </div>

          {!antwort && (
            <>
              <h1 style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.25, fontWeight: 600,
                           color: FARBE.text, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
                War das für Sie hilfreich?
              </h1>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: FARBE.leise, margin: '0 0 22px' }}>
                Sie konnten bei uns den Preis sehen und die passenden Betreuungskräfte —
                bevor Sie sich festlegen mussten. Ich würde gern wissen, ob Ihnen
                das etwas gebracht hat.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {([
                  ['hilfreich', 'Ja, das war hilfreich'],
                  ['teils', 'Teilweise'],
                  ['nein', 'Nein, eher nicht'],
                ] as [Antwort, string][]).map(([wert, label]) => (
                  <button key={wert} onClick={() => waehlen(wert)}
                    style={{ fontSize: 17, padding: '17px 20px', borderRadius: 13, textAlign: 'left',
                             border: `1px solid ${FARBE.randStark}`, background: '#fff',
                             color: FARBE.text, cursor: 'pointer', transition: 'background .15s' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#F4F4F5')}
                    onMouseOut={(e) => (e.currentTarget.style.background = '#fff')}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {antwort === 'hilfreich' && !gesendet && (
            <>
              <h1 style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.25, fontWeight: 600,
                           color: FARBE.text, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
                Vielen Dank!
              </h1>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: FARBE.leise, margin: '0 0 24px' }}>
                {GOOGLE_REVIEW_URL
                  ? 'Mögen Sie uns kurz bei Google oder Trustpilot bewerten? '
                  : 'Mögen Sie uns kurz bei Trustpilot bewerten? '}
                Damit helfen Sie uns und anderen Familien bei ihrer Suche.
              </p>
              {GOOGLE_REVIEW_URL && (
                <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                   onClick={() => melden('hilfreich', 'Google-Bewertung geöffnet')}
                   style={{ display: 'block', textAlign: 'center', fontSize: 17.5, fontWeight: 700,
                            padding: '18px 22px', borderRadius: 13, background: FARBE.akzent,
                            boxShadow: '0 2px 8px rgba(139,115,85,0.28)',
                            color: '#fff', textDecoration: 'none', marginBottom: 11 }}>
                  Bei Google bewerten
                </a>
              )}
              {/* Ohne Google-Adresse traegt Trustpilot die Hauptrolle und
                  bekommt die Akzentfarbe — sonst stuende hier ein blasser
                  Zweitknopf ganz allein. */}
              <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                 onClick={() => melden('hilfreich', 'Trustpilot-Bewertung geöffnet')}
                 style={GOOGLE_REVIEW_URL
                   ? { display: 'block', textAlign: 'center', fontSize: 17, fontWeight: 600,
                       padding: '17px 22px', borderRadius: 13, background: '#fff',
                       border: `1px solid ${FARBE.randStark}`,
                       color: FARBE.text, textDecoration: 'none' }
                   : { display: 'block', textAlign: 'center', fontSize: 17.5, fontWeight: 700,
                       padding: '18px 22px', borderRadius: 13, background: FARBE.akzent,
                       boxShadow: '0 2px 8px rgba(139,115,85,0.28)',
                       color: '#fff', textDecoration: 'none' }}>
                Bei Trustpilot bewerten
              </a>
            </>
          )}

          {(antwort === 'teils' || antwort === 'nein') && !gesendet && (
            <>
              <h1 style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.25, fontWeight: 600,
                           color: FARBE.text, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
                Was können wir besser machen?
              </h1>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: FARBE.leise, margin: '0 0 18px' }}>
                Ihre Antwort liest niemand außer mir — und daraus lernen wir am meisten.
              </p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
                placeholder="Was hat gefehlt oder war unklar?"
                style={{ width: '100%', fontSize: 16.5, lineHeight: 1.55, padding: '15px 16px',
                         borderRadius: 13, border: `1px solid ${FARBE.randStark}`,
                         color: FARBE.text, fontFamily: 'inherit', resize: 'vertical',
                         boxSizing: 'border-box' }} />
              <button onClick={absenden} disabled={sendet}
                style={{ width: '100%', marginTop: 12, fontSize: 17.5, fontWeight: 700,
                         padding: '18px 22px', borderRadius: 13, border: 0,
                         background: text.trim() ? FARBE.akzent : FARBE.randStark,
                         boxShadow: text.trim() ? '0 2px 8px rgba(139,115,85,0.28)' : 'none',
                         color: '#fff', cursor: sendet ? 'default' : 'pointer' }}>
                {sendet ? 'Wird gesendet …' : 'An Marta senden'}
              </button>
              <button onClick={() => setGesendet(true)}
                style={{ width: '100%', marginTop: 8, fontSize: 14.5, padding: '9px',
                         background: 'none', border: 0, color: FARBE.leise, cursor: 'pointer' }}>
                Überspringen
              </button>

              {/* Bewertungswege bleiben auch hier offen und normal gross —
                  wer trotzdem oeffentlich schreiben will, soll das koennen. */}
              {(GOOGLE_REVIEW_URL || TRUSTPILOT_REVIEW_URL) && (
                <div style={{ marginTop: 26, paddingTop: 22, borderTop: `1px solid ${FARBE.rand}` }}>
                  <p style={{ fontSize: 15.5, lineHeight: 1.6, color: FARBE.leise, margin: '0 0 13px' }}>
                    Sie können uns auch öffentlich bewerten:
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {GOOGLE_REVIEW_URL && (
                      <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                         onClick={() => melden(antwort!, 'Google-Bewertung geöffnet')}
                         style={{ flex: '1 1 180px', textAlign: 'center', fontSize: 16, fontWeight: 600,
                                  padding: '15px 18px', borderRadius: 13, background: '#fff',
                                  border: `1px solid ${FARBE.randStark}`, color: FARBE.text,
                                  textDecoration: 'none' }}>
                        Bei Google bewerten
                      </a>
                    )}
                    {TRUSTPILOT_REVIEW_URL && (
                      <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                         onClick={() => melden(antwort!, 'Trustpilot-Bewertung geöffnet')}
                         style={{ flex: '1 1 180px', textAlign: 'center', fontSize: 16, fontWeight: 600,
                                  padding: '15px 18px', borderRadius: 13, background: '#fff',
                                  border: `1px solid ${FARBE.randStark}`, color: FARBE.text,
                                  textDecoration: 'none' }}>
                        Bei Trustpilot bewerten
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Unterschrift wie unter einem Brief — steht in der Karte, nicht
              darunter, sonst sieht sie nach verrutschtem Element aus. */}
          {!gesendet && (
            <p style={{ fontFamily: SERIF, fontSize: 17, color: FARBE.text,
                        margin: '24px 0 0', paddingTop: 18,
                        borderTop: `1px solid ${FARBE.rand}` }}>
              Marta Kapcio
              <span style={{ display: 'block', fontSize: 13.5, color: FARBE.leise,
                             marginTop: 2, fontFamily: 'inherit' }}>Primundus</span>
            </p>
          )}

          {gesendet && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#E3F7EF',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                     stroke={FARBE.gut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: FARBE.text, margin: '0 0 8px' }}>
                Vielen Dank.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: FARBE.leise, margin: 0 }}>
                Ihre Rückmeldung ist bei uns angekommen.
              </p>
            </div>
          )}
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.6, color: FARBE.leise,
                    margin: '16px 0 0' }}>
          Sie erreichen mich jederzeit direkt:{' '}
          <a href="mailto:info@primundus.de" style={{ color: FARBE.akzent }}>info@primundus.de</a>
          {GOOGLE_REVIEW_URL && (
            <>
              {' · '}
              <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                 style={{ color: FARBE.leise }}>Öffentlich bewerten</a>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
