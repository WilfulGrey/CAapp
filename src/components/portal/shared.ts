// Shared types + pure helpers for portal components.
// Extracted from pages/CustomerPortalPage.tsx monolith.
//
// NOTE: No mock/fallback data lives here. See CLAUDE.md §1 — application
// data (nurses, bewerbungen, matchings) must come from Mamamia backend,
// never from inline seeds.

import type { Nurse } from '../../types';
import { badgeScore, badgeTier } from '../../lib/mamamia/badge';

// ─── Types ────────────────────────────────────────────────────────────────

export type AppStatus = 'new' | 'accepted' | 'declined';
export type NurseStatus = 'pending' | 'invited' | 'declined';

export interface OfferDetails {
  monatlicheKosten: number;
  anreisedatum: string;
  abreisedatum: string;
  anreisekosten: number;
  abreisekosten: number;
  reisetage: string;
  feiertagszuschlag: number;
  kuendigungsfrist: string;
  submittedAt: string;
}

export interface Application {
  id: string;
  nurse: Nurse;
  agencyName: string;
  appliedAt: string;
  status: AppStatus;
  message: string;
  offer: OfferDetails;
  isInvited?: boolean;
  // Vorstellungs-Text zur Pflegekraft, an den Kunden gerichtet (im Portal
  // unter „Vorstellung der Pflegekraft" angezeigt). Wird i.d.R. von der
  // Vermittlungs-Agentur formuliert und in Ich-Form unterschrieben — die PK
  // schreibt es nicht selbst. Daher Label NICHT „Nachricht von Maria"
  // (wäre falsche Zuschreibung).
  // ACHTUNG: NICHT identisch mit Mamamias `application.message` (agency-internal,
  // enthält Backoffice-Notizen mit Telefon/Gehalt → dauerhaft NICHT anzeigen).
  // Quelle für dieses Feld ist offen: entweder ein neues Mamamia-Feld
  // („caregiver cover message") oder eine personalisierte KI-Vorstellung.
  // Aktuell nur in Preview-Modi geseedet.
  coverMessage?: string;
  /** true = aus contract_snapshot rekonstruierte "accepted"-App (Mamamia
   *  liefert sie nicht mehr). Wird jeden Render neu abgeleitet → Platzhalter-
   *  Karte upgradet aufs volle Profil, sobald getCaregiver lädt. */
  synthetic?: boolean;
}

export interface NurseStatuses {
  [index: number]: NurseStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

// Maps the experience badge tier to its UI presentation (label/emoji/colour).
// Score + thresholds live in lib/mamamia/badge.ts — the single source of truth
// shared with the matching ranking (rankComparator) and the portal "Silber+"
// funnel (MIN_BADGE_SCORE). With the current thresholds
// (Platin ≥18 / Gold ≥10 / Silber ≥4 / Bronze ≥1 / sonst Starter):
//   1 J. + 3 Eins. = 4  → Silber
//   6 J. + 4 Eins. = 10 → Gold
//   12 J. + 6 Eins. = 18 → Platin
export function nurseLevel(experienceYears: number, assignments: number): {
  label: string;
  emoji: string;
  cls: string;
} {
  switch (badgeTier(badgeScore(experienceYears, assignments))) {
    case 4:  return { label: 'Platin',  emoji: '🏆', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 3:  return { label: 'Gold',    emoji: '🥇', cls: 'bg-yellow-50 text-yellow-600 border-yellow-300' };
    case 2:  return { label: 'Silber',  emoji: '🥈', cls: 'bg-slate-100 text-slate-500 border-slate-300' };
    case 1:  return { label: 'Bronze',  emoji: '🥉', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    default: return { label: 'Starter', emoji: '⭐', cls: 'bg-gray-100 text-gray-500 border-gray-200' };
  }
}

export function displayName(fullName: string): string {
  const parts = fullName.split(' ');
  return parts.map((p, i) => (i === parts.length - 1 ? `${p[0]}.` : p)).join(' ');
}

export function initials(fullName: string): string {
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('');
}

// ─── Nurse mock profile (for CustomerNurseModal when real data not fetched) ───

function seed(name: string): number {
  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function mockProfile(nurse: Nurse) {
  const s = seed(nurse.name);
  const hobbysPool = ['Kochen', 'Spazierengehen', 'Musik', 'Lesen', 'Gartenarbeit', 'Yoga', 'Handarbeiten', 'Backen'];
  const persPool = ['fürsorglich', 'geduldig', 'empathisch', 'zuverlässig', 'herzlich', 'ruhig', 'humorvoll', 'strukturiert'];
  const sprachenPool = [['Englisch'], ['Englisch', 'Russisch'], ['Ukrainisch'], ['Englisch', 'Ukrainisch'], ['Russisch']];
  const schwerpunktePool = [
    ['24h-Betreuung', 'Körperpflege', 'Demenzpflege', 'Medikamentengabe'],
    ['24h-Betreuung', 'Mobilisierung', 'Wundversorgung', 'Sturzprophylaxe'],
    ['24h-Betreuung', 'Palliativpflege', 'Ernährungsberatung', 'Körperpflege'],
    ['24h-Betreuung', 'Demenzpflege', 'Gedächtnisübungen', 'Beschäftigungstherapie'],
  ];
  const mobPool = [
    ['Mobil', 'Rollstuhl', 'Gehhilfe', 'Bettlägerig'],
    ['Mobil', 'Rollstuhl', 'Bettlägerig'],
    ['Mobil', 'Gehhilfe'],
    ['Alle'],
  ];
  const demenzPool = ['Keine', 'Leichtgradig', 'Mittelgradig', 'Leichtgradig'];
  const nachtPool = ['Ja', 'Gelegentlich', 'Nein', 'Unwichtig'];
  const unterbringungPool = ['Eigenes Zimmer', 'Eigenes Zimmer', 'Eigenes Bad', 'Eigenes Zimmer'];
  const urbanPool = ['Großstadt', 'Kleinstadt', 'Unwichtig', 'Großstadt'];
  const gewichtPool = ['51–60 kg', '61–70 kg', '61–70 kg', '71–80 kg', '51–60 kg'];
  const groessePool = ['151–160 cm', '161–170 cm', '161–170 cm', '161–170 cm', '151–160 cm'];

  return {
    schwerpunkte: schwerpunktePool[s % schwerpunktePool.length],
    nationalitaet: 'Polnisch',
    geburtsjahr: String(2026 - nurse.age),
    gewicht: gewichtPool[s % gewichtPool.length],
    groesse: groessePool[s % groessePool.length],
    hobbys: [hobbysPool[s % hobbysPool.length], hobbysPool[(s + 2) % hobbysPool.length], hobbysPool[(s + 4) % hobbysPool.length]],
    persoenlichkeit: [persPool[s % persPool.length], persPool[(s + 1) % persPool.length], persPool[(s + 3) % persPool.length], persPool[(s + 5) % persPool.length]],
    fuehrerschein: s % 3 !== 0,
    raucher: s % 4 === 0 ? 'Ja, draußen' : 'Nein',
    pflegeberuf: s % 2 === 0,
    krankenpflegeJahre: `${(s % 5) + 1} Jahre`,
    andereSpachen: sprachenPool[s % sprachenPool.length],
    mobilitaet: mobPool[s % mobPool.length],
    demenz: demenzPool[s % demenzPool.length],
    nacht: nachtPool[s % nachtPool.length],
    tiere: s % 3 === 0 ? 'Nein' : 'Unwichtig',
    unterbringung: unterbringungPool[s % unterbringungPool.length],
    urbanisierung: urbanPool[s % urbanPool.length],
    patienten: s % 3 === 0 ? '1 Patient' : 'Unwichtig',
    heben: s % 2 === 0,
  };
}

// ─── PatientForm (used by AngebotCard wizard) ─────────────────────────────

export interface PatientForm {
  anzahl: '1' | '2' | '';
  // Patient 1
  geschlecht: string; geburtsjahr: string; pflegegrad: string; gewicht: string; groesse: string;
  mobilitaet: string; heben: string; demenz: string; inkontinenz: string; nacht: string;
  // Patient 2
  p2_geschlecht: string; p2_geburtsjahr: string; p2_pflegegrad: string; p2_gewicht: string; p2_groesse: string;
  p2_mobilitaet: string; p2_heben: string; p2_demenz: string; p2_inkontinenz: string; p2_nacht: string;
  // Shared
  diagnosen: string;
  plz: string; ort: string; haushalt: string; wohnungstyp: string; urbanisierung: string;
  familieNahe: string; pflegedienst: string; internet: string;
  // ─── Kontakt-Daten ehemals auf Step 5 ─────────────────────────────
  // Rückrollung 14.06.2026: Name + Telefon wurden zurück in den Kostenrechner
  // verlegt (siehe project 3/components/calculator/MultiStepForm.tsx). Hier
  // bleiben sie als optionale Felder bestehen, damit:
  //  - alte localStorage-Drafts mit gesetzten Werten weiterhin laden
  //  - PatientFormMapper-Tests weiterhin compilen (Mapping zu Mamamia ist
  //    parallel zur Frontend-Änderung entfernt worden)
  // Step 5 UI rendert sie NICHT mehr — Lead hat sie schon vom Funnel.
  /** @deprecated kommt jetzt aus dem Kostenrechner (lead.vorname/nachname). */
  name: string;
  /** @deprecated kommt jetzt aus dem Kostenrechner (lead.telefon). */
  phone: string;
  // Voraussichtliches Startdatum — optional, ISO YYYY-MM-DD. Wird auf
  // Step 5 (Kontakt) abgefragt. Kann ans Mamamia Customer.arrival_at
  // weitergegeben werden (Matching-relevant); wenn der Mapper das Feld
  // nicht setzt, bleibt es im PatientForm-State (localStorage) erhalten.
  startDate: string;
  // Pflegedienst follow-up: required by Mamamia panel form when
  // pflegedienst='Ja'/'Geplant' (otherwise the customer is incomplete and
  // can't be matched). Frequency = how often, tasks = which tasks the
  // Pflegedienst handles. Combined into customer.day_care_facility_description
  // (with _de/_en/_pl locales) on the patient-form save.
  // pflegedienstAufgaben holds a comma-separated list of the user-picked
  // task labels (e.g. "Grundpflege, Wundversorgung").
  pflegedienstHaeufigkeit: string;
  pflegedienstAufgaben: string;
  tiere: string; unterbringung: string; badezimmer: string; aufgaben: string;
  // PK-Wünsche
  wunschGeschlecht: string; rauchen: string; sonstigeWuensche: string;
  // Führerschein Ja/Nein — editable, writes customer_caregiver_wish.driving_license.
  fuehrerschein: string;
  // Getriebe — only shown when fuehrerschein='Ja'. Maps to driving_license_gearbox.
  wunschGetriebe: string;
}

// Step 5 hieß "Kontakt" als dort noch Name + Telefon abgefragt wurden.
// Seit Rückrollung 14.06.2026 fragt Step 5 nur noch das Startdatum ab —
// Label entsprechend geändert.
export const STEP_LABELS = ['Zur Person', 'Pflegebedarf', 'Wohnsituation', 'Wünsche zur PK', 'Startdatum'];
