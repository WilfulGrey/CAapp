// Fortschritt im Formular: Segmente über die ganze Breite, darunter „Schritt 2 von 4 · Pflegebedarf".
// Zurückspringen geht nur zu früheren Schritten (wie bisher im Stepper), nie nach vorn.
export function ProgressSteps({
  schritte, aktuell, onSchritt, schlicht = false,
}: { schritte: readonly string[]; aktuell: number; onSchritt: (i: number) => void; schlicht?: boolean }) {
  // Minimal-Einstieg (Registry #147, Martin 08.11.: „das Formular mit diesen Strichen … schwer zu erkennen“): erst die Zeile
  // „Schritt 1 von 4 · Zur Person“, darunter EIN dünner Balken; zurück geht es über „Zurück“ in der Knopfleiste.
  if (schlicht) {
    return (
      <div>
        <p className="text-[13.5px] text-pm-muted">
          <span>Schritt {aktuell + 1} von {schritte.length}</span>
          <span aria-hidden="true"> · </span>
          <b className="font-semibold text-pm-ink">{schritte[aktuell]}</b>
        </p>
        <div
          role="progressbar"
          aria-label="Fortschritt"
          aria-valuemin={1}
          aria-valuemax={schritte.length}
          aria-valuenow={aktuell + 1}
          className="mt-2 h-1 overflow-hidden rounded-full bg-pm-line-soft"
        >
          <span className="block h-full rounded-full bg-pm-coral transition-[width] duration-300" style={{ width: `${((aktuell + 1) / schritte.length) * 100}%` }} />
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
