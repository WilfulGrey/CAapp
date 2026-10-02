// Registry #110: Team-Alarm „Bewerbung nach Unterschrift still zurückgezogen".
// Der detect-Cron erkennt im Mamamia-Protokoll, dass eine angenommene Bewerbung
// NACH der Buchung abgelehnt wurde, die Buchung (Confirmation) aber stehen blieb
// (Fall Hunkirchen, 28.09.2026). Bewusste Stornos durch SA/CGA alarmieren nicht.
// Rein (keine Next-/Supabase-Imports, nur relative Pfade) — getestet per
// Cross-Import in src/__tests__/ruecknahmeAlarm.test.ts.

import { timingSafeEqual } from 'crypto';
import type { EmailTemplate } from './email';

/**
 * Das Event darf nur server-to-server kommen (Cron mit Service-Role). Ein
 * Kunden-Token allein reicht nicht — sonst könnte jeder mit einem Mail-Link
 * rote Alarme mit eigenem Text verschicken. Fehlt der Key ⇒ lieber zu als offen.
 */
export function istServiceRoleAnfrage(
  authorization: string | null | undefined,
  erwartet: string | undefined,
): 'ok' | 'fehlt' | 'nein' {
  if (!erwartet) return 'fehlt';
  const geliefert = Buffer.from((authorization ?? '').replace(/^Bearer\s+/i, ''));
  const soll = Buffer.from(erwartet);
  return geliefert.length === soll.length && timingSafeEqual(geliefert, soll) ? 'ok' : 'nein';
}

export interface RuecknahmeInfo {
  application_id: string;
  caregiver_id: string | null;
  confirmation_id: string | null;
  accepted_at: string | null;
  confirmation_created_at: string | null;
  rejected_at: string | null;
  von: string | null;
  reject_type: string | null;
  reject_message: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

/** Metadaten des Cron-POSTs → Info; ohne application_id ⇒ null (400). */
export function ruecknahmeInfo(m: Record<string, unknown>): RuecknahmeInfo | null {
  const appId = str(m.application_id);
  if (!appId) return null;
  return {
    application_id: appId,
    caregiver_id: str(m.caregiver_id),
    confirmation_id: str(m.confirmation_id),
    accepted_at: str(m.accepted_at),
    confirmation_created_at: str(m.confirmation_created_at),
    rejected_at: str(m.rejected_at),
    von: str(m.von),
    reject_type: str(m.reject_type),
    reject_message: str(m.reject_message),
  };
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** UTC-Zeitpunkt → „28.09.2026, 11:34“ (Europe/Berlin). Unlesbar ⇒ „—“. */
export function berlinZeit(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

// reject_type ist Mamamias Enum (Struktur, kein Freitext); null = System.
function abgelehntVon(info: RuecknahmeInfo): string {
  const wer = info.von ?? 'unbekannt';
  if (info.reject_type === 'caregiverAgency') return `von der Pflegeagentur (${wer})`;
  if (info.reject_type === 'serviceAgency') return `von der Service-Agentur (${wer})`;
  return `automatisch von Mamamia (${info.von ?? 'System'})`;
}

interface LeadKopf {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
}

export function buildRuecknahmeAlarm(lead: LeadKopf, info: RuecknahmeInfo): EmailTemplate {
  const kunde = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || lead.id;
  const subject = `🚨 ALARM: Bewerbung nach Unterschrift zurückgezogen — ${kunde} (Bewerbung ${info.application_id})`;
  const lage = `Der Kunde hat am ${berlinZeit(info.accepted_at)} die Bewerbung angenommen und den Vertrag unterschrieben. `
    + `Mamamia hat die Buchung angelegt (Confirmation ${info.confirmation_id ?? '?'}). `
    + `Danach wurde die BEWERBUNG ${abgelehntVon(info)} abgelehnt (${berlinZeit(info.rejected_at)}) — die Buchung selbst aber NICHT storniert. `
    + 'In Mamamia sieht der Einsatz deshalb gebucht aus, die Pflegekraft kommt aber nicht. Der Kunde hat Vertrag und Buchungsbestätigung.';
  const daten: Array<[string, string]> = [
    ['Kunde', kunde],
    ['E-Mail', lead.email ?? '—'],
    ['Telefon', lead.telefon ?? '—'],
    ['Lead-ID', lead.id],
    ['Bewerbung (application_id)', info.application_id],
    ['Buchung (Confirmation)', info.confirmation_id ?? '—'],
    ['Pflegekraft', info.caregiver_id ? `ID ${info.caregiver_id}` : '—'],
    ['Unterschrift', berlinZeit(info.accepted_at)],
    ['Bewerbung abgelehnt', berlinZeit(info.rejected_at)],
    ['Abgelehnt von', abgelehntVon(info)],
    ['Grund laut Mamamia', info.reject_message ?? '—'],
  ];
  const schritte = [
    'Mit der Agentur klären, ob die Pflegekraft trotzdem kommt.',
    'Falls nicht: Buchung in Mamamia stornieren (Confirmation ablehnen), damit der Job wieder offen ist und neue Bewerbungen kommen.',
    'Kunden sofort informieren — er wartet auf die Anreise.',
  ];
  const text = [subject, '', lage, '', 'Daten:', ...daten.map(([k, v]) => `- ${k}: ${v}`), '', 'Bitte jetzt:', ...schritte.map((s, i) => `${i + 1}. ${s}`)].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background-color: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${esc(subject)}</h2>
      </div>
      <div style="border: 2px solid #dc2626; border-top: none; border-radius: 0 0 8px 8px; padding: 20px;">
        <p style="margin-top: 0;"><strong>${esc(lage)}</strong></p>
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          ${daten.map(([k, v]) => `<tr><td style="padding: 4px 8px; border: 1px solid #e5e7eb; background: #f9fafb; white-space: nowrap;">${esc(k)}</td><td style="padding: 4px 8px; border: 1px solid #e5e7eb;">${esc(v)}</td></tr>`).join('')}
        </table>
        <p style="margin-bottom: 4px;"><strong>Bitte jetzt:</strong></p>
        <ol style="margin-top: 4px;">${schritte.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
    </div>
  `;
  return { subject, html, text };
}
