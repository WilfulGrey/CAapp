'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { GARANTIE } from '@/lib/kraefte-vorschau';
import { PORTAL_BASIS } from '@/lib/portal-url';
import {
  ANLAESSE,
  knopfAus,
  PREIS_ANLAESSE,
  SPAETER_ANLAESSE,
  WANN,
  type Anlass,
  type Knopf,
  type Wann,
} from '@/lib/rueckmeldung';

// Ziel der drei Knöpfe der Abschiedsmail (nachfass_3, Registry #72):
// /rueckmeldung?token=…&knopf=interesse|aktuell-nicht|nicht-relevant.
// Martin 15.09.: „sehr leicht, jemanden zu verlieren … warum bieten wir nichts
// an … was bedeutet später … Abbestellen negativer darstellen". Deshalb:
// „später" = Termin wählen, „nicht relevant" = Grund + passendes Angebot,
// Abmelden nur als kleiner grauer Link. Jede Aktion erst per Klick (POST),
// nie beim Aufruf — Mail-Scanner öffnen Links von selbst.

type Stand =
  | 'laden' | 'ohne-token' | 'fehler'
  | 'interesse' | 'wann' | 'grund'
  | 'garantie' | 'spaeter' | 'freitext'
  | 'pausiert' | 'rueckruf-ok' | 'abgemeldet';

const TELEFON = '089\u00a0200\u00a0000\u00a0830'; // geschützte Leerzeichen: die Nummer bricht nie um
const TEL_HREF = 'tel:+4989200000830';
const WHATSAPP = `https://wa.me/4989200000830?text=${encodeURIComponent('Hallo Marta, hier ist mein Vergleichsangebot für die Bestpreisgarantie.')}`;
const MAIL_ANGEBOT = `mailto:info@primundus.de?subject=${encodeURIComponent('Bestpreisgarantie – Vergleichsangebot')}`;

const braun = '#8B7355';
const stil = {
  h1: { fontSize: 22, fontWeight: 700, color: '#2D1F0F', margin: '0 0 12px', lineHeight: 1.3 } as CSSProperties,
  p: { color: '#555', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' } as CSSProperties,
  klein: { color: '#777', fontSize: 14, lineHeight: 1.6, margin: '16px 0 0' } as CSSProperties,
  primaer: { display: 'block', width: '100%', minHeight: 48, padding: '12px 20px', borderRadius: 999, border: 'none', background: braun, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 10, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' } as CSSProperties,
  sekundaer: { display: 'block', width: '100%', minHeight: 48, padding: '12px 20px', borderRadius: 999, border: `1.5px solid ${braun}`, background: '#fff', color: braun, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 10, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' } as CSSProperties,
  option: { display: 'block', width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 12, border: '1.5px solid #E2DCD3', background: '#fff', color: '#2D1F0F', fontSize: 15, cursor: 'pointer', marginBottom: 8, textAlign: 'left', boxSizing: 'border-box' } as CSSProperties,
  abmelden: { background: 'none', border: 'none', padding: '8px 0', color: '#9A9A9A', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' } as CSSProperties,
  box: { background: '#FAF7F0', borderRadius: 12, padding: '16px', margin: '20px 0 0', textAlign: 'left' } as CSSProperties,
  link: { color: braun } as CSSProperties,
};

export default function RueckmeldungPage() {
  const [stand, setStand] = useState<Stand>('laden');
  const [token, setToken] = useState('');
  const [knopf, setKnopf] = useState<Knopf | null>(null);
  const [anlass, setAnlass] = useState<Anlass | null>(null);
  const [datumText, setDatumText] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('token');
    const k = knopfAus(p.get('knopf'));
    setKnopf(k);
    if (!t) return setStand('ohne-token');
    setToken(t);
    setStand(k === 'interesse' ? 'interesse' : k === 'aktuell-nicht' ? 'wann' : 'grund');
  }, []);

  const senden = async (aktion: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const r = await fetch('/api/rueckmeldung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, knopf, aktion, ...extra }),
      });
      if (!r.ok) {
        setStand('fehler');
        return null;
      }
      return await r.json().catch(() => ({}));
    } catch {
      setStand('fehler');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pausieren = async (wann: Wann) => {
    const r = await senden('pausieren', { wann, anlass, text });
    if (!r) return;
    setDatumText(typeof r.datumText === 'string' ? r.datumText : '');
    setStand('pausiert');
  };
  const stoppen = async (mitAnlass: Anlass | null, mitText = '') => {
    if (await senden('stoppen', { anlass: mitAnlass, text: mitText })) setStand('abgemeldet');
  };
  const rueckruf = async () => {
    if (await senden('rueckruf')) setStand('rueckruf-ok');
  };
  const grundWaehlen = (a: Anlass) => {
    setAnlass(a);
    if (PREIS_ANLAESSE.has(a)) {
      setStand('garantie');
      // Team soll anrufen, solange noch nicht unterschrieben ist. Die Seite
      // bleibt auch dann stehen, wenn diese Meldung hakt.
      fetch('/api/rueckmeldung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, knopf, aktion: 'grund', anlass: a }),
      }).catch(() => {});
    } else if (SPAETER_ANLAESSE.has(a)) setStand('spaeter');
    else if (a === 'anderer-grund') setStand('freitext');
    else stoppen(a);
  };

  const Abmelden = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <p style={{ margin: '18px 0 0' }}>
      <button type="button" style={stil.abmelden} onClick={onClick} disabled={busy}>{label}</button>
    </p>
  );
  const Taste = ({ children, onClick, zweit }: { children: ReactNode; onClick: () => void; zweit?: boolean }) => (
    <button type="button" style={{ ...(zweit ? stil.sekundaer : stil.primaer), opacity: busy ? 0.6 : 1 }} onClick={onClick} disabled={busy}>{children}</button>
  );
  const RueckrufBox = () => (
    <div style={stil.box}>
      <p style={{ ...stil.p, margin: '0 0 12px', fontSize: 14 }}>
        <strong style={{ color: '#2D1F0F' }}>Lieber gleich sprechen?</strong> Marta beantwortet Ihre Fragen zu Kosten, Zuschüssen und Ablauf.
      </p>
      <Taste zweit onClick={rueckruf}>Rückruf anfordern</Taste>
    </div>
  );

  let inhalt: ReactNode = null;
  switch (stand) {
    case 'laden':
      inhalt = <p style={stil.p}>Einen Moment …</p>;
      break;
    case 'interesse':
      inhalt = (
        <>
          <h1 style={stil.h1}>Schön! Wie machen wir weiter?</h1>
          <p style={stil.p}>Im Kundenportal sehen Sie Ihr Angebot und die Pflegekräfte, die zu Ihnen passen. Oder Marta ruft Sie an.</p>
          <a style={stil.primaer} href={`${PORTAL_BASIS}/?token=${encodeURIComponent(token)}`}>Pflegekräfte ansehen</a>
          <Taste zweit onClick={rueckruf}>Rückruf anfordern</Taste>
          <p style={stil.klein}>Oder rufen Sie an: <a href={TEL_HREF} style={stil.link}>{TELEFON}</a></p>
        </>
      );
      break;
    case 'wann':
      inhalt = (
        <>
          <h1 style={stil.h1}>Wann dürfen wir uns wieder melden?</h1>
          <p style={stil.p}>Sagen Sie uns, wann es besser passt. Bis dahin schicken wir Ihnen keine Erinnerungen.</p>
          {(Object.keys(WANN) as Wann[]).map((w) => (
            <Taste key={w} onClick={() => pausieren(w)}>{WANN[w].label}</Taste>
          ))}
          <RueckrufBox />
          <Abmelden label="Kein Interesse mehr? Hier abmelden" onClick={() => setStand('grund')} />
        </>
      );
      break;
    case 'grund':
      inhalt = (
        <>
          <h1 style={stil.h1}>Schade. Was hat sich geändert?</h1>
          <p style={stil.p}>Ein Klick genügt. Ihre Antwort hilft uns, besser zu werden.</p>
          <div style={{ textAlign: 'left' }}>
            {(Object.keys(ANLAESSE) as Anlass[]).map((a) => (
              <button key={a} type="button" style={stil.option} onClick={() => grundWaehlen(a)} disabled={busy}>{ANLAESSE[a]}</button>
            ))}
          </div>
          <Abmelden label="Ohne Angabe abmelden" onClick={() => stoppen(null)} />
        </>
      );
      break;
    case 'garantie':
      inhalt = (
        <>
          {anlass === 'anderer-anbieter' && <p style={{ ...stil.p, margin: '0 0 6px', fontWeight: 600, color: braun }}>Noch nicht unterschrieben?</p>}
          <h1 style={stil.h1}>{GARANTIE.titel}</h1>
          <p style={stil.p}>{GARANTIE.zusage} {GARANTIE.ablauf}</p>
          <a style={stil.primaer} href={WHATSAPP} target="_blank" rel="noopener noreferrer">Angebot per WhatsApp</a>
          <a style={stil.sekundaer} href={MAIL_ANGEBOT}>Angebot per E-Mail</a>
          <p style={stil.klein}><a href="/bestpreisgarantie" style={stil.link}>{GARANTIE.aufklappen}</a></p>
          <Abmelden label="Nein danke, abmelden" onClick={() => stoppen(anlass)} />
        </>
      );
      break;
    case 'spaeter':
      inhalt = (
        <>
          <h1 style={stil.h1}>Sollen wir uns in 3 Monaten melden?</h1>
          <p style={stil.p}>
            {anlass === 'familie' ? 'Falls es zu viel wird, springen wir ein.' : 'Falls sich etwas ändert.'} Eine Anreise ist schon in 3 Tagen möglich.
          </p>
          <Taste onClick={() => pausieren('3m')}>Ja, in 3 Monaten</Taste>
          <Abmelden label="Nein danke, abmelden" onClick={() => stoppen(anlass)} />
        </>
      );
      break;
    case 'freitext':
      inhalt = (
        <>
          <h1 style={stil.h1}>Was hat sich geändert?</h1>
          <p style={stil.p}>Freiwillig, aber es hilft uns sehr.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={1000}
            aria-label="Was hat sich geändert?"
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1.5px solid #E2DCD3', padding: 12, fontSize: 15, fontFamily: 'inherit', marginBottom: 12 }}
          />
          <Taste zweit onClick={() => pausieren('3m')}>Lieber in 3 Monaten noch einmal melden</Taste>
          <Abmelden label="Absenden und abmelden" onClick={() => stoppen('anderer-grund', text)} />
        </>
      );
      break;
    case 'pausiert':
      inhalt = datumText ? (
        <>
          <h1 style={stil.h1}>Gut, wir melden uns am {datumText}.</h1>
          <p style={stil.p}>Bis dahin schicken wir Ihnen keine Erinnerungen. Ihr Angebot bleibt gespeichert.</p>
          <p style={stil.klein}>Wird es früher dringend? Eine Anreise ist schon in 3 Tagen möglich: <a href={TEL_HREF} style={stil.link}>{TELEFON}</a></p>
        </>
      ) : (
        <>
          <h1 style={stil.h1}>Danke für Ihre Nachricht.</h1>
          <p style={stil.p}>Marta meldet sich bei Ihnen. Sie erreichen uns auch unter <a href={TEL_HREF} style={stil.link}>{TELEFON}</a>.</p>
        </>
      );
      break;
    case 'rueckruf-ok':
      inhalt = (
        <>
          <h1 style={stil.h1}>Danke, Marta ruft Sie an.</h1>
          <p style={stil.p}>Sie möchten nicht warten? Rufen Sie an: <a href={TEL_HREF} style={stil.link}>{TELEFON}</a></p>
        </>
      );
      break;
    case 'abgemeldet':
      inhalt = anlass === 'nicht-mehr-noetig' ? (
        <>
          <h1 style={stil.h1}>Danke für Ihre Rückmeldung.</h1>
          <p style={stil.p}>Wir schicken Ihnen keine E-Mails mehr. Alles Gute für Sie und Ihre Familie.</p>
        </>
      ) : (
        <>
          <h1 style={stil.h1}>Schade, dass es nicht gepasst hat.</h1>
          <p style={stil.p}>Sie sind abgemeldet und bekommen keine E-Mails mehr von uns. Wenn sich etwas ändert, erreichen Sie uns unter <a href={TEL_HREF} style={stil.link}>{TELEFON}</a>.</p>
        </>
      );
      break;
    case 'ohne-token':
      inhalt = (
        <>
          <h1 style={stil.h1}>Link unvollständig</h1>
          <p style={stil.p}>Bitte öffnen Sie den Link direkt aus der E-Mail oder schreiben Sie uns an <a href="mailto:info@primundus.de" style={stil.link}>info@primundus.de</a>.</p>
        </>
      );
      break;
    case 'fehler':
      inhalt = (
        <>
          <h1 style={stil.h1}>Das hat nicht geklappt</h1>
          <p style={stil.p}>Bitte rufen Sie uns an: <a href={TEL_HREF} style={stil.link}>{TELEFON}</a>, oder schreiben Sie an <a href="mailto:info@primundus.de" style={stil.link}>info@primundus.de</a>. Wir tragen es dann von Hand ein.</p>
        </>
      );
      break;
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '36px 28px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: '#3D2B1F', marginBottom: 16 }}>PRIMUNDUS</div>
        {inhalt}
      </div>
    </main>
  );
}
