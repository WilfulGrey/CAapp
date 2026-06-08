// Kontextuelle Chat-Vorschläge für den PflegekraftChat.
//
// Idee: statt generischer Chips ("Demenz?", "Führerschein?") fragen wir
// gezielt nach den Punkten, die im Patienten-/Auftragsprofil tatsächlich
// stehen — die Pflegekraft kennt ihr eigenes Profil und kann mit ja/nein
// antworten. Es wird KEIN Matching betrieben (kein "PK kann das nicht,
// also frag X" — siehe Nutzer-Feedback 2026-06-08): wir spiegeln nur die
// für die Stelle relevanten Patient/Customer-Angaben in eine Frage.
//
// Die Input-Form ist bewusst flach + primitiv gehalten, damit der Aufrufer
// (PflegekraftChat) nicht an konkrete Mamamia-Typen koppelt. Vor dem
// Aufruf werden die richtigen Felder aus Lead.kalkulation.formularDaten
// und der konkreten Bewerbung (application.arrival_at/departure_at) +
// Mamamia-Customer (smoking_household) + Patient (dementia/incontinence)
// extrahiert.
//
// Reihenfolge der Chips (priority numerisch absteigend = wichtiger):
//   100  Anreise — nur bei tatsächlicher Abweichung Kunde ↔ Bewerbung
//    95  Abreise — wenn Bewerbung Datum hat, immer "länger möglich?"
//    90  Couple-Care (Ehepaar / 2 Personen)
//    70  Mobilität (Rollstuhl/Bettlägerig)
//    60  Demenz
//    50  Inkontinenz
//    40  Nachteinsätze
//    30  Deutschkenntnisse (Selbsteinschätzung, bestätigend)
//    20  Raucher (nur wenn PK raucht UND Nichtraucher-Haushalt)
//
// Bewusst NICHT enthalten:
// • Pflegegrad — wir fragen ohnehin konkret nach den einzelnen Bedarfen
//   (Mobilität / Demenz / Inkontinenz / Nachteinsätze), die Aggregat-Zahl
//   "Pflegegrad 4" lenkt nur ab.
// • Generische "passt das Datum?" — überflüssig wenn Kundenwunsch + PK-
//   Angebot identisch sind. Frage entsteht erst bei einer Abweichung.

import type { FormularDaten } from '../../../supabase/functions/onboard-to-mamamia/types';

export interface ChatSuggestion {
  /** Eindeutige ID — wird als Schlüssel für React-Listen + analytics
   *  verwendet (welcher Chip wurde am häufigsten geklickt?). */
  id: string;
  /** Endgültiger Frage-Text der dem Kunden im Chip angezeigt + bei Klick
   *  in die Textarea gesetzt wird. Kein Markdown, keine Übersetzung. */
  text: string;
  /** Reihenfolge: höher = wichtiger / weiter oben. */
  priority: number;
}

export interface SuggestionContext {
  /** Kostenrechner-Antworten aus dem Lead. Hauptquelle für die meisten
   *  Chips. Fehlt → entsprechend weniger Vorschläge, kein Fehler. */
  formularDaten?: FormularDaten | null;
  /** Anreise-Datum, das die Pflegekraft in der Bewerbung vorgeschlagen
   *  hat (ISO YYYY-MM-DD). */
  applicationArrivalAt?: string | null;
  /** Abreise-Datum, das die Pflegekraft in der Bewerbung vorgeschlagen
   *  hat (ISO YYYY-MM-DD). */
  applicationDepartureAt?: string | null;
  /** Vom Kunden gewünschtes Anreise-Datum (ISO YYYY-MM-DD). Quelle:
   *  Mamamia Customer.arrival_at — gesetzt nach dem ersten Patient-
   *  Form-Save. Wird mit `applicationArrivalAt` verglichen; nur bei
   *  Abweichung kommt der Anreise-Chip. Fehlt der Wert, kommt kein
   *  Anreise-Chip (wir wollen keine Vermutung anstellen). */
  customerArrivalAt?: string | null;
  /** Patient hat Demenz — true wenn Mamamia patient.dementia='yes' ODER
   *  Kostenrechner-Fallback fd.demenz='ja'. Aufrufer wertet das aus. */
  patientHasDementia?: boolean;
  /** Patient ist inkontinent — Sammelflag (Mamamia: incontinence ODER
   *  incontinence_feces ODER incontinence_urine). */
  patientHasIncontinence?: boolean;
  /** Haushalt raucht — wenn 'no' und PK raucht, kommt der Raucher-Chip. */
  householdSmoking?: 'yes' | 'yes_outside' | 'no' | null;
  /** Smoking-Status der PK aus dem Caregiver-Profil. Nur wenn ≠ 'no'
   *  feuert der Raucher-Chip. Fehlt → Chip wird nicht gezeigt. */
  nurseSmoking?: 'no' | 'yes' | 'yes_outside' | null;
  /** Anrede für den Patienten ("Mein Vater", "Meine Mutter", "Mein Mann"
   *  …). Optional — wenn unbekannt fallen wir auf "Der Patient" zurück. */
  patientLabel?: string | null;
}

/**
 * Formatiert ein ISO-Datum als "TT.MM." (z.B. "22.07."). Kürze ist wichtig,
 * weil mehrere Datums-Chips nebeneinander stehen können. Jahr wird hier
 * NICHT angehängt — Anreise + Abreise sind beide im selben Jahr im 99 %-Fall;
 * sollte sich ein Edge-Case mit Jahreswechsel ergeben, wäre eine eigene
 * Logik nötig.
 */
function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // Mamamia gibt "YYYY-MM-DD" — wir umgehen Date-Parsing-Quirks (Timezone)
  // und nehmen die Strings direkt aus.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [, , month, day] = m;
  return `${day}.${month}.`;
}

/**
 * Liefert eine geordnete Liste kontextueller Frage-Chips für den Chat
 * mit der konkreten Pflegekraft. Reihenfolge stabil & deterministisch:
 * absteigend nach `priority`, bei Gleichstand nach ID — kein Math.random,
 * keine Datums-Abhängigkeit (Tests bleiben so trivial).
 */
export function buildChatSuggestions(ctx: SuggestionContext): ChatSuggestion[] {
  const out: ChatSuggestion[] = [];
  const fd = ctx.formularDaten ?? {};
  const patientLabel = ctx.patientLabel?.trim() || 'Der Patient';

  // ─── 1) Anreise — Frage nur bei tatsächlicher Abweichung ─────────────
  // Generisches "passt das Datum für Sie?" hilft niemandem — die Frage
  // entsteht erst, wenn das Bewerbungs-Datum NICHT mit dem Kundenwunsch
  // übereinstimmt. Wir zeigen das konkret: "Wir bräuchten Sie schon
  // ab dem 15.05. — könnten Sie früher anreisen statt am 19.05.?".
  const appArrIso = ctx.applicationArrivalAt;
  const custArrIso = ctx.customerArrivalAt;
  if (appArrIso && custArrIso && appArrIso !== custArrIso) {
    const appShort = formatShortDate(appArrIso);
    const custShort = formatShortDate(custArrIso);
    if (appShort && custShort) {
      if (custArrIso < appArrIso) {
        out.push({
          id: 'arrival-earlier',
          text: `Wir bräuchten Sie schon ab dem ${custShort} — könnten Sie früher anreisen statt am ${appShort}?`,
          priority: 100,
        });
      } else {
        out.push({
          id: 'arrival-later',
          text: `Wir bräuchten Sie erst ab dem ${custShort} — könnten Sie später anreisen statt am ${appShort}?`,
          priority: 100,
        });
      }
    }
  }

  // ─── 2) Abreise — immer fragen, ob länger möglich ────────────────────
  // Wenn die Bewerbung ein Abreisedatum vorschlägt, fragen wir, ob die PK
  // länger bleiben würde. Im Standardfall schlägt die PK 8 Wochen vor —
  // viele Kunden brauchen aber länger, und das herausfinden zu lassen
  // ist genau der Sinn dieses Chats. Kein Vergleich nötig, kein Risiko
  // einer Falsch-Frage: wenn PK nicht länger kann, sagt sie das.
  const appDep = formatShortDate(ctx.applicationDepartureAt);
  if (appDep) {
    out.push({
      id: 'departure-longer',
      text: `Sie schlagen eine Abreise am ${appDep} vor — wären Sie offen für länger?`,
      priority: 95,
    });
  }

  // ─── 2) Couple-Care (2 Personen) ─────────────────────────────────────
  if ((fd.betreuung_fuer ?? '').toString() === 'ehepaar') {
    out.push({
      id: 'couple-care',
      text: 'Es geht um die Pflege für ein Ehepaar (2 Personen) — passt das für Sie?',
      priority: 90,
    });
  }

  // Pflegegrad bewusst NICHT als eigener Chip — die Aggregat-Zahl 4 oder 5
  // sagt der PK nichts, was sie nicht schon aus den konkreten Folgefragen
  // (Mobilität / Demenz / Inkontinenz / Nachteinsätze) ableiten kann. Wir
  // lassen die Aggregat-Frage weg, um den Chat fokussiert zu halten.

  // ─── Mobilität ───────────────────────────────────────────────────────
  const mob = (fd.mobilitaet ?? '').toString();
  if (mob === 'rollstuhl') {
    out.push({
      id: 'mobility-rollstuhl',
      text: `${patientLabel} ist rollstuhlpflichtig — schaffen Sie das?`,
      priority: 70,
    });
  } else if (mob === 'bettlaegerig') {
    out.push({
      id: 'mobility-bettlaegerig',
      text: `${patientLabel} ist bettlägerig — wäre das für Sie ok?`,
      priority: 70,
    });
  }

  // ─── 5) Demenz ───────────────────────────────────────────────────────
  // Quelle bleibt dem Aufrufer überlassen — er konsolidiert Mamamia-Patient
  // (dementia='yes') und Kostenrechner-Fallback (fd.demenz='ja') zu einem
  // Boolean.
  if (ctx.patientHasDementia) {
    out.push({
      id: 'demenz',
      text: `${patientLabel} hat Demenz — kennen Sie sich damit aus?`,
      priority: 60,
    });
  }

  // ─── 6) Inkontinenz ──────────────────────────────────────────────────
  // Nur aus Patient-Form (Mamamia) verfügbar. Aufrufer fasst die drei
  // Mamamia-Flags (incontinence / _feces / _urine) zu einem Boolean
  // zusammen — wir fragen einfach "inkontinent", egal welche Art (das
  // vertieft die PK selbst).
  if (ctx.patientHasIncontinence) {
    out.push({
      id: 'inkontinenz',
      text: `${patientLabel} ist inkontinent — wäre das für Sie ok?`,
      priority: 50,
    });
  }

  // ─── 7) Nachteinsätze ────────────────────────────────────────────────
  // Schon "gelegentlich" verlangt regelmäßiges Aufstehen — Frage ist also
  // sobald ≠ "nein" sinnvoll. Bei "mehrmals" verschärfen wir die Zahl,
  // damit die PK weiß, was sie erwartet.
  const nacht = (fd.nachteinsaetze ?? '').toString();
  if (nacht === 'mehrmals') {
    out.push({
      id: 'nacht-mehrmals',
      text: 'Wir brauchen jemanden, der nachts mehrmals aufstehen kann — schaffen Sie das?',
      priority: 40,
    });
  } else if (nacht === 'taeglich' || nacht === 'gelegentlich') {
    out.push({
      id: 'nacht-regelmaessig',
      text: 'Wir brauchen jemanden, der nachts 1–2x aufstehen kann — schaffen Sie das?',
      priority: 40,
    });
  }

  // ─── Deutschkenntnisse (Selbsteinschätzung passend zum gewählten Level) ─
  // Strikt-Filter sorgt dafür, dass die PK im richtigen Sprach-Bucket
  // liegt — die Selbst-Beschreibung der PK gibt dem Kunden trotzdem
  // Sicherheit. Wir formulieren die Frage abhängig vom KUNDEN-Wunsch,
  // damit klar ist, was erwartet wird (grundlegend ≠ sehr gut):
  //   • grundlegend  → "können Sie sich grundlegend verständigen?"
  //   • kommunikativ → "können Sie sich gut verständigen?"
  //   • sehr-gut     → "sprechen Sie sehr gut Deutsch?"
  // Andere/fehlende Werte → kein Chip.
  const deutsch = (fd.deutschkenntnisse ?? '').toString();
  let deutschText: string | null = null;
  if (deutsch === 'grundlegend') {
    deutschText = 'Können Sie sich auf Deutsch grundlegend verständigen?';
  } else if (deutsch === 'kommunikativ') {
    deutschText = 'Können Sie sich gut auf Deutsch mit uns verständigen?';
  } else if (deutsch === 'sehr-gut') {
    deutschText = 'Sprechen Sie sehr gut Deutsch — wie würden Sie Ihr Niveau einschätzen?';
  }
  if (deutschText) {
    out.push({
      id: 'deutschkenntnisse',
      text: deutschText,
      priority: 30,
    });
  }

  // ─── 9) Raucher / Nichtraucher-Haushalt ──────────────────────────────
  // Nur dann fragen, wenn (a) wir wissen dass die PK raucht UND (b) der
  // Haushalt Nichtraucher ist. Sonst keine Frage — sie ist sinnlos.
  // "yes_outside" zählt als raucht (sie tut es draußen) — der Haushalt
  // bekommt aber trotzdem die Klärung, ob die Praxis übereinstimmt.
  const nurseSmokes = ctx.nurseSmoking === 'yes' || ctx.nurseSmoking === 'yes_outside';
  const householdNonSmoking = ctx.householdSmoking === 'no';
  if (nurseSmokes && householdNonSmoking) {
    out.push({
      id: 'rauchen',
      text: 'Es geht um einen Nichtraucher-Haushalt — wäre es für Sie ok, nur draußen zu rauchen? Und wie viele Zigaretten pro Tag?',
      priority: 20,
    });
  }

  // Deterministische Sortierung: priority DESC, dann ID ASC für Stabilität.
  out.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  return out;
}
