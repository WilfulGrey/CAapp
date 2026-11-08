// Rückmeldung aus der Abschiedsmail (nachfass_3, Registry #72). Die drei Knöpfe
// der Mail führen auf /rueckmeldung. Martin 14./15.09.2026: „wenn kunde
// antwortet, dass er gerade kein interesse hat … nachfassen stoppen" und „das ist
// sehr leicht, jemanden zu verlieren. Warum bieten wir da nicht irgendwas an? …
// was bedeutet später? … Abbestellen müsste negativer dargestellt sein … wir
// wollen das für uns nutzen." Deshalb: bei „später" einen Termin wählen lassen,
// bei „nicht relevant" den Grund erfragen und je Grund etwas Echtes anbieten,
// Abmelden nur als kleiner Link.
// Pure Logik für die Route und die Seite — keine Next-/Supabase-Importe, damit
// root-vitest sie testen kann.

/** Die drei Knöpfe der Abschiedsmail — Texte 1:1 wie RUECKMELDUNG_KNOEPFE in
 *  send-scheduled-emails/kette.ts (neu seit der Vorschau v2, 26.09.2026). */
export const KNOEPFE = {
  interesse: 'Ja, ich habe noch Interesse',
  'aktuell-nicht': 'Aktuell nicht, vielleicht später',
  'nicht-relevant': 'Nicht mehr relevant',
} as const;
export type Knopf = keyof typeof KNOEPFE;

/** Gründe bei „Nicht mehr relevant". Reihenfolge = Reihenfolge auf der Seite. */
export const ANLAESSE = {
  'anderer-anbieter': 'Wir haben einen anderen Anbieter gewählt',
  'zu-teuer': 'Es ist uns zu teuer',
  familie: 'Die Familie übernimmt die Pflege',
  pflegeheim: 'Umzug ins Pflegeheim',
  'nicht-mehr-noetig': 'Betreuung wird nicht mehr gebraucht',
  'anderer-grund': 'Anderer Grund',
} as const;
export type Anlass = keyof typeof ANLAESSE;

/** Wann wir uns wieder melden. Tage ab heute. */
export const WANN = {
  '2w': { tage: 14, label: 'In 2 Wochen', seit: 'vor zwei Wochen' },
  '1m': { tage: 30, label: 'In 1 Monat', seit: 'vor einem Monat' },
  '3m': { tage: 91, label: 'In 3 Monaten', seit: 'vor drei Monaten' },
} as const;
export type Wann = keyof typeof WANN;

const hat = (obj: object, wert: unknown): wert is string =>
  typeof wert === 'string' && Object.prototype.hasOwnProperty.call(obj, wert);

export const knopfAus = (w: unknown): Knopf | null => (hat(KNOEPFE, w) ? (w as Knopf) : null);
export const anlassAus = (w: unknown): Anlass | null => (hat(ANLAESSE, w) ? (w as Anlass) : null);
export const wannAus = (w: unknown): Wann | null => (hat(WANN, w) ? (w as Wann) : null);

/** Bei diesen Gründen zeigt die Seite die Bestpreisgarantie und das Team bekommt sofort Bescheid. */
export const PREIS_ANLAESSE: ReadonlySet<Anlass> = new Set<Anlass>(['anderer-anbieter', 'zu-teuer']);
/** Bei diesen Gründen bietet die Seite an, sich in 3 Monaten noch einmal zu melden. */
export const SPAETER_ANLAESSE: ReadonlySet<Anlass> = new Set<Anlass>(['familie', 'pflegeheim']);

// Nur offene Anfragen werden pausiert oder auf „nicht interessiert" gesetzt.
// Gebuchte Kunden (vertrag_abgeschlossen, betreuung_beauftragt, folge_einsatz)
// bleiben unangetastet: der Link liegt Wochen im Postfach und darf keine
// Buchung lahmlegen. Das Team bekommt dann nur die Info.
const OFFENE_STATUS = new Set(['angebot_requested', 'info_requested', 'manuell_pruefen']);
export function istOffen(status: string | null | undefined): boolean {
  return OFFENE_STATUS.has(String(status ?? ''));
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/**
 * Termin der Wiedervorlage: heute (Berliner Kalendertag) plus N Tage, 08:00 UTC
 * (= 10:00 Sommer- bzw. 09:00 Winterzeit, nie in der Nachtruhe).
 */
export function wiedervorlageTermin(jetzt: Date, wann: Wann): { iso: string; datum: string; text: string } {
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
  const [j, m, t] = heute.split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1, t + WANN[wann].tage, 8, 0, 0));
  const datum = ziel.toISOString().slice(0, 10);
  return { iso: ziel.toISOString(), datum, text: `${ziel.getUTCDate()}. ${MONATE[ziel.getUTCMonth()]}` };
}

// ─── Team-Mails an info@ ──────────────────────────────────────────────────

export type TeamAktion = 'pausieren' | 'stoppen' | 'rueckruf' | 'grund';

export interface TeamInfo {
  aktion: TeamAktion;
  kunde: string;
  email: string;
  telefon: string;
  quelle: string;
  adminUrl: string;
  knopf: Knopf | null;
  anlass?: Anlass | null;
  text?: string;
  wann?: Wann | null;
  datumText?: string;
  statusVorher: string;
  offen: boolean;
  mailsGestoppt?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function teamMail(i: TeamInfo): { subject: string; html: string; text: string } {
  const knopf = i.knopf ? `„${KNOEPFE[i.knopf]}“` : 'einen Knopf';
  const anlass = i.anlass ? ANLAESSE[i.anlass] : '';
  const nichtOffen = `Der Status wurde NICHT geändert (aktuell „${i.statusVorher}“, gebucht oder Folge-Einsatz). Bitte prüfen.`;
  let subject: string;
  const saetze: string[] = [];
  switch (i.aktion) {
    case 'pausieren':
      subject = `Wiedervorlage: ${i.kunde} am ${i.datumText ?? '?'}`;
      saetze.push(`${i.kunde} hat in der letzten Nachfass-Mail ${knopf} geklickt und „${i.wann ? WANN[i.wann].label : '?'}“ gewählt.`);
      if (anlass) saetze.push(`Grund: ${anlass}.`);
      if (i.text) saetze.push(`Anmerkung des Kunden: „${i.text}“`);
      saetze.push(i.offen
        ? `Bis zum ${i.datumText} gehen keine Erinnerungen raus${i.mailsGestoppt ? ` (${i.mailsGestoppt} geplante Mails gestoppt)` : ''}. Dann schickt das System eine persönliche Nachfrage von Marta. Sagt der Kunde vorher ab: im Admin „Nicht interessiert“ klicken, dann entfällt auch die Nachfrage.`
        : nichtOffen);
      break;
    case 'stoppen':
      subject = `Abgemeldet: ${i.kunde}${anlass ? ` („${anlass}“)` : ''}`;
      saetze.push(`${i.kunde} hat sich über die letzte Nachfass-Mail (${knopf}) abgemeldet.`);
      saetze.push(anlass ? `Grund: ${anlass}.` : 'Ohne Angabe eines Grundes.');
      if (i.text) saetze.push(`Anmerkung des Kunden: „${i.text}“`);
      saetze.push(i.offen
        ? `Der Status steht jetzt auf „nicht interessiert“. ${i.mailsGestoppt ?? 0} geplante Mails sind gestoppt, es gehen keine automatischen Mails mehr an den Kunden, auch keine Bewerbungsmails.`
        : nichtOffen);
      break;
    case 'rueckruf':
      subject = `📞 Rückruf erbeten: ${i.kunde}`;
      saetze.push(`${i.kunde} möchte angerufen werden (Knopf ${knopf} in der letzten Nachfass-Mail). Die Seite sagt dem Kunden: „Marta ruft Sie an.“`);
      if (!i.telefon) saetze.push('Keine Telefonnummer im Lead — bitte per Mail melden.');
      break;
    case 'grund':
      subject = `Preis-Einwand: ${i.kunde} („${anlass}“)`;
      saetze.push(`${i.kunde} hat „Nicht mehr relevant“ geklickt und als Grund „${anlass}“ gewählt. Die Seite hat die Bestpreisgarantie gezeigt.`);
      saetze.push('Ein Anruf lohnt sich, solange noch nicht unterschrieben ist. Der Kunde ist noch NICHT abgemeldet.');
      break;
  }
  const daten: Array<[string, string]> = [
    ['Kunde', i.kunde],
    ['Telefon', i.telefon || '—'],
    ['E-Mail', i.email || '—'],
    ['Quelle', i.quelle || '—'],
    ['Lead', i.adminUrl],
  ];
  const text = [subject, '', ...saetze, '', ...daten.map(([k, v]) => `${k}: ${v}`)].join('\n');
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
        ${saetze.map((s) => `<p style="margin: 0 0 10px; font-size: 15px; color: #222;">${esc(s)}</p>`).join('')}
        <table style="border-collapse: collapse; font-size: 14px; margin-top: 8px;">${zeilen}</table>
      </div>
    </div>`;
  return { subject, html, text };
}
