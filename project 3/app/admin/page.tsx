"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Cell,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/*
 * Startseite des Admins: Wachstum auf einen Blick (Martin, 14.09.2026: „ich
 * brauche das als Standardansicht und zwar grafisch. Kundenverlauf,
 * Anfragenverlauf, Profil-Verlauf").
 *
 * Die Zahlen rechnet /api/admin/wachstum auf dem Server (lib/wachstum.ts);
 * hier wird nur gezeichnet. Ersetzt das alte Dashboard, das Leads mit dem
 * Anon-Key im Browser las und „Verträge" aus einem Status zählte, der nie
 * gepflegt wird (immer 0).
 */

type Woche = {
  start: string; tage: number; laufend: boolean;
  anfragenEigen: number; anfragenGekauft: number; profileEigen: number; profileGekauft: number;
  kundenSchnitt: number; neueKunden: number;
};
type Antwort = {
  von: string; heute: string;
  wochen: Woche[];
  tage: { tag: string; kunden: number }[];
  kacheln: {
    kundenHeute: number; kundenVor30: number; anfragen7Eigen: number; anfragen7Gekauft: number;
    profile7Eigen: number; profile7Gekauft: number; neueKunden30: number;
  };
};

/* Zielmarken je Tag für EIGENE Anfragen (Martin, 11.09.2026: 5–6 Leads, 2–3 Profile). */
const ZIEL_ANFRAGEN = 5;
const ZIEL_PROFILE = 2;

/* Farben: geprüft auf Farbfehlsichtigkeit und Kontrast (Blau/Orange-Paar). */
const BLAU = '#2A78D6';
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

  const k = daten?.kacheln;
  const kachel = (titel: string, wert: string, fuss: string) => (
    <Card key={titel}>
      <CardContent className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{titel}</p>
        <p className="mt-1 text-3xl font-bold text-[#3D2B1F]">{wert}</p>
        <p className="mt-1 text-sm text-gray-500">{fuss}</p>
      </CardContent>
    </Card>
  );

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
            Kunden im Einsatz, Anfragen und fertige Profile, neu gerechnet bei jedem Aufruf{daten ? `. Stand ${kurz(daten.heute)}` : '.'}
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

      {daten && k && (
        <div className={`mt-6 space-y-6 transition-opacity ${laedt ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kachel('Kunden im Einsatz', String(k.kundenHeute), `vor 30 Tagen: ${k.kundenVor30}`)}
            {kachel('Neue Kunden, 30 Tage', String(k.neueKunden30), 'erste Anreise in den letzten 30 Tagen')}
            {kachel('Anfragen, 7 Tage', String(k.anfragen7Eigen + k.anfragen7Gekauft),
              `${k.anfragen7Eigen} eigene (${zahl(k.anfragen7Eigen / 7)} am Tag, Ziel ${ZIEL_ANFRAGEN}) · ${k.anfragen7Gekauft} eingekauft`)}
            {kachel('Fertige Profile, 7 Tage', String(k.profile7Eigen + k.profile7Gekauft),
              `${k.profile7Eigen} eigene (${zahl(k.profile7Eigen / 7)} am Tag, Ziel ${ZIEL_PROFILE}) · ${k.profile7Gekauft} eingekauft`)}
          </div>

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
              Tage zwischen Anreise und Abreise gebuchter und abgeschlossener Einsätze, täglich aus mamamia. Kunden, die das Team direkt
              in mamamia anlegt, fehlen hier.
            </p>
          </div>

          <div className="flex gap-4 text-sm">
            <Link href="/admin/leads" className="font-medium text-[#5C4A32] hover:underline">Zu den Leads →</Link>
            <Link href="/admin/kosten" className="font-medium text-[#5C4A32] hover:underline">Kosten je Quelle →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
