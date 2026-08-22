/*
 * Rückrufbitte aus dem Chat.
 *
 * Warum es diese Route gibt (22.08.2026): Der Knopf „Rückruf vereinbaren"
 * hatte einen leeren Handler. Der Kunde klickte, Pria bestätigte freundlich —
 * und niemand rief je an. Ein Versprechen ohne Empfänger ist schlimmer als
 * gar kein Knopf, deshalb hat die Bitte jetzt zwei Ziele:
 *
 *   1. eine Mail an info@primundus.de — dorthin schaut jemand,
 *   2. eine Zeile im Gesprächsprotokoll — damit im Admin sichtbar ist,
 *      an welcher Stelle der Kunde lieber telefonieren wollte.
 *
 * Die Mail ist der verlässliche Teil: schlägt sie fehl, meldet die Route
 * einen Fehler und das Widget sagt dem Kunden die Wahrheit, statt einen
 * Anruf zuzusagen, der nicht kommt. Das Protokoll ist Beiwerk und darf
 * still scheitern.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { findOrCreateLead, logEvent } from '@/lib/lead-management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dieselbe Adresse, an die auch die Lead-Benachrichtigungen gehen
// (app/api/lead-event/route.ts) — ein Postfach, nicht zwei.
const EMPFAENGER = 'info@primundus.de';

// Wortgleich zu app/api/angebot-anfordern — die Einwilligung, die der Kunde
// mit dem Absenden erteilt, muss überall dieselbe sein (DSGVO Art. 7 Abs. 1).
const PRIVACY_CONSENT_VERSION = '2026-02';
const PRIVACY_CONSENT_TEXT =
  'Ich akzeptiere die Datenschutzerklärung und bin damit einverstanden, dass Primundus meine Daten zur Bearbeitung meiner Anfrage verarbeitet.';

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim().slice(0, 120);
  const telefon = String(body?.telefon || '').trim().slice(0, 60);
  const sid = String(body?.sid || '').replace(/[^\w-]/g, '').slice(0, 40);
  // Freiwillig. Ohne sie bleibt es bei Mail und Protokoll — die Lead-Tabelle
  // führt die Adresse als Identität, und eine zu erfinden verbietet sich.
  const email = String(body?.email || '').trim().slice(0, 200);
  // Was der Kunde vorher wissen wollte — der Anruf beginnt sonst bei null.
  const anlass = String(body?.anlass || '').trim().slice(0, 500);
  // Die bereits beantworteten Fragen, damit Marta nicht alles neu erfragt.
  const antworten = body?.antworten && typeof body.antworten === 'object' ? body.antworten : {};

  // Milde geprüft, wie beim Kontaktformular: niemand soll an einem Format
  // scheitern, nur offensichtlich Leeres wird abgefangen.
  if (name.length < 2 || telefon.replace(/\D/g, '').length < 7) {
    return NextResponse.json({ fehler: 'Name oder Telefonnummer fehlt.' }, { status: 400 });
  }

  const mailOk = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
  const db = supabase();

  /* Der Rückruf soll nicht nur im Postfach landen, sondern dort sichtbar
     werden, wo das Team ohnehin arbeitet — am Lead. Drei Fälle:

       a) Das Gespräch hat schon einen Lead  → nur vermerken.
       b) Noch keiner, aber eine E-Mail liegt vor → Lead anlegen.
       c) Weder noch → Mail und Protokoll müssen reichen; das steht dann
          auch so in der Team-Mail, damit niemand vergeblich sucht.

     Alles hier ist fail-soft: die Rückrufbitte selbst darf an einem
     stolpernden Lead nicht scheitern. */
  let leadId: string | null = null;
  if (db && sid) {
    const { data } = await db.from('pria_gespraeche')
      .select('lead_id').eq('sid', sid).not('lead_id', 'is', null).limit(1);
    leadId = (data as any)?.[0]?.lead_id ?? null;
  }

  let leadNeu = false;
  if (!leadId && mailOk) {
    try {
      const { lead, isNew } = await findOrCreateLead(email, 'info_requested', {
        vorname: name, telefon,
      });
      leadId = lead.id;
      leadNeu = isNew;
      if (isNew) {
        await logEvent(lead.id, 'privacy_consent', {
          accepted: true,
          version: PRIVACY_CONSENT_VERSION,
          text: PRIVACY_CONSENT_TEXT,
          source: 'pria-rueckruf',
        }).catch(() => {});
      }
      if (db && sid) {
        await db.from('pria_gespraeche').update({ lead_id: leadId }).eq('sid', sid);
      }
    } catch (e: any) {
      console.warn('[pria] Rückruf-Lead nicht angelegt:', e?.message);
    }
  }

  if (leadId) {
    await logEvent(leadId, 'rueckruf_erbeten', {
      name, telefon, anlass: anlass || null, antworten, sid: sid || null,
    }).catch((e: any) => console.warn('[pria] Rückruf-Ereignis nicht vermerkt:', e?.message));
  }

  const leadZeile = leadId
    ? `Lead: ${leadId}${leadNeu ? ' (neu aus dem Rückruf angelegt)' : ''}`
    : 'Kein Lead — es lag keine E-Mail vor. Diese Mail ist die einzige Spur.';

  const angaben = Object.entries(antworten)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`);

  const zeit = new Date().toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const textZeilen = [
    'Ein Besucher hat im Chat um einen Rückruf gebeten.',
    '',
    `Name:     ${name}`,
    `Telefon:  ${telefon}`,
    `Zeit:     ${zeit}`,
    ...(anlass ? ['', `Es ging um: ${anlass}`] : []),
    ...(angaben.length ? ['', 'Im Chat schon beantwortet:', ...angaben.map((a) => `  · ${a}`)] : []),
    '',
    leadZeile,
    ...(sid ? [`Gespräch: ${sid}`] : []),
    '',
    'Pria hat zugesagt, dass sich jemand meldet — täglich zwischen 8 und 20 Uhr.',
  ];

  const template = {
    subject: `Rückruf erbeten: ${name} · ${telefon}`,
    text: textZeilen.join('\n'),
    html:
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#3D2B1F;line-height:1.6">` +
      `<p style="margin:0 0 14px"><b>Ein Besucher hat im Chat um einen Rückruf gebeten.</b></p>` +
      `<table style="border-collapse:collapse;font-size:15px">` +
      `<tr><td style="padding:2px 14px 2px 0;color:#777">Name</td><td><b>${esc(name)}</b></td></tr>` +
      `<tr><td style="padding:2px 14px 2px 0;color:#777">Telefon</td>` +
      `<td><a href="tel:${esc(telefon.replace(/[^\d+]/g, ''))}"><b>${esc(telefon)}</b></a></td></tr>` +
      `<tr><td style="padding:2px 14px 2px 0;color:#777">Zeit</td><td>${esc(zeit)}</td></tr>` +
      `</table>` +
      (anlass ? `<p style="margin:14px 0 0">Es ging um: <i>${esc(anlass)}</i></p>` : '') +
      (angaben.length
        ? `<p style="margin:14px 0 4px;color:#777">Im Chat schon beantwortet:</p><ul style="margin:0;padding-left:20px">` +
          angaben.map((a) => `<li>${esc(a)}</li>`).join('') + `</ul>`
        : '') +
      `<p style="margin:14px 0 0;color:${leadId ? '#999' : '#B45309'};font-size:13px">${esc(leadZeile)}</p>` +
      (sid ? `<p style="margin:2px 0 0;color:#999;font-size:13px">Gespräch: ${esc(sid)}</p>` : '') +
      `<p style="margin:16px 0 0;color:#777;font-size:13px">Pria hat zugesagt, dass sich jemand meldet — ` +
      `täglich zwischen 8 und 20 Uhr.</p></div>`,
  };

  const mail = await sendEmail(EMPFAENGER, template).catch((e: any) => ({
    success: false, error: e?.message as string | undefined,
  }));

  if (!mail.success) {
    console.warn('[pria] Rückruf-Mail fehlgeschlagen:', mail.error);
    return NextResponse.json({ fehler: 'Rückruf konnte nicht weitergegeben werden.' }, { status: 502 });
  }

  // Ab hier ist die Bitte zugestellt. Das Protokoll ist nur noch Beiwerk.
  if (db && sid) {
    const { error } = await db.from('pria_gespraeche').insert({
      sid,
      rolle: 'system',
      text: `Rückruf erbeten — ${name}, ${telefon}`,
      ereignis: 'rueckruf',
      meta: { name, telefon, anlass: anlass || null, antworten, leadId, leadNeu },
      zeit: new Date().toISOString(),
    });
    if (error) console.warn('[pria] Rückruf nicht protokolliert:', error.message);
  }

  console.log(`[pria] Rückruf ${name} / ${telefon} aus Gespräch ${sid || '—'}`);
  return NextResponse.json({ ok: true });
}
