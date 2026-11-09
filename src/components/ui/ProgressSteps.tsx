// Fortschritt im Formular: Segmente über die ganze Breite, darunter „Schritt 2 von 4 · Pflegebedarf".
// Zurückspringen geht nur zu früheren Schritten (wie bisher im Stepper), nie nach vorn.
export function ProgressSteps({
  schritte, aktuell, onSchritt, schlicht = false, onZurueck, anteil,
}: {
  schritte: readonly string[]; aktuell: number; onSchritt: (i: number) => void; schlicht?: boolean;
  /** Nur mit `schlicht`: Füllung des Balkens (0–1) statt „aktueller Schritt / Anzahl“, z. B. halber erster Schritt. */
  anteil?: number;
  /** Nur mit `schlicht`: „Zurück“ klein rechts in der Zeile, wenn die Seite keine eigene Knopfleiste zeigt. */
  onZurueck?: () => void;
}) {
  // Minimal-Einstieg (Registry #147, Martin 08.11.: „das Formular mit diesen Strichen … schwer zu erkennen“): erst die Zeile
  // „Schritt 1 von 4 · Zur Person“, darunter EIN dünner Balken. Unten steht nur EIN Knopf (Martin: „keinen Weiter-Button“),
  // darum „Zurück“ hier rechts in der Zeile.
  if (schlicht) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[14.5px] text-pm-muted">
            <span>Schritt {aktuell + 1} von {schritte.length}</span>
            <span aria-hidden="true"> · </span>
            <b className="whitespace-nowrap font-semibold text-pm-ink">{schritte[aktuell]}</b>
          </p>
          {onZurueck && (
            <button
              type="button"
              onClick={onZurueck}
              className="-my-3 inline-flex min-h-[44px] flex-none items-center text-[14.5px] font-medium text-pm-muted underline decoration-pm-line underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pm-taupe"
            >
              Zurück
            </button>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Fortschritt"
          aria-valuemin={1}
          aria-valuemax={schritte.length}
          aria-valuenow={aktuell + 1}
          className="mt-2 h-1 overflow-hidden rounded-full bg-white"
        >
          <span className="block h-full rounded-full bg-pm-coral transition-[width] duration-300" style={{ width: `${(anteil ?? (aktuell + 1) / schritte.length) * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Fortschritt"
        aria-valuemin={1}
        aria-valuemax={schritte.length}
        aria-valuenow={aktuell + 1}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${schritte.length}, minmax(0, 1fr))` }}
      >
        {schritte.map((name, i) => {
          const balken = <span className={`block h-1.5 rounded-full ${i <= aktuell ? 'bg-pm-taupe' : 'bg-pm-line'}`} />;
          return i < aktuell ? (
            <button
              key={name}
              type="button"
              onClick={() => onSchritt(i)}
              aria-label={`Zurück zu Schritt ${i + 1}: ${name}`}
              className="py-[19px] -my-[19px] rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-pm-taupe"
            >
              {balken}
            </button>
          ) : (
            <span key={name} className="py-[19px] -my-[19px]">{balken}</span>
          );
        })}
      </div>
      <p className="mt-3 text-[13.5px] text-pm-muted">
        <span>Schritt {aktuell + 1} von {schritte.length}</span>
        <span aria-hidden="true"> · </span>
        <b className="font-bold text-pm-ink">{schritte[aktuell]}</b>
      </p>
    </div>
  );
}
