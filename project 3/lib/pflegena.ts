/* ─── Vermittler-Anfragen (Pflegena) lesen ───────────────────────────────
 *
 * Pflegehilfe und Pflege-Helfer24 liefern Formulardaten: "Label: Wert" oder
 * benannte CSV-Spalten. Ein Vermittler schreibt Prosa:
 *
 *   "wenigstens mittlere Deutschkenntnisse sind gewuenscht, Tagessatz IHR
 *    PREISANGEBOT + 10 Pflegena = ?? EUR plus Reisekosten ... ein liebes
 *    Ehepaar, sie ist nicht pflegebeduerftig, er ist aktuell sehr
 *    geschwaecht, Hebetechnik erforderlich falls Transfer Bett/Rollstuhl"
 *
 * Dafuer gibt es keinen Regelparser. Das Modell ordnet den Text denselben
 * neun Kalkulator-Feldern zu, die auch das Formular kennt — und dieses
 * Modul prueft die Antwort, bevor sie irgendwo hin darf.
 *
 * Aufbau wie bei Pria (app/api/pria/route.ts + lib/pria.ts): Schema, Prompt
 * und Pruefung liegen hier und sind OHNE Schluessel testbar; der Netzaufruf
 * steht in der Route. Das Modul ist rein (nur type-Importe), damit der
 * root-vitest es quer importieren kann.
 */

import { ERLAUBT, zulaessig, type AngabenKey } from './angaben-diff';

/* Die neun Felder, die eine Anfrage tragen kann. `care_start_timing` ist
 * KEIN fd-Key (es ist die Spalte leads.care_start_timing), wandert aber
 * denselben Weg durch die Pruefung. */
const ANGABEN_KEYS = [
  'betreuung_fuer', 'pflegegrad', 'weitere_personen', 'mobilitaet',
  'nachteinsaetze', 'deutschkenntnisse', 'erfahrung', 'fuehrerschein', 'geschlecht',
] as const;

const enumWerte = (k: AngabenKey) =>
  (ERLAUBT as Record<string, readonly string[]>)[k].filter((v) => v !== '');

export const WERKZEUG = {
  name: 'anfrage_lesen',
  description:
    'Ordnet eine Vermittler-Anfrage den Preiskategorien zu. Nur Werte aus den '
    + 'vorgegebenen Listen; was im Text nicht steht, bleibt null.',
  input_schema: {
    type: 'object' as const,
    properties: {
      ist_anfrage: {
        type: 'boolean',
        description:
          'true nur, wenn die Mail eine NEUE Betreuungsanfrage fuer einen Kunden ist. '
          + 'Danksagungen, Rueckfragen, Zusagen, Rechnungen, Newsletter: false.',
      },
      mehrere_anfragen: {
        type: 'boolean',
        description: 'true, wenn die Mail Anfragen fuer MEHRERE verschiedene Haushalte enthaelt.',
      },
      nachtrag: {
        type: 'boolean',
        description: 'true, wenn die Mail eine frueher gestellte Anfrage ergaenzt oder korrigiert.',
      },
      betreuung_fuer: { type: ['string', 'null'], enum: [...enumWerte('betreuung_fuer'), null] },
      weitere_personen: { type: ['string', 'null'], enum: [...enumWerte('weitere_personen'), null] },
      mobilitaet: { type: ['string', 'null'], enum: [...enumWerte('mobilitaet'), null] },
      nachteinsaetze: { type: ['string', 'null'], enum: [...enumWerte('nachteinsaetze'), null] },
      deutschkenntnisse: { type: ['string', 'null'], enum: [...enumWerte('deutschkenntnisse'), null] },
      erfahrung: { type: ['string', 'null'], enum: [...enumWerte('erfahrung'), null] },
      fuehrerschein: { type: ['string', 'null'], enum: [...enumWerte('fuehrerschein'), null] },
      geschlecht: { type: ['string', 'null'], enum: [...enumWerte('geschlecht'), null] },
      pflegegrad: {
        type: ['integer', 'null'],
        description:
          'Ganzzahl 0-5. 0 NUR, wenn der Text ausdruecklich sagt, dass kein Pflegegrad '
          + 'vorliegt ("kein Pflegegrad", "noch nicht eingestuft"). Wird der Pflegegrad '
          + 'gar nicht erwaehnt: null.',
      },
      care_start_timing: { type: ['string', 'null'], enum: [...enumWerte('care_start_timing'), null] },
      kunde_vorname: { type: ['string', 'null'] },
      kunde_nachname: {
        type: ['string', 'null'],
        description: 'Nachname des zu betreuenden Haushalts, z. B. "Schmidt" aus "Familie Schmidt".',
      },
      plz: { type: ['string', 'null'], description: 'Fuenfstellige PLZ, nur wenn sie im Text steht.' },
      ort: { type: ['string', 'null'] },
      provision_pro_tag: {
        type: ['number', 'null'],
        description: 'Vom Vermittler genannte Provision in EUR pro Tag, falls die Mail eine nennt.',
      },
      kontext: {
        type: 'string',
        description:
          'Die menschliche Situation in 2-5 Saetzen, moeglichst mit den Worten der Mail: '
          + 'Beziehung, Zustand, Besonderheiten, Hilfsmittel, Transfer, Wuensche. Alles, '
          + 'was kein Preisfeld ist, aber die Agentur wissen muss.',
      },
    },
    required: ['ist_anfrage', 'mehrere_anfragen', 'nachtrag', 'kontext'],
  },
};

export const SYSTEM = `Du liest E-Mails, die ein Vermittler an eine 24-Stunden-Betreuungsagentur schickt, und ordnest sie den Preiskategorien zu.

Rufe IMMER das Werkzeug ${WERKZEUG.name} auf.

GRUNDREGEL: Was im Text nicht steht, ist null. Rate nicht, schliesse nicht aus Erfahrung, waehle keinen "typischen" Wert. Eine Luecke wird spaeter bewusst und sichtbar gefuellt — ein geratener Wert nicht.

Unterscheidung bei "betreuung_fuer":
- "ehepaar": NUR wenn BEIDE Personen betreut/gepflegt werden muessen.
- "1-person": wenn eine Person der Patient ist und der Partner selbststaendig ist, mithilft oder einfach im Haushalt lebt. Dann ist "weitere_personen" = "ja".

Mobilitaet bezeichnet, wie sich der Patient BEWEGT:
- "mobil" geht selbststaendig, "rollator" braucht ein Gehhilfsmittel,
- "rollstuhl" ist auf den Rollstuhl angewiesen, "bettlaegerig" verlaesst das Bett nicht.
Saetze ueber HEBEN, TRANSFER oder Hebetechnik sagen nichts ueber die Mobilitaetsstufe — sie gehoeren nach kontext. "Er kann kurz stehen, die Ehefrau hilft beim Transfer" ist kein bettlaegeriger Patient.

Deutschkenntnisse: "grundlegend" (einfache Verstaendigung), "kommunikativ" (mittlere Kenntnisse, Alltagsgespraeche), "sehr-gut" (fliessend). "wenigstens mittlere Deutschkenntnisse" ist "kommunikativ".

pflegegrad: nur eine Zahl, die im Text steht. "kein Pflegegrad" ist 0. Nicht erwaehnt ist null — NICHT 0.

plz: nur uebernehmen, wenn eine fuenfstellige Zahl im Text steht. Aus einem Ortsnamen keine PLZ herleiten.

provision_pro_tag: die Zahl, die der Vermittler auf unseren Preis aufschlaegt ("+ 10 Pflegena" ist 10). Steht keine da: null.

kontext: die Situation in den Worten der Mail. Keine Erfindungen, keine Zusammenfassung der Preisfelder.`;

/* Die zwei Mails, die eine Vermittler-Anfrage ausloest. Bewusst HIER und
 * nicht in der Route: so kann der Test festhalten, was die Liste enthaelt —
 * und vor allem, was nicht. Stuende 'eingangsbestaetigung' darin, bekaeme
 * der Partner die Kundenmail (Portal-Button, Angaben-Tabelle, Abmelde-Link
 * mit seinem Token) und obendrein die sechsteilige Nurture-Kette, die
 * send-scheduled-emails nach diesem Typ scharfschaltet. */
export const VERMITTLER_MAILS = ['vermittler_angebot', 'vermittler_kraefte'] as const;
export type VermittlerMailTyp = (typeof VERMITTLER_MAILS)[number];

/* ─── Pruefung ───────────────────────────────────────────────────────── */

export interface MailKopf {
  /** Absenderadresse — sie wird zu leads.email. */
  von: string;
  /** Anzeigename des Absenders (From/Reply-To), Basis fuer die Anrede. */
  vonName?: string | null;
  betreff?: string | null;
  messageId?: string | null;
  datum?: Date | null;
  /** Rohtext der Mail — Beleg fuer die PLZ. */
  text: string;
}

export interface PflegenaBody {
  portal: string;
  name: string;
  email: string;
  angaben: Record<string, string | number>;
  care_start_timing?: string;
  plz?: string;
  ort?: string;
  details: Record<string, string>;
  einwilligung: { text: string; zeitpunkt: string };
  erstellt_am: string;
  message_id?: string;
  betreff?: string;
}

export type PflegenaErgebnis =
  | { ok: true; body: PflegenaBody; unbekannt: string[]; hinweise: string[] }
  | { ok: false; grund: string };

const text = (v: unknown, max = 200): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

/**
 * Werkzeug-Antwort → Body fuer /api/portal-lead. Rein und deterministisch.
 *
 * @param roh   das `input`-Objekt des tool_use-Blocks
 * @param mail  Kopfdaten der gelesenen Mail
 * @param provisionErwartet Provision aus der Vermittler-Konfiguration
 */
export function pruefeAnfrage(
  roh: any,
  mail: MailKopf,
  provisionErwartet: number,
): PflegenaErgebnis {
  if (!roh || typeof roh !== 'object') return { ok: false, grund: 'Modell hat nichts Verwertbares geliefert' };

  /* Drei Faelle, die ein Mensch anschauen muss statt eines Automaten. Eine
     automatische Antwort auf ein "Danke" waere peinlich; ein Angebot fuer
     die erste von zwei Familien waere falsch. */
  if (roh.ist_anfrage !== true) return { ok: false, grund: 'keine neue Betreuungsanfrage' };
  if (roh.mehrere_anfragen === true) return { ok: false, grund: 'mehrere Anfragen in einer Mail' };
  if (roh.nachtrag === true) return { ok: false, grund: 'Nachtrag zu einer frueheren Anfrage' };

  const unbekannt: string[] = [];
  const hinweise: string[] = [];
  const angaben: Record<string, string | number> = {};

  for (const k of ANGABEN_KEYS) {
    const v = roh[k];
    if (v === null || v === undefined) continue; // Luecke — fuellt ergaenzeAngaben
    if (zulaessig(k as AngabenKey, v)) {
      angaben[k] = v as string | number;
    } else {
      // Ein Wert ausserhalb des Kanons heisst: Prompt und pricing_config sind
      // auseinandergelaufen. Nicht setzen, aber laut ins Log.
      unbekannt.push(`${k}: ${JSON.stringify(v)}`);
    }
  }

  /* Konnte gar nichts gelesen werden, ist die Mail entweder keine Anfrage
     oder so vage, dass jeder Preis daraus eine reine Erfindung waere. */
  if (Object.keys(angaben).length === 0) {
    return { ok: false, grund: 'keine einzige Angabe lesbar' };
  }

  let care_start_timing: string | undefined;
  if (roh.care_start_timing !== null && roh.care_start_timing !== undefined) {
    if (zulaessig('care_start_timing', roh.care_start_timing)) care_start_timing = roh.care_start_timing;
    else unbekannt.push(`care_start_timing: ${JSON.stringify(roh.care_start_timing)}`);
  }

  /* PLZ nur mit Beleg im Text. Eine halluzinierte Postleitzahl waere nicht
     bloss falsch, sie steuert den Locations-Lookup und damit, welche
     Betreuungskraefte der Partner zu sehen bekommt. */
  let plz: string | undefined;
  const plzRoh = text(roh.plz, 5);
  if (plzRoh) {
    if (/^\d{5}$/.test(plzRoh) && new RegExp(`(?<!\\d)${plzRoh}(?!\\d)`).test(mail.text)) plz = plzRoh;
    else hinweise.push(`PLZ "${plzRoh}" steht nicht im Mailtext — verworfen`);
  }

  /* Provision: die Konfiguration entscheidet, nie das Modell. Eine
     abweichende Zahl in der Mail ist ein Hinweis fuer das Team, kein Grund,
     dem Partner einen anderen Preis zu schicken. */
  const provGelesen = typeof roh.provision_pro_tag === 'number' && Number.isFinite(roh.provision_pro_tag)
    ? roh.provision_pro_tag : null;
  if (provGelesen !== null && provGelesen !== provisionErwartet) {
    hinweise.push(`Provision in der Mail: ${provGelesen} EUR/Tag, konfiguriert: ${provisionErwartet} EUR/Tag`);
  }

  const gemeldetAm = (mail.datum ?? new Date()).toISOString();
  const nachname = text(roh.kunde_nachname, 80);
  const ort = text(roh.ort, 80);

  /* Erste Zeile des Blocks ist die Kennung des Haushalts: sie landet ueber
     fd.portal_details in der JobOffer-Beschreibung und ist im Mamamia-Panel
     das Einzige, was zwei Anfragen desselben Vermittlers unterscheidet (der
     Kunde dort traegt die Kontaktdaten des Vermittlers). */
  const kopfzeile = [nachname ? `Familie ${nachname}` : 'Kunde des Vermittlers', ort]
    .filter(Boolean).join(', ');
  const details: Record<string, string> = {
    block: `${kopfzeile}\n${text(roh.kontext, 1800) ?? ''}`.trim(),
  };
  const vorname = text(roh.kunde_vorname, 80);
  if (vorname) details.patient_vorname = vorname;
  if (nachname) details.patient_nachname = nachname;

  return {
    ok: true,
    unbekannt,
    hinweise,
    body: {
      portal: 'pflegena.de',
      // Der Anzeigename des Absenders; die Anrede baut die Route daraus mit
      // parseCustomerName — aus einem Vornamen ein Geschlecht zu erraten ist
      // nicht Sache des Modells.
      name: text(mail.vonName, 120) ?? '',
      email: mail.von,
      angaben,
      ...(care_start_timing ? { care_start_timing } : {}),
      ...(plz ? { plz } : {}),
      ...(ort ? { ort } : {}),
      details,
      /* Bezeugt, nicht erfunden (Muster portal-helfer24.ts): der Endkunde hat
         uns nichts erlaubt — er hat den Vermittler beauftragt. Wir
         protokollieren, was wir wissen. */
      einwilligung: {
        text: `Anfrage per Mail vom Vermittler Pflegena (Absender ${mail.von}) am ${gemeldetAm}; `
          + 'Einwilligung des Endkunden liegt beim Vermittler.',
        zeitpunkt: gemeldetAm,
      },
      erstellt_am: gemeldetAm,
      ...(mail.messageId ? { message_id: mail.messageId } : {}),
      ...(mail.betreff ? { betreff: mail.betreff } : {}),
    },
  };
}

/**
 * Betreff einer Antwort im Thread. Mailclients stapeln "AW: Re: Fwd:"
 * uebereinander; wir setzen genau ein "Re:" davor.
 */
export function betreffAntwort(roh?: string | null): string {
  const blank = String(roh ?? '').replace(/\s+/g, ' ').trim();
  const ohne = blank.replace(/^(?:(?:re|aw|antw|fwd|wg)\s*(?:\[\d+\])?\s*:\s*)+/i, '').trim();
  return ohne ? `Re: ${ohne}` : 'Re: Ihre Anfrage';
}
