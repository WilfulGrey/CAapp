"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { adminDb, ADMIN_EMAIL } from '@/lib/admin-db';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      setError('Falsches Passwort. Bitte erneut versuchen.');
      setLoading(false);
      return;
    }

    /* Zweite Anmeldung mit demselben Passwort: am Konto des Panels in Supabase.
       Ohne diese Sitzung lässt RLS die Admin-Seiten keine Leads lesen. Schlägt
       sie fehl, nehmen wir das Cookie wieder weg — sonst landet man in einem
       Panel, das nichts zeigen kann. */
    const { error: authFehler } = await adminDb.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
    if (authFehler) {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      setError(`Anmeldung an der Datenbank fehlgeschlagen: ${authFehler.message}`);
      setLoading(false);
      return;
    }
    window.location.href = '/admin';
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-full bg-[#5C4A32] flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Primundus Admin</h1>
            <p className="text-sm text-gray-500 mt-1">Bitte Passwort eingeben</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C4A32] focus:border-transparent transition"
            />

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl bg-[#5C4A32] text-white text-sm font-medium hover:bg-[#4A3A26] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Wird geprüft...' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
