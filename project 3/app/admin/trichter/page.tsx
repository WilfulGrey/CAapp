"use client";

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { KanalSumme, TagZeile } from '@/lib/trichter';

/*
 * Admin → Mehr → Trichter (Registry #142, Martin 27.10.2026). Je Kanal: was aus den
 * Anfragen wird, bis zum fertigen Profil und zur Buchung, und was ein Profil kostet.
 * Gerechnet wird auf dem Server (/api/admin/trichter, lib/trichter.ts); hier wird nur
 * gezeigt. Nur Typen aus lib/trichter — die Datei nutzt node:crypto und gehört nicht
 * ins Browser-Paket.
 */

type Antwort = {
  von: string; bis: string; heute: string; stand: string; reifBis: string;
  ziel: { gruenBis: number; gelbBis: number };
  kostenJeKampagne: boolean;
  tests: number;
  kanaele: KanalSumme[];
  zusammen: KanalSumme;
  google: { tageskosten: number; kampagnenkosten: number | null };
  reif: { kanaele: KanalSumme[]; zusammen: KanalSumme } | null;
  tage: TagZeile[];
  hinweise: string[];
};

const START_MESSUNG = '2026-09-01';

const ZEITRAEUME = [
  { key: '7', label: '7 Tage' },
  { key: '14', label: '14 Tage' },
  { key: '30', label: '30 Tage' },
  { key: '90', label: '90 Tage' },
  { key: 'sept', label: 'Seit 01.09.' },
  { key: 'frei', label: 'Frei' },
];

const kurz = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.`;
const euro = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
const prozent = (teil: number, ganz: number) => (ganz > 0 ? `${Math.round((teil / ganz) * 100)} %` : '');

/** Berliner Kalendertag minus n Tage (nur für die Vorauswahl; die Route prüft selbst). */
function tagMinus(heute: string, n: number) {
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const heuteBerlin = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

const FARBE: Record<string, string> = {
  gruen: 'bg-emerald-50 text-emerald-800',
  gelb: 'bg-amber-50 text-amber-800',
  rot: 'bg-red-50 text-red-700',
};

/* Stufen der Kette: Schlüssel, Kopf, Erklärung (Titel am Kopf). */
const STUFEN: { key: keyof KanalSumme; kopf: string; titel: string }[] = [
  { key: 'ohneDoppelte', kopf: 'ohne Doppelte', titel: 'Anfragen ohne die, die schon einmal angefragt hatten (gleiche Mail, Telefon oder Google-Klick)' },
  { key: 'portalGeoeffnet', kopf: 'Portal offen', titel: 'Kundenportal mindestens einmal geöffnet' },
  { key: 'bogenImBild', kopf: 'Bogen im Bild', titel: 'Patientenbogen war auf dem Bildschirm — gemessen erst seit 22.10.2026, 15:29' },
  { key: 'bogenBegonnen', kopf: 'Bogen begonnen', titel: 'mindestens eine Seite des Bogens mit „Weiter“ gespeichert' },
  { key: 'profilSelbst', kopf: 'Profil selbst', titel: 'Bogen vom Kunden vollständig gespeichert' },
  { key: 'teamIndiz', kopf: 'Profil Team', titel: 'Einladung oder Bewerbung ohne gespeicherten Bogen: das Team hat das Profil vermutlich angelegt' },
  { key: 'profileGesamt', kopf: 'Profile gesamt', titel: 'selbst + Team, ohne Doppelzählung' },
  { key: 'mitEinladung', kopf: 'Einladung', titel: 'mindestens eine Pflegekraft eingeladen' },
  { key: 'mitBewerbung', kopf: 'Bewerbung', titel: 'mindestens eine Bewerbung beim Kunden' },
  { key: 'buchungen', kopf: 'Buchung', titel: 'Kunde hat eine Bewerbung angenommen' },
];

export default function TrichterPage() {
  const [auswahl, setAuswahl] = useState('30');
  const [frei, setFrei] = useState<{ von: string; bis: string }>(() => {
    const h = heuteBerlin();
    return { von: tagMinus(h, 29), bis: h };
  });
  const [zeitraum, setZeitraum] = useState<{ von: string; bis: string }>(() => {
    const h = heuteBerlin();
    return { von: tagMinus(h, 29), bis: h };
  });
  const [nurReif, setNurReif] = useState(false);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const waehle = (key: string) => {
    setAuswahl(key);
    if (key === 'frei') return;
    const h = heuteBerlin();
    setZeitraum(key === 'sept' ? { von: START_MESSUNG, bis: h } : { von: tagMinus(h, Number(key) - 1), bis: h });
  };

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);
    fetch(`/api/admin/trichter?von=${zeitraum.von}&bis=${zeitraum.bis}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!abgebrochen) setDaten(d); })
      .catch((e) => { if (!abgebrochen) setFehler(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [zeitraum]);

  const sicht = nurReif && daten?.reif ? daten.reif : daten ? { kanaele: daten.kanaele, zusammen: daten.zusammen } : null;

  /* Tagestabelle: Zeilen = Tage (neueste oben), Spalten = Kanäle mit Daten. */
  const tagTabelle = useMemo(() => {
    if (!daten) return null;
    const tage = nurReif ? daten.tage.filter((t) => t.reif) : daten.tage;
    const kanaele = (nurReif && daten.reif ? daten.reif.kanaele : daten.kanaele).map((k) => k.kanal);
    const jeTag = new Map<string, Map<string, TagZeile>>();
    tage.forEach((t) => {
      const m = jeTag.get(t.tag) ?? new Map<string, TagZeile>();
      m.set(t.kanal, t);
      jeTag.set(t.tag, m);
    });
    const tagListe = Array.from(jeTag.keys()).sort().reverse();
    return { kanaele, tagListe, jeTag };
  }, [daten, nurReif]);

  const csvLink = (teil: 'anfragen' | 'tage') =>
    `/api/admin/trichter?von=${daten?.von ?? zeitraum.von}&bis=${daten?.bis ?? zeitraum.bis}&format=csv&teil=${teil}`;

  const zelle = (k: KanalSumme, key: keyof KanalSumme) => {
    const wert = Number(k[key] ?? 0);
    if (key === 'bogenImBild') {
      if (k.bogenGemessen === 0) return <span className="text-gray-400">—</span>;
      return (
        <span title={`${wert} von ${k.bogenGemessen} gemessenen Anfragen`}>
          {wert}<span className="block text-[11px] text-gray-400">{prozent(wert, k.bogenGemessen)}</span>
        </span>
      );
    }
    return (
      <span>
        {wert}<span className="block text-[11px] text-gray-400">{key === 'ohneDoppelte' ? '' : prozent(wert, k.anfragen)}</span>
      </span>
    );
  };

  const jeProfil = (wert: number | null, farbe: string | null) => (
    <span className={`inline-block rounded px-1.5 py-0.5 font-semibold ${farbe ? FARBE[farbe] : 'text-gray-400'}`}>{euro(wert)}</span>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#3D2B1F]">Trichter</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Was aus den Anfragen je Kanal wird, bis zum fertigen Profil und zur Buchung, und was ein Profil kostet.
            Gezählt nach dem Tag der Anfrage{daten ? `. Stand ${kurz(daten.heute)}, ${new Date(daten.stand).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr` : ''}.
          </p>
        </div>
        <div className="flex flex-wrap items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {ZEITRAEUME.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => waehle(z.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                auswahl === z.key ? 'bg-[#5C4A32] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {auswahl === 'frei' && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => { e.preventDefault(); setZeitraum({ ...frei }); }}
        >
          <label className="text-sm text-gray-600">
            von
            <input type="date" value={frei.von} min={tagMinus(heuteBerlin(), 400)} max={frei.bis}
              onChange={(e) => setFrei((f) => ({ ...f, von: e.target.value }))}
              className="ml-2 rounded-md border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-sm text-gray-600">
            bis
            <input type="date" value={frei.bis} min={frei.von} max={heuteBerlin()}
              onChange={(e) => setFrei((f) => ({ ...f, bis: e.target.value }))}
              className="ml-2 rounded-md border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button type="submit" className="rounded-md bg-[#5C4A32] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#6B5942]">
            Zeitraum zeigen
          </button>
        </form>
      )}

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

      {daten && sicht && tagTabelle && (
        <div className={`mt-6 space-y-6 transition-opacity ${laedt ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              {kurz(daten.von)}{daten.von.slice(0, 4)} bis {kurz(daten.bis)}{daten.bis.slice(0, 4)}
              {nurReif && daten.reif ? ` · nur Anfragen bis ${kurz(daten.reifBis)} (älter als 72 Stunden)` : ''}
              {daten.tests > 0 ? ` · ${daten.tests} Tests nicht gezählt` : ''}
            </p>
            <label className={`flex items-center gap-2 text-sm ${daten.reif ? 'text-gray-700' : 'text-gray-400'}`}>
              <input type="checkbox" checked={nurReif && !!daten.reif} disabled={!daten.reif}
                onChange={(e) => setNurReif(e.target.checked)} className="h-4 w-4 accent-[#5C4A32]" />
              Nur reife Tage (Anfrage älter als 72 Stunden)
            </label>
          </div>

          {daten.hinweise.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {daten.hinweise.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Je Kanal</CardTitle>
              <p className="text-xs text-gray-500">
                Unter jeder Zahl der Anteil an den Anfragen. Kosten je Profil gegen das Ziel: bis {daten.ziel.gruenBis} €{' '}
                <span className={`rounded px-1 ${FARBE.gruen}`}>grün</span>, bis {daten.ziel.gelbBis} €{' '}
                <span className={`rounded px-1 ${FARBE.gelb}`}>gelb</span>, darüber{' '}
                <span className={`rounded px-1 ${FARBE.rot}`}>rot</span>. Google-Kosten je Kampagne, eingekaufte Anfragen zum Stückpreis.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="sticky left-0 z-10 bg-white py-2 pr-3">Kanal</th>
                    <th className="py-2 px-1.5 text-right">Anfragen</th>
                    {STUFEN.map((s) => (
                      <th key={String(s.key)} title={s.titel} className="cursor-help py-2 px-1.5 text-right">{s.kopf}</th>
                    ))}
                    <th className="py-2 px-1.5 text-right">Kosten</th>
                    <th className="py-2 px-1.5 text-right" title="Kosten ÷ Profile gesamt">€ je Profil</th>
                    <th className="py-2 pl-1.5 text-right" title="Kosten ÷ Profile, die der Kunde selbst gespeichert hat">€ je Profil selbst</th>
                  </tr>
                </thead>
                <tbody>
                  {sicht.kanaele.concat([sicht.zusammen]).map((k) => (
                    <tr key={k.kanal} className={`align-top tabular-nums ${k.kanal === 'Zusammen' ? 'border-t-2 border-gray-300 font-semibold' : 'border-b border-gray-100'}`}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-2.5 pr-3 font-medium text-[#3D2B1F]">{k.kanal}</td>
                      <td className="py-2.5 px-1.5 text-right font-semibold">{k.anfragen}</td>
                      {STUFEN.map((s) => (
                        <td key={String(s.key)} className="py-2.5 px-1.5 text-right">{zelle(k, s.key)}</td>
                      ))}
                      <td className="py-2.5 px-1.5 text-right">{euro(k.kosten)}</td>
                      <td className="py-2.5 px-1.5 text-right">{k.kosten === null ? <span className="text-gray-400">—</span> : jeProfil(k.jeProfil, k.farbe)}</td>
                      <td className="py-2.5 pl-1.5 text-right">{k.kosten === null ? <span className="text-gray-400">—</span> : jeProfil(k.jeProfilSelbst, k.farbeSelbst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Je Tag</CardTitle>
              <p className="text-xs text-gray-500">
                Je Kanal: Anfragen → Profile gesamt, darunter die Kosten des Tages. Grau: jünger als 72 Stunden, da kommen noch Profile und Buchungen dazu.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="sticky left-0 bg-white py-2 pr-3">Tag</th>
                    {tagTabelle.kanaele.map((k) => <th key={k} className="whitespace-nowrap py-2 px-2 text-right">{k}</th>)}
                    <th className="py-2 pl-2 text-right">Zusammen</th>
                  </tr>
                </thead>
                <tbody>
                  {tagTabelle.tagListe.map((tag) => {
                    const m = tagTabelle.jeTag.get(tag)!;
                    const zeilen = Array.from(m.values());
                    const reif = zeilen.every((z) => z.reif);
                    const a = zeilen.reduce((s, z) => s + z.anfragen, 0);
                    const p = zeilen.reduce((s, z) => s + z.profileGesamt, 0);
                    return (
                      <tr key={tag} className={`border-b border-gray-100 tabular-nums ${reif ? '' : 'text-gray-400'}`}>
                        <td className="sticky left-0 whitespace-nowrap bg-white py-1.5 pr-3">{kurz(tag)}</td>
                        {tagTabelle.kanaele.map((k) => {
                          const z = m.get(k);
                          return (
                            <td key={k} className="whitespace-nowrap py-1.5 px-2 text-right">
                              {z ? (
                                <>
                                  {z.anfragen} → {z.profileGesamt}
                                  {z.kosten !== null && <span className="block text-[11px] text-gray-400">{euro(z.kosten)}</span>}
                                </>
                              ) : <span className="text-gray-300">·</span>}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap py-1.5 pl-2 text-right font-medium">{a} → {p}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <a href={csvLink('anfragen')} download
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-[#3D2B1F] hover:bg-gray-50">
              <Download className="h-4 w-4" /> Anfragen als CSV (anonym)
            </a>
            <a href={csvLink('tage')} download
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-[#3D2B1F] hover:bg-gray-50">
              <Download className="h-4 w-4" /> Tage als CSV
            </a>
          </div>
          <p className="text-xs text-gray-500">
            Die Anfragen-Datei enthält keine Namen, Kontaktdaten, Adressen, Zugangsschlüssel, Google-Klickkennungen oder Angaben aus dem
            Patientenbogen. Die Anfrage-ID ist ein Pseudonym.
          </p>
        </div>
      )}
    </div>
  );
}
