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
 * „fixe plus die neuen als Superchart"). Darunter „Wo wir stehen" (15.09.):
 * Provision je Kunde minus variable Kosten, Werbung und Gemeinkosten je Monat.
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
type Posten = { posten: string; betrag: number };
type ErgebnisMonat = {
  monat: string; tageImMonat: number; laufend: boolean; einsatztage: number; kundenSchnitt: number;
  provisionJeKunde: number; variabelJeKunde: number; provision: number; variabel: number; deckungsbeitrag: number;
  werbungGoogle: number; werbungEingekauft: number; werbung: number;
  gemeinkosten: number | null; posten: Posten[];
  quelle: 'eigen' | 'uebernommen' | 'keine'; uebernommenAus: string | null;
  ergebnis: number; kostenGedecktAb: number | null;
};
type Antwort = {
  von: string; heute: string;
  wochen: Woche[];
  tage: { tag: string; kunden: number }[];
  potenzial: Potenzial;
  ergebnis: ErgebnisMonat[];
  kostenTabelleFehlt: boolean;
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
/* Euro ohne Cent, echtes Minuszeichen */
const euro = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('de-DE')}\u00A0€`;
const monatsName = (m: string, lang = true) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString('de-DE', { month: lang ? 'long' : 'short', timeZone: 'UTC' }).replace('.', '');
const VORSCHLAEGE = ['Personal', 'Steuerberater', 'Büro und Software', 'Versicherungen', 'weiteres Marketing'];

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

function ErgebnisHinweis({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: ErgebnisMonat & { label: string } = payload[0].payload;
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
  const [neuLaden, setNeuLaden] = useState(0);

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
  }, [zeitraum, neuLaden]);

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
          <ErgebnisKarte monate={daten.ergebnis} tabelleFehlt={daten.kostenTabelleFehlt} achse={achse}
            onGespeichert={() => setNeuLaden((n) => n + 1)} />
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
            <p className="mt-2">
              Wo wir stehen: Provision und variable Kosten gelten je Kunde und vollem Monat und werden je Einsatztag gerechnet (Wert
              geteilt durch 30). Im laufenden Monat zählen die gebuchten Einsatztage bis Monatsende. Werbung kommt automatisch:
              Google-Anzeigen (netto, im laufenden Monat aus den vollen Tagen auf den Monat hochgerechnet) und eingekaufte Anfragen zum
              Stückpreis bis heute. Gemeinkosten gelten ab dem Monat, für den sie eingetragen sind, bis zum nächsten Eintrag.
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

/* ─── Wo wir stehen ──────────────────────────────────────────────────────── */

function Kachel({ titel, wert, unter, ton }: { titel: string; wert: string; unter?: string; ton?: 'plus' | 'minus' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{titel}</p>
      <p className={`mt-0.5 text-xl font-semibold ${ton === 'plus' ? 'text-[#1E7A36]' : ton === 'minus' ? 'text-[#B42F2F]' : 'text-[#3D2B1F]'}`}>{wert}</p>
      {unter && <p className="mt-0.5 text-xs text-gray-500">{unter}</p>}
    </div>
  );
}

function ErgebnisKarte({ monate, tabelleFehlt, achse, onGespeichert }: {
  monate: ErgebnisMonat[];
  tabelleFehlt: boolean;
  achse: { fill: string; fontSize: number };
  onGespeichert: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const jetzt = monate[monate.length - 1];
  if (!jetzt) return null;
  const gk = jetzt.gemeinkosten;
  const mitGk = monate.some((m) => m.kostenGedecktAb !== null);
  const reihe = monate.map((m) => ({ ...m, label: `${monatsName(m.monat, false)}${m.laufend ? '*' : ''}`, noetig: m.kostenGedecktAb }));
  const name = monatsName(jetzt.monat);
  const vorzeichen = (n: number) => (n > 0 ? 'plus' : n < 0 ? 'minus' : undefined);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#3D2B1F]">Wo wir stehen</h2>
            <p className="text-xs text-gray-500">Provision minus variable Kosten, Werbung und Gemeinkosten · {name} hochgerechnet</p>
          </div>
          <button type="button" onClick={() => setOffen((o) => !o)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-[#5C4A32] hover:bg-gray-50">
            {offen ? 'Eingabe schließen' : 'Kosten eintragen'}
          </button>
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-700">
          Im {name} kommen wir auf <b>{zahl(jetzt.kundenSchnitt)}</b> Kunden im Schnitt. Mit {euro(jetzt.provisionJeKunde)} Provision
          und {euro(jetzt.variabelJeKunde)} variablen Kosten je Kunde und Monat sind das <b>{euro(jetzt.deckungsbeitrag)}</b> Deckungsbeitrag.
          Werbung kostet hochgerechnet <b>{euro(jetzt.werbung)}</b>.{' '}
          {gk !== null ? (
            <>
              Nach <b>{euro(gk)}</b> Gemeinkosten{jetzt.quelle === 'uebernommen' && jetzt.uebernommenAus ? ` (aus ${monatsName(jetzt.uebernommenAus)} übernommen)` : ''} bleiben{' '}
              <b>{euro(jetzt.ergebnis)}</b>.
              {jetzt.kostenGedecktAb !== null && <> Alle Kosten sind ab <b>{zahl(jetzt.kostenGedecktAb)}</b> Kunden im Schnitt gedeckt.</>}
            </>
          ) : (
            <>Gemeinkosten sind für {name} noch nicht eingetragen. Ohne sie bleiben <b>{euro(jetzt.ergebnis)}</b>.</>
          )}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kachel titel="Deckungsbeitrag" wert={euro(jetzt.deckungsbeitrag)} unter={`${zahl(jetzt.kundenSchnitt)} Kunden im Schnitt`} />
          <Kachel titel="Werbung" wert={euro(jetzt.werbung)} unter={`Google ${euro(jetzt.werbungGoogle)}, eingekauft ${euro(jetzt.werbungEingekauft)}`} />
          <Kachel titel="Gemeinkosten" wert={gk === null ? '–' : euro(gk)}
            unter={gk === null ? 'noch nicht eingetragen' : jetzt.quelle === 'uebernommen' && jetzt.uebernommenAus ? `aus ${monatsName(jetzt.uebernommenAus)} übernommen` : `${jetzt.posten.length} Posten`} />
          <Kachel titel={gk === null ? 'Ergebnis ohne Gemeinkosten' : 'Ergebnis'} wert={euro(jetzt.ergebnis)} ton={gk === null ? undefined : vorzeichen(jetzt.ergebnis)}
            unter={jetzt.kostenGedecktAb !== null ? `gedeckt ab ${zahl(jetzt.kostenGedecktAb)} Kunden` : undefined} />
        </div>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-[#3D2B1F]">Kunden im Schnitt je Monat{mitGk ? ' und Kunden, die alle Kosten decken' : ''}</p>
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
              <Tooltip content={<ErgebnisHinweis />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="kundenSchnitt" name="Kunden im Schnitt" fill={BLAU} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}
                label={{ position: 'top', fill: '#3D2B1F', fontSize: 11, formatter: (v: number) => zahl(v) }} />
              {mitGk && <Bar dataKey="noetig" name="nötig" fill={ORANGE} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          * {name}: gebuchte Einsatztage bis Monatsende, Google-Kosten hochgerechnet.
          {!mitGk && ' Sobald Gemeinkosten eingetragen sind, zeigt das Diagramm daneben, wie viele Kunden nötig sind.'}
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="bg-[#F7F5F2] text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Monat</th>
                <th className="px-3 py-2 text-right font-semibold">Kunden im Schnitt</th>
                <th className="px-3 py-2 text-right font-semibold">Deckungsbeitrag</th>
                <th className="px-3 py-2 text-right font-semibold">Werbung</th>
                <th className="px-3 py-2 text-right font-semibold">Gemeinkosten</th>
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
                  <td className="px-3 py-2 text-right">{euro(m.werbung)}</td>
                  <td className="px-3 py-2 text-right">{m.gemeinkosten === null ? '–' : euro(m.gemeinkosten)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${m.gemeinkosten === null ? 'text-gray-500' : m.ergebnis < 0 ? 'text-[#B42F2F]' : 'text-[#3D2B1F]'}`}
                    title={m.gemeinkosten === null ? 'ohne Gemeinkosten' : undefined}>{euro(m.ergebnis)}</td>
                  <td className="px-3 py-2 text-right">{m.kostenGedecktAb === null ? '–' : `${zahl(m.kostenGedecktAb)} Kunden`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {offen && <KostenEditor monate={monate} tabelleFehlt={tabelleFehlt} onGespeichert={onGespeichert} />}
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
      const r = await fetch('/api/admin/wachstum/kosten', {
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
    <div className="mt-5 rounded-lg border border-gray-200 bg-[#FBFAF8] p-4">
      <div className="flex flex-wrap items-end gap-4">
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

      <p className="mt-4 text-sm font-medium text-[#3D2B1F]">Gemeinkosten im Monat (netto)</p>
      <p className="text-xs text-gray-500">
        Google-Anzeigen und eingekaufte Anfragen rechnen wir automatisch dazu, hier nur alles andere. Zeilen ohne Betrag zählen nicht.
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
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
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
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={speichern} disabled={speichert || tabelleFehlt}
          className="rounded-md bg-[#5C4A32] px-4 py-2 text-sm font-medium text-white hover:bg-[#4A3B28] disabled:cursor-not-allowed disabled:opacity-50">
          {speichert ? 'Speichert …' : `Für ${monatsName(monat)} speichern`}
        </button>
        {aktuell?.quelle === 'uebernommen' && (
          <span className="text-xs text-gray-500">Bisher gelten die Werte aus {monatsName(aktuell.uebernommenAus ?? '')}.</span>
        )}
      </div>
    </div>
  );
}
