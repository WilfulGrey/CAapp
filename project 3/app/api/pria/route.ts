/*
 * Prias Sprachdienst — der einzige Ort, an dem der Anthropic-Schlüssel
 * vorkommt. Der Browser sieht ihn nie.
 *
 * Die Fachlogik (Prompt, Werkzeug, Prüfung) liegt in lib/pria.ts und ist
 * ohne Schlüssel testbar; hier steht nur der Netzaufruf drumherum.
 *
 * Gedacht für die Testseite /pria.html. Ohne ANTHROPIC_API_KEY antwortet
 * die Route ehrlich mit 503 — das Widget fällt dann sichtbar auf seine
 * Stichwortsuche zurück, statt so zu tun, als verstünde es etwas.
 */
import { NextResponse } from 'next/server';
import { SYSTEM, WERKZEUG, pruefen, zustandText, type PriaZustand } from '@/lib/pria';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODELL = process.env.PRIA_MODELL || 'claude-opus-5';

type Zeile = { rolle?: string; text?: string };

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { fehler: 'ANTHROPIC_API_KEY fehlt — Pria versteht gerade nur Stichwörter.' },
      { status: 503 },
    );
  }

  let body: { text?: string; zustand?: PriaZustand; verlauf?: Zeile[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const text = String(body.text || '').slice(0, 2000);
  if (!text.trim()) return NextResponse.json({ fehler: 'Leere Nachricht.' }, { status: 400 });

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
    (Array.isArray(body.verlauf) ? body.verlauf.slice(-12) : [])
      .filter((m) => m && typeof m.text === 'string' && m.text.trim())
      .map((m) => ({
        role: m.rolle === 'pria' ? ('assistant' as const) : ('user' as const),
        content: String(m.text).slice(0, 2000),
      }));
  // Das Fenster kann mitten in einer Antwort anfangen — die API will als
  // Erstes eine Kundennachricht.
  while (messages.length && messages[0].role === 'assistant') messages.shift();

  // Der Zustand gehört ans Ende, nicht in den zwischengespeicherten
  // Systemblock — sonst fällt der Cache bei jeder Nachricht.
  messages.push({
    role: 'user',
    content: `<zustand>\n${zustandText(body.zustand)}\n</zustand>\n\n<nachricht>\n${text}\n</nachricht>`,
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 1200,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages,
        tools: [WERKZEUG],
        tool_choice: { type: 'tool', name: WERKZEUG.name },
      }),
      // Render-Starter ist warm, trotzdem eine Obergrenze: ein hängender
      // Aufruf blockiert sonst den einzigen Node-Prozess.
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const rumpf = await res.text();
      console.warn('[pria] Anthropic-Fehler', res.status, rumpf.slice(0, 300));
      return NextResponse.json({ fehler: `KI-Dienst nicht erreichbar (HTTP ${res.status}).` }, { status: 502 });
    }

    const daten = await res.json();
    const block = (daten.content || []).find((b: any) => b.type === 'tool_use');
    if (!block) {
      console.warn('[pria] Modell hat kein Werkzeug aufgerufen', JSON.stringify(daten).slice(0, 300));
      return NextResponse.json({ fehler: 'Keine verwertbare Antwort.' }, { status: 502 });
    }

    const antwort = pruefen(block.input);
    const u = daten.usage || {};
    console.log(`[pria] ${antwort.typ}${antwort.feld ? ' ' + antwort.feld + '=' + antwort.werte.join('|') : ''}` +
      `  ↑${u.input_tokens} (cache ${u.cache_read_input_tokens || 0}) ↓${u.output_tokens}`);

    return NextResponse.json(antwort);
  } catch (e: any) {
    console.warn('[pria] Aufruf fehlgeschlagen:', e?.message);
    return NextResponse.json({ fehler: 'KI-Dienst nicht erreichbar.' }, { status: 502 });
  }
}
