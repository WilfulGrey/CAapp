import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  alleSeiten, anfrageZeilen, anfragenCsv, berlinTagBeginn, EREIGNISSE_MIT_FELDERN, EREIGNISSE_OHNE_METADATEN,
  FELDER_AUSWAHL, hinweise, kostenLage, LEAD_SPALTEN, mitReife, pruefeZeitraum, pseudonym, reifBis, stuecke,
  tabelleFehlt, tageCsv, tageZwischen, trichterSummen, ZIEL_GELB_BIS, ZIEL_GRUEN_BIS,
  type KostenKampagneTag, type KostenTag, type TAnnahme, type TEreignis, type TLead,
} from '@/lib/trichter';
import { berlinTag, tagPlus } from '@/lib/wachstum';

/**
 * Trichter je Kanal (Registry #142, Martin 27.10.2026): Anfrage → Portal → Bogen → Profil
 * (selbst / Team) → Einladung → Bewerbung → Buchung, mit Kosten je Profil.
 *
 *   GET /api/admin/trichter?von=JJJJ-MM-TT&bis=JJJJ-MM-TT            → JSON (nur Summen)
 *   GET /api/admin/trichter?…&format=csv&teil=anfragen|tage           → CSV-Datei (anonym)
 *
 * Server-seitig mit dem Service-Key. Kontaktfelder und Klickkennungen werden nur zur
 * Test- und Doppelten-Erkennung gelesen und verlassen den Server nie; die Anfrage-ID der
 * CSV ist ein HMAC-Pseudonym (Schlüssel aus dem Service-Key). Rechnen: lib/trichter.ts.
 */

const ID_STUECK = 100; // Lead-IDs je Abfrage: hält die Adresse kurz
const PARALLEL = 4;

type Abfrage<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;
const als = <T,>(q: unknown) => q as Abfrage<T>;

async function begrenzt<T>(aufgaben: (() => Promise<T>)[], parallel: number): Promise<T[]> {
  const ergebnis: T[] = new Array(aufgaben.length);
  let naechste = 0;
  const arbeiter = async () => {
    while (naechste < aufgaben.length) {
      const i = naechste++;
      ergebnis[i] = await aufgaben[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, aufgaben.length) }, arbeiter));
  return ergebnis;
}

export async function GET(request: NextRequest) {
  /* Ohne ADMIN_PASSWORD kein Zugang (kein Ersatzpasswort im Code; die middleware sperrt
     /api/admin/* in dem Fall ohnehin). PR #809 stellt die Prüfung für alle Routen um. */
  const passwort = process.env.ADMIN_PASSWORD;
  const cookie = request.cookies.get('admin_auth')?.value ?? '';
  if (!passwort || cookie !== passwort) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500 });

  const p = request.nextUrl.searchParams;
  const format = p.get('format');
  const teil = p.get('teil');
  if (format === 'csv' && teil !== 'anfragen' && teil !== 'tage') {
    return NextResponse.json({ error: 'teil muss anfragen oder tage sein' }, { status: 400 });
  }
  const jetzt = new Date();
  const heute = berlinTag(jetzt);
  const zeitraum = pruefeZeitraum(p.get('von'), p.get('bis'), heute);
  if (!zeitraum.ok) return NextResponse.json({ error: zeitraum.fehler }, { status: 400 });
  const { von, bis } = zeitraum.wert;

  const supabase: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const vonBeginn = berlinTagBeginn(von).getTime();
  const bisEnde = berlinTagBeginn(tagPlus(bis, 1)).toISOString();

  try {
    /* Alle Leads bis zum Ende des Zeitraums — auch frühere, weil eine Anfrage im Zeitraum
       die Doppelte einer älteren sein kann. Rund 1.000 Zeilen, seitenweise. */
    const alle = await alleSeiten<TLead>((a, b) => als<TLead>(supabase.from('leads')
      .select(LEAD_SPALTEN).lt('created_at', bisEnde).order('created_at').order('id').range(a, b)));
    const ids = alle.filter((l) => new Date(l.created_at).getTime() >= vonBeginn).map((l) => l.id);

    /* Ereignisse nur der Leads im Zeitraum und nur der gebrauchten Typen
       (portal_reopened allein hat seit 01.09. über 3.600 Zeilen). */
    const teile = stuecke(ids, ID_STUECK);
    const [ohne, mit, annahmen] = await Promise.all([
      begrenzt(teile.map((t) => () => alleSeiten<TEreignis>((a, b) => als<TEreignis>(supabase.from('lead_events')
        .select('lead_id, event_type, created_at').in('lead_id', t).in('event_type', EREIGNISSE_OHNE_METADATEN)
        .order('id').range(a, b)))), PARALLEL),
      begrenzt(teile.map((t) => () => alleSeiten<TEreignis>((a, b) => als<TEreignis>(supabase.from('lead_events')
        .select(FELDER_AUSWAHL).in('lead_id', t).in('event_type', EREIGNISSE_MIT_FELDERN)
        .order('id').range(a, b)))), PARALLEL),
      begrenzt(teile.map((t) => () => alleSeiten<TAnnahme>((a, b) => als<TAnnahme>(supabase.from('lead_application_acceptances')
        .select('lead_id, accepted_at, signed_at').in('lead_id', t)
        .order('lead_id').order('application_id').range(a, b)))), PARALLEL),
    ]);

    /* Kosten. Fehlt die Kampagnen-Tabelle (Migration noch nicht eingespielt), bleibt es
       beim Hinweis — kein Fehler, keine geschätzten Kosten. */
    let kampagne: KostenKampagneTag[] | null = null;
    try {
      kampagne = await alleSeiten<KostenKampagneTag>((a, b) => als<KostenKampagneTag>(supabase.from('ads_kosten_kampagne_tag')
        .select('tag, kampagne_id, kampagne_name, kosten_netto, klicks, impressionen')
        .gte('tag', von).lte('tag', bis).order('tag').order('kampagne_id').range(a, b)));
    } catch (e) {
      if (!tabelleFehlt(e)) throw e;
    }
    let gesamt: KostenTag[] | null = null;
    try {
      gesamt = await alleSeiten<KostenTag>((a, b) => als<KostenTag>(supabase.from('ads_kosten_tag')
        .select('tag, kosten_netto').gte('tag', von).lte('tag', bis).order('tag').range(a, b)));
    } catch (e) {
      if (!tabelleFehlt(e)) throw e;
    }

    const { zeilen, tests } = anfrageZeilen({
      alle,
      ereignisse: ([] as TEreignis[]).concat(...ohne, ...mit),
      annahmen: ([] as TAnnahme[]).concat(...annahmen),
      von, bis, jetzt,
      pseudo: (id) => pseudonym(id, key),
    });
    const lage = kostenLage({ kampagne, gesamt, von, bis, heute });
    const alleTage = tageZwischen(von, bis);
    const reif = reifBis(jetzt);
    const ergebnis = trichterSummen(zeilen, lage, alleTage);
    const tage = mitReife(ergebnis.tage, reif);

    if (format === 'csv') {
      const namen: Record<string, string> = {};
      (kampagne ?? []).forEach((k) => { if (k.kampagne_name) namen[String(k.kampagne_id)] = String(k.kampagne_name); });
      const text = teil === 'anfragen' ? anfragenCsv(zeilen, namen) : tageCsv(tage);
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="trichter-${teil}-${von}-bis-${bis}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const reifeTage = alleTage.filter((t) => t <= reif);
    const reifeSumme = reifeTage.length > 0 ? trichterSummen(zeilen, lage, reifeTage) : null;
    return NextResponse.json({
      von, bis, heute, stand: jetzt.toISOString(), reifBis: reif,
      ziel: { gruenBis: ZIEL_GRUEN_BIS, gelbBis: ZIEL_GELB_BIS },
      kostenJeKampagne: lage.tabelleDa,
      tests,
      kanaele: ergebnis.kanaele,
      googleGesamt: ergebnis.googleGesamt,
      zusammen: ergebnis.zusammen,
      google: ergebnis.google,
      reif: reifeSumme ? { kanaele: reifeSumme.kanaele, googleGesamt: reifeSumme.googleGesamt, zusammen: reifeSumme.zusammen } : null,
      tage,
      hinweise: [
        ...(zeitraum.wert.hinweis ? [zeitraum.wert.hinweis] : []),
        ...hinweise({ lage, von, bis, heute, reifBis: reif, trichter: ergebnis, jetzt }),
      ],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
