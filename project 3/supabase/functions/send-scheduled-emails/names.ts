/*
 * Eigennamen für Anreden sauber schreiben.
 *
 * ⚠️ ZWEITE KOPIE von `capitalize` aus `project 3/lib/email.ts` — Edge Functions
 * können nicht aus `lib/` importieren (CI-Deploy kopiert nur den functions-Ordner,
 * gleiche Situation wie bei `appendJobParam`/`portal-url.ts`). Änderungen IMMER
 * in beiden Dateien nachziehen. Dasselbe gilt für `cleanNamePart` weiter unten:
 * dort heisst die Schwester-Funktion `usableNamePart` (project 3/lib/calculation).
 *
 * Regeln (Martin, 10.08.2026 — „wir haben doch keine Großbuchstaben, immer nur
 * der erste Buchstabe"):
 *  - ALL-CAPS wird normalisiert: „RUPPERT" → „Ruppert"
 *  - gemischte Schreibweise bleibt unangetastet: „McDonald" → „McDonald"
 *  - Kleinschreibung wird großgeschrieben: „ruppert" → „Ruppert"
 *  - Bindestrich- und Leerzeichen-Teile einzeln: „MÜLLER-LÜDENSCHEIDT" →
 *    „Müller-Lüdenscheidt"
 *  - Namens-Partikel bleiben klein, weil im Text eine Anrede davorsteht:
 *    „Hallo Herr von Stein", nicht „… Herr Von Stein"
 */

const NAME_PARTICLES = new Set([
  'von', 'vom', 'van', 'de', 'del', 'della', 'di', 'da', 'dos', 'das',
  'der', 'den', 'ten', 'ter', 'zu', 'zur', 'zum', 'le', 'la', 'y', 'af', 'of',
]);

function capWord(w: string): string {
  if (!w) return w;
  // Nur SCHREIT der Name, wird der Rest kleingeschrieben — sonst bleibt die
  // bewusste Schreibweise erhalten (McDonald, DiCaprio).
  const rest = w === w.toUpperCase() ? w.slice(1).toLowerCase() : w.slice(1);
  return w.charAt(0).toUpperCase() + rest;
}

export function capitalizeName(name: string): string {
  if (!name) return name;

  return name.trim().split(/\s+/).map((word) =>
    word.split('-').map((part) =>
      NAME_PARTICLES.has(part.toLowerCase()) ? part.toLowerCase() : capWord(part),
    ).join('-'),
  ).join(' ');
}

// Ein Namensteil ist nur brauchbar, wenn er wie ein echter Name aussieht:
// mindestens ein Buchstabe, keine übrig gebliebenen Klammer-Notizen wie
// „(Sohn)". Schützt vor Alt-/Müll-Daten, damit nie „Hallo Herr (Sohn),"
// herausgeht. Lag bis 09.09.2026 in index.ts — steht hier, weil es ein reiner
// Namens-Helfer ist und index.ts beim Import einen Server startet (nicht
// testbar).
export function cleanNamePart(part?: string | null): string {
  if (!part) return "";
  const trimmed = part.trim();
  if (/[([{)\]}]/.test(trimmed)) return "";            // bracketed note, e.g. "(Sohn)"
  if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) return "";          // no letters at all
  if (trimmed.replace(/\.$/, "").length < 2) return ""; // bare initial, e.g. "M" / "M."
  return trimmed;
}

// Zuordnungs-Schlüssel für die Nachfass-3-Antwortknöpfe („Habe noch Interesse",
// „Doch nicht relevant" …). Diese Knöpfe öffnen eine mailto: an info@, und der
// Betreff ist die EINZIGE Zuordnungshilfe, sobald die Antwort aus einem anderen
// Postfach kommt als dem, an das wir geschrieben haben. Fall Oehlert/Stein
// (08.09.2026): die Antwort lief über ein zweites t-online-Konto — im Postfach
// stand ein Kunde als Absender, im Betreff ein anderer. Beide waren echte offene
// Leads, also echtes Risiko, den Falschen auf „nicht interessiert" zu setzen.
// Darum der NAME zuerst (den sucht das Team im Panel) und die Adresse in
// Klammern dahinter (der eindeutige Schlüssel). Ohne brauchbaren Namen bleibt es
// beim bisherigen Verhalten: nur E-Mail, sonst die Lead-ID.
export function buildLeadRef(lead: {
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  id: string;
}): string {
  const name = [lead.vorname, lead.nachname]
    .map((teil) => capitalizeName(cleanNamePart(teil)))
    .filter(Boolean)
    .join(" ");
  const kontakt = lead.email || lead.id;
  return name ? `${name} (${kontakt})` : kontakt;
}
