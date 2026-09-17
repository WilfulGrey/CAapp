import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { withMem } from '@/lib/memlog';
import { hinweisSeite, teamMail, type LeadTreffer } from '@/lib/bewertungen-mails';
import { fehlerText, htmlAntwort, supabaseDienst, type Supa } from '@/lib/bewertungen-server';
import {
  apiBasis,
  bestaetigungsErgebnis,
  ilikeExakt,
  istTokenFormat,
  moderationsLinks,
  neuerToken,
  teamEmpfaenger,
  tokenHash,
  zielUrl,
  type BewertungStatus,
} from '@/lib/bewertungen';

// Link aus der Bestätigungsmail. Setzt „bestaetigt“, merkt sich den passenden
// Lead (nur als Hinweis, kunde_bestaetigt setzt allein das Team) und schickt
// die Team-Mail mit frischem Moderations-Token. Danach zurück auf die Seite.
// Ändert beim GET Daten (Vertrag der Seite): scannt ein Mailprogramm den Link,
// ist die Bewertung bestätigt. Das Team gibt trotzdem erst per Knopf frei.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function weiter(ergebnis: 'bestaetigt' | 'ungueltig'): NextResponse {
  const res = NextResponse.redirect(zielUrl(ergebnis), 303);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

/** Neuester Nicht-Test-Lead mit derselben E-Mail; 'fehler', wenn die Suche scheitert. */
async function findeLead(supabase: Supa, email: string): Promise<(LeadTreffer & { id: string }) | null | 'fehler'> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('id, vorname, nachname, email, status, created_at')
      .ilike('email', ilikeExakt(email))
      .eq('ist_test', false)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    // PostgREST liest * im ilike-Muster als Platzhalter ⇒ exakt nachprüfen.
    const lead = (data ?? []).find((l) => String(l.email ?? '').trim().toLowerCase() === email);
    if (!lead) return null;
    return {
      id: String(lead.id),
      name: [lead.vorname, lead.nachname].filter(Boolean).join(' '),
      erstellt_am: String(lead.created_at),
      status: String(lead.status ?? ''),
      adminUrl: `${apiBasis(process.env)}/admin/leads/${lead.id}`,
    };
  } catch (e) {
    console.error('[bewertungen] Lead-Suche:', fehlerText(e));
    return 'fehler';
  }
}

async function handleGet(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t');
  if (!istTokenFormat(t)) return weiter('ungueltig');

  try {
    const supabase = supabaseDienst();
    const { data: zeile, error } = await supabase
      .from('bewertungen')
      .select('id, status, erstellt_am, bestaetigt_am, sterne, text, name, ort, email')
      .eq('bestaetigen_token_hash', tokenHash(t))
      .maybeSingle();
    if (error) throw new Error(error.message);

    const jetzt = new Date();
    const ergebnis = bestaetigungsErgebnis(
      zeile ? { status: zeile.status as BewertungStatus, erstellt_am: String(zeile.erstellt_am), bestaetigt_am: zeile.bestaetigt_am ? String(zeile.bestaetigt_am) : null } : null,
      jetzt,
    );
    if (ergebnis === 'ungueltig' || !zeile || !zeile.email) return weiter('ungueltig');
    if (ergebnis === 'bereits') return weiter('bestaetigt');

    const lead = await findeLead(supabase, String(zeile.email));
    // Nur der Hash steht in der DB ⇒ für die Team-Mail einen neuen Token erzeugen.
    const moderationToken = neuerToken();
    const { data: geaendert, error: updateFehler } = await supabase
      .from('bewertungen')
      .update({
        status: 'bestaetigt',
        bestaetigt_am: jetzt.toISOString(),
        lead_id: lead && lead !== 'fehler' ? lead.id : null,
        moderation_token_hash: tokenHash(moderationToken),
      })
      .eq('id', zeile.id)
      .eq('status', 'unbestaetigt')
      .select('id');
    if (updateFehler) throw new Error(updateFehler.message);
    // Doppelklick: der erste Aufruf hat bestätigt und die Team-Mail geschickt.
    if (!geaendert || geaendert.length === 0) return weiter('bestaetigt');

    const mail = teamMail({
      bewertung: {
        sterne: Number(zeile.sterne),
        text: String(zeile.text),
        name: String(zeile.name),
        ort: zeile.ort ? String(zeile.ort) : null,
        email: String(zeile.email),
        erstellt_am: String(zeile.erstellt_am),
      },
      lead,
      links: moderationsLinks(apiBasis(process.env), moderationToken),
    });
    const r = await sendEmail(teamEmpfaenger(process.env.BEWERTUNG_TEAM_AN), mail, undefined, { skipBcc: true });
    if (r.success) console.log(`[bewertungen] bestätigt id=${zeile.id} lead=${lead && lead !== 'fehler' ? lead.id : '-'}`);
    // Bleibt die Bewertung ohne Mail liegen, findet das Team sie nur per
    // select * from bewertungen where status = 'bestaetigt'.
    else console.error(`[bewertungen] Team-Mail fehlgeschlagen id=${zeile.id} (Status steht auf bestaetigt):`, r.error);
    return weiter('bestaetigt');
  } catch (e) {
    console.error('[bewertungen] Bestätigen:', fehlerText(e));
    // Ehrlich statt „ungültig“: der Link bleibt gültig, später noch einmal klicken.
    return htmlAntwort(
      hinweisSeite('Bestätigung nicht möglich', 'Die Bestätigung hat gerade nicht geklappt. Bitte klicken Sie den Link in der E-Mail in einigen Minuten noch einmal.'),
      500,
    );
  }
}

export const GET = withMem('bewertungen bestaetigen GET', handleGet);
