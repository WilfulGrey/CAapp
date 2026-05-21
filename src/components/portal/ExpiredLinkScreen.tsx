import { useState, type FC } from 'react';
import { AlertCircle, Mail, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { KOSTENRECHNER_URL } from '../../lib/leadEvents';

// Rendered when fetchLeadByToken returns null/error in CustomerPortalPage —
// usually means token expired (14-day TTL) or, less commonly, the token
// doesn't exist at all (random URL / typo). The token-present case offers
// the customer a CTA to send themselves a fresh magic-link via the
// kostenrechner /api/lead-regenerate-token endpoint. The token-missing
// case (no ?token=… in URL) falls back to the contact-the-team prompt.

type RegenStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'sent'; maskedEmail: string }
  | { kind: 'error'; code: 'unknown_token' | 'lead_closed' | 'network' | 'unknown' };

interface RegenResponse {
  masked_email: string;
  sent: boolean;
  deduped?: boolean;
}

export const ExpiredLinkScreen: FC<{
  token: string | null;
  message: string;
}> = ({ token, message }) => {
  const [status, setStatus] = useState<RegenStatus>({ kind: 'idle' });

  const requestNewLink = async () => {
    if (!token) return;
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch(`${KOSTENRECHNER_URL}/api/lead-regenerate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, source: 'portal' }),
      });
      if (res.ok) {
        const data = (await res.json()) as RegenResponse;
        setStatus({ kind: 'sent', maskedEmail: data.masked_email });
        return;
      }
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      const code = errBody?.error;
      if (code === 'unknown_token') {
        setStatus({ kind: 'error', code: 'unknown_token' });
        return;
      }
      if (code === 'lead_closed') {
        setStatus({ kind: 'error', code: 'lead_closed' });
        return;
      }
      setStatus({ kind: 'error', code: 'unknown' });
    } catch {
      setStatus({ kind: 'error', code: 'network' });
    }
  };

  // Phone fallback rendered in every branch — the customer is stuck, give
  // them an immediate human-contact option even when self-service worked.
  const phoneBlock = (
    <>
      <a
        href="tel:+4989200000830"
        className="inline-flex items-center gap-2 text-sm font-bold text-white rounded-2xl px-6 py-3 shadow-sm"
        style={{ background: '#8B7355' }}
      >
        <Phone className="w-4 h-4" /> 089 200 000 830
      </a>
      <p className="text-xs text-gray-400">Mo–So, 8:00–18:00 Uhr</p>
    </>
  );

  // No token in URL at all — can't regenerate. Show the original "kontaktieren
  // Sie uns" prompt (matches pre-regen behaviour for that path).
  if (!token) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: 'linear-gradient(160deg,#F8F5F1 0%,#EFE8DE 100%)' }}
      >
        <div className="text-center space-y-5 max-w-xs">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: '#E76F6320' }}
          >
            <AlertCircle className="w-8 h-8" style={{ color: '#E76F63' }} />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 mb-2">Link fehlt</p>
            <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
          </div>
          {phoneBlock}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg,#F8F5F1 0%,#EFE8DE 100%)' }}
    >
      <div className="text-center space-y-5 max-w-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: '#E76F6320' }}
        >
          {status.kind === 'sent' ? (
            <CheckCircle2 className="w-8 h-8" style={{ color: '#2A9D5C' }} />
          ) : (
            <AlertCircle className="w-8 h-8" style={{ color: '#E76F63' }} />
          )}
        </div>

        {status.kind === 'sent' ? (
          <>
            <div>
              <p className="text-lg font-bold text-gray-900 mb-2">Neuer Link gesendet</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Wir haben Ihnen einen frischen Zugangslink an{' '}
                <span className="font-semibold text-gray-700">{status.maskedEmail}</span> geschickt.
                Bitte prüfen Sie Ihren Posteingang (ggf. auch Spam-Ordner).
              </p>
            </div>
            <a
              href="mailto:"
              className="inline-flex items-center gap-2 text-sm font-bold text-white rounded-2xl px-6 py-3 shadow-sm"
              style={{ background: '#2A9D5C' }}
            >
              <Mail className="w-4 h-4" /> E-Mail-App öffnen
            </a>
            <p className="text-xs text-gray-400 pt-2">Sie können dieses Fenster schließen.</p>
          </>
        ) : status.kind === 'error' && status.code === 'unknown_token' ? (
          <>
            <div>
              <p className="text-lg font-bold text-gray-900 mb-2">Link nicht erkannt</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Dieser Link gehört zu keinem aktiven Auftrag mehr. Bitte rufen Sie uns an —
                wir helfen Ihnen weiter.
              </p>
            </div>
            {phoneBlock}
          </>
        ) : status.kind === 'error' && status.code === 'lead_closed' ? (
          <>
            <div>
              <p className="text-lg font-bold text-gray-900 mb-2">Auftrag abgeschlossen</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Dieser Auftrag wurde bereits abgeschlossen. Bei Fragen melden Sie sich gerne
                bei uns.
              </p>
            </div>
            {phoneBlock}
          </>
        ) : status.kind === 'error' ? (
          <>
            <div>
              <p className="text-lg font-bold text-gray-900 mb-2">Etwas ist schiefgegangen</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Wir konnten gerade keinen neuen Link erstellen. Bitte versuchen Sie es in
                wenigen Augenblicken erneut, oder rufen Sie uns direkt an.
              </p>
            </div>
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={requestNewLink}
                className="inline-flex items-center gap-2 text-sm font-bold rounded-2xl px-6 py-3 border"
                style={{ color: '#8B7355', borderColor: '#C4B49A', background: 'white' }}
              >
                Erneut versuchen
              </button>
              {phoneBlock}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-lg font-bold text-gray-900 mb-2">Ihr Link ist abgelaufen</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Aus Sicherheitsgründen sind Zugangslinks 14 Tage gültig. Wir senden Ihnen
                gerne einen neuen, frischen Link an die hinterlegte E-Mail-Adresse.
              </p>
            </div>
            <button
              onClick={requestNewLink}
              disabled={status.kind === 'loading'}
              className="inline-flex items-center gap-2 text-sm font-bold text-white rounded-2xl px-6 py-3 shadow-sm disabled:opacity-60"
              style={{ background: '#2A9D5C' }}
            >
              {status.kind === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Wird gesendet…
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" /> Neuen Link senden
                </>
              )}
            </button>
            <div className="pt-2">{phoneBlock}</div>
          </>
        )}
      </div>
    </div>
  );
};
