"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Cell,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/*
 * Admin → Mehr → Wachstum (Martin, 14.09.2026: „Kundenverlauf, Anfragenverlauf,
 * Profil-Verlauf" und oben die Potenzialentwicklung des laufenden Monats:
 * „fixe plus die neuen als Superchart").
 *
 * Die Zahlen rechnet /api/admin/wachstum auf dem Server (lib/wachstum.ts);
 * hier wird nur gezeichnet.
 */

type Woche = {
  start: string; tage: number; laufend: boolean;
  anfragenEigen: number; anfragenGekauft: number; profileEigen: number; profileGekauft: number;
  kundenSchnitt: number; neueKunden: number;
};
type Potenzial = {
  monat: string; heute: string; monatsEnde: string;
  tage: { tag: string; fest: number; potenzial: number; vergangen: boolean }[];
  jetzt: number; anreisenNeu: number; anreisenWechsel: number; abgaenge: number;
  festAmMonatsende: number; inSuche: number;
};
type Antwort = {
  von: string; heute: string;
  wochen: Woche[];
  tage: { tag: string; kunden: number }[];
  potenzial: Potenzial;
};

/* Zielmarken je Tag für EIGENE Anfragen (Martin, 11.09.2026: 5–6 Leads, 2–3 Profile). */
const ZIEL_ANFRAGEN = 5;
const ZIEL_PROFILE = 2;

/* Farben: geprüft auf Farbfehlsichtigkeit und Kontrast (Blau/Orange-Paar). */
const BLAU = '#2A78D6';
const HELLBLAU = '#86B6EF'; // hellere Stufe desselben Blaus: „möglich“ auf „fest“
const ORANGE = '#EB6834';
const GITTER = '#F0EDE8';
const ACHSE = '#6F6A64';

const ZEITRAEUME = [
  { key: '12', label: '12 Wochen' },
  { key: '26', label: '26 Wochen' },
  { key: 'alle', label: 'Seit Mai' },
];

const kurz = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.`;
const zahl = (n: number, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Balken mit runder Oberkante nur am obersten Stück und 2 px Luft zwischen den Stücken. */
function Stueck(props: any) {
  const { x, y, width, height, fill, payload, dataKey, fillOpacity } = props;
  if (!height || height <= 0) return null;
  const oben = dataKey === 'gekauft' || !(payload?.gekauft > 0);
  const h = dataKey === 'gekauft' ? Math.max(0, height - 2) : height;
  if (h <= 0) return null;
  const r = oben ? Math.min(4, h, width / 2) : 0;
  const d = r > 0
    ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`
    : `M${x},${y + h} V${y} H${x + width} V${y + h} Z`;
  return <path d={d} fill={fill} fillOpacity={fillOpacity} />;
}

function Hinweis({ active, payload, einheit }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="text-base font-semibold text-[#3D2B1F] tabular-nums">
        {zahl(p.eigene + p.gekauft)} {einheit}
      </p>
      <p className="text-gray-500">Woche ab {kurz(p.start)}{p.laufend ? `, läuft (${p.tage} Tage)` : ''}</p>
      <p className="mt-1 flex items-center gap-2 text-gray-700">
        <span className="inline-block h-0.5 w-3" style={{ background: BLAU }} /> eigene {zahl(p.eigene)}
        <span className="text-gray-400">({p.eigeneAnzahl})</span>
      </p>
      {p.gekauftAnzahl > 0 && (
        <p className="flex items-center gap-2 text-gray-700">
          <span className="inline-block h-0.5 w-3" style={{ background: ORANGE }} /> eingekauft {zahl(p.gekauft)}
          <span className="text-gray-400">({p.gekauftAnzahl})</span>
        </p>
      )}
    </div>
  );
}

function KundenHinweis({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="text-base font-semibold text-[#3D2B1F] tabular-nums">{p.kunden} Kunden im Einsatz</p>
      <p className="text-gray-500">{kurz(p.tag)}{p.tag.slice(0, 4)}</p>
    </div>
  );
}

function PotenzialHinweis({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="text-base font-semibold text-[#3D2B1F] tabular-nums">
        {p.vergangen ? `${p.fest} im Einsatz` : `${p.fest} fest gebucht`}
      </p>
      <p className="text-gray-500">{kurz(p.tag)}{p.tag.slice(0, 4)}</p>
      {!p.vergangen && p.potenzial > 0 && (
        <p className="mt-1 text-gray-700">+ {p.potenzial} in der Suche · bis zu {p.fest + p.potenzial}</p>
      )}
    </div>
  );
}

const Legende = ({ eigen, gekauft }: { eigen: string; gekauft: string }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
    <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BLAU }} />{eigen}</span>
    <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ORANGE }} />{gekauft}</span>
  </div>
);

export default function WachstumPage() {
  const [zeitraum, setZeitraum] = useState('alle');
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);
    fetch(`/api/admin/wachstum${zeitraum === 'alle' ? '' : `?wochen=${zeitraum}`}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!abgebrochen) setDaten(d); })
      .catch((e) => { if (!abgebrochen) setFehler(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [zeitraum]);

  /* Je Tag im Wochenschnitt: so sind angefangene Wochen vergleichbar und die Ziele
     (je Tag) passen. Eine laufende Woche mit ein, zwei Tagen verzerrt trotzdem die
     Skala (ein Montag mit einer Einkaufs-Lieferung sieht aus wie ein Rekord) — sie
     erscheint deshalb erst ab Mittwoch. */
  const wochen = useMemo(() => (daten?.wochen ?? []).filter((w) => !(w.laufend && w.tage < 3)), [daten]);
  const anfragen = useMemo(() => wochen.map((w) => ({
    start: w.start, tage: w.tage, laufend: w.laufend, label: kurz(w.start),
    eigene: w.anfragenEigen / w.tage, gekauft: w.anfragenGekauft / w.tage,
    eigeneAnzahl: w.anfragenEigen, gekauftAnzahl: w.anfragenGekauft,
  })), [wochen]);
  const profile = useMemo(() => wochen.map((w) => ({
    start: w.start, tage: w.tage, laufend: w.laufend, label: kurz(w.start),
    eigene: w.profileEigen / w.tage, gekauft: w.profileGekauft / w.tage,
    eigeneAnzahl: w.profileEigen, gekauftAnzahl: w.profileGekauft,
  })), [wochen]);

  const achse = { fill: ACHSE, fontSize: 11 };

  const balken = (titel: string, unter: string, reihe: typeof anfragen, ziel: number, einheit: string, legende: [string, string]) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#3D2B1F]">{titel}</h2>
            <p className="text-xs text-gray-500">{unter}</p>
          </div>
          <Legende eigen={legende[0]} gekauft={legende[1]} />
        </div>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reihe} margin={{ top: 12, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GITTER} />
              <XAxis dataKey="label" tick={achse} tickLine={false} axisLine={{ stroke: GITTER }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={achse} tickLine={false} axisLine={false} allowDecimals={false} width={40}
                tickFormatter={(v: number) => v.toLocaleString('de-DE')} />
              <Tooltip content={<Hinweis einheit={einheit} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <ReferenceLine y={ziel} stroke={ACHSE} strokeWidth={1}
                label={{ value: `Ziel eigene: ${ziel} am Tag`, position: 'insideTopLeft', fill: ACHSE, fontSize: 11 }} />
              <Bar dataKey="eigene" stackId="a" fill={BLAU} maxBarSize={24} shape={<Stueck />} isAnimationActive={false}>
                {reihe.map((w) => <Cell key={w.start} fillOpacity={w.laufend ? 0.45 : 1} />)}
              </Bar>
              <Bar dataKey="gekauft" stackId="a" fill={ORANGE} maxBarSize={24} shape={<Stueck />} isAnimationActive={false}>
                {reihe.map((w) => <Cell key={w.start} fillOpacity={w.laufend ? 0.45 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#3D2B1F]">Wachstum</h1>
          <p className="mt-1 text-sm text-gray-600">
            Potenzial im laufenden Monat, Kunden im Einsatz, Anfragen und fertige Profile, neu gerechnet bei jedem Aufruf{daten ? `. Stand ${kurz(daten.heute)}` : '.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {ZEITRAEUME.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZeitraum(z.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                zeitraum === z.key ? 'bg-[#5C4A32] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

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

      {daten && (
        <div className={`mt-6 space-y-6 transition-opacity ${laedt ? 'opacity-60' : ''}`}>
          {(() => {
            const pz = daten.potenzial;
            const monatsName = new Date(`${pz.monat}-01T00:00:00Z`).toLocaleString('de-DE', { month: 'long', timeZone: 'UTC' });
            const ende = kurz(pz.monatsEnde);
            const letzter = pz.tage[pz.tage.length - 1];
            return (
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-[#3D2B1F]">Potenzialentwicklung {monatsName}</h2>
                      <p className="text-xs text-gray-500">fest gebucht, dazu Suchende mit fertigem Profil und Anreise in diesem Monat</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BLAU }} />fest im Einsatz (ab heute gebucht)</span>
                      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: HELLBLAU }} />in der Suche mit fertigem Profil</span>
                    </div>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-700">
                    Heute sind <b>{pz.jetzt}</b> Kunden im Einsatz. Bis zum {ende} reisen <b>{pz.anreisenNeu + pz.anreisenWechsel}</b> Pflegekräfte
                    an: <b>{pz.anreisenNeu}</b> {pz.anreisenNeu === 1 ? 'neuer Kunde' : 'neue Kunden'}, <b>{pz.anreisenWechsel}</b> Wechsel.{' '}
                    <b>{pz.abgaenge}</b> {pz.abgaenge === 1 ? 'Kunde endet' : 'Kunden enden'} ohne gebuchte Nachfolge. Am {ende} sind damit{' '}
                    <b>{pz.festAmMonatsende}</b> fest im Einsatz. Dazu kommen <b>{pz.inSuche}</b> Kunden mit fertigem Profil, die eine Anreise in
                    diesem Monat suchen, zusammen bis zu <b>{pz.festAmMonatsende + pz.inSuche}</b>.
                  </p>
                  <div className="mt-3 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={pz.tage} margin={{ top: 20, right: 16, left: -12, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={GITTER} />
                        <XAxis dataKey="tag" tickFormatter={kurz} tick={achse} tickLine={false} axisLine={{ stroke: GITTER }} minTickGap={24} />
                        <YAxis tick={achse} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                        <Tooltip content={<PotenzialHinweis />} cursor={{ stroke: ACHSE, strokeWidth: 1 }} />
                        <ReferenceLine x={pz.heute} stroke={ACHSE} strokeWidth={1}
                          label={{ value: 'heute', position: 'insideTopLeft', fill: ACHSE, fontSize: 11 }} />
                        <Area type="stepAfter" dataKey="fest" stackId="p" stroke={BLAU} strokeWidth={2} fill={BLAU} fillOpacity={0.28}
                          isAnimationActive={false} dot={false} activeDot={false} />
                        {/* gestrichelte Oberkante = „bis zu“; vor heute ist potenzial 0 und die Linie liegt unsichtbar auf der festen */}
                        <Area type="stepAfter" dataKey="potenzial" stackId="p" stroke={BLAU} strokeWidth={1.5} strokeDasharray="4 3"
                          fill={HELLBLAU} fillOpacity={0.35} isAnimationActive={false} dot={false} activeDot={false} />
                        {letzter && (
                          <ReferenceDot x={letzter.tag} y={letzter.fest + letzter.potenzial} r={0}
                            label={({ viewBox }: { viewBox: { x: number; y: number } }) => (
                              // rechtsbündig am letzten Tag, sonst läuft die Zahl über den Rand
                              <text x={viewBox.x} y={viewBox.y - 8} textAnchor="end" fill="#3D2B1F" fontSize={12} fontWeight={600}>
                                bis zu {letzter.fest + letzter.potenzial}
                              </text>
                            )} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          <Card>
            <CardContent className="p-5">
              <h2 className="text-base font-semibold text-[#3D2B1F]">Kunden im Einsatz</h2>
              <p className="text-xs text-gray-500">je Tag · ein Kunde zählt einmal, auch beim Wechsel der Pflegekraft</p>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daten.tage} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GITTER} />
                    <XAxis dataKey="tag" tickFormatter={kurz} tick={achse} tickLine={false} axisLine={{ stroke: GITTER }} minTickGap={28} />
                    <YAxis tick={achse} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                    <Tooltip content={<KundenHinweis />} cursor={{ stroke: ACHSE, strokeWidth: 1 }} />
                    <Area type="stepAfter" dataKey="kunden" stroke={BLAU} strokeWidth={2} fill={BLAU} fillOpacity={0.1}
                      isAnimationActive={false} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2, fill: BLAU }} />
                    {daten.tage.length > 0 && (
                      <ReferenceDot x={daten.tage[daten.tage.length - 1].tag} y={daten.tage[daten.tage.length - 1].kunden}
                        r={4} fill={BLAU} stroke="#fff" strokeWidth={2}
                        label={{ value: String(daten.tage[daten.tage.length - 1].kunden), position: 'top', fill: '#3D2B1F', fontSize: 12, fontWeight: 600 }} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {balken('Anfragen je Tag', 'Wochenschnitt · die laufende Woche erscheint ab Mittwoch, heller', anfragen, ZIEL_ANFRAGEN, 'Anfragen am Tag',
              ['eigene Anfragen', 'eingekaufte Anfragen'])}
            {balken('Fertige Profile je Tag', 'Wochenschnitt · vom Kunden gespeichert oder vom Team angelegt', profile, ZIEL_PROFILE, 'Profile am Tag',
              ['aus eigenen Anfragen', 'aus eingekauften Anfragen'])}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-xs leading-relaxed text-gray-500">
            <p className="font-semibold text-gray-700">So wird gezählt</p>
            <p className="mt-1">
              Anfragen ohne Tests und interne Adressen; eingekauft sind Anfragen von Portalen. Profil fertig heißt: der Kunde hat es
              gespeichert oder es gibt schon eine Bewerbung oder Einladung (dann hat das Team das Profil angelegt). Kunden im Einsatz:
              Tage zwischen Anreise und Abreise gebuchter und abgeschlossener Einsätze, täglich aus mamamia; ab heute zählt die Buchungslage
              mit der geplanten Abreise. In der Suche: fertiges Profil, offene Suche, gewünschte Anreise in diesem Monat (bis zu 14 Tage
              überfällige zählen ab heute mit), nicht „nicht interessiert“ und in diesem Monat noch ohne Einsatz. Das ist die Obergrenze,
              keine Erwartung. Kunden, die das Team direkt in mamamia anlegt, fehlen hier.
            </p>
          </div>

          <div className="flex gap-4 text-sm">
            <Link href="/admin/leads" className="font-medium text-[#5C4A32] hover:underline">Zu den Leads →</Link>
            <Link href="/admin/ergebnis" className="font-medium text-[#5C4A32] hover:underline">Zum Ergebnis →</Link>
            <Link href="/admin/kosten" className="font-medium text-[#5C4A32] hover:underline">Kosten je Quelle →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
