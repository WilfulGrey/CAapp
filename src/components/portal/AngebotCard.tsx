import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { Check, ChevronDown, FileText, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Lead,
  formatDate,
  addDays,
  leadDisplayName,
  leadGreeting,
  careStartLabel,
  formatEuro,
  cap,
  prefillPatientFromLead,
} from '../../lib/supabase';
import { CustomSelect } from './CustomSelect';
import type { PatientForm } from './shared';
import { STEP_LABELS } from './shared';
import type { MamamiaCustomer } from '../../lib/mamamia/types';
import { mapMamamiaCustomerToPatientForm, germanySkillLabel } from '../../lib/mamamia/mappers';

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
}> = ({ lead, mmCustomer, onPatientSaved, triggerOpenPatient, onTriggerHandled, mamamiaEnabled, onSaveToMamamia }) => {
  // ─── Derive display values from lead (or fallback to demo data) ──────────────
  // No demo-mode hardcodes (CLAUDE.md §1: real backend or visible failure).
  // When lead is missing, fields render empty — parent decides whether to
  // gate the card behind a loading/error state.
  const kalk = lead?.kalkulation;
  const bruttopreis = kalk ? formatEuro(kalk.bruttopreis) : '';
  const eigenanteil = kalk ? formatEuro(kalk.eigenanteil) : '';
  const nachname = cap(lead?.nachname) || '';
  const displayAngebot = nachname ? `${nachname} · ${bruttopreis}/Mo.` : bruttopreis;
  const careStart = careStartLabel(lead?.care_start_timing ?? null);
  const angebotDatum = lead ? formatDate(lead.created_at) : '';
  const gueltigBis = lead ? addDays(lead.created_at, 30) : '';
  const kundenEmail = lead?.email ?? '';
  const kundenName = lead ? leadDisplayName(lead) : '';
  const greeting = lead ? leadGreeting(lead) : '';
  const zuschüsse = kalk?.['zuschüsse']?.items?.filter(z => z.in_kalkulation) ?? [];
  const [angebotOpen, setAngebotOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
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

  // Propagate saved → parent. The hasFinalSave hydration above flips
  // `saved=true` on mount when the customer revisits with a previously
  // submitted patient form, but without this useEffect the parent's
  // patientSaved would stay false (onPatientSaved is only called from
  // the explicit "Daten speichern" click handler) — meaning the strict
  // invite-gate would block invitations for a returning customer who
  // already has a complete profile.
  useEffect(() => {
    onPatientSaved?.(saved);
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
    haushalt: pick('haushalt') || 'Ehepartner/in',
    wohnungstyp: pick('wohnungstyp'), urbanisierung: pick('urbanisierung'),
    familieNahe: pick('familieNahe'), pflegedienst: pick('pflegedienst'), internet: pick('internet'),
    pflegedienstHaeufigkeit: pick('pflegedienstHaeufigkeit'),
    pflegedienstAufgaben: pick('pflegedienstAufgaben'),
    tiere: pick('tiere'), unterbringung: pick('unterbringung'), aufgaben: pick('aufgaben'),
    wunschGeschlecht: pick('wunschGeschlecht'),
    rauchen: pick('rauchen'), sonstigeWuensche: pick('sonstigeWuensche'),
    wunschGetriebe: pick('wunschGetriebe'),
  });

  const zwei = patient.anzahl === '2';

  // userDirty — set ONLY by user-driven setPatient (set() / CustomSelect
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
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...patient, _isDraft: !saved }),
    );
  }, [patient, storageKey, saved]);

  const set = (f: keyof PatientForm) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) =>
      updatePatient(p => ({ ...p, [f]: e.target.value }));

  const stepComplete = (s: number): boolean => {
    if (s === 0) {
      if (!patient.anzahl) return false;
      const p1ok = patient.geschlecht !== '' && patient.geburtsjahr !== '' && patient.pflegegrad !== '';
      const p2ok = !zwei || (patient.p2_geschlecht !== '' && patient.p2_geburtsjahr !== '' && patient.p2_pflegegrad !== '');
      return p1ok && p2ok;
    }
    if (s === 1) {
      const p1ok = patient.mobilitaet !== '' && patient.heben !== '' && patient.demenz !== '' && patient.inkontinenz !== '' && patient.nacht !== '';
      const p2ok = !zwei || (patient.p2_mobilitaet !== '' && patient.p2_heben !== '' && patient.p2_demenz !== '' && patient.p2_inkontinenz !== '' && patient.p2_nacht !== '');
      return p1ok && p2ok;
    }
    if (s === 2) {
      const baseOk = patient.plz !== '' && patient.ort !== '' && patient.haushalt !== ''
        && patient.wohnungstyp !== '' && patient.urbanisierung !== '' && patient.familieNahe !== ''
        && patient.pflegedienst !== '' && patient.internet !== '';
      // When Pflegedienst='Ja' or 'Geplant', Mamamia requires a description
      // of frequency + tasks (panel form gates customer completion on it).
      // 'Nein' skips both follow-ups.
      const pflegedienstActive = patient.pflegedienst === 'Ja' || patient.pflegedienst === 'Geplant';
      if (pflegedienstActive) {
        return baseOk && patient.pflegedienstHaeufigkeit !== '' && patient.pflegedienstAufgaben !== '';
      }
      return baseOk;
    }
    if (s === 3) {
      const baseOk = patient.wunschGeschlecht !== '' && patient.rauchen !== '';
      // Gearbox is required only when the customer's calculator answer
      // said they need a driving caregiver — surfaced via Mamamia state.
      const needsGearbox = mmCustomer?.customer_caregiver_wish?.driving_license === 'yes';
      if (needsGearbox) {
        return baseOk && patient.wunschGetriebe !== '';
      }
      return baseOk;
    }
    return false;
  };
  const allComplete = STEP_LABELS.every((_, i) => stepComplete(i));

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 transition-all bg-white';
  const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5';
  // 2-column grid rows: align label boxes so a wrapped label (e.g.
  // "Heben erforderlich? *" vs single-line "Demenz *") doesn't shift its
  // select down relative to the neighbour. Apply via grid items-end on
  // the row and flex flex-col on each cell.
  const gridRow2 = 'grid grid-cols-2 gap-2 items-end';

  const downloadPdf = async () => {
    // Pre-load logo as base64 so html2canvas doesn't miss it
    const logoB64 = await fetch('/LOGO-PRIMUNDUS.png')
      .then(r => r.blob())
      .then(b => new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); }));

    const html = `<div style="width:794px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;">

  <!-- HEADER -->
  <div style="padding:32px 52px 24px;border-bottom:1px solid #e8e8e8;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:middle;width:55%;">
        <img src="${logoB64}" style="height:52px;display:block;" />
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <div style="font-size:13px;color:#444;line-height:1.5;">089 200 000 830</div>
        <div style="font-size:12px;color:#888;line-height:1.5;">Ilka Wysocki · Mo–Sa 8–18 Uhr</div>
      </td>
    </tr></table>
  </div>

  <!-- ADDRESS + META -->
  <div style="padding:24px 52px 20px;border-bottom:1px solid #f0f0f0;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:top;">
        <div style="font-size:13px;font-weight:600;color:#1a1a1a;">${kundenName}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">${kundenEmail}</div>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="font-size:12px;color:#888;line-height:2.0;">
          <div>Angebotsdatum: <span style="color:#333;">${angebotDatum}</span></div>
          <div>Gültig bis: <span style="color:#333;">${gueltigBis}</span></div>
        </div>
      </td>
    </tr></table>
  </div>

  <!-- TITLE + BRIEF -->
  <div style="padding:32px 52px 28px;">
    <div style="font-size:19px;font-weight:700;color:#1a1a1a;margin-bottom:20px;line-height:1.35;">Ihr persönliches Angebot –<br/>24-Stunden-Betreuung zu Hause</div>
    <p style="font-size:13.5px;color:#333;margin:0 0 10px;">${greeting},</p>
    <p style="font-size:13.5px;color:#555;line-height:1.7;margin:0 0 10px;">vielen Dank für Ihre Anfrage. Gerne können wir die Betreuung übernehmen. Da unsere Betreuungskräfte direkt angestellt sind, kann die Betreuung bereits <strong style="color:#1a1a1a;">innerhalb von 4–7 Werktagen</strong> beginnen.</p>
    <p style="font-size:13.5px;color:#555;line-height:1.7;margin:0 0 18px;">Unser nachfolgendes Angebot ist auf Ihre individuelle Situation zugeschnitten.</p>
    <div style="font-size:13px;color:#888;">Ihre Ilka Wysocki</div>
  </div>

  <!-- TRUST BAR -->
  <div style="padding:13px 52px;background:#f9f9f9;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="font-size:11px;color:#bbb;vertical-align:middle;width:80px;">Bekannt aus</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">DIE WELT</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">FAZ</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">ARD</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">NDR</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">SAT.1</td>
    </tr></table>
  </div>

  <!-- KOSTEN -->
  <div style="padding:32px 52px 0;">
    <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px;">Kosten</div>
    <div style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;margin-bottom:10px;">
      <div style="padding:10px 22px;background:#f5f5f5;border-bottom:1px solid #e8e8e8;">
        <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.2px;text-transform:uppercase;">Monatssatz für die 24h-Betreuung</div>
      </div>
      <div style="padding:20px 22px 16px;">
        <div style="font-size:38px;font-weight:700;color:#1a1a1a;line-height:1;">${bruttopreis}</div>
        <div style="font-size:12px;color:#aaa;margin-top:6px;">Inkl. aller Steuern, Gebühren und Sozialabgaben</div>
      </div>
      <div style="border-top:1px solid #f0f0f0;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="padding:12px 22px;border-right:1px solid #f0f0f0;width:50%;vertical-align:top;">
            <div style="font-size:10px;color:#bbb;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Zzgl. Anreisepauschale</div>
            <div style="font-size:13px;color:#555;">125 € pro Strecke</div>
          </td>
          <td style="padding:12px 22px;width:50%;vertical-align:top;">
            <div style="font-size:10px;color:#bbb;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Zzgl. Kost &amp; Logis</div>
            <div style="font-size:13px;color:#555;">Eigenes Zimmer + Verpflegung</div>
          </td>
        </tr></table>
      </div>
    </div>
    <div style="padding:6px 0 28px;">
      <div style="font-size:12px;color:#888;border:1px solid #e0e0e0;border-radius:20px;padding:5px 14px;display:inline-block;">✓ Täglich kündbar &nbsp;·&nbsp; ✓ Tagesgenaue Abrechnung &nbsp;·&nbsp; ✓ Keine Kosten ohne Pflegekraft</div>
    </div>
  </div>

  <!-- ZUSCHÜSSE -->
  <div style="padding:0 52px 28px;">
    <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px;">Mögliche Zuschüsse der Pflegekasse</div>
    <div style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        ${zuschüsse.map((z: any) => `<tr><td style="padding:11px 22px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;background:#fafafa;">${z.label}</td><td style="padding:11px 22px;text-align:right;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;background:#fafafa;white-space:nowrap;">−${formatEuro(z.betrag_monatlich)}</td></tr>`).join('')}
        <tr><td style="padding:14px 22px;font-size:14px;font-weight:700;color:#1a1a1a;background:#fff;">Möglicher Eigenanteil</td><td style="padding:14px 22px;text-align:right;font-size:16px;font-weight:700;color:#1a1a1a;background:#fff;white-space:nowrap;">ab ${eigenanteil}/Monat</td></tr>
      </table>
    </div>
    <div style="font-size:11px;color:#ccc;margin-top:8px;font-style:italic;">Zuschüsse sind individuell und abhängig von Ihrer persönlichen Situation. Kein Vertragsbestandteil.</div>
  </div>

  <!-- NÄCHSTE SCHRITTE -->
  <div style="padding:24px 52px 32px;border-top:1px solid #f0f0f0;">
    <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:20px;">Was passiert nach der Annahme?</div>
    ${[
      ['1','Vertragsbestätigung per E-Mail','Sie erhalten sofort eine Bestätigung mit allen Details des Einsatzes.'],
      ['2','Anreise &amp; Betreuungsbeginn','Die Pflegekraft reist zum vereinbarten Datum an und beginnt die Betreuung.'],
      ['3','Laufende Begleitung','Ihr persönlicher Ansprechpartner ist 7 Tage die Woche für Sie erreichbar.'],
      ['4','Nächsten Einsatz planen','Zur Mitte des Einsatzes planen wir gemeinsam die Nachfolge — alles im Portal.'],
    ].map(([n,title,desc]) => `
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;"><tr>
      <td style="vertical-align:top;width:36px;padding-top:2px;">
        <div style="width:24px;height:24px;border:1.5px solid #ddd;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#aaa;">${n}</div>
      </td>
      <td style="vertical-align:top;padding-left:14px;">
        <div style="font-size:13.5px;font-weight:700;color:#1a1a1a;">${title}</div>
        <div style="font-size:12.5px;color:#777;margin-top:3px;line-height:1.55;">${desc}</div>
      </td>
    </tr></table>`).join('')}
  </div>

  <!-- FOOTER -->
  <div style="padding:16px 52px;border-top:1px solid #f0f0f0;background:#f9f9f9;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="font-size:11px;color:#bbb;">Primundus GmbH · primundus.de · info@primundus.de</td>
      <td style="text-align:right;font-size:11px;color:#bbb;">Vertrauliches Angebot · Nur für ${kundenName}</td>
    </tr></table>
  </div>

</div>`;

    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;pointer-events:none;';
    el.innerHTML = html;
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 300));

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const canvasH = (canvas.height / canvas.width) * pageW;

      if (canvasH <= pageH) {
        doc.addImage(imgData, 'PNG', 0, 0, pageW, canvasH);
      } else {
        const pxPerPage = (pageH / pageW) * canvas.width;
        let remainingH = canvas.height;
        let srcY = 0;
        let firstPage = true;
        while (remainingH > 0) {
          const sliceH = Math.min(pxPerPage, remainingH);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (!firstPage) doc.addPage();
          doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, (sliceH / canvas.width) * pageW);
          srcY += sliceH;
          remainingH -= sliceH;
          firstPage = false;
        }
      }

      doc.save('Primundus-Angebot.pdf');
    } finally {
      document.body.removeChild(el);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">

      {/* ── Row 1: Ihr Angebot — hidden, offer is now shown inline above the AngebotCard ── */}
      <div style={{display:'none'}}>
        <button
          onClick={() => setAngebotOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-[#E3F7EF] flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-[#22A06B]" strokeWidth={3} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500 mb-0.5">Ihr Angebot</p>
            <p className="text-sm font-bold text-gray-900">{displayAngebot}</p>
            <p className="text-sm text-gray-500 mt-0.5">{careStart}</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-[#F8F7F5] flex items-center justify-center flex-shrink-0">
            <ChevronDown className={`w-4 h-4 text-[#8B7355] transition-transform ${angebotOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {angebotOpen && (
          <div className="border-t border-gray-100 px-4 pt-5 pb-5 space-y-5">

            {/* ── Angebotsbrief ── */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-800">{kundenName}</p>
                  <p className="text-sm text-gray-500">{kundenEmail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">Angebotsdatum: {angebotDatum}</p>
                  <p className="text-xs text-gray-500">Gültig bis: {gueltigBis}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 mb-2 mt-6">Ihr persönliches Angebot –<br />24-Stunden-Betreuung zu Hause</p>
                <p className="text-sm text-gray-600 mb-2">{greeting},</p>
                <p className="text-sm text-gray-600 leading-relaxed">vielen Dank für Ihre Anfrage. Gerne können wir die Betreuung übernehmen. Da unsere Betreuungskräfte direkt angestellt sind, kann die Betreuung bereits <span className="font-semibold">innerhalb von 4–7 Werktagen</span> beginnen.</p>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">Nachfolgend finden Sie die Konditionen sowie bereits vorausgewählte Pflegekräfte. Melden Sie sich jederzeit bei Fragen.</p>
                <p className="text-sm text-gray-400 mt-3">Ihre Ilka Wysocki</p>
              </div>
            </div>

            {/* ── Konditionen & Kosten ── */}
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#F8F7F5]">
                  <span className="text-sm font-bold text-[#8B7355]">Ihre Konditionen</span>
                </div>
                {/* Kosten */}
                {[
                  { label: 'Mtl. Betreuungskosten', value: bruttopreis, bold: true, sub: 'Inkl. Steuern, Gebühren & Sozialabgaben' },
                  { label: 'Anreise', value: 'Zzgl. 125 € / Strecke', bold: false },
                  { label: 'Unterkunft', value: 'Zzgl. Kost & Logis', bold: false },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-2 bg-white gap-4">
                    <div>
                      <span className="text-sm text-gray-700">{r.label}</span>
                      {r.sub && <p className="text-sm text-gray-500 mt-0.5">{r.sub}</p>}
                    </div>
                    <span className={`text-sm text-right flex-shrink-0 ${r.bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{r.value}</span>
                  </div>
                ))}
                {/* Vertragskonditionen */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-500">Vertragskonditionen</span>
                  <span className="text-xs font-semibold text-[#1a7a4f] bg-[#E3F7EF] border border-[#B8E8D4] px-2 py-0.5 rounded-full">100% Sorglos</span>
                </div>
                {[
                  'Täglich kündbar',
                  'Tagesgenaue Abrechnung',
                  'Kosten entstehen nur wenn Pflegekraft vor Ort ist',
                ].map(label => (
                  <div key={label} className="flex items-center gap-2.5 px-4 py-2 bg-gray-50">
                    <Check className="w-3 h-3 text-[#22A06B] flex-shrink-0" strokeWidth={3} />
                    <span className="text-sm text-gray-700">{label}</span>
                  </div>
                ))}
              </div>

              {/* Warum Primundus */}
              <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                <div className="px-4 py-2.5 bg-white">
                  <p className="text-sm font-bold text-gray-900">Warum Primundus…</p>
                </div>
                {[
                  { icon: <svg className="w-4 h-4 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>, label: 'Über 20 Jahre Erfahrung' },
                  { icon: <svg className="w-4 h-4 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>, label: 'Über 60.000+ Einsätze' },
                  { icon: <svg className="w-4 h-4 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>, label: 'Persönlicher Ansprechpartner 7 Tage die Woche' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 bg-white">
                    <span className="flex-shrink-0">{r.icon}</span>
                    <span className="text-sm text-gray-700">{r.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-white">
                  <img src="/badge-testsieger.webp" alt="Testsieger" className="w-8 flex-shrink-0 rounded" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Testsieger bei DIE WELT</p>
                    <p className="text-sm text-gray-400 italic">„Beste Kombination aus Preis, Qualität und Kundenservice."</p>
                  </div>
                </div>
                <div className="px-4 py-3 bg-white">
                  <p className="text-xs text-gray-400 mb-2">Bekannt aus</p>
                  <div className="flex items-center justify-center gap-x-5 gap-y-3 flex-wrap">
                    {[
                      { src: '/media-welt.webp', alt: 'Die Welt' },
                      { src: '/media-faz.webp', alt: 'FAZ' },
                      { src: '/media-ard.webp', alt: 'ARD' },
                      { src: '/media-ndr.webp', alt: 'NDR' },
                      { src: '/media-sat1.webp', alt: 'SAT.1' },
                    ].map(l => (
                      <img key={l.alt} src={l.src} alt={l.alt} className="h-3.5 object-contain" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Zuschüsse — grüner Hinweisblock */}
              <div className="rounded-xl border border-[#B8E8D4] overflow-hidden divide-y divide-[#c8edd8]">
                <div className="px-4 py-2.5 bg-[#E3F7EF]">
                  <p className="text-xs font-bold text-[#1a7a4f]">Mögliche Zuschüsse der Pflegekasse</p>
                  <p className="text-xs text-[#2a9a6f] mt-0.5">Hinweis – kein Vertragsbestandteil</p>
                </div>
                {zuschüsse.map((z: any) => (
                  <div key={z.label || z.name} className="flex items-center justify-between px-4 py-2 bg-[#E3F7EF] gap-4">
                    <span className="text-xs text-[#1a7a4f]">{z.label}</span>
                    <span className="text-xs font-semibold text-[#1a7a4f] text-right">−{formatEuro(z.betrag_monatlich)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#d0f2e4] border-t border-[#a3d9c4] gap-4">
                  <span className="text-sm font-bold text-[#1a7a4f]">Möglicher Eigenanteil</span>
                  <span className="text-sm font-bold text-[#1a7a4f] text-right">ab {eigenanteil}/Monat</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Zuschüsse sind individuell nutzbar und abhängig von Ihrer persönlichen Situation.
              </p>
            </div>

            {/* ── PDF Download ── */}
            <button onClick={downloadPdf} className="flex items-center gap-2 text-xs font-semibold text-[#8B7355] border border-[#C5B49A] bg-[#F8F7F5] rounded-lg px-3 py-2 hover:bg-[#EBE2D5] transition-colors w-full justify-center">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Angebot als PDF herunterladen
            </button>

            {/* ── Wie geht es weiter? ── */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-sm font-bold text-gray-900">Wie geht es weiter?</p>
              </div>
              <div className="divide-y divide-gray-100">
                {/* Step 1 */}
                <button
                  onClick={() => { setAngebotOpen(false); setPatientOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8F7F5] transition-colors text-left group"
                >
                  <div className="w-6 h-6 rounded-full bg-[#8B7355] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#8B7355]">Profildaten vervollständigen</p>
                    <p className="text-xs text-gray-500">Angaben zum Patienten & Haushalt</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#8B7355] -rotate-90 flex-shrink-0" />
                </button>
                {/* Step 2 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Auswahl Ihrer Pflegekraft</p>
                    <p className="text-xs text-gray-500">Passende Betreuerin kennenlernen</p>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Anreise & Betreuungsbeginn</p>
                    <p className="text-xs text-gray-500">Pflegekraft kommt zu Ihnen nach Hause</p>
                  </div>
                </div>
                {/* Step 4 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">4</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Laufende Betreuung</p>
                    <p className="text-xs text-gray-500">Ihr persönlicher Ansprechpartner begleitet Sie</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Row 2: Patientendaten ── */}
      <div>
        <button
          onClick={() => setPatientOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${allComplete && saved ? 'bg-[#E3F7EF]' : 'bg-amber-50'}`}>
            {allComplete && saved
              ? <Check className="w-4 h-4 text-[#22A06B]" strokeWidth={3} />
              : <AlertCircle className="w-4 h-4 text-amber-500" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Patientendaten</p>
            {allComplete && saved ? (
              <p className="text-sm font-bold text-gray-900">Vollständig ausgefüllt</p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">Unvollständig</p>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Bitte ergänzen</span>
              </div>
            )}
          </div>
          <div className="w-7 h-7 rounded-full bg-[#F8F7F5] flex items-center justify-center flex-shrink-0">
            <ChevronDown className={`w-4 h-4 text-[#8B7355] transition-transform ${patientOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {patientOpen && (
          <div className="border-t border-gray-100 p-3 bg-gray-50">
          <div className="rounded-2xl border-2 border-[#E76F63] overflow-hidden shadow-[0_0_0_4px_rgba(231,111,99,0.07)] bg-gray-50">

            {/* Colored header banner */}
            <div className="bg-[#E76F63] px-4 py-3 flex items-center gap-2.5 rounded-t-2xl">
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white">Patientendaten ausfüllen</p>
                <p className="text-[13px] text-white/75">Damit Pflegekräfte sich optimal vorbereiten können</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-3">
              <div className="flex gap-1 flex-1">
                {STEP_LABELS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i < step ? 'bg-[#8B7355]' : i === step ? 'bg-[#8B7355]/20' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0 font-medium">
                {STEP_LABELS[step]} ({step + 1}/{STEP_LABELS.length})
              </span>
            </div>

            <div className="px-4 pb-5 space-y-3 bg-gray-50">

              {/* Step heading */}
              <div className="pt-1 pb-1 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {step === 0 && 'Angaben zur betreuten Person'}
                  {step === 1 && 'Pflegebedarf'}
                  {step === 2 && 'Wohnsituation'}
                </p>
              </div>

              {/* ── Step 1: Zur Person ── */}
              {step === 0 && (
                <>
                  {/* Anzahl Patienten toggle */}
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      Anzahl zu betreuender Personen
                      <button type="button" onClick={() => setPriceInfo(priceInfo === 'anzahl' ? null : 'anzahl')} className="flex-shrink-0 text-gray-400 hover:text-[#8B7355] transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                      </button>
                    </label>
                    {priceInfo === 'anzahl' && (
                      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                        <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                        <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                      </div>
                    )}
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">
                      {patient.anzahl === '2' ? '2 Personen' : '1 Person'}
                    </div>
                  </div>

                  {/* Patient 1 */}
                  {patient.anzahl !== '' && (
                    <>
                      {zwei && (
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-1">Person 1</p>
                      )}
                      <div className={gridRow2}>
                        <div>
                          <label className={labelCls}>Geschlecht <span className="text-red-400">*</span></label>
                          <CustomSelect value={patient.geschlecht} onChange={v => updatePatient(p=>({...p,geschlecht:v}))}
                            options={['Männlich','Weiblich']} />
                        </div>
                        <div>
                          <label className={labelCls}>Geburtsjahr <span className="text-red-400">*</span></label>
                          <CustomSelect value={patient.geburtsjahr} onChange={v => updatePatient(p=>({...p,geburtsjahr:v}))}
                            options={Array.from({length:70},(_,i)=>String(1931+i))} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Pflegegrad <span className="text-red-400">*</span></label>
                        <CustomSelect value={patient.pflegegrad} onChange={v => updatePatient(p=>({...p,pflegegrad:v}))}
                          options={['Kein/e','Pflegegrad 1','Pflegegrad 2','Pflegegrad 3','Pflegegrad 4','Pflegegrad 5']} />
                      </div>
                      <div className={gridRow2}>
                        <div>
                          <label className={labelCls}>Gewicht <span className="font-normal text-gray-400">(optional)</span></label>
                          <CustomSelect value={patient.gewicht} onChange={v => updatePatient(p=>({...p,gewicht:v}))}
                            options={['Unter 50 kg','51-60 kg','61-70 kg','71-80 kg','81-90 kg','91-100 kg','101-110 kg','Über 110 kg']} />
                        </div>
                        <div>
                          <label className={labelCls}>Größe <span className="font-normal text-gray-400">(optional)</span></label>
                          <CustomSelect value={patient.groesse} onChange={v => updatePatient(p=>({...p,groesse:v}))}
                            options={['Unter 151 cm','151-160 cm','161-170 cm','171-180 cm','181-190 cm','Über 190 cm']} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Patient 2 */}
                  {zwei && (
                    <>
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Person 2</p>
                        <div className={gridRow2}>
                          <div>
                            <label className={labelCls}>Geschlecht <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_geschlecht} onChange={v => updatePatient(p=>({...p,p2_geschlecht:v}))}
                              options={['Männlich','Weiblich']} />
                          </div>
                          <div>
                            <label className={labelCls}>Geburtsjahr <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_geburtsjahr} onChange={v => updatePatient(p=>({...p,p2_geburtsjahr:v}))}
                              options={Array.from({length:70},(_,i)=>String(1931+i))} />
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className={labelCls}>Pflegegrad <span className="text-red-400">*</span></label>
                          <CustomSelect value={patient.p2_pflegegrad} onChange={v => updatePatient(p=>({...p,p2_pflegegrad:v}))}
                            options={['Kein/e','Pflegegrad 1','Pflegegrad 2','Pflegegrad 3','Pflegegrad 4','Pflegegrad 5']} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className={labelCls}>Gewicht <span className="font-normal text-gray-400">(optional)</span></label>
                            <CustomSelect value={patient.p2_gewicht} onChange={v => updatePatient(p=>({...p,p2_gewicht:v}))}
                              options={['Unter 50 kg','51-60 kg','61-70 kg','71-80 kg','81-90 kg','91-100 kg','101-110 kg','Über 110 kg']} />
                          </div>
                          <div>
                            <label className={labelCls}>Größe <span className="font-normal text-gray-400">(optional)</span></label>
                            <CustomSelect value={patient.p2_groesse} onChange={v => updatePatient(p=>({...p,p2_groesse:v}))}
                              options={['Unter 151 cm','151-160 cm','161-170 cm','171-180 cm','181-190 cm','Über 190 cm']} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Step 2: Pflegebedarf ── */}
              {step === 1 && (
                <>
                  {zwei && (
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Person 1</p>
                  )}
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      Mobilität
                      <button type="button" onClick={() => setPriceInfo(priceInfo === 'mobilitaet' ? null : 'mobilitaet')} className="flex-shrink-0 text-gray-400 hover:text-[#8B7355] transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                      </button>
                    </label>
                    {priceInfo === 'mobilitaet' && (
                      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                        <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                        <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                      </div>
                    )}
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">{patient.mobilitaet}</div>
                  </div>
                  <div className={gridRow2}>
                    <div>
                      <label className={labelCls}>Heben erforderlich? <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.heben} onChange={v => updatePatient(p=>({...p,heben:v}))}
                        options={['Ja','Nein']} />
                    </div>
                    <div>
                      <label className={labelCls}>Demenz <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.demenz} onChange={v => updatePatient(p=>({...p,demenz:v}))}
                        options={['Nein','Leichtgradig','Mittelgradig','Schwer']} />
                    </div>
                  </div>
                  <div className={gridRow2}>
                    <div>
                      <label className={labelCls}>Inkontinenz <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.inkontinenz} onChange={v => updatePatient(p=>({...p,inkontinenz:v}))}
                        options={['Nein','Harninkontinenz','Stuhlinkontinenz','Beides']} />
                    </div>
                    <div>
                      <label className={`${labelCls} flex items-center gap-1.5`}>
                        Nachteinsätze
                        <button type="button" onClick={() => setPriceInfo(priceInfo === 'nacht' ? null : 'nacht')} className="flex-shrink-0 text-gray-400 hover:text-[#8B7355] transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                        </button>
                      </label>
                      {priceInfo === 'nacht' && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                          <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                          <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                        </div>
                      )}
                      <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">{patient.nacht}</div>
                    </div>
                  </div>

                  {/* Patient 2 Pflegebedarf */}
                  {zwei && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Person 2</p>
                      <div className="space-y-3">
                        <div>
                          <label className={`${labelCls} flex items-center gap-1.5`}>Mobilität <span className="text-red-400">*</span><svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg></label>
                          <CustomSelect value={patient.p2_mobilitaet} onChange={v => updatePatient(p=>({...p,p2_mobilitaet:v}))}
                            options={['Vollständig mobil','Am Gehstock','Rollatorfähig','Rollstuhlfähig','Bettlägerig']} />
                        </div>
                        <div className={gridRow2}>
                          <div>
                            <label className={labelCls}>Heben erforderlich? <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_heben} onChange={v => updatePatient(p=>({...p,p2_heben:v}))}
                              options={['Ja','Nein']} />
                          </div>
                          <div>
                            <label className={labelCls}>Demenz <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_demenz} onChange={v => updatePatient(p=>({...p,p2_demenz:v}))}
                              options={['Nein','Leichtgradig','Mittelgradig','Schwer']} />
                          </div>
                        </div>
                        <div className={gridRow2}>
                          <div>
                            <label className={labelCls}>Inkontinenz <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_inkontinenz} onChange={v => updatePatient(p=>({...p,p2_inkontinenz:v}))}
                              options={['Nein','Harninkontinenz','Stuhlinkontinenz','Beides']} />
                          </div>
                          <div>
                            <label className={`${labelCls} flex items-center gap-1.5`}>Nachteinsätze <span className="text-red-400">*</span><svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg></label>
                            <CustomSelect value={patient.p2_nacht} onChange={v => updatePatient(p=>({...p,p2_nacht:v}))}
                              options={['Nein','Bis zu 1 Mal','1–2 Mal','Mehr als 2']} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={labelCls}>Weitere Diagnosen <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea value={patient.diagnosen} onChange={set('diagnosen')}
                      placeholder="z.B. Parkinson, Herzinsuffizienz, Diabetes…"
                      rows={2} className={`${inputCls} resize-none`} />
                  </div>
                </>
              )}

              {/* ── Step 3: Wohnsituation ── */}
              {step === 2 && (
                <>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-2">
                      <label className={labelCls}>PLZ <span className="text-red-400">*</span></label>
                      <input value={patient.plz} onChange={set('plz')} placeholder="80331" maxLength={5} className={inputCls} />
                    </div>
                    <div className="col-span-3">
                      <label className={labelCls}>Ort <span className="text-red-400">*</span></label>
                      <input value={patient.ort} onChange={set('ort')} placeholder="München" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      Weitere Personen im Haushalt
                      <button type="button" onClick={() => setPriceInfo(priceInfo === 'haushalt' ? null : 'haushalt')} className="flex-shrink-0 text-gray-400 hover:text-[#8B7355] transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                      </button>
                    </label>
                    {priceInfo === 'haushalt' && (
                      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                        <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                        <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                      </div>
                    )}
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">{patient.haushalt}</div>
                  </div>
                  <div>
                    <label className={labelCls}>Familie in der Nähe (bis 20 km) <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.familieNahe} onChange={v => updatePatient(p=>({...p,familieNahe:v}))}
                      options={['Ja','Nein']} />
                  </div>
                  <div className={gridRow2}>
                    <div>
                      <label className={labelCls}>Urbanisation <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.urbanisierung} onChange={v => updatePatient(p=>({...p,urbanisierung:v}))}
                        options={['Großstadt','Kleinstadt','Dorf/Land']} />
                    </div>
                    <div>
                      <label className={labelCls}>Wohnungstyp <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.wohnungstyp} onChange={v => updatePatient(p=>({...p,wohnungstyp:v}))}
                        options={['Einfamilienhaus','Wohnung in Mehrfamilienhaus','Andere']} />
                    </div>
                  </div>
                  <div className={gridRow2}>
                    <div>
                      <label className={labelCls}>Unterbringung der PK</label>
                      <CustomSelect value={patient.unterbringung} onChange={v => updatePatient(p=>({...p,unterbringung:v}))}
                        options={['Zimmer in den Räumlichkeiten','Gesamter Bereich','Zimmer extern','Bereich extern']} />
                    </div>
                    <div>
                      <label className={labelCls}>Internet vorhanden? <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.internet} onChange={v => updatePatient(p=>({...p,internet:v}))}
                        options={['Ja','Nein']} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Haustiere <span className="font-normal text-gray-400">(opt.)</span></label>
                    <CustomSelect value={patient.tiere} onChange={v => updatePatient(p=>({...p,tiere:v}))}
                      options={['Keine','Hund','Katze','Andere']} placeholder="Keine" />
                  </div>
                  <div>
                    <label className={labelCls}>Pflegedienst kommt? <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.pflegedienst} onChange={v => updatePatient(p=>{
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
                  </div>

                  {/* Pflegedienst follow-up: frequency + tasks. Required by
                      Mamamia panel form when pflegedienst='Ja'/'Geplant' —
                      pre-2026-05-05 we sent day_care_facility=yes without a
                      description and the customer flow stalled with
                      "Wie oft und welche Aufgaben übernimmt der Pflegedienst?"
                      validation error. */}
                  {(patient.pflegedienst === 'Ja' || patient.pflegedienst === 'Geplant') && (
                    <div className="space-y-3 pl-3 border-l-2 border-[#8B7355]/20">
                      <div>
                        <label className={labelCls}>Wie oft kommt der Pflegedienst? <span className="text-red-400">*</span></label>
                        <CustomSelect value={patient.pflegedienstHaeufigkeit}
                          onChange={v => updatePatient(p=>({...p,pflegedienstHaeufigkeit:v}))}
                          options={['1× pro Woche','2× pro Woche','3× pro Woche','Täglich','Mehrmals täglich']} />
                      </div>
                      <div>
                        <label className={labelCls}>Welche Aufgaben übernimmt der Pflegedienst? <span className="text-red-400">*</span></label>
                        <p className="text-xs text-gray-500 mb-2">Mehrfachauswahl möglich</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {[
                            'Grundpflege (Körperpflege, Anziehen)',
                            'Medikamentengabe',
                            'Wundversorgung',
                            'Injektionen / Blutzucker',
                            'Behandlungspflege (z.B. Verbandwechsel)',
                          ].map(task => {
                            // Use '; ' as separator: task labels contain
                            // commas inside parens, so a comma-joined string
                            // can't be split back unambiguously.
                            const selected = patient.pflegedienstAufgaben
                              .split('; ')
                              .map(s => s.trim())
                              .filter(Boolean);
                            const checked = selected.includes(task);
                            return (
                              <label key={task}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                                  checked
                                    ? 'bg-[#8B7355]/5 border-[#8B7355]/40'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                }`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => updatePatient(p => {
                                    const cur = p.pflegedienstAufgaben
                                      .split('; ')
                                      .map(s => s.trim())
                                      .filter(Boolean);
                                    const next = checked
                                      ? cur.filter(t => t !== task)
                                      : [...cur, task];
                                    return { ...p, pflegedienstAufgaben: next.join('; ') };
                                  })}
                                  className="w-4 h-4 rounded border-gray-300 text-[#8B7355] focus:ring-[#8B7355]/30"
                                />
                                <span className="text-sm text-gray-700">{task}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Step 4: Wünsche zur PK ── */}
              {step === 3 && (
                <>
                  <div>
                    <label className={labelCls}>Gewünschtes Geschlecht der PK <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.wunschGeschlecht} onChange={v => updatePatient(p=>({...p,wunschGeschlecht:v}))}
                      options={['Egal','Weiblich','Männlich']} />
                  </div>

                  {/* Preisrelevante Felder – read-only */}
                  <div className={gridRow2}>
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                        Sprachniveau
                        <button type="button" onClick={() => setPriceInfo(priceInfo === 'sprache' ? null : 'sprache')} className="flex-shrink-0 text-gray-400 hover:text-[#8B7355] transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                        </button>
                      </label>
                      {priceInfo === 'sprache' && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                          <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                          <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                        </div>
                      )}
                      <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">
                        {germanySkillLabel(mmCustomer?.customer_caregiver_wish?.germany_skill) || '—'}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>
                        Führerschein
                        {mmCustomer?.customer_caregiver_wish?.driving_license === 'yes' && (
                          <span className="text-red-400"> *</span>
                        )}
                      </label>
                      {/* When the calculator answered fuehrerschein=Ja
                          (mirror via Mamamia.customer_caregiver_wish.driving_license=yes),
                          let the user pick the gearbox they need. Otherwise
                          show the static "Nicht erforderlich" — license isn't
                          required for matching, so gearbox is moot. */}
                      {mmCustomer?.customer_caregiver_wish?.driving_license === 'yes' ? (
                        <CustomSelect value={patient.wunschGetriebe}
                          onChange={v => updatePatient(p=>({...p,wunschGetriebe:v}))}
                          options={['Automatik','Schaltung','Egal']}
                          placeholder="Bitte wählen" />
                      ) : (
                        <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">Nicht erforderlich</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Darf die Betreuungsperson rauchen? <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.rauchen} onChange={v => updatePatient(p=>({...p,rauchen:v}))}
                      options={['Ja','Nein']} />
                  </div>
                  <div>
                    <label className={labelCls}>Aufgaben der Pflegekraft <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea value={patient.aufgaben} onChange={set('aufgaben')}
                      placeholder="z.B. Körperpflege, Mahlzeiten, Arztbegleitung, Einkäufe…"
                      rows={3} className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>Sonstige Wünsche <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea value={patient.sonstigeWuensche} onChange={set('sonstigeWuensche')}
                      placeholder="z.B. Erfahrung mit Demenz, ruhige Person, tierlieb…"
                      rows={2} className={`${inputCls} resize-none`} />
                  </div>
                </>
              )}

              {/* Nav buttons */}
              <div className={`flex gap-2 pt-1 ${step > 0 ? 'justify-between' : 'justify-end'}`}>
                {step > 0 && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="px-4 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    ← Zurück
                  </button>
                )}
                {step < STEP_LABELS.length - 1 ? (
                  <button
                    onClick={() => stepComplete(step) && setStep(s => s + 1)}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                      stepComplete(step)
                        ? 'bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Weiter →
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (!allComplete) return;
                      // Mark as final submission (not a draft) so reload
                      // shows the green-checked "Vollständig" state.
                      if (storageKey) {
                        localStorage.setItem(
                          storageKey,
                          JSON.stringify({ ...patient, _isDraft: false }),
                        );
                      }
                      // Persist to Mamamia when session is live.
                      if (mamamiaEnabled && onSaveToMamamia) {
                        try {
                          await onSaveToMamamia(patient);
                        } catch (err) {
                          console.error('UpdateCustomer failed:', err);
                          // Still let user proceed (local draft saved). Revisit when mutation settles.
                        }
                      }
                      setSaved(true);
                      setPatientOpen(false);
                      onPatientSaved?.(true);
                    }}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                      allComplete
                        ? 'bg-[#E76F63] hover:bg-[#D65E52] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {allComplete ? '✓ Daten speichern' : 'Bitte alle Pflichtfelder ausfüllen'}
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>

    </div>
  );
};

