'use client';

import { useEffect, useState } from 'react';

// Abmelde-Bestätigungsseite. Vom Abmelde-Link im Mail-Footer aufgerufen
// (/abmelden?token=...). Ruft /api/unsubscribe auf und zeigt das Ergebnis.
export default function AbmeldenPage() {
  const [status, setStatus] = useState<'loading' | 'done' | 'error' | 'notoken'>('loading');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setStatus('notoken');
      return;
    }
    fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => (r.ok ? setStatus('done') : setStatus('error')))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 520, width: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: '#3D2B1F', marginBottom: 16 }}>PRIMUNDUS</div>

        {status === 'loading' && (
          <p style={{ color: '#555', fontSize: 15 }}>Einen Moment, wir verarbeiten Ihre Abmeldung…</p>
        )}

        {status === 'done' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Sie wurden abgemeldet</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6 }}>
              Sie erhalten künftig keine weiteren automatischen E-Mails von uns zu Ihrer Anfrage.
              Wenn Sie weiterhin Unterstützung möchten, erreichen Sie uns jederzeit unter{' '}
              <a href="tel:+4989200000830" style={{ color: '#8B7355' }}>089&nbsp;200&nbsp;000&nbsp;830</a> oder{' '}
              <a href="mailto:info@primundus.de" style={{ color: '#8B7355' }}>info@primundus.de</a>.
            </p>
          </>
        )}

        {status === 'notoken' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Link unvollständig</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6 }}>
              Dieser Abmelde-Link ist unvollständig. Bitte öffnen Sie den Link direkt aus der E-Mail,
              oder schreiben Sie uns an <a href="mailto:info@primundus.de" style={{ color: '#8B7355' }}>info@primundus.de</a> —
              wir melden Sie dann manuell ab.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2D1F0F', marginBottom: 12 }}>Das hat nicht geklappt</h1>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.6 }}>
              Bei der Abmeldung ist etwas schiefgelaufen. Bitte schreiben Sie uns kurz an{' '}
              <a href="mailto:info@primundus.de" style={{ color: '#8B7355' }}>info@primundus.de</a> —
              wir melden Sie dann zuverlässig ab.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
