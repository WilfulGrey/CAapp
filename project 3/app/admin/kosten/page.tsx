"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/*
 * Kosten je Lead-Quelle (Martin, 06.09.2026). Eine Seite, um zu sehen, was ein
 * Lead je Quelle kostet und was daraus wird — mit freiem Zeitraum, und die
 * eingekauften einzeln statt als Summe, damit sich jedes Portal bewerten lässt.
 */
type Zeile = {
  key: string; name: string; gruppe: 'eigene' | 'eingekauft';
  leads: number; profile: number; kosten: number; preis: number | null;
  jeLead: number | null; jeProfil: number | null;
};
type Summe = { leads: number; profile: number; kosten: number; jeLead: number | null; jeProfil: number | null };
type Antwort = {
  tage: number; von: string; werbekosten: number; werbetageVorhanden: number;
  zeilen: Zeile[]; ohnePreis: string[]; summe: Summe; eigene: Summe; eingekauft: Summe;
};

const euro = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const ZEITRAEUME = [
  { key: '7', label: '7 Tage' },
  { key: '14', label: '14 Tage' },
  { key: '30', label: '30 Tage' },
  { key: '90', label: '90 Tage' },
  { key: '180', label: '180 Tage' },
];

export default function KostenPage() {
  const [tage, setTage] = useState('30');
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);
    fetch(`/api/admin/lead-kosten?days=${tage}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!abgebrochen) setDaten(d); })
      .catch((e) => { if (!abgebrochen) setFehler(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [tage]);

  const kachel = (titel: string, wert: string, fuss: string) => (
    <Card key={titel}>
      <CardContent className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{titel}</p>
        <p className="mt-1 text-3xl font-bold text-[#3D2B1F] tabular-nums">{wert}</p>
        <p className="mt-1 text-sm text-gray-500">{fuss}</p>
      </CardContent>
    </Card>
  );

  const tabelle = (titel: string, gruppe: 'eigene' | 'eingekauft', summe: Summe, hinweis: string) => {
    const zeilen = (daten?.zeilen ?? []).filter((z) => z.gruppe === gruppe);
    if (zeilen.length === 0) return null;
    return (
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{titel}</CardTitle>
          <p className="text-xs text-gray-500">{hinweis}</p>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="py-2">Quelle</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Profile</th>
                <th className="py-2 text-right">Kosten</th>
                <th className="py-2 text-right">je Lead</th>
                <th className="py-2 text-right">je Profil</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.key} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5">
                    {z.name}
                    {z.preis !== null && <span className="ml-2 text-xs text-gray-400">Stückpreis {euro(z.preis)}</span>}
                    {z.gruppe === 'eingekauft' && z.preis === null && (
                      <span className="ml-2 text-xs text-red-600">kein Preis hinterlegt</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{z.leads}</td>
                  <td className="py-2.5 text-right tabular-nums">{z.profile}</td>
                  <td className="py-2.5 text-right tabular-nums">{euro(z.kosten)}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold">{euro(z.jeLead)}</td>
                  <td className="py-2.5 text-right tabular-nums">{euro(z.jeProfil)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-2.5">Zusammen</td>
                <td className="py-2.5 text-right tabular-nums">{summe.leads}</td>
                <td className="py-2.5 text-right tabular-nums">{summe.profile}</td>
                <td className="py-2.5 text-right tabular-nums">{euro(summe.kosten)}</td>
                <td className="py-2.5 text-right tabular-nums">{euro(summe.jeLead)}</td>
                <td className="py-2.5 text-right tabular-nums">{euro(summe.jeProfil)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#3D2B1F]">Kosten je Quelle</h1>
          <p className="mt-1 text-sm text-gray-600">
            Was ein Lead kostet und was daraus wird — eigene Leads gegen eingekaufte, jede Quelle einzeln.
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {ZEITRAEUME.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setTage(z.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tage === z.key ? 'bg-[#5C4A32] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {fehler && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{fehler}</p>}
      {laedt && <p className="mt-6 text-sm text-gray-500">Wird geladen…</p>}

      {daten && !laedt && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {kachel('Leads gesamt', String(daten.summe.leads),
              `${daten.eigene.leads} eigene · ${daten.eingekauft.leads} eingekauft`)}
            {kachel('Kosten gesamt', euro(daten.summe.kosten),
              `${euro(daten.eigene.kosten)} Werbung · ${euro(daten.eingekauft.kosten)} Einkauf`)}
            {kachel('je Lead', euro(daten.summe.jeLead),
              `${euro(daten.summe.jeProfil)} je Patientenprofil`)}
          </div>

          {daten.werbetageVorhanden < daten.tage && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Werbekosten liegen nur für {daten.werbetageVorhanden} von {daten.tage} Tagen vor. Die Kosten der
              eigenen Leads sind dadurch zu niedrig ausgewiesen.
            </p>
          )}
          {daten.ohnePreis.length > 0 && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Ohne hinterlegten Einkaufspreis und daher mit 0 € gerechnet: {daten.ohnePreis.join(', ')}.
            </p>
          )}

          {tabelle('Eigene Leads', 'eigene', daten.eigene,
            'Werbebudget nach Lead-Anteil auf die Quellen verteilt — eine Anzeige führt auf die Seite, nicht auf Formular oder Chat.')}
          {tabelle('Eingekaufte Leads', 'eingekauft', daten.eingekauft,
            'Stückpreis × Anzahl. Jedes Portal einzeln, damit sich vergleichen lässt, welches sich lohnt.')}
        </>
      )}
    </div>
  );
}
