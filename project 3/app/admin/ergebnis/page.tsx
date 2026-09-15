"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { ergebnisVergleich, type ErgebnisMonat } from '@/lib/wachstum';

/*
 * Admin → Mehr → Ergebnis (Martin, 15.09.2026: „Mach für das finanzielle
 * Ergebnis einen eigenen Menüpunkt"). Je Monat: Provision je Kunde minus
 * variable Kosten, Werbung (Google + eingekaufte Anfragen, automatisch) und
 * Gemeinkosten (Eingabe unten). Oben der laufende Monat und was sich gegenüber
 * dem Vormonat geändert hat — „ich kann doch nicht in beiden Monaten ähnliche
 * Zahlen haben, obwohl hier sechs Kunden mehr sind" beantwortet die Zeile
 * Werbung: eingekaufte Anfragen kosten sofort, ihre Kunden bringen Provision
 * erst ab der Anreise.
 *
 * Die Zahlen rechnet /api/admin/ergebnis auf dem Server (lib/wachstum.ts).
 */

type Antwort = { heute: string; monate: ErgebnisMonat[]; kostenTabelleFehlt: boolean };

/* Farben: geprüft auf Farbfehlsichtigkeit und Kontrast (Blau/Orange-Paar). */
const BLAU = '#2A78D6';
const ORANGE = '#EB6834';
const GITTER = '#F0EDE8';
const ACHSE = '#6F6A64';
const achse = { fill: ACHSE, fontSize: 11 };

const zahl = (n: number, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
/* Euro ohne Cent, echtes Minuszeichen, € klebt an der Zahl */
const euro = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('de-DE')} €`;
/* Mit Vorzeichen, für Veränderungen */
const plusMinus = (n: number) => (Math.round(n) === 0 ? euro(0) : `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('de-DE')} €`);
const monatsName = (m: string, lang = true) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString('de-DE', { month: lang ? 'long' : 'short', timeZone: 'UTC' }).replace('.', '');
const kurz = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.`;
const VORSCHLAEGE = ['Personal', 'Steuerberater', 'Büro und Software', 'Versicherungen', 'weiteres Marketing'];

function Kachel({ titel, wert, unter, ton }: { titel: string; wert: string; unter?: string; ton?: 'plus' | 'minus' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{titel}</p>
      <p className={`mt-0.5 text-xl font-semibold ${ton === 'plus' ? 'text-[#1E7A36]' : ton === 'minus' ? 'text-[#B42F2F]' : 'text-[#3D2B1F]'}`}>{wert}</p>
      {unter && <p className="mt-0.5 text-xs text-gray-500">{unter}</p>}
    </div>
  );
}

function KundenHinweis({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: ErgebnisMonat = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="text-base font-semibold text-[#3D2B1F] tabular-nums">{zahl(p.kundenSchnitt)} Kunden im Schnitt</p>
      <p className="text-gray-500">{monatsName(p.monat)} {p.monat.slice(0, 4)}{p.laufend ? ', hochgerechnet' : ''}</p>
      <p className="mt-1 text-gray-700">
        {p.kostenGedecktAb === null ? 'Gemeinkosten nicht eingetragen' : `Kosten gedeckt ab ${zahl(p.kostenGedecktAb)} Kunden`}
      </p>
      <p className="text-gray-700">Ergebnis {euro(p.ergebnis)}{p.gemeinkosten === null ? ' (ohne Gemeinkosten)' : ''}</p>
    </div>
  );
}

export default function ErgebnisPage() {
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neuLaden, setNeuLaden] = useState(0);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);
    fetch('/api/admin/ergebnis')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!abgebrochen) setDaten(d); })
      .catch((e) => { if (!abgebrochen) setFehler(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [neuLaden]);

  const monate = daten?.monate ?? [];
  const jetzt = monate[monate.length - 1];
  const vorher = monate.length > 1 ? monate[monate.length - 2] : undefined;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold text-[#3D2B1F]">Ergebnis</h1>
      <p className="mt-1 text-sm text-gray-600">
        Provision minus variable Kosten, Werbung und Gemeinkosten je Monat, neu gerechnet bei jedem Aufruf{daten ? `. Stand ${kurz(daten.heute)}` : '.'}
      </p>

      {fehler && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Die Zahlen konnten nicht geladen werden: {fehler}
        </p>
      )}
      {laedt && !daten && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#5C4A32]" />
        </div>
      )}

      {daten && jetzt && (
        <div className={`mt-6 space-y-6 transition-opacity ${laedt ? 'opacity-60' : ''}`}>
          <LaufenderMonat m={jetzt} />
          {vorher && <Vergleich vorher={vorher} jetzt={jetzt} />}
          <Verlauf monate={monate} />
          <KostenEditor monate={monate} tabelleFehlt={daten.kostenTabelleFehlt} onGespeichert={() => setNeuLaden((n) => n + 1)} />

          <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-xs leading-relaxed text-gray-500">
            <p className="font-semibold text-gray-700">So wird gerechnet</p>
            <p className="mt-1">
              Provision und variable Kosten gelten je Kunde und vollem Monat und werden je Einsatztag gerechnet (Wert geteilt durch 30,
              wie der Tagessatz). Einsatztage sind die Tage zwischen Anreise und Abreise gebuchter und abgeschlossener Einsätze, täglich aus
              mamamia, je Kunde einmal, auch beim Wechsel der Pflegekraft. Im laufenden Monat zählen die gebuchten Tage bis Monatsende.
              Werbung kommt automatisch: Google-Anzeigen netto (im laufenden Monat aus den vollen Tagen auf den Monat hochgerechnet) und
              eingekaufte Anfragen zum Stückpreis im Monat des Einkaufs. Gemeinkosten gelten ab dem Monat, für den sie eingetragen sind, bis
              zum nächsten Eintrag. Kunden, die das Team direkt in mamamia anlegt, fehlen hier; die Provision ist also eher zu niedrig.
            </p>
          </div>

          <div className="flex gap-4 text-sm">
            <Link href="/admin/wachstum" className="font-medium text-[#5C4A32] hover:underline">Zum Wachstum →</Link>
            <Link href="/admin/kosten" className="font-medium text-[#5C4A32] hover:underline">Kosten je Quelle →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function LaufenderMonat({ m }: { m: ErgebnisMonat }) {
  const gk = m.gemeinkosten;
  const name = monatsName(m.monat);
  const vorzeichen = (n: number) => (n > 0 ? 'plus' : n < 0 ? 'minus' : undefined);
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-base font-semibold text-[#3D2B1F]">{name} {m.monat.slice(0, 4)}{m.laufend ? ', hochgerechnet' : ''}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-700">
          Im {name} kommen wir auf <b>{zahl(m.kundenSchnitt)}</b> Kunden im Schnitt. Mit {euro(m.provisionJeKunde)} Provision
          und {euro(m.variabelJeKunde)} variablen Kosten je Kunde und Monat sind das <b>{euro(m.deckungsbeitrag)}</b> Deckungsbeitrag.
          Werbung kostet{m.laufend ? ' hochgerechnet' : ''} <b>{euro(m.werbung)}</b>.{' '}
          {gk !== null ? (
            <>
              Nach <b>{euro(gk)}</b> Gemeinkosten{m.quelle === 'uebernommen' && m.uebernommenAus ? ` (aus ${monatsName(m.uebernommenAus)} übernommen)` : ''} bleiben{' '}
              <b>{euro(m.ergebnis)}</b>.
              {m.kostenGedecktAb !== null && <> Alle Kosten sind ab <b>{zahl(m.kostenGedecktAb)}</b> Kunden im Schnitt gedeckt.</>}
            </>
          ) : (
            <>Gemeinkosten sind für {name} noch nicht eingetragen. Ohne sie bleiben <b>{euro(m.ergebnis)}</b>.</>
          )}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kachel titel="Deckungsbeitrag" wert={euro(m.deckungsbeitrag)} unter={`${zahl(m.kundenSchnitt)} Kunden im Schnitt`} />
          <Kachel titel="Werbung" wert={euro(m.werbung)} unter={`Google ${euro(m.werbungGoogle)}, eingekauft ${euro(m.werbungEingekauft)}`} />
          <Kachel titel="Gemeinkosten" wert={gk === null ? '–' : euro(gk)}
            unter={gk === null ? 'noch nicht eingetragen' : m.quelle === 'uebernommen' && m.uebernommenAus ? `aus ${monatsName(m.uebernommenAus)} übernommen` : `${m.posten.length} Posten`} />
          <Kachel titel={gk === null ? 'Ergebnis ohne Gemeinkosten' : 'Ergebnis'} wert={euro(m.ergebnis)} ton={gk === null ? undefined : vorzeichen(m.ergebnis)}
            unter={m.kostenGedecktAb !== null ? `gedeckt ab ${zahl(m.kostenGedecktAb)} Kunden` : undefined} />
        </div>
      </CardContent>
    </Card>
  );
}

function Vergleich({ vorher, jetzt }: { vorher: ErgebnisMonat; jetzt: ErgebnisMonat }) {
  const v = ergebnisVergleich(vorher, jetzt);
  const vName = monatsName(vorher.monat);
  const jName = monatsName(jetzt.monat);
  /* Zeilen aus Sicht des Ergebnisses: Kosten, die steigen, drücken es */
  const zeilen: { was: string; betrag: number | null; unter?: string }[] = [
    { was: 'Deckungsbeitrag', betrag: v.deckungsbeitragMehr, unter: `${v.kundenMehr >= 0 ? zahl(v.kundenMehr) : `−${zahl(Math.abs(v.kundenMehr))}`} Kunden ${v.kundenMehr >= 0 ? 'mehr' : 'weniger'} im Schnitt` },
    { was: 'Google-Anzeigen', betrag: -v.googleMehr, unter: `${euro(vorher.werbungGoogle)} → ${euro(jetzt.werbungGoogle)}${jetzt.laufend ? ' (hochgerechnet)' : ''}` },
    { was: 'Eingekaufte Anfragen', betrag: -v.eingekauftMehr, unter: `${euro(vorher.werbungEingekauft)} → ${euro(jetzt.werbungEingekauft)}` },
    { was: 'Gemeinkosten', betrag: v.gemeinkostenMehr === null ? null : -v.gemeinkostenMehr, unter: v.gemeinkostenMehr === null ? 'nicht für beide Monate eingetragen' : undefined },
  ];
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-base font-semibold text-[#3D2B1F]">Gegenüber {vName}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-700">
          Im {jName} sind im Schnitt <b>{zahl(Math.abs(v.kundenMehr))}</b> Kunden {v.kundenMehr >= 0 ? 'mehr' : 'weniger'} im Einsatz als im {vName}.
          Das ändert den Deckungsbeitrag um {plusMinus(v.deckungsbeitragMehr)}. Die Werbung kostet{' '}
          {v.werbungMehr >= 0 ? `${euro(v.werbungMehr)} mehr` : `${euro(-v.werbungMehr)} weniger`}.
          Unterm Strich ändert sich das Ergebnis{v.vorGemeinkosten ? ' vor Gemeinkosten' : ''} um <b>{plusMinus(v.ergebnisMehr)}</b>.
        </p>
        {jetzt.werbungEingekauft > 0 && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-700">
            Eingekaufte Anfragen kosten im Monat des Einkaufs. Die Kunden daraus bringen Provision erst ab der Anreise, über die
            folgenden Monate.
          </p>
        )}
        <div className="mt-4 max-w-xl divide-y divide-gray-100 rounded-lg border border-gray-200">
          {zeilen.map((z) => (
            <div key={z.was} className="flex items-baseline justify-between gap-4 px-4 py-2">
              <div>
                <p className="text-sm text-gray-700">{z.was}</p>
                {z.unter && <p className="text-xs text-gray-500">{z.unter}</p>}
              </div>
              <p className={`shrink-0 text-sm font-medium tabular-nums ${z.betrag === null ? 'text-gray-400' : z.betrag < 0 ? 'text-[#B42F2F]' : 'text-[#3D2B1F]'}`}>
                {z.betrag === null ? '–' : plusMinus(z.betrag)}
              </p>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-[#F7F5F2] px-4 py-2">
            <p className="text-sm font-semibold text-[#3D2B1F]">Ergebnis{v.vorGemeinkosten ? ' vor Gemeinkosten' : ''}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-[#3D2B1F]">{plusMinus(v.ergebnisMehr)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Verlauf({ monate }: { monate: ErgebnisMonat[] }) {
  const mitGk = monate.some((m) => m.kostenGedecktAb !== null);
  const laufend = monate.find((m) => m.laufend);
  const reihe = monate.map((m) => ({ ...m, label: `${monatsName(m.monat, false)}${m.laufend ? '*' : ''}`, noetig: m.kostenGedecktAb }));
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-[#3D2B1F]">Je Monat</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BLAU }} />Kunden im Schnitt</span>
            {mitGk && <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ORANGE }} />nötig, um alle Kosten zu decken</span>}
          </div>
        </div>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reihe} margin={{ top: 16, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%" barGap={2}>
              <CartesianGrid vertical={false} stroke={GITTER} />
              <XAxis dataKey="label" tick={achse} tickLine={false} axisLine={{ stroke: GITTER }} />
              <YAxis tick={achse} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip content={<KundenHinweis />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="kundenSchnitt" name="Kunden im Schnitt" fill={BLAU} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}
                label={{ position: 'top', fill: '#3D2B1F', fontSize: 11, formatter: (v: number) => zahl(v) }} />
              {mitGk && <Bar dataKey="noetig" name="nötig" fill={ORANGE} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {laufend && <>* {monatsName(laufend.monat)}: gebuchte Einsatztage bis Monatsende, Google-Kosten hochgerechnet.</>}
          {!mitGk && ' Sobald Gemeinkosten eingetragen sind, zeigt das Diagramm daneben, wie viele Kunden nötig sind.'}
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[760px] text-sm tabular-nums">
            <thead className="bg-[#F7F5F2] text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Monat</th>
                <th className="px-3 py-2 text-right font-semibold">Kunden im Schnitt</th>
                <th className="px-3 py-2 text-right font-semibold">Deckungs&shy;beitrag</th>
                <th className="px-3 py-2 text-right font-semibold">Google</th>
                <th className="px-3 py-2 text-right font-semibold">Eingekauft</th>
                <th className="px-3 py-2 text-right font-semibold">Gemein&shy;kosten</th>
                <th className="px-3 py-2 text-right font-semibold">Ergebnis</th>
                <th className="px-3 py-2 text-right font-semibold">gedeckt ab</th>
              </tr>
            </thead>
            <tbody>
              {[...monate].reverse().map((m) => (
                <tr key={m.monat} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-left text-gray-700">{monatsName(m.monat)}{m.laufend ? ' (hochgerechnet)' : ''}</td>
                  <td className="px-3 py-2 text-right">{zahl(m.kundenSchnitt)}</td>
                  <td className="px-3 py-2 text-right">{euro(m.deckungsbeitrag)}</td>
                  <td className="px-3 py-2 text-right">{euro(m.werbungGoogle)}</td>
                  <td className="px-3 py-2 text-right">{euro(m.werbungEingekauft)}</td>
                  <td className="px-3 py-2 text-right">{m.gemeinkosten === null ? '–' : euro(m.gemeinkosten)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${m.gemeinkosten === null ? 'text-gray-500' : m.ergebnis < 0 ? 'text-[#B42F2F]' : 'text-[#3D2B1F]'}`}
                    title={m.gemeinkosten === null ? 'ohne Gemeinkosten' : undefined}>{euro(m.ergebnis)}</td>
                  <td className="px-3 py-2 text-right">{m.kostenGedecktAb === null ? '–' : `${zahl(m.kostenGedecktAb)} Kunden`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">Ergebnis in Grau: ohne Gemeinkosten, weil für diesen Monat keine eingetragen sind.</p>
      </CardContent>
    </Card>
  );
}

function KostenEditor({ monate, tabelleFehlt, onGespeichert }: {
  monate: ErgebnisMonat[];
  tabelleFehlt: boolean;
  onGespeichert: () => void;
}) {
  const [monat, setMonat] = useState(monate[monate.length - 1].monat);
  const [provision, setProvision] = useState('');
  const [variabel, setVariabel] = useState('');
  const [posten, setPosten] = useState<{ posten: string; betrag: string }[]>([]);
  const [status, setStatus] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);
  const [speichert, setSpeichert] = useState(false);

  /* Beim Wechsel des Monats: was für diesen Monat gilt (eigen oder übernommen), sonst Vorschläge ohne Beträge */
  useEffect(() => {
    const m = monate.find((x) => x.monat === monat);
    if (!m) return;
    setProvision(String(m.provisionJeKunde));
    setVariabel(String(m.variabelJeKunde));
    setPosten(m.posten.length > 0
      ? m.posten.map((p) => ({ posten: p.posten, betrag: String(p.betrag) }))
      : VORSCHLAEGE.map((v) => ({ posten: v, betrag: '' })));
    setStatus(null);
    // monate ändert sich nach dem Speichern; die Eingabe soll dann nicht springen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monat]);

  const aktuell = monate.find((x) => x.monat === monat);
  const summe = posten.reduce((s, p) => s + (p.betrag.trim() === '' ? 0 : Number(p.betrag) || 0), 0);
  const aendern = (i: number, feld: 'posten' | 'betrag', wert: string) =>
    setPosten((alt) => alt.map((p, j) => (j === i ? { ...p, [feld]: wert } : p)));

  const speichern = async () => {
    setSpeichert(true);
    setStatus(null);
    try {
      const r = await fetch('/api/admin/ergebnis/kosten', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monat,
          provision_je_kunde: provision.trim() === '' ? '' : Number(provision),
          variabel_je_kunde: variabel.trim() === '' ? '' : Number(variabel),
          gemeinkosten: posten.map((p) => ({ posten: p.posten, betrag: p.betrag.trim() === '' ? '' : Number(p.betrag) })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setStatus({ art: 'ok', text: `Gespeichert für ${monatsName(monat)} ${monat.slice(0, 4)}. Gilt auch für die folgenden Monate, bis dort etwas anderes steht.` });
      onGespeichert();
    } catch (e) {
      setStatus({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSpeichert(false);
    }
  };

  const feld = 'rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#5C4A32] focus:outline-none focus:ring-1 focus:ring-[#5C4A32]';

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-base font-semibold text-[#3D2B1F]">Kosten eintragen</h2>
        <p className="text-xs text-gray-500">Gilt ab dem gewählten Monat, bis ein späterer Monat etwas anderes sagt.</p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-medium text-gray-500">Monat</span>
            <select value={monat} onChange={(e) => setMonat(e.target.value)} className={`${feld} w-full bg-white`}>
              {[...monate].reverse().map((m) => (
                <option key={m.monat} value={m.monat}>
                  {monatsName(m.monat)} {m.monat.slice(0, 4)}{m.quelle === 'eigen' ? '' : m.quelle === 'uebernommen' ? ` (aus ${monatsName(m.uebernommenAus ?? '')} übernommen)` : ' (noch leer)'}
                </option>
              ))}
            </select>
          </label>
          <label className="w-44 text-sm text-gray-700">
            <span className="mb-1 block text-xs font-medium text-gray-500">Provision je Kunde und Monat (€)</span>
            <input type="number" min={0} step="1" inputMode="decimal" value={provision} onChange={(e) => setProvision(e.target.value)} className={`${feld} w-full`} />
          </label>
          <label className="w-44 text-sm text-gray-700">
            <span className="mb-1 block text-xs font-medium text-gray-500">Variable Kosten je Kunde und Monat (€)</span>
            <input type="number" min={0} step="1" inputMode="decimal" value={variabel} onChange={(e) => setVariabel(e.target.value)} className={`${feld} w-full`} />
          </label>
        </div>

        <p className="mt-5 text-sm font-medium text-[#3D2B1F]">Gemeinkosten im Monat (netto)</p>
        <p className="text-xs text-gray-500">
          Google-Anzeigen und eingekaufte Anfragen rechnen wir automatisch dazu, hier nur alles andere, auch ChatGPT-Werbung. Zeilen ohne
          Betrag zählen nicht.
        </p>
        <div className="mt-2 space-y-2">
          {posten.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input aria-label="Posten" value={p.posten} onChange={(e) => aendern(i, 'posten', e.target.value)} maxLength={60}
                placeholder="Posten" className={`${feld} min-w-0 max-w-xs flex-1 bg-white`} />
              <input aria-label={`Betrag für ${p.posten || 'Posten'}`} type="number" min={0} step="1" inputMode="decimal" value={p.betrag}
                onChange={(e) => aendern(i, 'betrag', e.target.value)} placeholder="€" className={`${feld} w-24 shrink-0 bg-white text-right sm:w-32`} />
              <button type="button" onClick={() => setPosten((alt) => alt.filter((_, j) => j !== i))}
                className="shrink-0 rounded px-2 py-1 text-base leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={`${p.posten || 'Posten'} entfernen`} title="entfernen">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex max-w-xl flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setPosten((alt) => [...alt, { posten: '', betrag: '' }])}
            className="text-sm font-medium text-[#5C4A32] hover:underline" disabled={posten.length >= 30}>
            + Posten hinzufügen
          </button>
          <p className="text-sm text-gray-700">Summe: <b className="tabular-nums">{euro(summe)}</b></p>
        </div>

        {tabelleFehlt && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Speichern geht noch nicht: Die Kostentabelle ist in der Datenbank noch nicht angelegt. Bis dahin rechnet die Seite mit
            550 € Provision, 50 € variablen Kosten und ohne Gemeinkosten.
          </p>
        )}
        {status && (
          <p className={`mt-3 rounded-md px-3 py-2 text-sm ${status.art === 'ok' ? 'border border-green-200 bg-green-50 text-green-800' : 'border border-red-200 bg-red-50 text-red-700'}`}>
            {status.text}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={speichern} disabled={speichert || tabelleFehlt}
            className="rounded-md bg-[#5C4A32] px-4 py-2 text-sm font-medium text-white hover:bg-[#4A3B28] disabled:cursor-not-allowed disabled:opacity-50">
            {speichert ? 'Speichert …' : `Für ${monatsName(monat)} speichern`}
          </button>
          {aktuell?.quelle === 'uebernommen' && (
            <span className="text-xs text-gray-500">Bisher gelten die Werte aus {monatsName(aktuell.uebernommenAus ?? '')}.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
