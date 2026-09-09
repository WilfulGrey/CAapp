/* ─── Eingang fuer eingekaufte Leads ─────────────────────────────────────
 *
 * Zweiter Weg in dieselbe Strecke: nicht der Kunde fuellt den Rechner aus,
 * sondern wir kaufen seine Anfrage bei einem Portal (Pflegehilfe.org,
 * Pflegebund.eu). Ab hier laeuft alles wie immer — Lead, Token,
 * Kundenportal, Mail 1 — nur mit source="portal:<domain>", woran die Mail
 * ihren eigenen Kopf erkennt (send-scheduled-emails/herkunft.ts).
 *
 * Bewusst NICHT oeffentlich: dieser Endpunkt legt Leads an und loest
 * Kundenmails aus. Ohne PORTAL_LEAD_KEY in der Env ist er aus.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findOrCreateLead, logEvent } from '@/lib/lead-management';
import { berechnePreis, parseCustomerName, generateToken, getTokenExpiry } from '@/lib/calculation';
import { ergaenzeAngaben, PORTALE, vermittlerFuer, PortalAngaben, PreisZeile } from '@/lib/portal-lead';
import { scheduleEmail, flushScheduledEmails } from '@/lib/lead-mails';
import { sendezeitIso } from '@/lib/quiet-hours';
import { betreffAntwort, VERMITTLER_MAILS } from '@/lib/pflegena';
import { darfAngeschriebenWerden, HOECHSTALTER_TAGE } from '@/lib/portal-schutz';
import { sendEmail, getTeamNotificationTemplate } from '@/lib/email';

/* Muss zur Allowlist in send-scheduled-emails/herkunft.ts passen: Edge
 * Function (Deno) und Next-App koennen keinen Code teilen, deshalb steht
 * die Liste dort ein zweites Mal. Ein Portal, das nur hier steht, bekaeme
 * die normale Mail statt der Portal-Fassung. Beide zusammen pflegen. */
const ERLAUBTE_PORTALE: readonly string[] = PORTALE.map((p) => p.domain);

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = (serviceKey && serviceKey.length > 10 ? serviceKey : null)
    || (anonKey && anonKey.length > 10 ? anonKey : null);
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* Die zwei Mails an den Vermittler in die Warteschlange legen.
 *
 * IDEMPOTENT by design: die Funktion schaut nach, welche Zeile schon da
 * ist, und legt nur die fehlende an. Damit ist der Wiederanlauf nach einem
 * abgebrochenen Lauf derselbe Code wie der Erstlauf — und ein Lead kann
 * nicht mit halber Warteschlange liegenbleiben (die Mail waere fuer immer
 * weg, weil das Abholer-Protokoll die Mail als 'erledigt' fuehrt).
 *
 * Direkter Insert statt scheduleEmail(): dessen Union kennt nur zwei Typen
 * und der Weg fuehrt ueber die Edge Function schedule-email — eine vierte
 * Funktion, die man bei jedem Prod-Deploy von Hand mitnehmen muesste.
 * scheduled_emails.email_type ist blankes text ohne CHECK.
 */
const KRAEFTE_VERZUG_MIN = 120;

async function sorgeFuerVermittlerMails(
  supabase: ReturnType<typeof supabaseClient>,
  leadId: string,
  empfaenger: string,
  metadata: Record<string, unknown>,
): Promise<{ angelegt: string[] }> {
  const { data: vorhanden } = await supabase
    .from('scheduled_emails')
    .select('email_type')
    .eq('lead_id', leadId)
    .in('email_type', VERMITTLER_MAILS as unknown as string[]);
  const da = new Set((vorhanden ?? []).map((z: any) => z.email_type));

  const jetzt = new Date();
  const zeilen = VERMITTLER_MAILS.filter((t) => !da.has(t)).map((t) => ({
    lead_id: leadId,
    email_type: t,
    recipient_email: empfaenger,
    /* Mail 1 sofort: sie ist die Antwort auf die Mail des Partners, und wer
       zuerst antwortet, gewinnt. Mail 2 nach zwei Stunden — durch die
       Nachtruhe geschickt, damit "+2 h" um 20:30 nicht 22:30 heisst. */
    scheduled_for: t === 'vermittler_angebot'
      ? jetzt.toISOString()
      : sendezeitIso(new Date(jetzt.getTime() + KRAEFTE_VERZUG_MIN * 60_000)),
    status: 'pending',
    metadata,
  }));
  if (!zeilen.length) return { angelegt: [] };

  const { error } = await supabase.from('scheduled_emails').insert(zeilen);
  if (error) throw new Error(`Vermittler-Mails nicht geplant: ${error.message}`);
  return { angelegt: zeilen.map((z) => z.email_type) };
}

export async function POST(request: NextRequest) {
  const erwarteterKey = process.env.PORTAL_LEAD_KEY;
  if (!erwarteterKey || erwarteterKey.length < 16) {
    // Nicht konfiguriert ⇒ Feature aus. Lieber tot als offen.
    return NextResponse.json({ error: 'nicht konfiguriert' }, { status: 503 });
  }
  if (request.headers.get('x-portal-key') !== erwarteterKey) {
    return NextResponse.json({ error: 'nicht berechtigt' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ungültiges JSON' }, { status: 400 });
  }

  const portal = String(body?.portal ?? '').trim().toLowerCase();
  if (!ERLAUBTE_PORTALE.includes(portal)) {
    return NextResponse.json(
      { error: `unbekanntes Portal: ${portal || '(leer)'}` },
      { status: 400 },
    );
  }

  /* Vermittler statt eingekauftem Portal: die Mail kommt von einem Partner,
     der fuer SEINEN Kunden anfragt. Ab hier weicht der Weg an fuenf Stellen
     ab — Bestandskunden-Guard, Dedupe, Lead-Anlage, Duplikat-Logik und
     Mailversand. Alles andere (Preis, Details, Onboarding, Team-Mail) ist
     identisch. */
  const vermittler = vermittlerFuer(portal);

  const email = String(body?.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'ungültige E-Mail-Adresse' }, { status: 400 });
  }

  const name = String(body?.name ?? '').trim();
  const telefon = String(body?.telefon ?? '').trim();
  /* Zweite Nummer (Festnetz + Mobil aus der Portal-Mail, Registry #56) —
     eigene Spalte, nie Teil der Lead-Identitaet. */
  const telefon2 = String(body?.telefon_2 ?? '').trim();

  /* Einwilligungsnachweis. Der Kunde hat BEIM PORTAL eingewilligt, nicht
   * bei uns — unser eigener Checkbox-Text waere hier eine Faelschung des
   * Nachweises. Deshalb Pflichtfeld: wer den Nachweis nicht mitliefert,
   * bekommt keinen Lead angelegt. */
  const einwilligung = body?.einwilligung ?? {};
  const einwilligungText = String(einwilligung?.text ?? '').trim();
  const einwilligungAm = String(einwilligung?.zeitpunkt ?? '').trim();
  if (!einwilligungText || !einwilligungAm) {
    return NextResponse.json(
      { error: 'Einwilligungsnachweis (text + zeitpunkt) erforderlich' },
      { status: 400 },
    );
  }

  /* Schutzregeln VOR allem anderen: kein Lead, kein Preis, keine Mail.
   * Ein "Keine Interesse" oder eine halbjahresalte Anfrage darf HIER nicht
   * als Datensatz entstehen. Sichtbar wird sie trotzdem (Entscheidung
   * Michał 03.09., Registry #47): der ABHOLER legt fuer uebersprungene
   * Mails einen Shell-Lead 'manuell_pruefen' an — Anschauen ja,
   * automatische Strecke (Preis, Mail 1, Onboarding) nein. */
  const schutz = darfAngeschriebenWerden(
    { status: body?.status, erstellt_am: body?.erstellt_am },
    new Date(),
  );
  if (!schutz.ok) {
    console.log(`Portal-Lead abgelehnt (${portal}): ${schutz.grund}`);
    return NextResponse.json({ ok: false, uebersprungen: true, grund: schutz.grund }, { status: 200 });
  }

  try {
    const supabase = supabaseClient();

    /* ─── Bestandskunden-Guard (Registry #50) ───────────────────────────
     * findOrCreateLead dedupliziert per E-Mail, kennt aber nur die Status
     * seiner statusOrder: fuer 'nicht_interessiert', 'betreuung_beauftragt'
     * oder Unbekanntes fallen ALLE Vergleiche durch ⇒ neuer Lead + Mail 1
     * + Onboarding an jemanden, der uns "kein Interesse" gesagt hat.
     * Deshalb VOR dem Anlegen: nur bekannte, offene Status duerfen weiter
     * (deny-by-default, wie ANSPRECHBARE_STATUS). Alles andere wird als
     * uebersprungen gemeldet — der Abholer haengt das Ereignis an genau
     * diesen Lead, der bezahlte Lead bleibt sichtbar.
     *
     * ilike statt eq: "Max.Mustermann@web.de" vs. gespeichertes
     * "max.mustermann@web.de" wuerde sonst den ganzen Guard umgehen. Ab
     * hier gilt die GESPEICHERTE Adresse als Identitaet. */
    /* Beim VERMITTLER uebersprungen: seine Adresse steht auf jedem seiner
       Leads. Der Guard wuerde ab der zweiten Anfrage den Bestand seines
       eigenen ersten Leads finden — und jede weitere Anfrage entweder als
       Duplikat verschlucken oder am falschen Lead festmachen. Was der Guard
       verhindern soll (Mail an jemanden, der "kein Interesse" gesagt hat),
       gibt es hier nicht: der Empfaenger ist ein Geschaeftspartner, der uns
       gerade geschrieben hat. */
    const { data: bestand } = vermittler ? { data: null } : await supabase
      .from('leads')
      .select('id, email, status, kalkulation, token, token_expires_at')
      .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
      .order('created_at', { ascending: false })
      .limit(1);
    const vorhanden = bestand?.[0] as
      | { id: string; email: string; status: string; kalkulation: any; token: string | null; token_expires_at: string | null }
      | undefined;
    const OFFENE_STATUS = ['info_requested', 'manuell_pruefen', 'angebot_requested', 'folge_einsatz'];
    if (vorhanden && !OFFENE_STATUS.includes(vorhanden.status)) {
      console.log(`Portal-Lead uebersprungen (${portal}): Bestandskunde ${vorhanden.status} (${vorhanden.email})`);
      return NextResponse.json(
        { ok: false, uebersprungen: true, grund: `Bestandskunde (${vorhanden.status}) — keine Mail 1` },
        { status: 200 },
      );
    }
    const kundenEmail = vorhanden?.email || email;

    /* Hat der Kunde seine Antworten SELBST gegeben (Kostenrechner, oder ein
       Portal, das alles lieferte: angenommene_felder leer), duerfen unsere
       Annahmen sie nicht ueberschreiben — sonst sieht er im Portal einen
       hoeheren Preis als den, den er kennt ("Ein Preis, der steigt, ist ein
       Vertrauensschaden", portal-lead.ts). Dann bleibt die Kalkulation
       stehen; nur die Portal-Details (PLZ, Gewicht …) kommen dazu. */
    const echteAntworten = !vermittler && !!vorhanden
      && vorhanden.status !== 'manuell_pruefen'
      && !!vorhanden.kalkulation
      && !(Array.isArray(vorhanden.kalkulation?.angenommene_felder) && vorhanden.kalkulation.angenommene_felder.length > 0);

    // Preistabelle EINMAL laden — die Wahl des teuersten Werts je fehlender
    // Kategorie gehoert in die Daten, nicht in den Code.
    const { data: preisZeilen } = await supabase
      .from('pricing_config')
      .select('kategorie, antwort_key, aufschlag_euro')
      .eq('aktiv', true);

    const { daten, angenommen } = ergaenzeAngaben(
      (body?.angaben ?? {}) as PortalAngaben,
      (preisZeilen ?? []) as PreisZeile[],
      /* Beim Vermittler in die guenstige Richtung: er hat kein Portal, in
         dem der Preis spaeter korrigiert wuerde (portal-lead.ts, Richtung). */
      vermittler ? 'guenstig' : 'teuer',
    );

    const kalkulation = await berechnePreis(daten);
    /* Welche Felder WIR gesetzt haben, reist mit der Kalkulation: die Mail
       entscheidet daran, ob sie den Annahme-Hinweis zeigt. Leere Liste =
       das Portal hat alles geliefert. */
    (kalkulation as any).angenommene_felder = angenommen;

    /* Details ohne Preisbezug → formularDaten (additiv; der Rechner sendet
       diese Schlüssel nie). Von dort aus: Formular-Prefill
       (prefillPatientFromLead), Mamamia-Onboarding (weight/dementia/
       internet, Locations-Lookup über fd.plz) und JobOffer-Beschreibung
       (fd.portal_details). Whitelist + String-Zwang: der Body kommt von
       aussen. */
    const d = (body?.details && typeof body.details === 'object' ? body.details : {}) as Record<string, unknown>;
    const fdExtras: Record<string, string | number> = {};
    const nimm = (ziel: string, wert: unknown, max = 2000) => {
      if (typeof wert === 'string' && wert.trim()) fdExtras[ziel] = wert.trim().slice(0, max);
    };
    /* Zwilling fuer Zahlen: buildPatients (onboard-to-mamamia/mappers.ts)
       prueft `typeof fd.geburtsjahr === "number"` — ein String waere still
       wirkungslos, das Feld verschwaende ohne eine Zeile im Log. */
    const nimmZahl = (ziel: string, wert: unknown, min: number, max: number) => {
      const n = Number(typeof wert === 'string' || typeof wert === 'number' ? wert : NaN);
      if (Number.isInteger(n) && n >= min && n <= max) fdExtras[ziel] = n;
    };
    nimm('plz', body?.plz, 5);
    nimm('ort', body?.ort, 80);
    nimm('gewicht', d.gewicht, 10);
    nimm('internet', d.internet, 4);
    nimm('demenz', d.demenz, 2);
    nimm('diagnosen', d.diagnosen, 500);
    nimm('portal_details', d.block);
    nimmZahl('geburtsjahr', d.geburtsjahr, 1900, new Date().getFullYear());
    /* Name des betreuten Haushalts: steht in den patient_*-Spalten, wurde
       aber nie nach fd durchgelassen — und genau von dort lesen die
       Team-Mail und `kunde_label` (weiter unten). Deshalb stand dort
       "nicht genannt", obwohl der Name bekannt war. */
    nimm('patient_vorname', d.patient_vorname, 80);
    nimm('patient_nachname', d.patient_nachname, 80);
    if (Object.keys(fdExtras).length) {
      (kalkulation as any).formularDaten = { ...(kalkulation as any).formularDaten, ...fdExtras };
    }

    let { vorname, nachname, anrede } = parseCustomerName(name);
    /* Faellt der Anzeigename aus (Pflegena verschickt ohne), kommt der
       Ansprechpartner aus dem Registereintrag. Sonst gruesst die Mail den
       Geschaeftspartner mit blossem "Guten Tag", waehrend jede Kundenmail
       den Namen kennt. Der Header hat Vorrang — er ist die frischere
       Quelle, falls dort doch jemand steht. */
    const fest = vermittler && 'ansprechpartner' in vermittler ? vermittler.ansprechpartner : undefined;
    if (fest && !nachname) {
      vorname = vorname || fest.vorname;
      nachname = fest.nachname;
      anrede = anrede || fest.anrede;
    }

    /* ─── Lead-Anlage ──────────────────────────────────────────────────
     *
     * findOrCreateLead dedupliziert per E-Mail. Beim Vermittler traegt
     * JEDE Anfrage dieselbe Absenderadresse — ab der zweiten faende die
     * Funktion den bestehenden Lead, saehe eine Mail 1 juenger als 60 Tage
     * und verschluckte die Anfrage als Duplikat. Jede Anfrage ist hier ein
     * eigener Lead; gegen doppelte Verarbeitung schuetzt stattdessen die
     * Message-ID (quelle_nachricht_id, unique).
     *
     * Die Feldliste ist an findOrCreateLead abgeglichen — token_used und
     * anrede_text fehlen sonst still (leadGreeting liest sie), und das
     * Ereignis angebot_requested gaebe es im Verlauf nicht. */
    let lead: any;
    let isNew = true;
    let isUpgrade = false;
    let schonDa = false;

    if (vermittler) {
      const token = generateToken();
      const neu = {
        email: kundenEmail,
        status: 'angebot_requested',
        source: `portal:${portal}`,
        vermittler: vermittler.domain,
        quelle_nachricht_id: typeof body?.message_id === 'string' && body.message_id.trim()
          ? body.message_id.trim().slice(0, 400) : null,
        token,
        token_expires_at: getTokenExpiry().toISOString(),
        token_used: false,
        kalkulation,
        vorname: vorname || (nachname ? '' : name),
        nachname: nachname || null,
        anrede: anrede || null,
        anrede_text: anrede || null,
        telefon: telefon || null,
        care_start_timing: body?.care_start_timing || null,
      };
      const { data, error } = await supabase.from('leads').insert(neu).select('*').single();
      if (error) {
        /* 23505 = dieselbe Message-ID war schon da. Der vorige Lauf hat den
           Lead angelegt und ist danach abgebrochen — wir holen ihn und
           lassen sorgeFuerVermittlerMails die fehlenden Mails nachziehen.
           Ohne das waere die Anfrage fuer immer stumm: das Abholer-
           Protokoll fuehrt sie dann als 'erledigt'. */
        if ((error as any).code !== '23505' || !neu.quelle_nachricht_id) {
          throw new Error(`Vermittler-Lead nicht angelegt: ${error.message}`);
        }
        const { data: alt } = await supabase.from('leads').select('*')
          .eq('quelle_nachricht_id', neu.quelle_nachricht_id).limit(1);
        lead = (alt as any[])?.[0];
        if (!lead) throw new Error('Vermittler-Lead: Konflikt ohne auffindbaren Lead');
        isNew = false;
        schonDa = true;
        console.log(`Vermittler-Lead (${portal}): Message-ID bereits bekannt — Lead ${lead.id}, Mails werden geprueft`);
      } else {
        lead = data;
        await logEvent(lead.id, 'angebot_requested', { quelle: `portal:${portal}`, vermittler: vermittler.domain })
          .catch((e) => console.error('angebot_requested log failed:', e));
      }
    } else {
    const { lead: gefunden, isNew: neuAngelegt, isUpgrade: hochgestuft } = await findOrCreateLead(kundenEmail, 'angebot_requested', {
      vorname: vorname || (nachname ? '' : name),
      nachname: nachname || undefined,
      anrede: anrede || undefined,
      telefon: telefon || undefined,
      care_start_timing: echteAntworten ? undefined : (body?.care_start_timing || undefined),
      kalkulation: echteAntworten ? undefined : kalkulation,
      quelle: `portal:${portal}`,
    });
    lead = gefunden; isNew = neuAngelegt; isUpgrade = hochgestuft;
    }

    /* Kalkulation blieb stehen ⇒ die Portal-Details muessen trotzdem
       ankommen: sie leben NUR in formularDaten, und das Onboarding gleich
       unten liest sie von dort (PLZ → Location, Gewicht, Demenz, Kontext).
       angenommene_felder: [] ⇒ Mail 1 sagt "uebernommen", nicht "vorsichtig
       angenommen" — angenommen wurde ja nichts. */
    if (echteAntworten) {
      const alt = (lead.kalkulation ?? {}) as Record<string, unknown>;
      const neu = {
        ...alt,
        formularDaten: { ...((alt.formularDaten as Record<string, unknown>) ?? {}), ...fdExtras },
        angenommene_felder: [],
      };
      const { error: kalkErr } = await supabase.from('leads').update({ kalkulation: neu }).eq('id', lead.id);
      if (kalkErr) console.error('Portal-Lead: Kalkulation-Ergaenzung fehlgeschlagen:', kalkErr.message);
      else lead.kalkulation = neu;
    }

    /* Duplikat (Lead war schon angebot_requested/folge_einsatz): keine
       zweite Mail 1 — der Kunde hat sie, und eine zweite trueg den Namen
       des ERSTEN Portals und ggf. einen anderen Preis (Registry #47).
       Ausnahme: die letzte Mail 1 ist aelter als die Einwilligungs-Grenze
       (60 Tage) oder ging nie raus ⇒ der Kunde fragt wirklich neu (und
       bekommt gerade Antworten von zwei Wettbewerbern) ⇒ Token erneuern,
       wenn abgelaufen, und Mail 1 wie bei einer neuen Anfrage (Re-Submit-
       Wortlaut waehlt send-scheduled-emails anhand der lead_events). */
    let mail1 = isNew || isUpgrade;
    let duplikatGrund: string | undefined;
    /* Beim Vermittler entfaellt die ganze Duplikat-Logik: jede Anfrage ist
       eine eigene, und ob eine Mail schon rausging, entscheidet nicht das
       Alter der letzten Mail 1, sondern ob die Warteschlangen-Zeile
       existiert (sorgeFuerVermittlerMails). */
    if (!mail1 && !vermittler) {
      const cutoff = new Date(Date.now() - HOECHSTALTER_TAGE * 86_400_000).toISOString();
      const { data: letzte } = await supabase
        .from('lead_events')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('event_type', 'email_eingangsbestaetigung_sent')
        .gte('created_at', cutoff)
        .limit(1);
      if (letzte && letzte.length > 0) {
        duplikatGrund = 'Lead bereits vorhanden — keine Mail 1';
      } else {
        mail1 = true;
        if (!lead.token || !lead.token_expires_at || new Date(lead.token_expires_at) < new Date()) {
          const token = generateToken();
          const token_expires_at = getTokenExpiry().toISOString();
          const { error: tokErr } = await supabase
            .from('leads')
            .update({ token, token_expires_at, token_used: false })
            .eq('id', lead.id);
          if (tokErr) console.error('Portal-Lead: Token-Erneuerung fehlgeschlagen:', tokErr.message);
          else { lead.token = token; lead.token_expires_at = token_expires_at; }
        }
      }
    }

    /* Zwei getrennte Nachweise, beide append-only:
     *  - woher der Lead kam und was er gekostet hat
     *  - WELCHE Angaben wir angenommen haben (der Kunde sieht sie in der
     *    Mail und koennte sie zu Recht hinterfragen) */
    /* Der volle Portal-Datensatz (CSV-Spalten ohne Zuhause bei uns:
       Krankheiten, Gewicht, Beziehung, Zimmer, Internet …) — append-only
       archiviert, damit nichts verloren geht. Groessen-Kappe, weil der
       Wert von aussen kommt. */
    const zusatzRoh = body?.zusatz;
    const zusatz = zusatzRoh && typeof zusatzRoh === 'object'
      && JSON.stringify(zusatzRoh).length <= 6000 ? zusatzRoh : undefined;

    await logEvent(lead.id, 'portal_lead_eingekauft', {
      portal,
      einkaufspreis: body?.einkaufspreis ?? null,
      portal_lead_id: body?.portal_lead_id ?? null,
      angenommene_felder: angenommen,
      ...(zusatz ? { zusatz } : {}),
      at: new Date().toISOString(),
    }).catch((e) => console.error('portal_lead_eingekauft log failed:', e));

    await logEvent(lead.id, 'privacy_consent', {
      accepted: true,
      source: `portal:${portal}`,
      text: einwilligungText,
      at: einwilligungAm,
      // Kein eigener Versionsstempel: der Text stammt vom Portal, nicht von
      // uns — wir bezeugen, was uns geliefert wurde.
      version: null,
    }).catch((e) => console.error('privacy_consent log failed:', e));

    /* Geschlecht/Name des SENIORS (Registry #45): aus SeniorSex bzw. dem
       eindeutig gegenderten Beziehungswort ("Schwiegervater" IST ein Mann).
       Auf die patient_*-Spalten des Leads — davon lebt resolvePatientSalutation
       im Onboarding (patient.gender) und patientGenderKnown im Formular.
       VOR dem Onboarding-Aufruf, damit der frisch geladene Lead sie traegt. */
    const patientPatch: Record<string, string> = {};
    if (typeof d.patient_anrede === 'string' && /^(Herr|Frau)$/.test(d.patient_anrede)) {
      patientPatch.patient_anrede = d.patient_anrede;
    }
    if (typeof d.patient_vorname === 'string' && d.patient_vorname.trim()) {
      patientPatch.patient_vorname = d.patient_vorname.trim().slice(0, 80);
    }
    if (typeof d.patient_nachname === 'string' && d.patient_nachname.trim()) {
      patientPatch.patient_nachname = d.patient_nachname.trim().slice(0, 80);
    }
    /* Strasse nur fuer den Admin: nach Mamamia geht vom Einsatzort
       ausschliesslich die PLZ (ueber den Locations-Lookup). */
    if (typeof d.patient_strasse === 'string' && d.patient_strasse.trim()) {
      patientPatch.patient_street = d.patient_strasse.trim().slice(0, 200);
    }
    if (Object.keys(patientPatch).length) {
      const { error: patchErr } = await supabase.from('leads').update(patientPatch).eq('id', lead.id);
      if (patchErr) console.error('Portal-Lead: patient_* Update fehlgeschlagen:', patchErr.message);
    }

    /* telefon_2 als EIGENES best-effort Update, nicht im patientPatch: fehlt
       die Spalte noch (Migration laeuft nach), darf das patient_* nicht mit
       reissen. Setzt nur, loescht nie (wie telefon in findOrCreateLead) —
       leeren geht ueber den Admin. */
    if (telefon2) {
      const { error: t2Err } = await supabase.from('leads').update({ telefon_2: telefon2 }).eq('id', lead.id);
      if (t2Err) console.error('Portal-Lead: telefon_2 Update fehlgeschlagen:', t2Err.message);
    }

    /* Mamamia SOFORT, nicht erst beim Portal-Besuch (Entscheidung Michał
       01.09., Registry #44): ein eingekaufter Lead ist bezahlt und traegt
       ab #614/#615 vollstaendige Daten — Kunde + Job entstehen in MM in
       derselben Minute, mit weight/dementia/internet und dem Kontextblock
       in der JobOffer-Beschreibung. Der Aufruf ist der GLEICHE Edge-Fn-Weg
       wie aus dem Browser (idempotent per Cache-Hit); Fehler brechen den
       Eingang NICHT ab — dann greift der bisherige Lazy-Onboard beim
       ersten Portal-Besuch als Fallback. VOR Mail 1, damit der
       Empfehlungs-Pfad der Mail (Registry #39) einen bestehenden Kunden
       vorfindet statt selbst zu onboarden. */
    try {
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supaUrl && anon && lead.token) {
        const r = await fetch(`${supaUrl}/functions/v1/onboard-to-mamamia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
          body: JSON.stringify({ token: lead.token }),
          signal: AbortSignal.timeout(25_000),
        });
        const daten = await r.json().catch(() => ({}));
        if (r.ok && daten?.customer_id) {
          await logEvent(lead.id, 'mamamia_onboarded_at_ingest', {
            customer_id: daten.customer_id,
            job_offer_id: daten.job_offer_id ?? null,
          }).catch(() => {});
        } else {
          console.error(`Portal-Lead: Sofort-Onboarding fehlgeschlagen (HTTP ${r.status}) — Lazy-Fallback bleibt`, daten?.error ?? '');
        }
      }
    } catch (e) {
      console.error('Portal-Lead: Sofort-Onboarding threw — Lazy-Fallback bleibt:', e instanceof Error ? e.message : String(e));
    }

    // Mail 1 sofort (delay 0) — identischer Weg wie beim Kostenrechner.
    if (vermittler) {
      /* Zwei Mails: Angebot sofort, fuenf Kraefte nach zwei Stunden. Die
         Metadaten reisen in der Zeile mit — die Edge Function baut daraus
         Betreff ("Re: ..."), Thread-Kopf und Provisionsblock, ohne die
         Vermittler-Konfiguration der Next-App zu kennen. */
      const metadata = {
        vermittler: vermittler.domain,
        provision_pro_tag: vermittler.provisionProTag,
        kunde_label: [fdExtras.patient_vorname, fdExtras.patient_nachname].filter(Boolean).join(' ')
          || (typeof d.patient_nachname === 'string' ? d.patient_nachname : '') || null,
        /* Fertiger Antwort-Betreff, nicht der Originalbetreff: betreffAntwort
           lebt in lib/ und ist aus der Deno-Funktion nicht importierbar. Ihn
           hier zu berechnen erspart eine dritte Kopie derselben Regex
           (Muster names.ts / appendJobParam — dort war die Kopie unvermeidbar,
           hier ist sie es nicht). */
        betreff_antwort: betreffAntwort(typeof body?.betreff === 'string' ? body.betreff : null).slice(0, 300),
        message_id: lead.quelle_nachricht_id ?? null,
      };
      try {
        const { angelegt } = await sorgeFuerVermittlerMails(supabase, lead.id, kundenEmail, metadata);
        if (angelegt.length) {
          await logEvent(lead.id, 'vermittler_mails_geplant', { to: kundenEmail, typen: angelegt })
            .catch(() => {});
          flushScheduledEmails();
        } else {
          console.log(`Vermittler-Lead (${portal}): Mails standen bereits in der Warteschlange`);
        }
      } catch (e: any) {
        /* Laut scheitern: ohne Warteschlange bekommt der Partner nie eine
           Antwort, und der Abholer wuerde die Mail als erledigt abhaken.
           HTTP 500 ⇒ der naechste Takt versucht es erneut (der Lead ist
           dank Message-ID idempotent). */
        console.error('Vermittler-Lead: Mails nicht geplant:', e?.message ?? e);
        return NextResponse.json({ error: 'Vermittler-Mails konnten nicht geplant werden' }, { status: 500 });
      }
    } else if (mail1) {
      scheduleEmail(lead.id, kundenEmail, 'eingangsbestaetigung', 0)
        .then(async (r) => {
          if (r.success) {
            await logEvent(lead.id, 'email_eingangsbestaetigung_scheduled', { to: kundenEmail, token: lead.token });
            flushScheduledEmails();
          } else {
            console.error('Portal-Lead: Mail nicht geplant:', r.error);
            await logEvent(lead.id, 'email_eingangsbestaetigung_schedule_failed', { to: kundenEmail, error: r.error });
          }
        })
        .catch((e) => console.error('schedule threw:', e));
    } else {
      console.log(`Portal-Lead Duplikat (${portal}): ${kundenEmail} — ${duplikatGrund}`);
    }

    // Team-Mail in JEDEM Zweig: der Lead hat Geld gekostet, das Team soll es sehen.
    const teamEmail = getTeamNotificationTemplate(lead, 'angebot_requested', { quelle: `portal:${portal}` });
    /* Beim Vermittler traegt der Lead die Kontaktdaten des PARTNERS — wer
       betreut werden soll und wie viel vom Preis auf unseren Annahmen steht,
       stuende sonst nirgends. Das ist die einzige Stelle, an der das Team den
       an den Partner geschickten Preis mit seiner Herkunft sieht (die Mail an
       den Partner nennt die Annahmen bewusst nicht, Entscheidung 08.09.). */
    if (vermittler) {
      const label = [fdExtras.patient_vorname, fdExtras.patient_nachname].filter(Boolean).join(' ');
      const zeilen = [
        `Vermittler: ${vermittler.name} (Provision ${vermittler.provisionProTag} €/Tag)`,
        label ? `Kunde des Vermittlers: ${label}` : 'Kunde des Vermittlers: nicht genannt',
        angenommen.length
          ? `ANGENOMMEN (nicht in der Anfrage genannt, teurerer Wert): ${angenommen.join(', ')}`
          : 'Alle Angaben aus der Anfrage gelesen.',
        ...(Array.isArray(body?.hinweise) ? body.hinweise.map((h: unknown) => `Hinweis: ${String(h)}`) : []),
      ];
      teamEmail.subject = `${teamEmail.subject} — ${label || 'Vermittler-Anfrage'}`;
      teamEmail.text = `${zeilen.join('\n')}\n\n${teamEmail.text}`;
      teamEmail.html = `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;font-size:13px;margin:0 0 16px;">${
        zeilen.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }</pre>${teamEmail.html}`;
    }
    sendEmail('info@primundus.de', teamEmail).catch((e) => console.error('Team-Mail:', e));

    return NextResponse.json({
      ok: true,
      lead_id: lead.id,
      neu: isNew,
      ...(duplikatGrund ? { duplikat: true, grund: duplikatGrund } : {}),
      /* Wiederanlauf nach abgebrochenem Lauf: der Lead war schon da, die
         fehlenden Mails wurden eben nachgezogen. Fuer den Abholer ist das
         'erledigt' — und diesmal stimmt es auch. */
      ...(schonDa ? { duplikat: true, grund: 'Anfrage bereits verarbeitet — Mails geprueft' } : {}),
      angenommene_felder: angenommen,
      eigenanteil: kalkulation.eigenanteil,
    });
  } catch (error) {
    console.error('Portal-Lead fehlgeschlagen:', error);
    return NextResponse.json({ error: 'Lead konnte nicht angelegt werden' }, { status: 500 });
  }
}
