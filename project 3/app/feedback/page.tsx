'use client';

import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';

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
// Kurzlink aus dem Google-Unternehmensprofil ("Mehr Rezensionen erhalten",
// Martin 26.08.2026). Geprueft: 200, leitet auf den Rezensions-Dialog des
// Eintrags. Google gibt diese Adresse nur dem eingeloggten Profil-Inhaber
// oder per kostenpflichtigem Places-Schluessel heraus — sie laesst sich
// nicht nachschlagen, deshalb steht sie hier fest.
const GOOGLE_REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL
  || 'https://g.page/r/Cc3Eo4E9lrdtEBI/review';

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

// Die beiden Zeichen als SVG — keine Fremd-Ressource, kein Nachladen.
function GoogleG() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function TrustpilotStern() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#00B67A" d="M12 1.6l3.1 7.05 7.65.62-5.8 5.02 1.75 7.48L12 17.83 5.3 21.77l1.75-7.48-5.8-5.02 7.65-.62z"/>
    </svg>
  );
}

// Ein Stil fuer beide: gleiches Gewicht, gleiche Groesse. Die Farbe kommt
// aus dem Zeichen, nicht aus der Flaeche — sonst kaempfen Google-Blau,
// Trustpilot-Gruen und das Primundus-Gold gegeneinander.
const KNOPF: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
  fontSize: 16.5, fontWeight: 600, padding: '16px 22px', borderRadius: 12,
  background: '#fff', border: '1px solid #DCDCE0', color: '#18181B',
  textDecoration: 'none', boxShadow: '0 1px 2px rgba(24,24,27,0.05)',
  transition: 'box-shadow .15s, border-color .15s, transform .15s',
};

const anheben = (e: MouseEvent<HTMLAnchorElement>) => {
  e.currentTarget.style.boxShadow = '0 4px 14px rgba(24,24,27,0.10)';
  e.currentTarget.style.borderColor = '#C4C4CA';
  e.currentTarget.style.transform = 'translateY(-1px)';
};
const ablegen = (e: MouseEvent<HTMLAnchorElement>) => {
  e.currentTarget.style.boxShadow = '0 1px 2px rgba(24,24,27,0.05)';
  e.currentTarget.style.borderColor = '#DCDCE0';
  e.currentTarget.style.transform = 'none';
};

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
                 alt="Testsieger — Service-Studie DIE WELT und ServiceValue"
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
              {/* Marken-Knoepfe statt zweier gleicher Farbbalken: das
                  Google-G und der Trustpilot-Stern sagen auf einen Blick,
                  wo man landet — das ist der eigentliche Grund zu klicken.
                  Heller Grund, feiner Rand, Farbe kommt allein aus den
                  Zeichen. (Martin, 26.08.2026: nicht in diesem Braun.) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                   onClick={() => melden('hilfreich', 'Google-Bewertung geöffnet')}
                   style={KNOPF} onMouseOver={anheben} onMouseOut={ablegen}>
                  <GoogleG />
                  <span>Bei Google bewerten</span>
                </a>
                <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                   onClick={() => melden('hilfreich', 'Trustpilot-Bewertung geöffnet')}
                   style={KNOPF} onMouseOver={anheben} onMouseOut={ablegen}>
                  <TrustpilotStern />
                  <span>Bei Trustpilot bewerten</span>
                </a>
              </div>
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
          {/* Auf dem Danke-Bildschirm stehen schon zwei grosse Knoepfe —
              dieser kleine Fussnoten-Link waere dort nur eine dritte
              Google-Wiederholung. Ueberall sonst bleibt er der oeffentliche
              Weg (auch fuer Unzufriedene — kein Filtern von Bewertungen). */}
          {GOOGLE_REVIEW_URL && antwort !== 'hilfreich' && (
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
