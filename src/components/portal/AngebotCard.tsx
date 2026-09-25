import { useEffect, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import {
  Lead,
  prefillPatientFromLead,
} from '../../lib/supabase';
import { ChipSelect } from './ChipSelect';
import { Card } from '../ui/Card';
import { FormField } from '../ui/FormField';
import { FormNav } from '../ui/FormNav';
import { ProgressSteps } from '../ui/ProgressSteps';
import { EYEBROW } from '../ui/SectionHeader';
import { DateField, kalenderTag, localTodayIso } from './DateField';
import { callMamamia } from '../../lib/mamamia/client';
import { reportLeadEvent } from '../../lib/leadEvents';
import type { PatientForm } from './shared';
import { STEP_LABELS, einsatzortHinweis } from './shared';
import type { MamamiaCustomer } from '../../lib/mamamia/types';
import { mapMamamiaCustomerToPatientForm, germanySkillLabel } from '../../lib/mamamia/mappers';
import { RESERVIERUNG_STUNDEN } from '../../lib/reservierung';

// Plausibilitäts-Check für Telefonnummern — bewusst lax, dieselbe Regel wie
// im Kostenrechner (project 3/lib/telefon.ts): 8–15 Ziffern, führendes „+"
// oder „00" erlaubt, Leerzeichen/Bindestrich/Klammer egal. Seit das Feld im
// Profil immer steht und aus dem Rechner vorbelegt ist (Registry #76), darf
// es nicht strenger sein als der Rechner — sonst sperrte eine dort gültige
// +41-/+43-Nummer den Schritt. Soll Tippfehler / Unsinn abfangen, NICHT als
// Format-Pflicht wirken.
function isPlausibleGermanPhone(raw: string): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/[\s\-/().]/g, '');
  const ziffern = cleaned.replace(/^\+/, '').replace(/^00/, '');
  return /^\d{8,15}$/.test(ziffern);
}

// Geburtsjahr ist optional; wenn eingetragen, dann ein plausibles Jahr.
// Bis 24.09. eine Liste 1931–2000, jetzt ein Zahlenfeld (Martin: „Zahlenfeld").
function geburtsjahrGueltig(jahr: string): boolean {
  if (jahr === '') return true;
  if (!/^\d{4}$/.test(jahr)) return false;
  const n = Number(jahr);
  return n >= 1920 && n <= 2010;
}

// Auswahl-Werte bleiben, wie mamamia und der Mapper sie kennen; die Chips zeigen
// kürzere Beschriftungen, damit drei in eine Zeile passen (Einheit steht im Label).
const GEWICHT = ['Unter 50 kg','51-60 kg','61-70 kg','71-80 kg','81-90 kg','91-100 kg','Über 100 kg'];
const GEWICHT_KURZ: Record<string, string> = {
  'Unter 50 kg': 'bis 50', '51-60 kg': '51–60', '61-70 kg': '61–70', '71-80 kg': '71–80',
  '81-90 kg': '81–90', '91-100 kg': '91–100', 'Über 100 kg': 'über 100',
};
const GROESSE = ['Unter 151 cm','151-160 cm','161-170 cm','171-180 cm','181-190 cm','Über 190 cm'];
const GROESSE_KURZ: Record<string, string> = {
  'Unter 151 cm': 'bis 150', '151-160 cm': '151–160', '161-170 cm': '161–170',
  '171-180 cm': '171–180', '181-190 cm': '181–190', 'Über 190 cm': 'über 190',
};
const PFLEGEGRAD = ['Kein/e','Pflegegrad 1','Pflegegrad 2','Pflegegrad 3','Pflegegrad 4','Pflegegrad 5'];
const PFLEGEGRAD_KURZ: Record<string, string> = {
  'Kein/e': 'Keiner', 'Pflegegrad 1': '1', 'Pflegegrad 2': '2', 'Pflegegrad 3': '3', 'Pflegegrad 4': '4', 'Pflegegrad 5': '5',
};
const DEMENZ = ['Nein','Leichtgradig','Mittelgradig','Schwer'];
// Felder, die es pro Person gibt (Person 2 mit Präfix p2_).
const PERSON_FELDER = ['geschlecht', 'geburtsjahr', 'mobilitaet', 'heben', 'demenz', 'nacht'];
const INKONTINENZ = ['Nein','Harninkontinenz','Stuhlinkontinenz','Beides'];

export const AngebotCard: FC<{
  lead?: Lead | null;
  /** Snapshot of the customer's Mamamia state — used to seed the
   *  patient-form wizard with the real backend values, not just the
   *  stage-A calculator answers. Source-of-truth when available. */
  mmCustomer?: MamamiaCustomer | null;
  onPatientSaved?: (saved: boolean) => void;
  triggerOpenPatient?: boolean;
  onTriggerHandled?: () => void;
  mamamiaEnabled?: boolean;
  onSaveToMamamia?: (form: PatientForm) => Promise<void>;
  /** Nach jedem erfolgreichen Absenden; `nurAenderung` = Angaben wurden nur geändert. */
  onAbgesendet?: (nurAenderung: boolean) => void;
  /** Startdatum, das der Kunde beim Absenden gewählt hat (`JobOffer.arrival_at`).
   *  Nur übergeben, wenn schon abgesendet wurde: Vorher steht dort die
   *  Onboard-Schätzung, die das Feld bewusst NICHT vorbelegt. */
  gewaehlterStart?: string | null;
  /** Schon abgesendet (laut mamamia oder in dieser Sitzung): nur noch „Änderungen speichern". */
  schonAbgesendet?: boolean;
}> = ({ lead, mmCustomer, onPatientSaved, triggerOpenPatient, onTriggerHandled, mamamiaEnabled, onSaveToMamamia, onAbgesendet, gewaehlterStart, schonAbgesendet }) => {
  // Offen, sobald die Karte gerendert wird: Seit dem Wegfall des
  // Zwischenkopfs (11.08.) steuert allein der Abschnittskopf in
  // CustomerPortalPage, ob dieser Block überhaupt erscheint.
  const [patientOpen, setPatientOpen] = useState(true);
  // Fehler zeigen erst nach einem Fehlversuch mit „Weiter"/„Speichern" — vorher
  // standen die roten Rahmen ab dem ersten Rendern und das Formular sah falsch
  // aus, bevor jemand getippt hatte. Welche Felder rot sind, ergibt sich live
  // aus `missingFields`.
  const [fehlerZeigen, setFehlerZeigen] = useState(false);
  const [step, setStep] = useState(0);
  const [priceInfo, setPriceInfo] = useState<string|null>(null);

  // ─── localStorage key per lead/token ────────────────────────────────────────
  const storageKey = lead?.token ? `patient_${lead.token}` : null;

  // Load saved patient data from localStorage (or fall back to formularDaten prefill).
  // localStorage now carries an `_isDraft` flag so partially-filled drafts
  // (auto-saved on every field change) don't masquerade as a complete
  // submission. Only `_isDraft: false` (set when user clicks the final
  // "Daten speichern") flips the customer-portal "Patientendaten" card
  // to its green-checked "Vollständig" state.
  // Three prefill sources, applied in priority order (highest wins):
  //   1. localStorage draft (`_isDraft: true`) — user mid-edit, must
  //      survive refreshes between steps.
  //   2. Mamamia state — what the backend currently knows (latest save).
  //   3. formularDaten prefill from the calculator — coarse, stage-A
  //      stub. Only used for fields neither (1) nor (2) cover.
  // Final-saved localStorage (`_isDraft: false`) sits at level 1 too —
  // it's identical to Mamamia state by construction (the save is what
  // wrote both) so its position relative to (2) doesn't matter.
  const prefill = lead ? prefillPatientFromLead(lead) : {};
  // Bug #13: onboard no longer ships patient.gender (kalkulator nie pyta);
  // Mamamia returns null until patient form save → reverse mapper outputs
  // '' for gender so dropdown stays empty. No more patientGenderKnown opt.
  const mmPrefill = mapMamamiaCustomerToPatientForm(mmCustomer ?? null);
  const savedData: Partial<PatientForm> & { _isDraft?: boolean } = storageKey
    ? (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })()
    : {};
  const hasFinalSave = storageKey
    ? !!localStorage.getItem(storageKey) && savedData._isDraft !== true
    : false;

  // pick(field) — return the first non-empty value across the three
  // sources. Empty strings are treated as "missing" so a partial draft
  // doesn't black-hole a Mamamia value for a field the user hasn't
  // touched yet.
  const pick = <K extends keyof PatientForm>(field: K): string => {
    const fromDraft = savedData[field] as string | undefined;
    if (fromDraft != null && fromDraft !== '') return fromDraft;
    const fromMm = (mmPrefill as Record<string, string | undefined>)[field as string];
    if (fromMm != null && fromMm !== '') return fromMm;
    const fromCalc = (prefill as Record<string, string | undefined>)[field as string];
    if (fromCalc != null && fromCalc !== '') return fromCalc;
    return '';
  };

  const [saved, setSaved] = useState(hasFinalSave);
  // Tracks the Mamamia updateCustomer round-trip kicked off from "Speichern".
  // While true: button stays disabled with "Speichern…" label, form stays
  // visible (no premature collapse), invite gate stays closed. Flips back
  // to false in both success and failure paths inside the click handler.
  const [isSaving, setIsSaving] = useState(false);

  // Propagate saved → parent. The hasFinalSave hydration above flips
  // `saved=true` on mount when the customer revisits with a previously
  // submitted patient form, but without this useEffect the parent's
  // patientSaved would stay false (onPatientSaved is only called from
  // the explicit "Daten speichern" click handler) — meaning the strict
  // invite-gate would block invitations for a returning customer who
  // already has a complete profile.
  //
  // ABER: Dieser Effekt meldet AUSSCHLIESSLICH Aufwertungen (saved=true).
  // Martin, 13.08., prod: Daten in mamamia komplett, Kunde tippt den
  // Abschnittskopf an, das Formular mountet — auf dem Gerät liegt kein
  // localStorage-Vermerk, `saved` startet false, und der Effekt überschrieb
  // das server-bestätigte „Vollständig" mit „Noch offen". localStorage ist
  // GERÄTE-Wissen, mamamia ist die Wahrheit — ein fehlender lokaler Vermerk
  // ist kein Beleg für „unvollständig". (Erster Fix war ein Mount-Ref und
  // hielt StrictMode nicht stand — Doppel-Ausführung verbraucht den Ref.)
  // Die Abwertung läuft NUR noch über updatePatient, also über eine echte
  // Bearbeitung durch den Kunden.
  useEffect(() => {
    if (saved) onPatientSaved?.(true);
  }, [saved]);

  // Open the Patientendaten row when the parent flips `triggerOpenPatient`
  // (e.g. customer clicks "Jetzt Patientendaten ausfüllen" in the
  // invite-gate popup or in the So-funktioniert's stepper). The prop was
  // declared but never wired up, so the click was a no-op apart from the
  // scrollIntoView — the row stayed collapsed.
  useEffect(() => {
    if (triggerOpenPatient) {
      setPatientOpen(true);
      onTriggerHandled?.();
    }
  }, [triggerOpenPatient]);
  const [patient, setPatient] = useState<PatientForm>({
    anzahl: (pick('anzahl') as '1' | '2' | '') || '1',
    geschlecht: pick('geschlecht'), geburtsjahr: pick('geburtsjahr'),
    pflegegrad: pick('pflegegrad'), gewicht: pick('gewicht'), groesse: pick('groesse'),
    mobilitaet: pick('mobilitaet') || 'Rollstuhlfähig',
    heben: pick('heben'), demenz: pick('demenz'), inkontinenz: pick('inkontinenz'),
    nacht: pick('nacht') || 'Nein',
    p2_geschlecht: pick('p2_geschlecht'), p2_geburtsjahr: pick('p2_geburtsjahr'),
    p2_pflegegrad: pick('p2_pflegegrad'), p2_gewicht: pick('p2_gewicht'), p2_groesse: pick('p2_groesse'),
    p2_mobilitaet: pick('p2_mobilitaet'), p2_heben: pick('p2_heben'),
    p2_demenz: pick('p2_demenz'), p2_inkontinenz: pick('p2_inkontinenz'), p2_nacht: pick('p2_nacht'),
    diagnosen: pick('diagnosen'),
    plz: pick('plz'), ort: pick('ort'),
    haushalt: pick('haushalt'),
    wohnungstyp: pick('wohnungstyp'), urbanisierung: pick('urbanisierung'),
    familieNahe: pick('familieNahe'), pflegedienst: pick('pflegedienst'), internet: pick('internet'),
    pflegedienstHaeufigkeit: pick('pflegedienstHaeufigkeit'),
    pflegedienstAufgaben: pick('pflegedienstAufgaben'),
    tiere: pick('tiere'), unterbringung: pick('unterbringung'), badezimmer: pick('badezimmer'), aufgaben: pick('aufgaben'),
    fuehrerschein: pick('fuehrerschein'),
    wunschGeschlecht: pick('wunschGeschlecht'),
    rauchen: pick('rauchen'), sonstigeWuensche: pick('sonstigeWuensche'),
    wunschGetriebe: pick('wunschGetriebe'),
    name: pick('name'),
    phone: pick('phone'),
    startDate: pick('startDate'),
    hilfsmittel: pick('hilfsmittel'), p2_hilfsmittel: pick('p2_hilfsmittel'),
    nachtDetail: pick('nachtDetail'), p2_nachtDetail: pick('p2_nachtDetail'),
    einkaeufe: pick('einkaeufe'), einkaeufeWie: pick('einkaeufeWie'),
    raucherhaushalt: pick('raucherhaushalt'),
  });

  // Startdatum beim Ändern (Martin 25.09.): Wer schon abgesendet hat, sieht
  // im „Stand" seinen Wunschstart. Auf einem anderen Gerät (kein lokaler
  // Entwurf) war das Feld trotzdem leer und musste neu gewählt werden. Einmal
  // vorbelegen, nur wenn leer und das Datum nicht schon vorbei ist, sonst
  // wählt der Kunde neu.
  const startVorbelegt = useRef(false);
  useEffect(() => {
    if (startVorbelegt.current) return;
    const tag = kalenderTag(gewaehlterStart);
    if (!tag || tag < localTodayIso()) return;
    startVorbelegt.current = true;
    setPatient(p => (p.startDate ? p : { ...p, startDate: tag }));
  }, [gewaehlterStart]);

  const zwei = patient.anzahl === '2';

  // userDirty — set ONLY by user-driven setPatient (set() / ChipSelect
  // onChange wrappers below). Programmatic merges (mm-rehydrate) leave
  // this false, so they don't masquerade as "user is editing".
  //
  // Why: previously we treated every render as potentially user-edited
  // and autosaved the patient state with _isDraft=true. That wrote a
  // pristine snapshot to localStorage on first mount (before mmCustomer
  // arrived), then flagged it as a draft — blocking the subsequent
  // mm-rehydrate from filling Geschlecht / Pflegegrad / etc., because
  // the rehydrate refused to overwrite "user-edited" data.
  const userDirty = useRef(false);

  // updatePatient — wrap setPatient for user actions. Never call this
  // from programmatic effects.
  // Bug #13h: any user-driven edit reverts saved → false so the form
  // again shows "Unvollständig / Bitte ergänzen" until next Save click.
  // Pre-Bug-#13h the chevron click handler stomped saved=false unconditionally
  // — peeking the form (without editing) reset state and triggered autosave
  // with `_isDraft: true`, breaking refresh persistence.
  const updatePatient = (updater: (prev: PatientForm) => PatientForm) => {
    userDirty.current = true;
    setSaved(false);
    // Abwertung EXPLIZIT nach oben melden — der saved-Effekt oben propagiert
    // bewusst nur Aufwertungen (siehe Kommentar dort). Eine Bearbeitung ist
    // der einzige legitime Weg von „Vollständig" zurück zu „Unvollständig".
    onPatientSaved?.(false);
    setPatient(updater);
  };

  // Re-hydrate patient state when mmCustomer arrives async (after the
  // initial render with mmCustomer=null). Skip cases:
  //   - userDirty.current — user is mid-edit in this session, must not
  //     stomp.
  //   - already merged for this customer.id (fingerprint guard).
  //
  // Per-field merge fills blanks AND known-default seed values
  // (Rollstuhlfähig / Nein / Ehepartner/in / "3" pure-digit pflegegrad),
  // so Mamamia's "Pflegegrad 3" correctly replaces the calculator's
  // "3" stub.
  const mmMergedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!mmCustomer) return;
    if (mmMergedFor.current === mmCustomer.id) return;
    if (userDirty.current) {
      mmMergedFor.current = mmCustomer.id;
      return;
    }
    const fresh = mapMamamiaCustomerToPatientForm(mmCustomer);
    mmMergedFor.current = mmCustomer.id;
    setPatient(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [k, v] of Object.entries(fresh)) {
        if (v == null || v === '') continue;
        const cur = (prev as unknown as Record<string, string | undefined>)[k];
        const isDefault = (cur === '' || cur == null)
          || (k === 'mobilitaet' && cur === 'Rollstuhlfähig')
          || (k === 'nacht' && cur === 'Nein')
          || (k === 'haushalt' && cur === 'Ehepartner/in')
          // calculator prefill stores raw digit "3"; Mamamia "Pflegegrad 3"
          // is the proper UI label — let it win over the bare digit.
          // Both Person 1 and Person 2 (couple flow) get the digit-only
          // prefill from the calculator — pre-2026-05-05 we only handled
          // pflegegrad and Person 2 stayed at raw "4" while Person 1 was
          // upgraded to "Pflegegrad 4".
          || ((k === 'pflegegrad' || k === 'p2_pflegegrad') && /^\d$/.test(cur ?? ''));
        if (isDefault) {
          (next as unknown as Record<string, string>)[k] = v as string;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmCustomer?.id]);

  // Autosave draft on every patient field change so a user who navigates
  // away mid-form (close tab / refresh / back-to-step-1) sees their
  // existing answers when they return — instead of starting from the
  // prefill again. Only writes when the user has actually edited
  // something; pristine state never reaches localStorage (which avoided
  // the previous bug where mount-time autosave shadowed mm-rehydrate).
  const initialMountRef = useRef(true);
  useEffect(() => {
    if (!storageKey) return;
    if (initialMountRef.current) { initialMountRef.current = false; return; }
    if (!userDirty.current && !saved) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...patient, _isDraft: !saved }),
      );
    } catch (err) {
      // iOS Private Mode / volle Quota: Entwurf kann lokal nicht gehalten
      // werden — nicht crashen; der echte Save geht ohnehin zum Server.
      console.warn('Draft konnte nicht lokal gespeichert werden:', err);
    }
  }, [patient, storageKey, saved]);

  const set = (f: keyof PatientForm) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) =>
      updatePatient(p => ({ ...p, [f]: e.target.value }));

  // PLZ-Lookup wie im SA-Kundenformular: ab 4 Ziffern echte Orte aus der
  // mamamia-Ortsdatenbank vorschlagen; Auswahl füllt PLZ + Ort verifiziert.
  // Der Lookup ist reiner Komfort — schlägt er fehl, bleibt Freitext gültig
  // (der Mapper klärt die location_id ohnehin nochmal beim Speichern).
  const [plzSuggestions, setPlzSuggestions] = useState<Array<{ zip: string; city: string }>>([]);
  const [plzVerified, setPlzVerified] = useState(false);
  const plzLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Laufende Nummer der Ortssuche: ein spät eintreffendes älteres Ergebnis darf
  // weder die Liste noch (schlimmer) per Auto-Pick das Feld überschreiben.
  const plzLookupSeq = useRef(0);
  // Ortssuche nicht erreichbar (Debounce-catch ODER Save-Wall). Reine Meldung,
  // KEINE Sperre: sonst hinge ein Kunde, der „76229 Karlsruhe" aus der Liste
  // gewählt hat, an einem kurzen Proxy-Aussetzer fest. Der Wall prüft ohnehin
  // bei jedem Speichern (Registry #65).
  const [lookupFehler, setLookupFehler] = useState(false);
  // 5-stellige PLZ, Mamamia antwortete mit [] — dann ist „aus der Liste wählen"
  // eine Aufforderung ins Leere; das wissen wir schon im Debounce.
  const [keinTreffer, setKeinTreffer] = useState(false);
  // PLZ, die der Save-Wall abgelehnt hat. `null` (nicht ''), sonst gälte ein
  // leeres Feld als abgelehnt.
  const [abgelehntePlz, setAbgelehntePlz] = useState<string | null>(null);

  const pickPlz = (o: { zip: string; city: string }) => {
    updatePatient(p => ({ ...p, plz: o.zip, ort: o.city }));
    setOrtQuery(`${o.zip} ${o.city}`);
    setPlzVerified(true);
    setPlzSuggestions([]);
  };

  // EIN Feld für PLZ ODER Ort (Martin, 11.08.: „das müsste doch nur ein Feld
  // sein"). Vorher zwei getrennte Eingaben, und die Suche hing allein am
  // PLZ-Feld — wer den Ortsnamen tippte, bekam keinen Vorschlag. Jetzt nimmt
  // dieselbe mamamia-Ortsdatenbank beides entgegen; die Auswahl füllt PLZ und
  // Ort gemeinsam, denn `location_id` hängt an der PLZ (ohne sie bleibt der
  // Kunde `draft`).
  const [ortQuery, setOrtQuery] = useState('');

  // Eigene Funktion, weil die Liste nicht nur beim Tippen gebraucht wird: seit
  // die Auswahl aus ihr Pflicht ist (Registry #65), muss sie auch beim Fokus
  // zurückkommen — `onBlur` räumt sie ab, und wer danebengeklickt hat, stünde
  // sonst vor leerem Feld und der Aufforderung, aus einer Liste zu wählen.
  const runLookup = async (q: string) => {
    const digits = q.replace(/\D/g, '').slice(0, 5);
    // Bei voller PLZ mit der PLZ suchen, nicht mit dem Rohtext: eine eingefügte
    // Adresse („50321 Brühl") fände sonst nichts.
    const term = digits.length === 5 ? digits : q.trim();
    // Der Wächter sass bis Registry #65 VOR dem Timer. Er muss mit hier herein,
    // sonst schickt ein Fokus ins leere Feld `search: ''` — der Proxy reicht
    // den leeren String weiter und der Kunde bekäme die ersten Katalogeinträge
    // als „Vorschläge".
    if (term.length < 3) { setPlzSuggestions([]); return; }
    const seq = ++plzLookupSeq.current;
    // Ohne mamamia-Verbindung (lokale Vorschau) liefert der Lookup nichts —
    // dort ein paar echte Orte, damit die Liste überhaupt beurteilbar ist.
    // Greift NUR wenn `mamamiaEnabled` false ist, also nie im Betrieb.
    if (!mamamiaEnabled) {
      const demo = [
        { zip: '25524', city: 'Itzehoe' }, { zip: '25541', city: 'Brunsbüttel' },
        { zip: '25551', city: 'Hohenlockstedt' }, { zip: '25554', city: 'Wilster' },
        { zip: '80331', city: 'München' }, { zip: '80333', city: 'München' },
        { zip: '10115', city: 'Berlin' }, { zip: '20095', city: 'Hamburg' },
      ].filter(o => o.zip.startsWith(term) || o.city.toLowerCase().startsWith(term.toLowerCase()));
      setPlzSuggestions(demo.slice(0, 8));
      return;
    }
    try {
      const r = await callMamamia<{
        LocationsWithPagination: { data: Array<{ id: number; location: string; zip_code: string; country_code: string }> };
      }>('searchLocations', { search: term, limit: 12, page: 1 });
      const seen = new Set<string>();
      const opts = (r.LocationsWithPagination?.data ?? [])
        .filter(l => l.country_code === 'DE' && l.location && l.zip_code)
        .map(l => ({ zip: l.zip_code, city: l.location }))
        .filter(o => { const k = `${o.zip} ${o.city}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 8);
      // Vergleich VOR pickPlz — ein verspätetes Ergebnis darf das Feld nicht
      // umschreiben, nicht nur die Liste.
      if (seq !== plzLookupSeq.current) return;
      // Beide Flaggen ZUWEISEN, nicht nur setzen: sonst könnte der Fokus-Pfad
      // einen Zustand, den er selbst gesetzt hat, nie wieder aufheben.
      setLookupFehler(false);
      setKeinTreffer(digits.length === 5 && opts.length === 0);
      // Auto-Pick nur, wenn der Kunde die blosse PLZ getippt hat. Bei
      // „50321 Brühl" zeigen wir den Vorschlag, damit das Löschen einzelner
      // Zeichen das Feld nicht sofort wieder zurückschnappen lässt.
      if (digits.length === 5 && opts.length === 1 && !/[a-zA-ZäöüÄÖÜß]/.test(q)) { pickPlz(opts[0]); return; }
      setPlzSuggestions(opts);
    } catch {
      if (seq !== plzLookupSeq.current) return;
      // Bis Registry #65 wurde hier still die Liste geleert. Seit die Auswahl
      // Pflicht ist, wäre Schweigen die Aufforderung, aus einer Liste zu
      // wählen, die es nicht gibt (Święta zasada nr 1).
      setPlzSuggestions([]);
      setLookupFehler(true);
    }
  };

  const onOrtInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setOrtQuery(q);
    const digits = q.replace(/\D/g, '').slice(0, 5);
    // `ort` wird beim Tippen von Ziffern GELEERT (früher: alter Wert behalten).
    // Nur so bedeutet „5-stellige PLZ und `ort` gefüllt" wirklich „aus der
    // Vorschlagsliste gewählt (oder aus Mamamia vorbefüllt)" — sonst reichte
    // „Karlsruhe" tippen, dann „50348", um mit einem erfundenen Paar
    // durchzukommen (Registry #65).
    updatePatient(p => ({ ...p, plz: digits, ort: /\d/.test(q) ? '' : q.trim() }));
    setPlzVerified(false);
    setLookupFehler(false);
    setKeinTreffer(false);
    if (plzLookupTimer.current) clearTimeout(plzLookupTimer.current);
    plzLookupTimer.current = setTimeout(() => { void runLookup(q); }, 300);
  };

  // Welche Pflichtfelder fehlen — statt nur „vollständig ja/nein".
  // Der Weiter-Button war bis 11.08. ein stiller No-op: kein `disabled`, aber
  // grau, und bei unvollständigem Schritt passierte schlicht NICHTS. Kein
  // Hinweis, welches Feld fehlt; auf Touch nicht einmal ein Hover, der die
  // Sperre andeutet. (Beim Prüfen bin ich zweimal selbst hängengeblieben.)
  const FIELD_LABELS: Record<string, string> = {
    anzahl: 'Anzahl zu betreuender Personen',
    geschlecht: 'Geschlecht', p2_geschlecht: 'Geschlecht (Person 2)',
    geburtsjahr: 'Geburtsjahr', p2_geburtsjahr: 'Geburtsjahr (Person 2)',
    mobilitaet: 'Mobilität', p2_mobilitaet: 'Mobilität (Person 2)',
    heben: 'Heben erforderlich', p2_heben: 'Heben erforderlich (Person 2)',
    demenz: 'Demenz', p2_demenz: 'Demenz (Person 2)',
    nacht: 'Nachteinsätze', p2_nacht: 'Nachteinsätze (Person 2)',
    plz: 'Einsatzort', wohnungstyp: 'Wohnungstyp', urbanisierung: 'Lage',
    wunschGeschlecht: 'Gewünschtes Geschlecht', fuehrerschein: 'Führerschein',
    startDate: 'Startdatum',
    phone: 'Telefonnummer',
  };

  // Der angezeigte Feldtext — eine Quelle für `value`, `onFocus` und den
  // Hinweis, damit die drei nicht auseinanderlaufen.
  const einsatzortFeldWert =
    ortQuery || (patient.plz || patient.ort ? `${patient.plz} ${patient.ort}`.trim() : '');

  const einsatzortStand = {
    plz: patient.plz,
    ort: patient.ort,
    eingabe: einsatzortFeldWert,
    lookupFehler,
    keinTreffer,
    abgelehnt: abgelehntePlz !== null && patient.plz === abgelehntePlz,
  };
  const einsatzortFehler = einsatzortHinweis(einsatzortStand);

  const missingFields = (s: number): string[] => {
    const m: string[] = [];
    if (s === 0) {
      if (!patient.anzahl) m.push('anzahl');
      // SA-Linie (Martin, 2026-07-08): nur aktivierungsrelevante Felder
      // blockieren — Geburtsjahr/Pflegegrad sind wie im SA-Wizard optional.
      if (patient.geschlecht === '') m.push('geschlecht');
      // Geburtsjahr bleibt optional. Seit es ein Zahlenfeld ist (24.09.), hält
      // nur ein angefangenes oder unmögliches Jahr den Schritt auf — sonst
      // ginge „19" oder „1492" an mamamia (dort still verworfen).
      if (!geburtsjahrGueltig(patient.geburtsjahr)) m.push('geburtsjahr');
      if (zwei && patient.p2_geschlecht === '') m.push('p2_geschlecht');
      if (zwei && !geburtsjahrGueltig(patient.p2_geburtsjahr)) m.push('p2_geburtsjahr');
    }
    if (s === 1) {
      (['mobilitaet','heben','demenz','nacht'] as const).forEach(k => { if (patient[k] === '') m.push(k); });
      if (zwei) (['p2_mobilitaet','p2_heben','p2_demenz','p2_nacht'] as const).forEach(k => { if (patient[k] === '') m.push(k); });
    }
    if (s === 2) {
      // `haushalt` ist read-only (kommt aus dem Angebot) — NIE prüfen, sonst
      // Deadlock bei fehlendem Wert.
      // Einsatzort: nicht „nicht leer", sondern „auflösbar" (Registry #65).
      // `lookupFehler` bleibt hier bewusst AUSSEN vor — er ist eine Meldung,
      // keine Sperre: er soll niemanden festhalten, der nichts falsch gemacht
      // hat, und zu schützen gibt es nichts, weil der Save-Wall die PLZ bei
      // jedem Speichern erneut prüft.
      if (einsatzortHinweis({ ...einsatzortStand, lookupFehler: false }) !== null) m.push('plz');
      (['wohnungstyp','urbanisierung','startDate'] as const).forEach(k => { if (patient[k] === '') m.push(k); });
      // Rückrufnummer immer Pflicht (Martin, 17.09.: „muss auf jeden Fall
      // vorhanden sein") — vorbelegt aus Rechner oder mamamia, hier zu prüfen
      // oder zu ergänzen; ohne sie kann das Team nicht nachfassen (Registry #76).
      if (!isPlausibleGermanPhone(patient.phone)) m.push('phone');
    }
    if (s === 3) {
      (['wunschGeschlecht','fuehrerschein'] as const).forEach(k => { if (patient[k] === '') m.push(k); });
    }
    return m;
  };

  // Offene Angaben des aktuellen Schritts — live, damit Rahmen und Hinweis
  // verschwinden, sobald der Kunde das Feld ausfüllt (vorher blieb die
  // Meldung stehen, bis er erneut „Weiter" drückte).
  const offen = fehlerZeigen ? missingFields(step) : [];

  // Fehler direkt am Feld. Chips brauchen keinen Feldnamen — der steht
  // darüber; Eingabefelder sagen, was genau nicht stimmt.
  const fehlerFuer = (k: string): string | undefined => {
    if (!fehlerZeigen) return undefined;
    // Der Einsatzort zeigt auch den Suchfehler, der nicht sperrt (s. o.).
    if (k === 'plz') return einsatzortFehler ?? undefined;
    if (!offen.includes(k)) return undefined;
    if (k === 'geburtsjahr' || k === 'p2_geburtsjahr') return 'Bitte ein Jahr zwischen 1920 und 2010 eintragen';
    if (k === 'startDate') return 'Bitte ein Datum wählen. Eine Schätzung reicht.';
    if (k === 'phone') {
      return patient.phone.trim() ? 'Die Nummer ist zu kurz oder zu lang. Bitte prüfen.' : 'Bitte eine Telefonnummer eintragen';
    }
    return 'Bitte eine Antwort wählen';
  };

  // Kurzfassung über den Knöpfen: „Geschlecht fehlt" statt „1 Angabe fehlt"
  // (GPT-5-Prüfung 24.09.). Tippen springt zum Feld.
  const navHinweis = (() => {
    if (!fehlerZeigen) return null;
    // Suchfehler beim Einsatzort sperrt nicht, soll aber gesehen werden.
    if (offen.length === 0) return einsatzortFehler;
    if (offen.length === 1 && offen[0] === 'plz' && einsatzortFehler) return einsatzortFehler;
    // Beim Ehepaar heißt Person 1 auch so — sonst stünde „Geschlecht,
    // Geschlecht (Person 2)" im Hinweis.
    const name = (k: string) =>
      zwei && PERSON_FELDER.includes(k) ? `${FIELD_LABELS[k]} (Person 1)` : FIELD_LABELS[k] ?? k;
    const kurz = (k: string) => {
      if (k === 'geburtsjahr' || k === 'p2_geburtsjahr') return `${name(k)} prüfen`;
      if (k === 'phone' && patient.phone.trim()) return `${name(k)} prüfen`;
      return `${name(k)} fehlt`;
    };
    return offen.length === 1
      ? kurz(offen[0])
      : `${offen.length} Angaben offen: ${offen.map(name).join(', ')}`;
  })();

  // Schritt-Tracking (einmal je Schritt/Sitzung): endlich sichtbar, WO im
  // Patientenbogen die Abbrüche passieren (lead_events → Dashboard/Report).
  const trackedSteps = useRef<Set<number>>(new Set());
  const trackStep = (s: number) => {
    if (!lead?.token || trackedSteps.current.has(s)) return;
    trackedSteps.current.add(s);
    reportLeadEvent(lead.token, 'patient_form_step', { step: s });
  };

  const inputCls =
    'w-full min-h-[48px] rounded-[14px] border-[1.5px] border-pm-chip bg-white px-3.5 py-3 text-[16px] text-pm-ink ' +
    'placeholder:text-pm-mute focus:outline-none focus:border-pm-taupe focus:ring-2 focus:ring-pm-taupe/15 transition-colors';
  const inputFehlerCls = ' !border-pm-error';

  // Desktop: the phone-frame div (#portal-scroll-container) is the scroller.
  // Mobile: that div has no overflow, so `window` is the actual scroller.
  // Scroll both — each is a harmless no-op where it doesn't apply.
  // Used for the final save: jump to the very top of the page.
  const scrollPortalToTop = () => {
    document.getElementById('portal-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step changes (open form / Weiter / Zurück) scroll to the top of the
  // patient form, not the page top. scrollIntoView picks the right scroller
  // (phone-frame on desktop, window on mobile); `scroll-mt-16` on the form
  // wrapper keeps it clear of the sticky portal nav.
  const patientFormRef = useRef<HTMLDivElement>(null);
  const scrollToFormTop = () => {
    setTimeout(() => {
      patientFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  // Zum ersten roten Feld — nach dem Render, damit die Rahmen schon stehen.
  // setTimeout statt rAF: nach einem await oder einem Schrittwechsel sind wir
  // in keinem diskreten Event, rAF kann dem Commit zuvorkommen.
  const zumErstenFehler = () => {
    setTimeout(() => {
      patientFormRef.current
        ?.querySelector('[data-invalid="1"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const zurueck = () => { setFehlerZeigen(false); setStep(s => s - 1); scrollToFormTop(); };

  const weiter = () => {
    if (missingFields(step).length === 0) {
      setFehlerZeigen(false);
      trackStep(step + 1); setStep(s => s + 1); scrollToFormTop();
      return;
    }
    // Kein `disabled` und kein stummes Nichts: Felder rot, Kurzfassung über
    // den Knöpfen, Sprung zum ersten offenen Feld.
    setFehlerZeigen(true);
    zumErstenFehler();
  };

  const speichern = async () => {
    if (isSaving) return;
    // „Speichern" ist immer aktiv (Martin, 24.09.): Tippen zeigt, was fehlt,
    // und springt zum ersten offenen Schritt und Feld. Vorher war der Knopf
    // still ausgegraut, wenn auf einem früheren Schritt etwas fehlte.
    const ersterOffener = STEP_LABELS.findIndex((_, i) => missingFields(i).length > 0);
    if (ersterOffener !== -1) {
      setFehlerZeigen(true);
      setStep(ersterOffener);
      zumErstenFehler();
      return;
    }
    // Hier stand bis Registry #65 ein `_isDraft:false` VOR dem
    // Speichern — nach einem abgelehnten Save las der Reload
    // „Vollständig", obwohl in Mamamia nichts steht. Ersatzlos
    // gestrichen: der Autosave-Effekt schreibt `_isDraft:!saved`
    // ohnehin bei jeder Änderung von `saved`, also false erst
    // nach Erfolg.
    // ── Save flow ─────────────────────────────────────
    // Previously we collapsed the form and flipped
    // patientSaved BEFORE the Mamamia round-trip — the
    // customer could then click "Einladen" while Mamamia
    // still had a half-populated profile (job_description
    // missing), which made StoreRequest reject the
    // invite. Now: button stays disabled, form stays
    // visible, gate stays closed until updateCustomer
    // resolves. On error: form re-opens, gate stays
    // closed, parent shows a toast.
    if (mamamiaEnabled && onSaveToMamamia) {
      setIsSaving(true);
      try {
        await onSaveToMamamia(patient);
        setSaved(true);
        setPatientOpen(false);
        onPatientSaved?.(true);
        onAbgesendet?.(nurAenderung);
        scrollPortalToTop();
      } catch (err) {
        // Parent already toasted; keep form open so the
        // customer can retry without re-entering data.
        setPatientOpen(true);
        const m = err instanceof Error ? err.message : '';
        if (!m.startsWith('EINSATZORT')) {
          console.error('UpdateCustomer failed:', err);
        } else {
          // Der Einsatzort steht auf Schritt 3, „Speichern"
          // auf Schritt 4 — ohne Rücksprung sieht der Kunde
          // gar nichts und klickt wieder (Registry #65).
          // Die Meldung selbst entsteht im nächsten Render aus
          // lookupFehler/abgelehntePlz (einsatzortFehler).
          if (m === 'EINSATZORT_LOOKUP') setLookupFehler(true);
          else if (m.startsWith('EINSATZORT:') && m.slice(11) === patient.plz) setAbgelehntePlz(m.slice(11));
          setStep(2);
          setFehlerZeigen(true);
          zumErstenFehler();
        }
      } finally {
        setIsSaving(false);
      }
    } else {
      // Mamamia disabled (e.g. local dev) — fall back to
      // the old immediate-collapse path.
      setSaved(true);
      setPatientOpen(false);
      onPatientSaved?.(true);
      onAbgesendet?.(nurAenderung);
      scrollPortalToTop();
    }
  };

  // Werte aus dem Kostenrechner (bestimmen den Preis) — fest, mit Schloss.
  // Tippen erklärt, warum; vorher war das ein 14-px-Info-Knopf neben dem Label.
  const festWert = (key: string, wert: ReactNode) => (
    <>
      <button
        type="button"
        onClick={() => setPriceInfo(priceInfo === key ? null : key)}
        aria-expanded={priceInfo === key}
        className="w-full min-h-[48px] rounded-[14px] bg-pm-paper px-3.5 py-2.5 text-left text-[16px] text-pm-ink flex items-center justify-between gap-3"
      >
        <span>{wert}</span>
        <Lock className="w-4 h-4 flex-none text-pm-mute" aria-hidden="true" />
      </button>
      <p className="mt-2 text-[13.5px] leading-snug text-pm-muted">
        {priceInfo === key
          ? 'Diese Angabe bestimmt den Preis. Ändern kann sie Ihre Beraterin, dann schicken wir Ihnen ein neues Angebot.'
          : 'Aus Ihrem Kostenrechner übernommen'}
      </p>
    </>
  );

  // Zwischenkopf („Person 1"); das Feld direkt darunter braucht keine eigene Trennlinie.
  const personKopf = (text: string) => (
    <p className={`${EYEBROW} pt-6 [&+[data-field]]:border-t-0 [&+[data-field]]:pt-3`}>{text}</p>
  );

  const geburtsjahrFeld = (k: 'geburtsjahr' | 'p2_geburtsjahr') => (
    <input
      value={patient[k]}
      onChange={e => {
        const ziffern = e.target.value.replace(/\D/g, '').slice(0, 4);
        updatePatient(p => ({ ...p, [k]: ziffern }));
      }}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={4}
      placeholder="z. B. 1948"
      aria-invalid={!!fehlerFuer(k)}
      className={inputCls + ' max-w-[160px] tabular-nums' + (fehlerFuer(k) ? inputFehlerCls : '')}
    />
  );

  const letzterSchritt = step === STEP_LABELS.length - 1;
  // Schon abgeschickt (lokal oder laut mamamia aktiv) → nur Angaben ändern: kein erneutes
  // „Bewerbungen anfragen", kein neues 72-h-Versprechen (Review 25.09.).
  // `hasFinalSave` allein reicht nicht: Die erste Änderung überschreibt den
  // lokalen Vermerk mit `_isDraft: true` (Review 25.09.).
  const nurAenderung = hasFinalSave || !!schonAbgesendet || (mmCustomer?.status != null && mmCustomer.status !== 'draft');

  return (
    <div ref={patientFormRef} id="pflegesituation-formular" className="scroll-mt-16">
      {patientOpen && (
        <Card className="px-5 pt-5">
          <ProgressSteps
            schritte={STEP_LABELS}
            aktuell={step}
            onSchritt={i => { setFehlerZeigen(false); setStep(i); scrollToFormTop(); }}
          />

          <div className="mt-2">
            {/* ── Step 1: Zur Person ── */}
            {step === 0 && (
              <>
                <FormField feld="anzahl" label="Anzahl zu betreuender Personen">
                  {festWert('anzahl', patient.anzahl === '2' ? '2 Personen' : '1 Person')}
                </FormField>

                {zwei && personKopf('Person 1')}
                <FormField feld="geschlecht" label="Geschlecht" pflicht fehler={fehlerFuer('geschlecht')}>
                  <ChipSelect invalid={!!fehlerFuer('geschlecht')} value={patient.geschlecht} onChange={v => updatePatient(p=>({...p,geschlecht:v}))}
                    options={['Männlich','Weiblich']} />
                </FormField>
                <FormField feld="geburtsjahr" label="Geburtsjahr" fehler={fehlerFuer('geburtsjahr')}>
                  {geburtsjahrFeld('geburtsjahr')}
                </FormField>
                <FormField feld="gewicht" label="Gewicht in kg">
                  <ChipSelect value={patient.gewicht} onChange={v => updatePatient(p=>({...p,gewicht:v}))}
                    options={GEWICHT} labels={GEWICHT_KURZ} />
                </FormField>
                <FormField feld="groesse" label="Größe in cm">
                  <ChipSelect value={patient.groesse} onChange={v => updatePatient(p=>({...p,groesse:v}))}
                    options={GROESSE} labels={GROESSE_KURZ} />
                </FormField>
                <FormField feld="pflegegrad" label="Pflegegrad">
                  <ChipSelect value={patient.pflegegrad} onChange={v => updatePatient(p=>({...p,pflegegrad:v}))}
                    options={PFLEGEGRAD} labels={PFLEGEGRAD_KURZ} />
                </FormField>

                {zwei && (
                  <>
                    {personKopf('Person 2')}
                    <FormField feld="p2_geschlecht" label="Geschlecht" pflicht fehler={fehlerFuer('p2_geschlecht')}>
                      <ChipSelect invalid={!!fehlerFuer('p2_geschlecht')} value={patient.p2_geschlecht} onChange={v => updatePatient(p=>({...p,p2_geschlecht:v}))}
                        options={['Männlich','Weiblich']} />
                    </FormField>
                    <FormField feld="p2_geburtsjahr" label="Geburtsjahr" fehler={fehlerFuer('p2_geburtsjahr')}>
                      {geburtsjahrFeld('p2_geburtsjahr')}
                    </FormField>
                    <FormField feld="p2_gewicht" label="Gewicht in kg">
                      <ChipSelect value={patient.p2_gewicht} onChange={v => updatePatient(p=>({...p,p2_gewicht:v}))}
                        options={GEWICHT} labels={GEWICHT_KURZ} />
                    </FormField>
                    <FormField feld="p2_groesse" label="Größe in cm">
                      <ChipSelect value={patient.p2_groesse} onChange={v => updatePatient(p=>({...p,p2_groesse:v}))}
                        options={GROESSE} labels={GROESSE_KURZ} />
                    </FormField>
                    <FormField feld="p2_pflegegrad" label="Pflegegrad">
                      <ChipSelect value={patient.p2_pflegegrad} onChange={v => updatePatient(p=>({...p,p2_pflegegrad:v}))}
                        options={PFLEGEGRAD} labels={PFLEGEGRAD_KURZ} />
                    </FormField>
                  </>
                )}
              </>
            )}

            {/* ── Step 2: Pflegebedarf ── */}
            {step === 1 && (
              <>
                {zwei && personKopf('Person 1')}
                <FormField feld="mobilitaet" label="Mobilität">
                  {festWert('mobilitaet', patient.mobilitaet)}
                </FormField>
                <FormField feld="heben" label="Heben erforderlich?" pflicht fehler={fehlerFuer('heben')}>
                  <ChipSelect invalid={!!fehlerFuer('heben')} value={patient.heben} onChange={v => updatePatient(p=>({...p,heben:v}))}
                    options={['Ja','Nein']} />
                </FormField>
                <FormField feld="demenz" label="Demenz" pflicht fehler={fehlerFuer('demenz')}>
                  <ChipSelect invalid={!!fehlerFuer('demenz')} value={patient.demenz} onChange={v => updatePatient(p=>({...p,demenz:v}))}
                    options={DEMENZ} />
                </FormField>
                <FormField feld="nacht" label="Nachteinsätze">
                  {festWert('nacht', patient.nacht)}
                </FormField>
                {patient.nacht !== '' && patient.nacht !== 'Nein' && (
                  <FormField feld="nachtDetail" label="Was ist in der Nacht zu tun?">
                    <input value={patient.nachtDetail} onChange={set('nachtDetail')}
                      placeholder="z. B. Toilettengang, Umlagern" className={inputCls} />
                  </FormField>
                )}
                <FormField feld="inkontinenz" label="Inkontinenz">
                  <ChipSelect value={patient.inkontinenz} onChange={v => updatePatient(p=>({...p,inkontinenz:v}))}
                    options={INKONTINENZ} />
                </FormField>

                {zwei && (
                  <>
                    {personKopf('Person 2')}
                    <FormField feld="p2_mobilitaet" label="Mobilität" pflicht fehler={fehlerFuer('p2_mobilitaet')}>
                      <ChipSelect invalid={!!fehlerFuer('p2_mobilitaet')} value={patient.p2_mobilitaet} onChange={v => updatePatient(p=>({...p,p2_mobilitaet:v}))}
                        options={['Vollständig mobil','Am Gehstock','Rollatorfähig','Rollstuhlfähig','Bettlägerig']} />
                    </FormField>
                    <FormField feld="p2_heben" label="Heben erforderlich?" pflicht fehler={fehlerFuer('p2_heben')}>
                      <ChipSelect invalid={!!fehlerFuer('p2_heben')} value={patient.p2_heben} onChange={v => updatePatient(p=>({...p,p2_heben:v}))}
                        options={['Ja','Nein']} />
                    </FormField>
                    <FormField feld="p2_demenz" label="Demenz" pflicht fehler={fehlerFuer('p2_demenz')}>
                      <ChipSelect invalid={!!fehlerFuer('p2_demenz')} value={patient.p2_demenz} onChange={v => updatePatient(p=>({...p,p2_demenz:v}))}
                        options={DEMENZ} />
                    </FormField>
                    <FormField feld="p2_nacht" label="Nachteinsätze" pflicht fehler={fehlerFuer('p2_nacht')}>
                      <ChipSelect invalid={!!fehlerFuer('p2_nacht')} value={patient.p2_nacht} onChange={v => updatePatient(p=>({...p,p2_nacht:v}))}
                        options={['Nein','Bis zu 1 Mal','1–2 Mal','Mehr als 2']} />
                    </FormField>
                    {patient.p2_nacht !== '' && patient.p2_nacht !== 'Nein' && (
                      <FormField feld="p2_nachtDetail" label="Was ist in der Nacht zu tun?">
                        <input value={patient.p2_nachtDetail} onChange={set('p2_nachtDetail')}
                          placeholder="z. B. Toilettengang, Umlagern" className={inputCls} />
                      </FormField>
                    )}
                    <FormField feld="p2_inkontinenz" label="Inkontinenz">
                      <ChipSelect value={patient.p2_inkontinenz} onChange={v => updatePatient(p=>({...p,p2_inkontinenz:v}))}
                        options={INKONTINENZ} />
                    </FormField>
                  </>
                )}

                <FormField feld="diagnosen" label="Weitere Diagnosen">
                  <textarea value={patient.diagnosen} onChange={set('diagnosen')}
                    placeholder="z. B. Parkinson, Herzinsuffizienz, Diabetes"
                    rows={2} className={`${inputCls} resize-none`} />
                </FormField>
              </>
            )}

            {/* ── Step 3: Einsatzort & Start ── */}
            {step === 2 && (
              <>
                <FormField feld="plz" label="Einsatzort" pflicht fehler={fehlerFuer('plz')}>
                  <div className="relative">
                    <input
                      value={einsatzortFeldWert}
                      onChange={onOrtInput}
                      // Liste zurückholen: `onBlur` räumt sie ab, und seit die
                      // Auswahl Pflicht ist, gäbe es sonst keinen Weg zurück
                      // (Registry #65).
                      onFocus={() => { if (!plzVerified) void runLookup(einsatzortFeldWert); }}
                      onBlur={() => setTimeout(() => setPlzSuggestions([]), 150)}
                      autoComplete="off"
                      placeholder="PLZ oder Ort eingeben"
                      aria-invalid={!!fehlerFuer('plz')}
                      className={inputCls + (fehlerFuer('plz') ? inputFehlerCls : '') + (plzVerified ? ' pr-10' : '')}
                    />
                    {plzVerified && (
                      <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-pm-green pointer-events-none" strokeWidth={3} />
                    )}
                    {plzSuggestions.length > 0 && (
                      <div className="absolute z-20 top-full mt-1.5 left-0 right-0 bg-white border-[1.5px] border-pm-line rounded-[14px] shadow-lift overflow-hidden">
                        {plzSuggestions.map(o => (
                          <button
                            key={`${o.zip} ${o.city}`}
                            type="button"
                            // onMouseDown statt onClick — feuert vor dem Blur
                            // des Inputs, das die Liste schließt.
                            onMouseDown={() => pickPlz(o)}
                            className="flex w-full min-h-[48px] items-center gap-2 text-left px-4 py-2.5 text-[16px] border-b last:border-b-0 border-pm-line-soft hover:bg-pm-paper transition-colors"
                          >
                            <span className="font-semibold tabular-nums text-pm-ink">{o.zip}</span>
                            <span className="text-pm-muted">{o.city}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FormField>
                <FormField feld="haushalt" label="Weitere Personen im Haushalt">
                  {festWert('haushalt', patient.haushalt || <span className="text-pm-mute">Nicht angegeben</span>)}
                </FormField>
                <FormField feld="familieNahe" label="Familie in der Nähe (bis 20 km)">
                  <ChipSelect value={patient.familieNahe} onChange={v => updatePatient(p=>({...p,familieNahe:v}))}
                    options={['Ja','Nein']} />
                </FormField>
                <FormField feld="urbanisierung" label="Lage" pflicht fehler={fehlerFuer('urbanisierung')}>
                  <ChipSelect invalid={!!fehlerFuer('urbanisierung')} value={patient.urbanisierung} onChange={v => updatePatient(p=>({...p,urbanisierung:v}))}
                    options={['Großstadt','Kleinstadt','Dorf/Land']} />
                </FormField>
                <FormField feld="wohnungstyp" label="Wohnungstyp" pflicht fehler={fehlerFuer('wohnungstyp')}>
                  <ChipSelect invalid={!!fehlerFuer('wohnungstyp')} value={patient.wohnungstyp} onChange={v => updatePatient(p=>({...p,wohnungstyp:v}))}
                    options={['Einfamilienhaus','Wohnung in Mehrfamilienhaus','Andere']} />
                </FormField>
                {/* SA-Gruppierung: Unterbringung → Haustiere → Badezimmer →
                    Internet; „Pflegedienst kommt?" wohnt wie bei SA im
                    Schritt „Wünsche & Aufgaben". */}
                <FormField feld="unterbringung" label="Unterbringung der Pflegekraft">
                  <ChipSelect value={patient.unterbringung} onChange={v => updatePatient(p=>({...p,unterbringung:v}))}
                    options={['Zimmer in den Räumlichkeiten','Gesamter Bereich','Zimmer extern','Bereich extern']} />
                </FormField>
                <FormField feld="tiere" label="Haustiere">
                  <ChipSelect value={patient.tiere} onChange={v => updatePatient(p=>({...p,tiere:v}))}
                    options={['Keine','Hund','Katze','Andere']} />
                </FormField>
                <FormField feld="badezimmer" label="Eigenes Badezimmer">
                  <ChipSelect value={patient.badezimmer} onChange={v => updatePatient(p=>({...p,badezimmer:v}))}
                    options={['Ja','Nein']} />
                </FormField>
                <FormField feld="internet" label="Internet vorhanden?">
                  <ChipSelect value={patient.internet} onChange={v => updatePatient(p=>({...p,internet:v}))}
                    options={['Ja','Nein']} />
                </FormField>

                {/* Startdatum am Ende von „Einsatzort" (Martin, 11.08.): Ort und
                    Termin sind beides Rahmendaten des Einsatzes. Das Feld bleibt
                    Pflicht und bleibt LEER — bewusst nicht aus `arrival_at`
                    vorbelegt: Der Kostenrechner fragt den Termin nicht ab, der
                    Onboard-Wert ist eine Schätzung, und ein vorbelegtes Datum
                    würde arglos bestätigt und der Job mit falschem Termin
                    angelegt. */}
                <FormField feld="startDate" label="Voraussichtliches Startdatum" pflicht fehler={fehlerFuer('startDate')}
                  hinweis="Noch unklar? Eine grobe Schätzung reicht.">
                  <DateField
                    value={patient.startDate}
                    min={localTodayIso()}
                    invalid={!!fehlerFuer('startDate')}
                    onChange={iso => updatePatient(p => ({ ...p, startDate: iso }))}
                  />
                </FormField>
                {/* Rückrufnummer IMMER hier, neben dem Termin (Martin, 17.09.:
                    „dass die Telefonnummer immer dort steht, man kann sie
                    überprüfen, anpassen oder ergänzen — muss auf jeden Fall
                    vorhanden sein"). Vorbelegt aus dem Rechner (leads.telefon)
                    oder aus mamamia; Kontakt in drei Schritten (Registry #76)
                    liefert Leads ohne Nummer, dann steht sie leer und ist
                    Pflicht. Geht mit dem Speichern nach mamamia
                    (patientFormMapper: Customer.phone + customer_contract.phone)
                    und über lead-event zurück in leads.telefon — beide Wege
                    gab es schon. Nicht wieder nach Step 5 auslagern: 06.–14.06.
                    halbierte das die Tel-Quote (67 % → 34 %). */}
                <FormField feld="phone" label="Telefonnummer für Rückfragen" pflicht fehler={fehlerFuer('phone')}
                  // Martin 17.09.: nicht „bitte prüfen" — sagen, WANN wir anrufen.
                  hinweis="Nur bei Rückfragen oder wenn etwas dringend geklärt werden muss.">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={patient.phone}
                    onChange={e => updatePatient(p => ({ ...p, phone: e.target.value }))}
                    placeholder="z. B. 0170 1234567"
                    aria-invalid={!!fehlerFuer('phone')}
                    className={inputCls + (fehlerFuer('phone') ? inputFehlerCls : '')}
                  />
                </FormField>
              </>
            )}

            {/* ── Step 4: Wünsche & Aufgaben ── */}
            {step === 3 && (
              <>
                <FormField feld="wunschGeschlecht" label="Gewünschtes Geschlecht der Pflegekraft" pflicht fehler={fehlerFuer('wunschGeschlecht')}>
                  <ChipSelect invalid={!!fehlerFuer('wunschGeschlecht')} value={patient.wunschGeschlecht} onChange={v => updatePatient(p=>({...p,wunschGeschlecht:v}))}
                    options={['Egal','Weiblich','Männlich']} />
                </FormField>
                <FormField feld="sprache" label="Sprachniveau">
                  {festWert('sprache', germanySkillLabel(mmCustomer?.customer_caregiver_wish?.germany_skill) || '—')}
                </FormField>
                <FormField feld="fuehrerschein" label="Führerschein erforderlich?" pflicht fehler={fehlerFuer('fuehrerschein')}>
                  <ChipSelect invalid={!!fehlerFuer('fuehrerschein')} value={patient.fuehrerschein}
                    onChange={v => updatePatient(p => ({ ...p, fuehrerschein: v, wunschGetriebe: v === 'Nein' ? '' : p.wunschGetriebe }))}
                    options={['Ja', 'Nein']} />
                </FormField>
                {patient.fuehrerschein === 'Ja' && (
                  <FormField feld="wunschGetriebe" label="Getriebe">
                    <ChipSelect value={patient.wunschGetriebe}
                      onChange={v => updatePatient(p => ({ ...p, wunschGetriebe: v }))}
                      options={['Automatik', 'Schaltung', 'Egal']} />
                  </FormField>
                )}
                <FormField feld="rauchen" label="Darf die Pflegekraft rauchen?">
                  <ChipSelect value={patient.rauchen} onChange={v => updatePatient(p=>({...p,rauchen:v}))}
                    options={['Ja (nur Draußen)','Nein']} labels={{ 'Ja (nur Draußen)': 'Ja, nur draußen' }} />
                </FormField>
                <FormField feld="sonstigeWuensche" label="Sonstige Wünsche">
                  <textarea value={patient.sonstigeWuensche} onChange={set('sonstigeWuensche')}
                    placeholder="z. B. Erfahrung mit Demenz, ruhige Person, tierlieb"
                    rows={2} className={`${inputCls} resize-none`} />
                </FormField>

                {/* SA-Gruppierung „Aufgaben & Pflegedienst" — Pflegedienst ist
                    aus der Wohnsituation hierher gezogen (wie im SA-Wizard). */}
                {personKopf('Aufgaben & Pflegedienst')}
                <FormField feld="pflegedienst" label="Kommt ein Pflegedienst?">
                  <ChipSelect value={patient.pflegedienst} onChange={v => updatePatient(p=>{
                    // When user switches to 'Nein', clear the follow-ups so
                    // a stale frequency/tasks selection doesn't sneak into
                    // the Mamamia description string on save.
                    const next = { ...p, pflegedienst: v };
                    if (v === 'Nein') {
                      next.pflegedienstHaeufigkeit = '';
                      next.pflegedienstAufgaben = '';
                    }
                    return next;
                  })}
                    options={['Ja','Nein','Geplant']} />
                </FormField>
                {/* Pflegedienst-Zusatzfelder (Häufigkeit/Aufgaben) entfernt —
                    unnötige Hürde (Martin, 2026-07-08); Standard-Text kommt vom Mapper. */}
                <FormField feld="einkaeufe" label="Muss die Pflegekraft Einkäufe erledigen?">
                  <ChipSelect value={patient.einkaeufe} onChange={v => updatePatient(p => {
                    // Beim Wechsel auf 'Nein' das Detailfeld leeren, damit kein
                    // veralteter Text in die Job-Beschreibung rutscht.
                    const next = { ...p, einkaeufe: v };
                    if (v === 'Nein') next.einkaeufeWie = '';
                    return next;
                  })} options={['Ja','Gelegentlich','Nein']} />
                </FormField>
                {(patient.einkaeufe === 'Ja' || patient.einkaeufe === 'Gelegentlich') && (
                  <FormField feld="einkaeufeWie" label="Wie werden die Einkäufe erledigt?">
                    <input value={patient.einkaeufeWie} onChange={set('einkaeufeWie')}
                      placeholder="ÖPNV, zu Fuß, Fahrrad, Taxi, Auto" className={inputCls} />
                  </FormField>
                )}
                <FormField feld="aufgaben" label="Aufgaben der Pflegekraft">
                  <textarea value={patient.aufgaben} onChange={set('aufgaben')}
                    placeholder="z. B. Körperpflege, Mahlzeiten, Arztbegleitung, Einkäufe"
                    rows={3} className={`${inputCls} resize-none`} />
                </FormField>
                {/* Was das Absenden bedeutet (Martin 25.09.): verbindlich anfragen,
                    72 h Reservierung je Bewerbung (= Auto-Absage in
                    detect-caregiver-events), Vertrag erst mit Zusage. */}
                {!nurAenderung && (
                  <p className="mt-2 pt-4 border-t border-pm-line-soft text-[14.5px] leading-[1.5] text-pm-body">
                    Mit dem Absenden fragen Sie Bewerbungen an. Jede Bewerbung ist {RESERVIERUNG_STUNDEN} Stunden für Sie reserviert.
                    Ein Vertrag entsteht erst, wenn Sie zusagen.
                  </p>
                )}
              </>
            )}
          </div>

          <FormNav
            onZurueck={step > 0 ? zurueck : undefined}
            onWeiter={letzterSchritt ? () => { void speichern(); } : weiter}
            // Verbindlich anfragen statt „Speichern" (Martin 25.09.): Der Kunde hat
            // unter der Kostenkarte „Ja" gesagt; hier schickt er die Anfrage ab.
            weiterText={letzterSchritt ? (nurAenderung ? 'Änderungen speichern' : 'Bewerbungen anfragen') : 'Weiter →'}
            zurueckAlsLink={letzterSchritt ? `Zurück zu Schritt ${step}` : undefined}
            laedt={isSaving}
            ladeText={nurAenderung ? 'Speichern…' : 'Wird angefragt…'}
            hinweis={navHinweis && (
              <button
                type="button"
                onClick={zumErstenFehler}
                className="inline-flex min-h-[44px] -my-2.5 items-center px-2 underline decoration-pm-error/40 underline-offset-4"
              >
                {navHinweis}
              </button>
            )}
          />
        </Card>
      )}
      {/* Unter der Karte statt in der mitlaufenden Leiste — dort kostete die
          zweite Zeile auf dem Handy Platz über dem Formular. */}
      {patientOpen && (
        <p className="mt-3 text-center text-[13px] text-pm-muted">Ihre Eingaben bleiben auf diesem Gerät gespeichert.</p>
      )}
    </div>
  );
};
