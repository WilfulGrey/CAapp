"use client";

/*
 * Admin → Gespräche: was Kunden Pria wirklich schreiben.
 *
 * Links die Gespräche, rechts der Verlauf. Die Marke „LEAD" sitzt an der
 * Stelle, an der die Kontaktdaten kamen — davor die Beratung, danach die
 * Rückfragen. Genau dieser Schnitt ist der Grund für die Seite.
 *
 * Gelesen wird über /api/admin/pria-gespraeche (Service-Role), nicht direkt
 * aus dem Browser: die Tabelle hat RLS ohne anon-Policies.
 */
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, MessageSquare, User, Bot, CircleCheck as CheckCircle2, Info } from 'lucide-react';

type Kopf = {
  sid: string; beginn: string; ende: string; nachrichten: number;
  ersteFrage: string | null; lead: boolean; leadId: string | null;
};
type Zeile = {
  id: string; rolle: string; text: string; ereignis: string | null;
  meta: any; zeit: string; lead_id: string | null;
};

const zeit = (s: string) =>
  new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const dauer = (a: string, b: string) => {
  const m = Math.round((Date.parse(b) - Date.parse(a)) / 60000);
  return m < 1 ? 'unter 1 Min' : `${m} Min`;
};

export default function GespraechePage() {
  const [liste, setListe] = useState<Kopf[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [verlauf, setVerlauf] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/pria-gespraeche')
      .then((r) => r.json())
      .then((d) => { if (d.fehler) setFehler(d.fehler); else setListe(d.gespraeche ?? []); })
      .catch((e) => setFehler(String(e.message)))
      .finally(() => setLaedt(false));
  }, []);

  useEffect(() => {
    if (!gewaehlt) return;
    setVerlauf([]);
    fetch(`/api/admin/pria-gespraeche?sid=${encodeURIComponent(gewaehlt)}`)
      .then((r) => r.json())
      .then((d) => setVerlauf(d.zeilen ?? []))
      .catch(() => {});
  }, [gewaehlt]);

  if (laedt) {
    return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gespräche mit Pria</h1>
        <p className="text-sm text-gray-500 mt-1">
          Was Kunden wirklich fragen — und an welcher Stelle daraus ein Lead wurde.
        </p>
      </div>

      {fehler && (
        <Card className="p-4 mb-6 bg-amber-50 border-amber-200 flex gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <b>Noch keine Mitschrift lesbar.</b> {fehler}
            <div className="mt-1 text-amber-800">
              Wenn die Tabelle fehlt: Migration <code>20260821140000_pria_gespraeche.sql</code> einspielen.
            </div>
          </div>
        </Card>
      )}

      {!fehler && liste.length === 0 && (
        <Card className="p-8 text-center text-gray-500">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          Noch keine Gespräche aufgezeichnet.
        </Card>
      )}

      {liste.length > 0 && (
        <div className="grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-6 items-start">
          {/* ── Liste ─────────────────────────────────────────────── */}
          <Card className="divide-y max-h-[70vh] overflow-y-auto">
            {liste.map((g) => (
              <button
                key={g.sid}
                onClick={() => setGewaehlt(g.sid)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                  gewaehlt === g.sid ? 'bg-gray-100' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500 tabular-nums">{zeit(g.beginn)}</span>
                  {g.lead && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Lead
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-900 mt-1 line-clamp-2">
                  {g.ersteFrage || <span className="text-gray-400">— nur geklickt, nichts geschrieben</span>}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {g.nachrichten} Nachrichten · {dauer(g.beginn, g.ende)}
                </div>
              </button>
            ))}
          </Card>

          {/* ── Verlauf ───────────────────────────────────────────── */}
          <Card className="p-5 max-h-[70vh] overflow-y-auto">
            {!gewaehlt && (
              <div className="text-gray-400 text-sm py-10 text-center">
                Links ein Gespräch wählen.
              </div>
            )}
            {gewaehlt && verlauf.length === 0 && (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            )}
            {verlauf.map((z) => {
              // Die Wendepunkte als Trennlinie, nicht als Sprechblase.
              if (z.ereignis === 'lead') {
                return (
                  <div key={z.id} className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-emerald-300" />
                    <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                      ▼ Kontaktdaten abgeschickt
                      {z.lead_id && <> · Lead <code className="text-[10px]">{z.lead_id.slice(0, 8)}</code></>}
                    </span>
                    <div className="h-px flex-1 bg-emerald-300" />
                  </div>
                );
              }
              if (z.rolle === 'modell') {
                const m = z.meta || {};
                return (
                  <div key={z.id} className="text-[11px] text-gray-400 pl-9 py-0.5 tabular-nums">
                    · {m.typ}{m.feld ? ` ${m.feld}=${(m.werte || []).join('|')}` : ''}
                    {m.tokens ? `  ↑${m.tokens.frisch} (cache ${m.tokens.cache}) ↓${m.tokens.aus}` : ''}
                  </div>
                );
              }
              if (z.rolle === 'system') {
                return <div key={z.id} className="text-[11px] text-gray-400 pl-9 py-0.5">· {z.text}</div>;
              }
              const kunde = z.rolle === 'kunde';
              return (
                <div key={z.id} className={`flex gap-2.5 my-2.5 ${kunde ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${
                    kunde ? 'bg-[#E76F63] text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {kunde ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    kunde ? 'bg-[#E76F63] text-white' : 'bg-gray-100 text-gray-900'}`}>
                    {z.text}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
