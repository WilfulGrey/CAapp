/**
 * Die EINE Stelle, die festlegt, wo der Kostenrechner landet, wenn man ihn
 * anspringt (CRO 15.08., Martin: "springe gleich an die richtige Stelle von
 * allen CTA-Buttons — also setze zentrale Marke").
 *
 * Vorher hatten sieben CTAs denselben Inline-Schnipsel
 * (`getElementById('calculator-form')` + `- 90`) kopiert, und der Wizard
 * richtete sich beim Start noch einmal selbst aus → sichtbarer Doppel-Scroll:
 * erst zum Formular springen, dann beim ersten Klick nochmal ruckeln.
 *
 * Jetzt zielt alles auf dieselbe Marke: Oberkante der Rechner-KARTE, knapp
 * unter dem Sticky-Header. Dadurch ist die Ausrichtung nach einem CTA-Sprung
 * bereits erfüllt und `isCalculatorAligned()` verhindert den zweiten Scroll.
 */

/** Luft zwischen Sticky-Header und Kartenoberkante. */
const GAP = 12;

/**
 * Sichtbare Rechner-Instanz finden. `page.tsx` rendert das Formular ZWEIMAL
 * (Mobile- und Desktop-Layout), beide mit `id="calculator-form"` —
 * `getElementById` liefert die erste und damit oft die ausgeblendete.
 */
function visibleCalculator(): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('#calculator-form')
  );
  return (
    nodes.find(
      (n) => n.offsetParent !== null || getComputedStyle(n).position === 'fixed'
    ) ??
    nodes[0] ??
    null
  );
}

/** Ziel-Scrollposition der Marke, oder null wenn kein Rechner im DOM ist. */
export function getCalculatorScrollTop(): number | null {
  const el = visibleCalculator();
  if (!el) return null;
  // Auf die KARTE zielen, nicht auf den Wrapper: dessen Padding schwankt
  // (pt-1 mobil / lg:pt-4), die Karte ist die sichtbare Kante.
  const card =
    el.querySelector<HTMLElement>('[data-calculator-card]') ?? el;
  const header = document.querySelector('header');
  const headerH = header
    ? Math.round(header.getBoundingClientRect().height)
    : 0;
  return Math.max(
    0,
    Math.round(card.getBoundingClientRect().top + window.pageYOffset - headerH - GAP)
  );
}

/** Steht die Karte bereits (nahezu) auf der Marke? */
export function isCalculatorAligned(tolerance = 28): boolean {
  const top = getCalculatorScrollTop();
  return top !== null && Math.abs(window.pageYOffset - top) <= tolerance;
}

/** Zur Marke scrollen. Alle CTAs der Seite benutzen genau das hier. */
export function scrollToCalculator(behavior: ScrollBehavior = 'smooth'): void {
  const top = getCalculatorScrollTop();
  if (top === null) return;
  window.scrollTo({ top, behavior });
}
