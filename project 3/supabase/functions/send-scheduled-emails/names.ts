/*
 * Eigennamen für Anreden sauber schreiben.
 *
 * ⚠️ ZWEITE KOPIE von `capitalize` aus `project 3/lib/email.ts` — Edge Functions
 * können nicht aus `lib/` importieren (CI-Deploy kopiert nur den functions-Ordner,
 * gleiche Situation wie bei `appendJobParam`/`portal-url.ts`). Änderungen IMMER
 * in beiden Dateien nachziehen.
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
