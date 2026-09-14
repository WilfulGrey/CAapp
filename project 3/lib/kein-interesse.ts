// Kunde meldet in der Abschiedsmail (nachfass_3) „kein Interesse“ (Registry #72,
// Martin 14.09.2026: „wenn kunde antwortet, dass er gerade kein interesse hat,
// würde ich nicht mehr mails senden und nachfassen stoppen“).
// Pure Logik für /api/kein-interesse und die Seite /kein-interesse — keine
// Next-/Supabase-Importe, damit root-vitest sie testen kann.

export const KEIN_INTERESSE_GRUENDE = {
  'aktuell-nicht': 'Aktuell nicht — vielleicht später',
  'nicht-relevant': 'Doch nicht relevant',
} as const;

export type KeinInteresseGrund = keyof typeof KEIN_INTERESSE_GRUENDE;

export function grundAus(wert: unknown): KeinInteresseGrund | null {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(KEIN_INTERESSE_GRUENDE, wert)
    ? (wert as KeinInteresseGrund)
    : null;
}

export function grundLabel(grund: KeinInteresseGrund | null): string {
  return grund ? KEIN_INTERESSE_GRUENDE[grund] : 'ohne Angabe';
}

// Nur offene Anfragen werden auf „nicht interessiert“ gesetzt. Gebuchte Kunden
// (vertrag_abgeschlossen, betreuung_beauftragt, folge_einsatz) bleiben
// unangetastet: der Link liegt noch Wochen im Postfach und darf keine Buchung
// lahmlegen. Das Team bekommt dann nur die Info.
const OFFENE_STATUS = new Set(['angebot_requested', 'info_requested', 'manuell_pruefen']);

export function darfStatusSetzen(status: string | null | undefined): boolean {
  return OFFENE_STATUS.has(String(status ?? ''));
}

export interface KeinInteresseInfo {
  kunde: string;
  email: string;
  telefon: string;
  quelle: string;
  leadId: string;
  grund: KeinInteresseGrund | null;
  statusVorher: string;
  statusGesetzt: boolean;
  mailsGestoppt: number;
  adminUrl: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function teamMailKeinInteresse(i: KeinInteresseInfo): { subject: string; html: string; text: string } {
  const label = grundLabel(i.grund);
  const subject = `Kein Interesse: ${i.kunde} („${label}“)`;
  const was = `${i.kunde} hat in der letzten Nachfass-Mail „${label}“ geklickt und bestätigt.`;
  const folge = i.statusGesetzt
    ? `Der Status steht jetzt auf „nicht interessiert“. ${i.mailsGestoppt} geplante Mails sind gestoppt, es gehen keine automatischen Mails mehr an den Kunden, auch keine Bewerbungsmails.`
    : `Der Status wurde NICHT geändert (aktuell „${i.statusVorher}“). Bitte prüfen, ob der Kunde noch Mails bekommen soll.`;
  const daten: Array<[string, string]> = [
    ['Kunde', i.kunde],
    ['E-Mail', i.email || '—'],
    ['Telefon', i.telefon || '—'],
    ['Quelle', i.quelle || '—'],
    ['Lead', i.adminUrl],
  ];
  const text = [subject, '', was, folge, '', ...daten.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const zeilen = daten
    .map(([k, v]) => {
      const wert = k === 'Lead' ? `<a href="${esc(v)}" style="color:#8B7355;">${esc(v)}</a>` : esc(v);
      return `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;color:#222;">${wert}</td></tr>`;
    })
    .join('');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background-color: #5C4A32; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${esc(subject)}</h2>
      </div>
      <div style="border: 2px solid #5C4A32; border-top: none; border-radius: 0 0 8px 8px; padding: 20px;">
        <p style="margin: 0 0 10px; font-size: 15px; color: #222;">${esc(was)}</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #222;">${esc(folge)}</p>
        <table style="border-collapse: collapse; font-size: 14px;">${zeilen}</table>
      </div>
    </div>`;
  return { subject, html, text };
}
