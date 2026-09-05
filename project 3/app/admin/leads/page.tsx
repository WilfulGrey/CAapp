"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@supabase/supabase-js';
import { Search, Loader as Loader2, Mail, Phone, Calendar, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { istEingekauft, quellenName, reiterFuer, PORTALE } from '@/lib/portal-lead';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* „Dzyń" für neue Leads/Portal-Mails (Registry #48): zwei kurze Sinus-Töne
   (A5 → E6) rein aus WebAudio — kein Asset. Browser-Autoplay: der
   AudioContext startet suspended, bis der erste Klick/Tastendruck ihn
   freischaltet; bis dahin bleibt der Ding stumm, die Tabelle aktualisiert
   sich trotzdem. Modul-Ebene ist SSR-sicher: hier steht nur `null`,
   `new AudioContext()` läuft erst in Handlern. */
let audioCtx: AudioContext | null = null;

function audioFreischalten() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch { /* kein WebAudio — der Ding ist nice-to-have */ }
}

function ding() {
  try {
    audioFreischalten();
    if (!audioCtx || audioCtx.state !== 'running') return;
    const ctx = audioCtx;
    const t0 = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch { /* still scheitern */ }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<any[]>([]);
  /* Protokoll des Abholers (portal_mail_log fuer Postfaecher, Registry
     #47; portal_api_log fuer API-Portale, Registry #50): alles, was KEIN
     Lead wurde — offen/abgelehnt/uebersprungen/altbestand — plus erledigte
     Duplikate (grund gesetzt, keine Mail 1). Beide Quellen auf EINE Form
     gebracht; sichtbar im jeweiligen Portal-Reiter, damit nichts still
     scheitert. */
  const [mailLog, setMailLog] = useState<Array<{
    postfach: string; uidvalidity?: number; kennung: string; status: string;
    grund: string | null; lead_id: string | null; updated_at: string;
  }>>([]);
  // Realtime-Kanal verbunden? Grauer Punkt = Verbindung down — sonst sähe
  // ein toter Socket aus wie „nichts Neues" (die stille Panne aus #47).
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  /* Herkunft: 'all' | 'eigene' | ein source-Wert ("portal:pflegebund.eu").
     Eingekaufte Leads sind eine eigene Welt — sie haben Geld gekostet, sie
     sind zeitkritisch (die Portale liefern an bis zu drei Anbieter) und
     ihre Abschlussquote entscheidet, ob sich die Quelle rechnet. */
  const [quelleFilter, setQuelleFilter] = useState('all');
  /* Testleads (Martin, 05.09.2026: „der filter muss alle 3 optionen haben:
     alle, echte, tests"). Standard „echte" — die Liste soll den echten Zulauf
     zeigen. Die Auswahl wirkt auf ALLES: Herkunfts-Reiter, Zähler und Liste,
     sonst stehen in den Reitern Zahlen, die die Liste nicht hergibt. */
  const [testAnsicht, setTestAnsicht] = useState<'echte' | 'alle' | 'tests'>('echte');
  const [markiere, setMarkiere] = useState<string | null>(null);

  useEffect(() => {
    loadLeads();
  }, []);

  /* Live-Kanal (Registry #48): postgres_changes auf leads + portal_mail_log.
     Abholer und Routen schreiben in die DB, die DB stösst die offene Karte
     an — kein Timer, kein eigener Push-Server. Ein Refetch pro Schwall
     (800 ms Debounce: die erledigte Portal-Mail schreibt Log-Zeile UND Lead
     binnen einer Sekunde), ein Ding pro Schwall (3 s Sperre, leading edge —
     der Ton soll sofort kommen). Rejoin nach Netzabriss macht realtime-js
     selbst (Backoff); jedes SUBSCRIBED holt Verpasstes still nach.

     BEWUSST kein Import von REALTIME_SUBSCRIBE_STATES: supabase-js 2.99
     re-exportiert das Enum nur in den Typdeklarationen, im ESM-Runtime-
     Bundle ist es `undefined` — Typecheck grün, Browser kaputt. Deshalb
     `status: string` (kontravariante Erweiterung des Enum-Parameters). */
  useEffect(() => {
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;
    let letzterDing = 0;

    const aenderung = (payload: { eventType: string }) => {
      if (payload.eventType === 'INSERT' && Date.now() - letzterDing > 3000) {
        letzterDing = Date.now();
        ding();
      }
      clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => loadLeads(true), 800);
    };

    const channel = supabase
      .channel('admin-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, aenderung)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_mail_log' }, aenderung)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_api_log' }, aenderung)
      .subscribe((status: string) => {
        console.log('[admin-live]', status);
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') loadLeads(true);
      });

    /* Laptop-Deckel zu = Socket tot, Timer eingefroren. Beim Sichtbarwerden
       einmal still nachladen, bevor der Heartbeat den Rejoin schafft. */
    const sichtbar = () => { if (document.visibilityState === 'visible') loadLeads(true); };
    document.addEventListener('visibilitychange', sichtbar);
    window.addEventListener('pointerdown', audioFreischalten, { once: true });
    window.addEventListener('keydown', audioFreischalten, { once: true });

    return () => {
      clearTimeout(refetchTimer);
      document.removeEventListener('visibilitychange', sichtbar);
      window.removeEventListener('pointerdown', audioFreischalten);
      window.removeEventListener('keydown', audioFreischalten);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    filterLeads();
  }, [searchTerm, statusFilter, quelleFilter, testAnsicht, leads]);

  /* still=true: Nachladen aus dem Live-Kanal — ohne Spinner, sonst blinkt
     bei jeder Änderung die ganze Seite weg. */
  const loadLeads = async (still = false) => {
    try {
      if (!still) setLoading(true);
      // lead_jobs(count) via FK-Embedding: liefert pro Lead die Anzahl
      // Mamamia-Einsätze OHNE N+1 (Badge „N Einsätze" bei Multi-Job-Kunden).
      const { data } = await supabase
        .from('leads')
        .select('*, lead_jobs(count)')
        .order('created_at', { ascending: false });

      if (data) {
        setLeads(data);
      }

      /* uid=0 ist der "Postfach leer"-Sentinel des Seeds; 'erledigt' OHNE
         grund fehlt bewusst — diese Mails SIND die Leads in der Tabelle.
         'erledigt' MIT grund = Duplikat ohne Mail 1: der bezahlte Lead
         haengt an einem bestehenden (evtl. Rechner-)Lead und waere sonst
         unter keinem Portal-Reiter zu finden. 200 reichen als Sicht. */
      const [{ data: mailZeilen }, { data: apiZeilen }] = await Promise.all([
        supabase
          .from('portal_mail_log')
          .select('postfach, uidvalidity, uid, status, grund, lead_id, updated_at')
          .or('status.neq.erledigt,grund.not.is.null')
          .gt('uid', 0)
          .order('updated_at', { ascending: false })
          .limit(200),
        supabase
          .from('portal_api_log')
          .select('portal, extern_id, status, grund, lead_id, updated_at')
          .or('status.neq.erledigt,grund.not.is.null')
          .neq('extern_id', '__seed__')
          .order('updated_at', { ascending: false })
          .limit(200),
      ]);
      setMailLog([
        ...(mailZeilen ?? []).map((z: any) => ({ ...z, kennung: `#${z.uid}` })),
        ...(apiZeilen ?? []).map((z: any) => ({
          postfach: z.portal, kennung: z.extern_id, status: z.status,
          grund: z.grund, lead_id: z.lead_id, updated_at: z.updated_at,
        })),
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Leads:', error);
      setLoading(false);
    }
  };


  /* Grundmenge der aktuellen Ansicht — Reiter, Zähler und Liste rechnen alle
     hierauf, damit die Zahlen zueinander passen. */
  const sichtbareLeads = leads.filter((l) =>
    testAnsicht === 'alle' ? true : testAnsicht === 'tests' ? !!l.ist_test : !l.ist_test,
  );

  /**
   * Lead als Test kennzeichnen — oder die Kennzeichnung zuruecknehmen.
   *
   * Server-seitig (Service-Key), nicht aus dem Browser heraus: der oeffentliche
   * Anon-Key liegt im Bundle, Schreibrechte gehoeren nicht dorthin. Die Zeile
   * wird sofort lokal umgestellt, damit die Liste nicht wartet; scheitert der
   * Server, wird zurueckgedreht und gesagt warum.
   */
  const testKennzeichnen = async (lead: any, ist_test: boolean) => {
    setMarkiere(lead.id);
    const vorher = leads;
    setLeads((l) => l.map((x) => (x.id === lead.id ? { ...x, ist_test } : x)));
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ist_test }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (e) {
      setLeads(vorher);
      alert('Konnte nicht gespeichert werden: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMarkiere(null);
    }
  };

  const testAnzahl = leads.filter((l) => l.ist_test).length;

  const filterLeads = () => {
    let filtered = [...sichtbareLeads];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.status === statusFilter);
    }

    if (quelleFilter === 'eigene') {
      filtered = filtered.filter((lead) => !istEingekauft(lead.source));
    } else if (quelleFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.source === quelleFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lead) =>
          lead.email?.toLowerCase().includes(term) ||
          lead.vorname?.toLowerCase().includes(term) ||
          lead.telefon?.includes(term)
      );
    }

    setFilteredLeads(filtered);
  };

  /* Reiter-Logik lebt in lib/portal-lead.ts (reiterFuer) — dort testbar,
     hier nur der Aufruf. */
  const reiter = reiterFuer(sichtbareLeads);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      info_requested: 'bg-yellow-100 text-yellow-800',
      angebot_requested: 'bg-orange-100 text-orange-800',
      folge_einsatz: 'bg-blue-100 text-blue-800',
      vertrag_abgeschlossen: 'bg-green-100 text-green-800',
      nicht_interessiert: 'bg-gray-200 text-gray-600',
      // Alarm-Rot: Portal-Mail, die kein echter Lead wurde (Registry #47)
      // — hier muss ein Mensch ran.
      manuell_pruefen: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      info_requested: 'Info angefordert',
      angebot_requested: 'Angebot angefordert',
      folge_einsatz: 'Folge-Einsatz',
      vertrag_abgeschlossen: 'Vertrag abgeschlossen',
      nicht_interessiert: 'Nicht interessiert',
      manuell_pruefen: 'Manuell prüfen',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  /* Badges des Abholer-Protokolls (portal_mail_log / portal_api_log). */
  const mailStatusBadge = (status: string, api = false) => {
    const styles: Record<string, string> = {
      offen: 'bg-amber-100 text-amber-800',
      abgelehnt: 'bg-red-100 text-red-800',
      uebersprungen: 'bg-gray-200 text-gray-600',
      altbestand: 'bg-gray-100 text-gray-500',
      erledigt: 'bg-green-100 text-green-800',
    };
    const labels: Record<string, string> = {
      offen: api ? 'Offen — nächster Versuch, solange im 7-Tage-Fenster' : 'Offen — nächster Versuch in 1 Min.',
      abgelehnt: 'Abgelehnt',
      uebersprungen: 'Übersprungen',
      altbestand: api ? 'Vor Inbetriebnahme — übersprungen' : 'Altbestand',
      erledigt: 'Erledigt — Duplikat, keine Mail 1',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#5C4A32]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie alle Interessenten ({filteredLeads.length} von {sichtbareLeads.length})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`inline-block w-2 h-2 rounded-full ${live ? 'bg-green-500' : 'bg-gray-300'}`} />
            {live ? 'Live' : 'Verbinde …'}
          </span>
          {/* onClick={loadLeads} würde das MouseEvent als `still` übergeben. */}
          <Button onClick={() => loadLeads()} variant="outline">
            Aktualisieren
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          {reiter.map((r) => (
            <button
              key={r.key}
              onClick={() => setQuelleFilter(r.key)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                quelleFilter === r.key
                  ? 'bg-[#E76F63] text-white font-semibold'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
              <span className={`ml-2 tabular-nums ${quelleFilter === r.key ? 'text-white/80' : 'text-gray-400'}`}>
                {r.anzahl}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Suche nach E-Mail, Name oder Telefon..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Drei Ansichten statt an/aus (Martin, 05.09.2026: „der filter muss alle 3
              optionen haben: alle, echte, tests"). „Echte" ist der Alltag, „Tests" zum
              Aufräumen, „Alle" zum Vergleichen. */}
          <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5">
            {([
              { key: 'echte', label: 'Echte', anzahl: leads.length - testAnzahl },
              { key: 'alle', label: 'Alle', anzahl: leads.length },
              { key: 'tests', label: 'Tests', anzahl: testAnzahl },
            ] as const).map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setTestAnsicht(a.key)}
                aria-pressed={testAnsicht === a.key}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  testAnsicht === a.key
                    ? 'bg-[#5C4A32] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a.label}
                <span className={`ml-1.5 tabular-nums ${testAnsicht === a.key ? 'text-white/75' : 'text-gray-400'}`}>
                  {a.anzahl}
                </span>
              </button>
            ))}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="info_requested">Info angefordert</SelectItem>
              <SelectItem value="angebot_requested">Angebot angefordert</SelectItem>
              <SelectItem value="folge_einsatz">Folge-Einsatz</SelectItem>
              <SelectItem value="vertrag_abgeschlossen">Vertrag abgeschlossen</SelectItem>
              <SelectItem value="nicht_interessiert">Nicht interessiert</SelectItem>
              <SelectItem value="manuell_pruefen">Manuell prüfen</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Kontakt
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Herkunft
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Eigenanteil
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Erstellt
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    {/* Der leere Portal-Reiter ist der Normalfall, solange
                        noch nichts eingekauft wurde — "Keine Leads gefunden"
                        laesst dann offen, ob nichts ankam oder etwas kaputt
                        ist. Deshalb hier sagen, worauf man wartet. */}
                    {istEingekauft(quelleFilter) && !searchTerm && statusFilter === 'all' ? (
                      <>
                        <p className="font-medium text-gray-600">
                          Noch keine Leads von {quellenName(quelleFilter)}
                        </p>
                        <p className="mt-1 text-sm">
                          Eingekaufte Anfragen erscheinen hier wenige Sekunden,
                          nachdem sie im Postfach bzw. in der Partner-API eingehen.
                        </p>
                      </>
                    ) : (
                      'Keine Leads gefunden'
                    )}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {[lead.anrede_text, lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </div>
                        {lead.telefon && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3 h-3" />
                            {lead.telefon}
                          </div>
                        )}
                        {/* Mamamia-Verknüpfung (read-only): zeigt auf einen Blick,
                            welche Leads im Portal onboardet sind + ihre MM-Kunden-ID
                            (Abgleich, Doppel-Anlagen erkennen). */}
                        {lead.mamamia_customer_id && (
                          <span className="inline-block mt-1 text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                            MM {lead.mamamia_customer_id}
                          </span>
                        )}
                        {/* Multi-Job-Badge: >1 Einsatz im lead_jobs-Spiegel =
                            Folge-Einsatz-Kunde (Bug #25) — Detailseite zeigt
                            die Liste in der Card „Einsätze (Mamamia)". */}
                        {(lead.lead_jobs?.[0]?.count ?? 0) > 1 && (
                          <span className="inline-block mt-1 ml-1 text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">
                            {lead.lead_jobs[0].count} Einsätze
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(lead.status)}</td>
                    <td className="py-3 px-4">
                      {/* Eingekauft wird hervorgehoben: dieser Lead hat Geld
                          gekostet und laeuft gegen die Uhr — das Portal hat
                          ihn an bis zu drei Anbieter gegeben. */}
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs ${
                          istEingekauft(lead.source)
                            ? 'bg-[#FDEDEB] text-[#B4483C] font-medium'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {quellenName(lead.source)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {lead.kalkulation?.eigenanteil ? (
                        <span className="font-medium text-gray-900">
                          {lead.kalkulation.eigenanteil.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        <span>
                          {new Date(lead.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                          <span className="text-gray-400 ml-1">
                            {new Date(lead.created_at).toLocaleTimeString('de-DE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-3">
                        {/* Kennzeichnen statt löschen (Martin, 05.09.2026): der Lead bleibt,
                            verschwindet aber aus Liste, Statistik und Berichten — und kommt
                            mit demselben Knopf zurück. */}
                        <button
                          type="button"
                          disabled={markiere === lead.id}
                          onClick={() => testKennzeichnen(lead, !lead.ist_test)}
                          title={lead.ist_test
                            ? 'Kennzeichnung zurücknehmen — der Lead zählt wieder mit'
                            : 'Als Testlead kennzeichnen — verschwindet aus Liste und Statistik'}
                          className={`text-xs font-medium transition-colors disabled:opacity-50 ${
                            lead.ist_test
                              ? 'text-[#5C4A32] hover:text-[#7D6850]'
                              : 'text-gray-400 hover:text-gray-700'
                          }`}
                        >
                          {markiere === lead.id ? '…' : lead.ist_test ? 'Kein Test' : 'Test'}
                        </button>
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="text-[#5C4A32] hover:text-[#7D6850] text-sm font-medium inline-flex items-center gap-1"
                        >
                          Details
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Postfach-Protokoll (Registry #47): jede Mail des aktiven
            Portal-Postfachs, die KEIN Lead wurde — offen / abgelehnt /
            uebersprungen / altbestand. Nichts scheitert still: was der
            Abholer nicht anlegen konnte, steht hier. 'erledigt' fehlt
            bewusst — diese Mails SIND die Leads in der Tabelle darüber. */}
        {istEingekauft(quelleFilter) && (() => {
          const postfach = quelleFilter.slice('portal:'.length);
          const api = PORTALE.find((p) => p.domain === postfach)?.abholung === 'api';
          const zeilen = mailLog.filter((z) => z.postfach === postfach);
          return (
            <div className="mt-8 border-t border-gray-200 pt-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                {api ? `API ${postfach} — Leads ohne Lead` : `Postfach ${postfach} — Mails ohne Lead`}
                <span className="ml-2 tabular-nums text-gray-400">{zeilen.length}</span>
              </h2>
              {zeilen.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Alles verarbeitet — nichts Offenes, Abgelehntes oder Übersprungenes.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">{api ? 'Kennung' : 'Mail'}</th>
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">Status</th>
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">Grund</th>
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">Zuletzt</th>
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {zeilen.map((z) => (
                        <tr key={`${z.postfach}-${z.uidvalidity ?? 'api'}-${z.kennung}`} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-4 text-sm font-mono text-gray-600 break-all">{z.kennung}</td>
                          <td className="py-2 px-4">{mailStatusBadge(z.status, api)}</td>
                          <td className="py-2 px-4 text-sm text-gray-600">{z.grund || '—'}</td>
                          <td className="py-2 px-4 text-sm text-gray-600">
                            {new Date(z.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            <span className="text-gray-400 ml-1">
                              {new Date(z.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            {z.lead_id && (
                              <Link
                                href={`/admin/leads/${z.lead_id}`}
                                className="text-[#5C4A32] hover:text-[#7D6850] text-sm font-medium inline-flex items-center gap-1"
                              >
                                Lead
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
