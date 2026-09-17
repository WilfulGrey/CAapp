import { NextRequest } from 'next/server';
import { withMem } from '@/lib/memlog';
import { ergebnisSeite, hinweisSeite, moderationsSeite } from '@/lib/bewertungen-mails';
import { fehlerText, htmlAntwort, supabaseDienst, type Supa } from '@/lib/bewertungen-server';
import {
  aktionAus,
  istTokenFormat,
  moderationsPlan,
  tokenHash,
  type BewertungStatus,
  type ModerationsAktion,
} from '@/lib/bewertungen';

// Freigabe-Links aus der Team-Mail.
//   GET  zeigt die Bewertung und EINEN Knopf. Ändert nie etwas: Mail-Scanner
//        (Outlook Safe Links, Gmail) öffnen Links von selbst.
//   POST (Formular derselben Seite, Felder t + aktion) wendet die Aktion an.
//        Idempotent: steht die Bewertung schon im Zielzustand, ist nichts zu tun.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPALTEN = 'id, status, kunde_bestaetigt, erstellt_am, sterne, text, name, ort, email';

interface Zeile {
  id: string;
  status: BewertungStatus;
  kunde_bestaetigt: boolean;
  erstellt_am: string;
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  email: string;
}

const UNGUELTIG = () =>
  htmlAntwort(hinweisSeite('Link ungültig', 'Dieser Freigabe-Link ist ungültig. Bitte nutzen Sie den Link aus der neuesten Team-Mail zu dieser Bewertung.'), 404);
const UNBEKANNTE_AKTION = () =>
  htmlAntwort(hinweisSeite('Unbekannte Aktion', 'Der Link enthält keine gültige Aktion (freigeben, freigeben_kunde oder ablehnen).'), 400);
const SERVERFEHLER = () =>
  htmlAntwort(hinweisSeite('Fehler', 'Das hat gerade nicht geklappt. Bitte versuchen Sie es in einigen Minuten noch einmal.'), 500);

async function ladeZeile(supabase: Supa, token: string): Promise<Zeile | null> {
  const { data, error } = await supabase.from('bewertungen').select(SPALTEN).eq('moderation_token_hash', tokenHash(token)).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Zeile | null) ?? null;
}

function eingabe(t: unknown, a: unknown): { token: string; aktion: ModerationsAktion } | Response {
  if (!istTokenFormat(t)) return UNGUELTIG();
  const aktion = aktionAus(a);
  if (!aktion) return UNBEKANNTE_AKTION();
  return { token: t, aktion };
}

async function handleGet(request: NextRequest) {
  const e = eingabe(request.nextUrl.searchParams.get('t'), request.nextUrl.searchParams.get('aktion'));
  if (e instanceof Response) return e;
  try {
    const zeile = await ladeZeile(supabaseDienst(), e.token);
    if (!zeile) return UNGUELTIG();
    const plan = moderationsPlan(zeile, e.aktion, new Date().toISOString());
    return htmlAntwort(
      moderationsSeite({ bewertung: zeile, status: zeile.status, kundeBestaetigt: zeile.kunde_bestaetigt, token: e.token, aktion: e.aktion, plan }),
    );
  } catch (err) {
    console.error('[bewertungen] Moderation anzeigen:', fehlerText(err));
    return SERVERFEHLER();
  }
}

async function handlePost(request: NextRequest) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return UNGUELTIG();
  }
  const e = eingabe(form.get('t'), form.get('aktion'));
  if (e instanceof Response) return e;

  try {
    const supabase = supabaseDienst();
    const zeile = await ladeZeile(supabase, e.token);
    if (!zeile) return UNGUELTIG();

    const jetztIso = new Date().toISOString();
    const plan = moderationsPlan(zeile, e.aktion, jetztIso);
    if (plan.art === 'nicht_moeglich') return htmlAntwort(hinweisSeite('Nicht möglich', plan.grund), 409);

    if (plan.art === 'aendern') {
      // Nur aus dem erwarteten Stand heraus ändern (zwei Klicks gleichzeitig).
      const { data, error } = await supabase
        .from('bewertungen')
        .update(plan.update)
        .eq('id', zeile.id)
        .eq('status', plan.vonStatus)
        .select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        const neu = await ladeZeile(supabase, e.token);
        const nachher = neu ? moderationsPlan(neu, e.aktion, jetztIso) : null;
        if (!nachher) return UNGUELTIG();
        if (nachher.art === 'nicht_moeglich') return htmlAntwort(hinweisSeite('Nicht möglich', nachher.grund), 409);
        if (nachher.art === 'aendern') {
          return htmlAntwort(hinweisSeite('Bitte neu laden', 'Die Bewertung wurde gerade gleichzeitig geändert. Bitte öffnen Sie den Link noch einmal.'), 409);
        }
      } else {
        console.log(`[bewertungen] moderiert id=${zeile.id} aktion=${e.aktion}`);
      }
    }
    return htmlAntwort(ergebnisSeite(e.aktion));
  } catch (err) {
    console.error('[bewertungen] Moderation anwenden:', fehlerText(err));
    return SERVERFEHLER();
  }
}

export const GET = withMem('bewertungen moderation GET', handleGet);
export const POST = withMem('bewertungen moderation POST', handlePost);
