import { NextResponse } from 'next/server';

/**
 * Schnitt und Anzahl aller Bewertungen — dieselbe Angabe wie überall auf
 * primundus.de („4,9 von 5 aus 126 Bewertungen", Martin 17.09.2026). Quelle
 * ist die öffentliche Schnittstelle der Website (Google live + direkte
 * Bewertungen, dort stündlich neu). Der Rechner fragt über die EIGENE Domain
 * (kein Fremdaufruf aus dem Browser) und zeigt die Zeile nur, wenn eine echte
 * Zahl da ist — nie eine erfundene oder veraltete aus dem Code.
 */
const QUELLE = 'https://primundus.de/api/bewertungen-stand';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await fetch(QUELLE, { next: { revalidate: 3600 } });
    if (!r.ok) return NextResponse.json({ anzahl: 0 }, { status: 502 });
    const j = await r.json();
    const anzahl = Number(j?.anzahl);
    const wert = Number(j?.wert);
    if (!Number.isFinite(anzahl) || anzahl <= 0 || !Number.isFinite(wert) || wert <= 0 || wert > 5 || typeof j?.schnitt !== 'string') {
      return NextResponse.json({ anzahl: 0 }, { status: 502 });
    }
    return NextResponse.json(
      { schnitt: j.schnitt, wert, anzahl },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json({ anzahl: 0 }, { status: 502 });
  }
}
