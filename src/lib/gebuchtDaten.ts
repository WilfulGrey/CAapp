// Gebucht-Seite für echte Kunden (Registry #139): baut `GebuchtSeiteDaten` aus dem Zustand des Portals. Reine Funktion —
// die Seite selbst (GebuchtSeite.tsx) und die Vorschau (gebuchtVorschau.ts) bleiben unverändert.
//
// Quellen und Regeln: seo-reports/analysen/gebucht-seite-2026-10-15/spezifikation.md, Abschnitte 5, 7 und 8.
// Święta zasada 1: Fehlt eine belegte Quelle, steht null — die Seite lässt die Angabe dann weg. Kein Ersatzwert.
import type { Application } from '../components/portal/shared';
import type { GebuchtSeiteDaten } from '../components/portal/GebuchtSeite';
import type { LeadJobRow, MamamiaAcceptedApplicationRow } from './mamamia/types';
import { anreiseAusEreignissen, isoTag, type AnreiseEreignis, type EinsatzZeile, type VertragStand } from './gebuchtStand';

export interface GebuchtPortalEingabe {
  /** Berliner Kalendertag YYYY-MM-DD. */
  heute: string;
  kopf: { name: string | null; kuerzel: string | null };
  lead: { id: string; token: string | null; email: string | null; vermittler?: string | null } | null;
  /** Die angenommene Bewerbung dieses Einsatzes (`acceptedApp`, auch synthetisch). */
  app: Application;
  /** Vertrag in dieser Sitzung unterschrieben (`signedForm.signatur`). */
  signiertInDieserSitzung: boolean;
  /** `listAcceptedApplications().rows`; null = noch nicht geladen. */
  annahmen: readonly MamamiaAcceptedApplicationRow[] | null;
  /** `canCompleteContract` wie im Portal (Token, numerische Referenz, kein Vertrag am Lead). */
  kannVertragNachholen: boolean;
  /** `lead_jobs` über `listLeadJobs`; null = noch nicht geladen. */
  jobs: readonly LeadJobRow[] | null;
  /** Mamamia-Job der Sitzung (`JobOffer.id`). */
  jobOfferId: number | null;
  /** Rückfall für die Daten, solange der Spiegel `lead_jobs` fehlt (Spez. 5.1, Quelle 4). */
  jobOffer: { arrival_at: string | null; departure_at: string | null } | null;
  /** Ereignisse aus `GET /api/lead-event`; null = die Brücke hat in diesem Aufruf nicht geantwortet. */
  ereignisse: readonly AnreiseEreignis[] | null;
  /** Aus `notfall_telefon(p_token)`; null = keine. */
  notfallTelefon: string | null;
  /** Basis-URL des Kostenrechners (Vertrags-PDF). */
  kostenrechnerUrl: string;
}

/** „EUR 95,00" (contract_snapshot) → 95. Alles Unlesbare → null. */
export function tagessatzAusVertrag(wert: string | null | undefined): number | null {
  const m = /^\s*(?:EUR\s*)?(\d{1,5})(?:,(\d{1,2}))?\s*(?:€|EUR)?\s*$/i.exec(wert ?? '');
  if (!m) return null;
  const n = Number(`${m[1]}.${m[2] ?? '0'}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Neueste Zeile (accepted_at) mit Vertragsdaten, optional nur für eine Pflegekraft. */
function neuesteMitVertrag(
  zeilen: readonly MamamiaAcceptedApplicationRow[] | null,
  caregiverId: number | null,
): MamamiaAcceptedApplicationRow | null {
  if (!zeilen) return null;
  const passend = zeilen
    .filter((z) => !!z.contract_snapshot)
    .filter((z) => caregiverId === null || z.caregiver_id === caregiverId)
    .sort((a, b) => (a.accepted_at < b.accepted_at ? 1 : a.accepted_at > b.accepted_at ? -1 : 0));
  return passend[0] ?? null;
}

/** Numerische Bewerbungs-ID aus `app.id` (auch „fc-123" der Agentur-Buchung); sonst null. */
function bewerbungsNummer(appId: string): number | null {
  const roh = appId.startsWith('fc-') ? appId.slice(3) : appId;
  return /^\d{1,12}$/.test(roh) ? Number(roh) : null;
}

export function gebuchtDatenAusPortal(e: GebuchtPortalEingabe): GebuchtSeiteDaten {
  const caregiverId = e.app.nurse.caregiverId ?? null;

  // ─── Vertrag (Spez. 5.2): je Pflegekraft, nicht je Lead ───
  const zeileDieser = caregiverId !== null ? neuesteMitVertrag(e.annahmen, caregiverId) : null;
  const zeileIrgendeine = neuesteMitVertrag(e.annahmen, null);
  let stand: VertragStand;
  if (e.signiertInDieserSitzung || zeileDieser) stand = 'unterschrieben';
  else if (e.kannVertragNachholen) stand = 'offen';
  else if (zeileIrgendeine) stand = 'anderer';
  else stand = 'vorbereitung';

  const vertragZeile = stand === 'unterschrieben' ? zeileDieser : stand === 'anderer' ? zeileIrgendeine : null;
  const datum = vertragZeile ? (vertragZeile.contract_snapshot?.datum || vertragZeile.accepted_at || null) : null;
  const pdfBewerbung = vertragZeile?.application_id
    ?? (stand === 'unterschrieben' && e.signiertInDieserSitzung ? bewerbungsNummer(e.app.id) : null);
  const pdfHref = e.lead?.id && e.lead.token && pdfBewerbung !== null
    ? `${e.kostenrechnerUrl.replace(/\/$/, '')}/api/contract-pdf/${e.lead.id}?${new URLSearchParams({
        token: e.lead.token,
        application_id: String(pdfBewerbung),
      }).toString()}`
    : null;

  // ─── Tagessatz (Spez. 7, Regel 6): Vertrag dieser Pflegekraft, sonst die noch gelistete Bewerbung (Pfad 1) ───
  let tagessatz: number | null = null;
  if (stand === 'unterschrieben') {
    tagessatz = tagessatzAusVertrag(zeileDieser?.contract_snapshot?.tagessatz);
    const gelistet = !e.app.synthetic && !e.app.id.startsWith('fc-');
    if (tagessatz === null && gelistet && e.app.offer.monatlicheKosten > 0) {
      tagessatz = Math.round(e.app.offer.monatlicheKosten / 30); // wie AppCard und Vertrag (AngebotPruefenModal)
    }
  }

  // ─── Einsatz (Spez. 5.1): Zeile aus lead_jobs, sonst die Daten des Jobs ───
  const zeile = e.jobOfferId !== null ? e.jobs?.find((j) => j.mamamia_job_offer_id === e.jobOfferId) ?? null : null;
  const einsatz = zeile
    ? { id: zeile.id, status: zeile.status, anreise: zeile.anreise, abreise: zeile.abreise }
    : { id: null, status: null, anreise: isoTag(e.jobOffer?.arrival_at), abreise: isoTag(e.jobOffer?.departure_at) };
  const jobs: EinsatzZeile[] = (e.jobs ?? []).map((j) => ({
    id: j.id,
    status: j.status,
    anreise: j.anreise,
    abreise: j.abreise,
    pflegekraft: j.pflegekraft,
    bewerbungen: j.bewerbungen,
  }));

  return {
    heute: e.heute,
    kopf: e.kopf,
    einsatz,
    pflegekraft: e.app.nurse,
    anreise: e.ereignisse ? anreiseAusEreignissen(e.ereignisse, e.jobOfferId, zeile?.status ?? null) : null,
    brueckeOk: e.ereignisse !== null,
    bekommtMail: !!e.lead?.email?.trim() && !e.lead?.vermittler,
    vertrag: { stand, datum, pdfHref },
    tagessatz,
    jobs,
    notfallTelefon: e.notfallTelefon,
  };
}
