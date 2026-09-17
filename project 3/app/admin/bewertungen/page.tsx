"use client";

/*
 * Admin → Bewertungen (Martin, 17.09.2026).
 *
 * Alles, was auf primundus.de/erfahrungen steht oder dort landen soll:
 * Bewertungen aus dem Formular (freigeben, ablehnen, zurückziehen, antworten)
 * und Bewertungen, die per Mail, Telefon, Brief oder bei Google kamen und hier
 * eingetragen werden. Eingetragene gehen sofort online, es gehen keine Mails raus.
 *
 * Gelesen und geschrieben wird über /api/admin/bewertungen (Service-Key): die
 * Tabelle hat RLS ohne Policy. Logik: lib/bewertungen-admin.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, X, Star, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  ADMIN_AKTIONEN,
  EINTRAG_HERKUNFT,
  HERKUNFT_LABEL,
  moeglicheAktionen,
  STATUS_LABEL,
  anzeigeDatum,
  type AdminAktion,
  type AdminBewertung,
} from '@/lib/bewertungen-admin';
import { berlinDatum, berlinDatumZeit, type BewertungStatus, type Herkunft } from '@/lib/bewertungen-basis';

type Filter = 'alle' | BewertungStatus;
const FILTER: { key: Filter; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'bestaetigt', label: STATUS_LABEL.bestaetigt },
  { key: 'veroeffentlicht', label: STATUS_LABEL.veroeffentlicht },
  { key: 'unbestaetigt', label: STATUS_LABEL.unbestaetigt },
  { key: 'abgelehnt', label: STATUS_LABEL.abgelehnt },
];

const STATUS_FARBE: Record<BewertungStatus, string> = {
  unbestaetigt: 'bg-gray-100 text-gray-700',
  bestaetigt: 'bg-amber-100 text-amber-800',
  veroeffentlicht: 'bg-emerald-100 text-emerald-800',
  abgelehnt: 'bg-red-100 text-red-700',
};

const AKTION_FARBE: Record<AdminAktion, string> = {
  freigeben: 'bg-[#2A7A4B] text-white hover:bg-[#23673F]',
  freigeben_kunde: 'bg-[#1F5F8B] text-white hover:bg-[#194E73]',
  ablehnen: 'border border-red-300 text-red-700 hover:bg-red-50',
  zurueckziehen: 'border border-red-300 text-red-700 hover:bg-red-50',
};

const RUECKFRAGE: Partial<Record<AdminAktion, string>> = {
  ablehnen: 'Bewertung ablehnen? Sie wird nicht veröffentlicht.',
  zurueckziehen: 'Bewertung zurückziehen? Sie verschwindet innerhalb von etwa 5 Minuten von primundus.de/erfahrungen.',
};

const sterne = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const tagText = (ymd: string) => ymd.split('-').reverse().join('.');

async function senden(url: string, body: unknown): Promise<{ bewertung?: AdminBewertung; hinweis?: string }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const felder = d.felder ? ` ${Object.values(d.felder as Record<string, string>).join(' ')}` : '';
    throw new Error(`${d.fehler ?? `HTTP ${r.status}`}${felder}`);
  }
  return d;
}

export default function BewertungenPage() {
  const [liste, setListe] = useState<AdminBewertung[]>([]);
  const [grenze, setGrenze] = useState<number | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');
  const [formOffen, setFormOffen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/bewertungen')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.fehler || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => { setListe(d.bewertungen ?? []); setGrenze(d.grenze ?? null); })
      .catch((e) => setFehler(e instanceof Error ? e.message : String(e)))
      .finally(() => setLaedt(false));
  }, []);

  const anzahl = useMemo(() => {
    const z: Record<Filter, number> = { alle: liste.length, unbestaetigt: 0, bestaetigt: 0, veroeffentlicht: 0, abgelehnt: 0 };
    for (const b of liste) z[b.status] += 1;
    return z;
  }, [liste]);
  const sichtbar = filter === 'alle' ? liste : liste.filter((b) => b.status === filter);

  const ersetzen = (b: AdminBewertung) => setListe((l) => l.map((x) => (x.id === b.id ? b : x)));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#3D2B1F]">Bewertungen</h1>
          <p className="mt-1 text-sm text-gray-600">
            Was auf{' '}
            <a href="https://primundus.de/erfahrungen" target="_blank" rel="noreferrer" className="underline hover:text-[#5C4A32]">
              primundus.de/erfahrungen
            </a>{' '}
            steht und was auf Freigabe wartet. Änderungen sind dort nach etwa 5 Minuten sichtbar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOffen((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#5C4A32] px-4 py-2 text-sm font-medium text-white hover:bg-[#4A3B28]"
        >
          {formOffen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {formOffen ? 'Schließen' : 'Bewertung eintragen'}
        </button>
      </div>

      {formOffen && (
        <EintragFormular
          onGespeichert={(b) => { setListe((l) => [b, ...l]); setFormOffen(false); setFilter('alle'); }}
        />
      )}

      <div className="mt-6 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
        {FILTER.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-[#5C4A32] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label} <span className="tabular-nums opacity-70">{anzahl[f.key]}</span>
          </button>
        ))}
      </div>

      {fehler && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{fehler}</p>}
      {laedt && <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>}
      {!laedt && !fehler && grenze !== null && liste.length >= grenze && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Es werden nur die neuesten {grenze} Bewertungen gezeigt.
        </p>
      )}
      {!laedt && !fehler && sichtbar.length === 0 && (
        <Card className="mt-6 p-8 text-center text-gray-500">
          <Star className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          {filter === 'alle' ? 'Noch keine Bewertungen.' : `Keine Bewertungen mit Status „${STATUS_LABEL[filter]}“.`}
        </Card>
      )}

      <div className="mt-6 space-y-4">
        {sichtbar.map((b) => <BewertungKarte key={b.id} b={b} onGeaendert={ersetzen} />)}
      </div>
    </div>
  );
}

function BewertungKarte({ b, onGeaendert }: { b: AdminBewertung; onGeaendert: (b: AdminBewertung) => void }) {
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [antwort, setAntwort] = useState(b.antwort ?? '');
  useEffect(() => { setAntwort(b.antwort ?? ''); }, [b.antwort]);

  async function aktion(a: AdminAktion) {
    const frage = RUECKFRAGE[a];
    if (frage && !window.confirm(frage)) return;
    setArbeitet(a); setFehler(null);
    try {
      const d = await senden(`/api/admin/bewertungen/${b.id}`, { aktion: a });
      if (d.bewertung) onGeaendert(d.bewertung);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setArbeitet(null);
    }
  }

  async function antwortSpeichern() {
    setArbeitet('antwort'); setFehler(null);
    try {
      const d = await senden(`/api/admin/bewertungen/${b.id}`, { antwort });
      if (d.bewertung) onGeaendert(d.bewertung);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setArbeitet(null);
    }
  }

  const aktionen = moeglicheAktionen(b.status, b.kunde_bestaetigt);
  const antwortGeaendert = antwort.trim() !== (b.antwort ?? '').trim();

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-lg tracking-wider text-[#D99A1E]" aria-label={`${b.sterne} von 5 Sternen`}>{sterne(b.sterne)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_FARBE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
        {b.kunde_bestaetigt && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Kunde bestätigt</span>}
        <span className="text-xs text-gray-500">{HERKUNFT_LABEL[b.herkunft] ?? b.herkunft}</span>
        <span className="ml-auto text-xs text-gray-500 tabular-nums">Datum {tagText(anzeigeDatum(b))}</span>
      </div>

      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-gray-900">{b.text}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        <span className="font-medium text-gray-900">{b.name}{b.ort ? `, ${b.ort}` : ''}</span>
        {b.email && <a href={`mailto:${b.email}`} className="hover:underline">{b.email}</a>}
        <span className="text-xs text-gray-400">Eingang {berlinDatumZeit(b.erstellt_am)}</span>
        {b.lead_id && (
          <Link href={`/admin/leads/${b.lead_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline">
            Passender Lead <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {aktionen.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {aktionen.map((a) => (
            <button
              key={a}
              type="button"
              disabled={arbeitet !== null}
              onClick={() => aktion(a)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${AKTION_FARBE[a]}`}
            >
              {arbeitet === a && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {ADMIN_AKTIONEN[a]}
            </button>
          ))}
        </div>
      )}
      {b.status === 'unbestaetigt' && (
        <p className="mt-2 text-xs text-gray-500">Die Person hat den Link in der Bestätigungsmail noch nicht geklickt. Freigeben geht erst danach.</p>
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        <label htmlFor={`antwort-${b.id}`} className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Antwort von Primundus {b.antwort_am && <span className="normal-case tracking-normal font-normal">· zuletzt {berlinDatumZeit(b.antwort_am)}</span>}
        </label>
        <textarea
          id={`antwort-${b.id}`}
          value={antwort}
          onChange={(e) => setAntwort(e.target.value)}
          rows={antwort ? 3 : 2}
          maxLength={2000}
          placeholder="Öffentliche Antwort unter der Bewertung. Leer lassen und speichern entfernt sie."
          className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-[#8B7355] focus:outline-none"
        />
        {antwortGeaendert && (
          <button
            type="button"
            disabled={arbeitet !== null}
            onClick={antwortSpeichern}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#5C4A32] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4A3B28] disabled:opacity-50"
          >
            {arbeitet === 'antwort' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {antwort.trim() ? 'Antwort speichern' : 'Antwort entfernen'}
          </button>
        )}
      </div>

      {fehler && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{fehler}</p>}
    </Card>
  );
}

function EintragFormular({ onGespeichert }: { onGespeichert: (b: AdminBewertung) => void }) {
  const heute = berlinDatum(new Date().toISOString());
  const [sterneWert, setSterne] = useState(5);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [ort, setOrt] = useState('');
  const [datum, setDatum] = useState(heute);
  const [herkunft, setHerkunft] = useState<Herkunft>('team');
  const [kunde, setKunde] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setSpeichert(true); setFehler(null);
    try {
      const d = await senden('/api/admin/bewertungen', { sterne: sterneWert, text, name, ort, datum, herkunft, kunde_bestaetigt: kunde });
      if (d.bewertung) onGespeichert(d.bewertung);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setSpeichert(false);
    }
  }

  const feld = 'mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-[#8B7355] focus:outline-none';
  const beschriftung = 'text-sm font-medium text-gray-800';

  return (
    <Card className="mt-6 p-5">
      <form onSubmit={speichern} className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#3D2B1F]">Bewertung eintragen</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Für Bewertungen per Mail, Telefon, Brief oder von Google. Wird sofort veröffentlicht, es geht keine Mail raus.
          </p>
        </div>

        <div>
          <span className={beschriftung}>Sterne</span>
          <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Sterne">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={sterneWert === n}
                aria-label={`${n} von 5 Sternen`}
                onClick={() => setSterne(n)}
                className={`text-2xl leading-none ${n <= sterneWert ? 'text-[#D99A1E]' : 'text-gray-300'}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className={beschriftung}>Text</span>
          <textarea required value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className={feld} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={beschriftung}>Name wie veröffentlicht</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={feld} placeholder="z. B. Renate M." />
            <span className="mt-1 block text-xs text-gray-500">Nachname auf Anfangsbuchstaben kürzen.</span>
          </label>
          <label className="block">
            <span className={beschriftung}>Ort <span className="font-normal text-gray-400">(optional)</span></span>
            <input value={ort} onChange={(e) => setOrt(e.target.value)} maxLength={60} className={feld} />
          </label>
          <label className="block">
            <span className={beschriftung}>Datum der Bewertung</span>
            <input required type="date" value={datum} max={heute} onChange={(e) => setDatum(e.target.value)} className={feld} />
          </label>
          <label className="block">
            <span className={beschriftung}>Herkunft</span>
            <select value={herkunft} onChange={(e) => setHerkunft(e.target.value as Herkunft)} className={feld}>
              {EINTRAG_HERKUNFT.map((h) => <option key={h} value={h}>{HERKUNFT_LABEL[h]}</option>)}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={kunde} onChange={(e) => setKunde(e.target.checked)} className="h-4 w-4 accent-[#5C4A32]" />
          Kunde bestätigt
        </label>

        {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{fehler}</p>}

        <button
          type="submit"
          disabled={speichert}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5C4A32] px-4 py-2 text-sm font-medium text-white hover:bg-[#4A3B28] disabled:opacity-50"
        >
          {speichert && <Loader2 className="h-4 w-4 animate-spin" />}
          Bewertung veröffentlichen
        </button>
      </form>
    </Card>
  );
}
