'use client';

import { useEffect, useState } from 'react';
import { grundAus, KEIN_INTERESSE_GRUENDE, type KeinInteresseGrund } from '@/lib/kein-interesse';

// Ziel der Knöpfe „Aktuell nicht" und „Doch nicht relevant" in der Abschiedsmail
// (nachfass_3, Registry #72): /kein-interesse?token=…&grund=aktuell-nicht|nicht-relevant.
// Erst der Klick auf „Ja, keine E-Mails mehr" schickt die Anfrage ab — Mail-
// Scanner öffnen Links von selbst und dürfen nichts auslösen.
type Stand = 'laden' | 'frage' | 'sende' | 'fertig' | 'fehler' | 'ohne-token';

const linkStil = { color: '#8B7355' };

export default function KeinInteressePage() {
  const [stand, setStand] = useState<Stand>('laden');
  const [token, setToken] = useState('');
  const [grund, setGrund] = useState<KeinInteresseGrund | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('token');
    setGrund(grundAus(p.get('grund')));
    if (!t) {
      setStand('ohne-token');
      return;
    }
    setToken(t);
    setStand('frage');
  }, []);

  const bestaetigen = () => {
    setStand('sende');
    fetch('/api/kein-interesse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, grund }),
    })
      .then((r) => setStand(r.ok ? 'fertig' : 'fehler'))
      .catch(() => setStand('fehler'));
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 520, width: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: '#3D2B1F', marginBottom: 16 }}>PRIMUNDUS</div>

        {(stand === 'frage' || stand === 'sende') && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Keine E-Mails mehr?</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              {grund ? <>Sie haben „{KEIN_INTERESSE_GRUENDE[grund]}“ gewählt. </> : null}
              Wenn Sie bestätigen, schicken wir Ihnen zu Ihrer Anfrage keine E-Mails mehr.
            </p>
            <button
              type="button"
              onClick={bestaetigen}
              disabled={stand === 'sende'}
              style={{ minHeight: 48, padding: '12px 28px', borderRadius: 999, border: 'none', background: '#8B7355', color: '#fff', fontSize: 16, fontWeight: 600, cursor: stand === 'sende' ? 'default' : 'pointer', opacity: stand === 'sende' ? 0.6 : 1 }}
            >
              {stand === 'sende' ? 'Einen Moment …' : 'Ja, keine E-Mails mehr'}
            </button>
            <p style={{ color: '#777', fontSize: 14, lineHeight: 1.6, marginTop: 24 }}>
              Doch noch eine Frage? Rufen Sie uns an:{' '}
              <a href="tel:+4989200000830" style={linkStil}>089&nbsp;200&nbsp;000&nbsp;830</a>
            </p>
          </>
        )}

        {stand === 'fertig' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Erledigt</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6 }}>
              Wir schicken Ihnen keine E-Mails mehr. Wenn Sie später doch Unterstützung brauchen, erreichen Sie uns unter{' '}
              <a href="tel:+4989200000830" style={linkStil}>089&nbsp;200&nbsp;000&nbsp;830</a> oder{' '}
              <a href="mailto:info@primundus.de" style={linkStil}>info@primundus.de</a>.
            </p>
          </>
        )}

        {stand === 'ohne-token' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Link unvollständig</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6 }}>
              Bitte öffnen Sie den Link direkt aus der E-Mail oder schreiben Sie uns an{' '}
              <a href="mailto:info@primundus.de" style={linkStil}>info@primundus.de</a>.
            </p>
          </>
        )}

        {stand === 'fehler' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Das hat nicht geklappt</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6 }}>
              Bitte schreiben Sie uns kurz an{' '}
              <a href="mailto:info@primundus.de" style={linkStil}>info@primundus.de</a> oder rufen Sie an:{' '}
              <a href="tel:+4989200000830" style={linkStil}>089&nbsp;200&nbsp;000&nbsp;830</a>. Wir tragen es dann von Hand ein.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
