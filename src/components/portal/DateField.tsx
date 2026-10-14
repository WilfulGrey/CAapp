import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { meldeFeldAufgeklappt } from '../ui/FormNav';

// React-Port des SA-Portal-DateField (mamamia-sadash
// resources/js/Components/DateField.vue): gleicher Look wie im
// SA-Kundenformular — eigener deutscher Kalender (Wochenstart Montag)
// statt des nativen, je nach Browser hässlichen type=date-Pickers.
// Wert bleibt ISO (yyyy-mm-dd), damit der Rest des Formulars und der
// Mapper unverändert weiterarbeiten.

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

// Lokales Heute — bewusst NICHT toISOString() (UTC), sonst springt das
// Mindestdatum zwischen 0 und 2 Uhr deutscher Zeit einen Tag zurück.
export function localTodayIso(): string {
  const t = new Date();
  return toIso(t.getFullYear(), t.getMonth(), t.getDate());
}

// Kalenderdatum aus einem mamamia-Wert („2026-10-15 00:00:00" oder
// „2026-10-15") als yyyy-mm-dd, sonst null. Bewusst ohne `new Date()`:
// Safari liest die Form mit Leerzeichen nicht zuverlässig, und ein
// Datum ohne Zeitzone soll der Tag bleiben, der dort steht.
export function kalenderTag(wert: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec((wert ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ── Kalender ganz ins Bild holen (Messung 13.10.: seit Registry #86 öffnete der Kalender am
// Handy zum großen Teil hinter der mitlaufenden Knopfleiste bzw. unter dem Bildschirmrand; stand
// das Feld direkt über der Leiste, waren nach dem Tipp 9 px Kalender zu sehen). Nur nach der
// Nutzeraktion „Kalender öffnen“, nie beim Mount, und nur den einen Scroller verschieben — kein
// scrollIntoView (das scrollt alle Vorfahren mit, auch das Fenster).

/** Abstand zwischen Kalender-Unterkante und Leiste bzw. Bildschirmrand. */
export const KALENDER_LUFT_UNTEN = 12;
/** Das Feld bleibt mindestens so weit unter dem Seitenkopf. */
const FELD_LUFT_OBEN = 8;

/** Um wie viele Pixel nach oben scrollen, damit der Kalender ganz sichtbar ist — höchstens so
 *  weit, dass das Datumsfeld nicht unter den Seitenkopf rutscht. Alle Werte in Bildschirm-
 *  koordinaten (getBoundingClientRect). `grenzeUnten` = Unterkante des sichtbaren Bereichs oder
 *  Oberkante einer mitlaufenden Knopfleiste, je nachdem, was höher liegt. */
export function kalenderNachschub({ kalenderUnten, feldOben, kopfUnten, grenzeUnten }: {
  kalenderUnten: number; feldOben: number; kopfUnten: number; grenzeUnten: number;
}): number {
  const noetig = kalenderUnten - (grenzeUnten - KALENDER_LUFT_UNTEN);
  const spielraum = feldOben - (kopfUnten + FELD_LUFT_OBEN);
  return Math.max(0, Math.round(Math.min(noetig, spielraum)));
}

// Der Scroller: Desktop der Telefon-Rahmen (#portal-scroll-container, overflow-y auto), am Handy
// hat der kein overflow und das Fenster scrollt — dieselbe Unterscheidung wie
// AngebotCard.scrollPortalToTop, hier über den nächsten selbst scrollenden Vorfahren. null = Fenster.
function scrollerVon(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

const klebt = (el: Element) => {
  const pos = getComputedStyle(el).position;
  return pos === 'sticky' || pos === 'fixed';
};

/** Wie viel Höhe ein Monat mit sechs Wochenzeilen mehr braucht als der angezeigte (4 oder 5 Zeilen). Beim Öffnen
 *  gleich mit eingeplant, damit Blättern nie scrollen muss (Gegenprüfung 13.10.: scrollte der Kalender beim
 *  Wechsel Oktober → November nach, rutschte „Nächster Monat“ unter dem Daumen 46 px nach oben). */
function platzFuerSechsZeilen(tage: HTMLElement): number {
  const zeilen = Math.ceil(tage.children.length / 7); // Leerfelder vor dem 1. + Tage
  if (zeilen <= 0 || zeilen >= 6) return 0;
  const luecke = parseFloat(getComputedStyle(tage).rowGap) || 0;
  const zeile = (tage.getBoundingClientRect().height + luecke) / zeilen;
  return Math.round((6 - zeilen) * zeile);
}

/** Scrollt, falls nötig, und gibt zurück, um wie viele Pixel (0 = gar nicht). `platzUnten` = zusätzliche Höhe,
 *  die unter dem Kalender frei bleiben soll. */
function kalenderEinblenden(feld: HTMLElement, kalender: HTMLElement, platzUnten = 0): number {
  const scroller = scrollerVon(feld);
  // Sichtbarer Bereich: visualViewport (iOS mit Tastatur oder Zoom), sonst das Fenster;
  // am Desktop zusätzlich auf den Rahmen beschnitten.
  const vv = window.visualViewport;
  let oben = vv ? vv.offsetTop : 0;
  let unten = vv ? vv.offsetTop + vv.height : window.innerHeight;
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    oben = Math.max(oben, r.top);
    unten = Math.min(unten, r.bottom);
  }
  // Mitlaufender Seitenkopf (Portal-Navigation, sticky top-0).
  let kopfUnten = oben;
  document.querySelectorAll('nav, header').forEach(el => {
    if (!klebt(el)) return;
    const r = el.getBoundingClientRect();
    if (r.top <= oben + 1 && r.bottom > kopfUnten) kopfUnten = r.bottom;
  });
  // Mitlaufende Knopfleiste (FormNav): ihre tatsächliche Höhe, nur solange sie unten klebt.
  // Während der Kalender offen ist, läuft sie im Fluss (FormNav), dann zählt hier nichts.
  let grenzeUnten = unten;
  document.querySelectorAll('[data-knopfleiste]').forEach(el => {
    if (!klebt(el)) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > oben && r.top < grenzeUnten) grenzeUnten = r.top;
  });
  const um = kalenderNachschub({
    kalenderUnten: kalender.getBoundingClientRect().bottom + platzUnten,
    feldOben: feld.getBoundingClientRect().top,
    kopfUnten,
    grenzeUnten,
  });
  if (um <= 0) return 0;
  if (scroller) {
    if (typeof scroller.scrollBy === 'function') scroller.scrollBy({ top: um, behavior: 'smooth' });
    else scroller.scrollTop += um;
  } else {
    window.scrollBy({ top: um, behavior: 'smooth' });
  }
  return um;
}

// ── Tipps, die begannen, während der Kalender noch ins Bild glitt, zählen im Kalender nicht. Gegenprüfung 13.10.:
// Ein schneller zweiter Tipp (oder Doppelklick) aufs Feld in der unteren Bildhälfte traf nach dem Einblend-Scroll
// einen Tag und setzte still ein Datum. Maßgeblich ist der Moment des Aufsetzens, nicht der des click.

/** Gesperrt mindestens so lange nach dem Start des Einblend-Scrolls … */
export const EINBLEND_SPERRE_MS = 450;
/** … und, solange noch gescrollt wird, bis so lange nach dem letzten Scroll-Ereignis … */
export const SCROLL_RUHE_MS = 80;
/** … höchstens aber so lange nach dem Start. */
export const EINBLEND_SPERRE_MAX_MS = 1000;

/** Ab so viel Bewegung zwischen Aufsetzen und Loslassen ist es ein Wisch, kein Tipp. */
const TIPP_TOLERANZ = 10;
/** Kommt nach einem Tipp kein click (iOS feuert auf nicht klickbaren Flächen keinen), schließt
 *  der Kalender nach dieser Zeit trotzdem. */
const ZU_OHNE_CLICK_MS = 500;

export const DateField: FC<{
  value: string; // ISO yyyy-mm-dd oder ''
  onChange: (iso: string) => void;
  min?: string; // ISO — frühere Tage sind ausgegraut
  invalid?: boolean; // Pflichtfeld-Optik (rote Umrandung solange leer)
  placeholder?: string;
  /** Kalender wurde geöffnet (Tipp aufs Feld). Für Messpunkte des Aufrufers; ändert am Kalender nichts. */
  onGeoeffnet?: () => void;
  /** Kalender ist wieder zu — auch wenn das Feld verschwindet, solange er offen ist (z. B. „Zurück"/„Weiter").
   *  `gewaehlt` = in diesem Öffnen wurde ein Tag gewählt. */
  onGeschlossen?: (gewaehlt: boolean) => void;
}> = ({ value, onChange, min, invalid, placeholder = 'Datum wählen', onGeoeffnet, onGeschlossen }) => {
  const [open, setOpen] = useState(false);
  // Rückrufe ohne eigenen Zustand: immer die aktuellen nehmen, damit das Öffnen/Schließen unten nur an `open` hängt.
  const geoeffnetRef = useRef(onGeoeffnet);
  const geschlossenRef = useRef(onGeschlossen);
  geoeffnetRef.current = onGeoeffnet;
  geschlossenRef.current = onGeschlossen;
  // In diesem Öffnen einen Tag gewählt?
  const gewaehltRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    gewaehltRef.current = false;
    geoeffnetRef.current?.();
    return () => geschlossenRef.current?.(gewaehltRef.current);
  }, [open]);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const rootRef = useRef<HTMLDivElement>(null);
  const kalenderRef = useRef<HTMLDivElement>(null);
  const tageRef = useRef<HTMLDivElement>(null);
  // Bis wann (performance.now) Tipps im Kalender nicht zählen, und ob der letzte begann, solange das galt.
  const sperreBis = useRef(0);
  const druckInSperre = useRef(false);
  const merkeDruck = () => { druckInSperre.current = performance.now() < sperreBis.current; };
  /** Tipp im Kalender nur ausführen, wenn er nicht während des Einblend-Scrolls begann. */
  const nurNachSperre = (aktion: () => void) => () => { if (!druckInSperre.current) aktion(); };

  // Schließen bei Berührung außerhalb nur bei einem echten Tipp. Bis 13.10. schloss jedes
  // touchstart außerhalb: Ein Wisch, der auf der Knopfleiste begann, klappte den Kalender ohne
  // Datum zu, und weil das VOR dem Klick geschah, rutschte die Seite unter dem Finger weg und der
  // Klick traf „Zurück“ oder „Weiter“. Jetzt: Aufsetzen merken; Wisch (> 10 px, pointercancel)
  // oder Scrollen dazwischen schließt nicht; nach dem Loslassen erst mit dem click schließen,
  // damit der Klick dort landet, wo der Kunde getippt hat.
  useEffect(() => {
    if (!open) return;
    let druck: { x: number; y: number } | null = null;
    let tipp = false;
    let timer: number | undefined;
    const aussen = (t: EventTarget | null) =>
      !!rootRef.current && t instanceof Node && !rootRef.current.contains(t);
    const weit = (e: PointerEvent, d: { x: number; y: number }) =>
      Math.hypot(e.clientX - d.x, e.clientY - d.y) > TIPP_TOLERANZ;
    const zu = () => { window.clearTimeout(timer); tipp = false; setOpen(false); };
    const onDown = (e: PointerEvent) => {
      tipp = false;
      druck = e.isPrimary !== false && aussen(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onMove = (e: PointerEvent) => { if (druck && weit(e, druck)) druck = null; };
    const vergessen = () => { druck = null; };
    const onUp = (e: PointerEvent) => {
      const d = druck;
      druck = null;
      if (!d || !aussen(e.target) || weit(e, d)) return;
      tipp = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(zu, ZU_OHNE_CLICK_MS);
    };
    const onClick = () => { if (tipp) zu(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', vergessen);
    document.addEventListener('scroll', vergessen, true);
    document.addEventListener('click', onClick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', vergessen);
      document.removeEventListener('scroll', vergessen, true);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  // Solange der Kalender offen ist, läuft die Knopfleiste im Fluss (FormNav). Layout-Effekt,
  // damit die Leiste schon vor dem ersten Bild mit offenem Kalender nicht mehr klebt.
  useLayoutEffect(() => {
    if (!open) return;
    meldeFeldAufgeklappt(true);
    return () => meldeFeldAufgeklappt(false);
  }, [open]);

  // Nur nach dem Öffnen den Kalender ganz ins Bild holen, mit Platz für einen Monat mit sechs
  // Wochenzeilen. Beim Blättern wird nicht gescrollt: Der Monatskopf mit „Nächster Monat“ bleibt,
  // wo er ist, der Kalender wächst oder schrumpft nur nach unten. rAF: erst wenn auch die
  // Knopfleiste umgestellt ist. Läuft dabei ein Scroll, zählen Tipps im Kalender bis zu seinem Ende
  // nicht (mindestens EINBLEND_SPERRE_MS, solange noch Scroll-Ereignisse kommen länger).
  useEffect(() => {
    if (!open) return;
    let aufraeumen: (() => void) | undefined;
    const id = window.requestAnimationFrame(() => {
      const feld = rootRef.current;
      const kalender = kalenderRef.current;
      if (!feld || !kalender) return;
      const platz = tageRef.current ? platzFuerSechsZeilen(tageRef.current) : 0;
      if (kalenderEinblenden(feld, kalender, platz) <= 0) return;
      const start = performance.now();
      sperreBis.current = start + EINBLEND_SPERRE_MS;
      const imScroll = () => {
        const jetzt = performance.now();
        if (jetzt - start < EINBLEND_SPERRE_MAX_MS) sperreBis.current = Math.max(sperreBis.current, jetzt + SCROLL_RUHE_MS);
      };
      document.addEventListener('scroll', imScroll, true);
      aufraeumen = () => document.removeEventListener('scroll', imScroll, true);
    });
    return () => {
      window.cancelAnimationFrame(id);
      aufraeumen?.();
      sperreBis.current = 0;
      druckInSperre.current = false;
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      // Beim Öffnen auf den gewählten Monat (sonst heute) springen.
      const base = value ? new Date(`${value}T00:00:00`) : new Date();
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
    setOpen(o => !o);
  };

  // Wochenstart Montag: getDay() liefert So=0 → Offset (getDay()+6)%7.
  const lead = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayIso = localTodayIso();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  };

  const display = value ? value.split('-').reverse().join('.') : '';

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={toggle}
        className={`w-full min-h-[48px] rounded-[14px] border-[1.5px] px-3.5 py-2.5 text-[16px] text-left bg-white flex items-center justify-between gap-2 focus:outline-none focus:border-pm-taupe focus:ring-2 focus:ring-pm-taupe/15 transition-colors ${invalid ? 'border-pm-error' : 'border-pm-chip'}`}
      >
        <span className={display ? 'text-pm-ink' : 'text-pm-mute'}>{display || placeholder}</span>
        <svg aria-hidden="true" className="w-5 h-5 text-pm-taupe flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        // Bewusst KEIN absolute-Dropdown: die Angebots-Karte hat
        // overflow-hidden und würde den Kalender abschneiden (Martin,
        // Screenshot 08.07.). Im Fluss gerendert wächst die Karte mit.
        <div
          ref={kalenderRef}
          onPointerDownCapture={merkeDruck}
          onTouchStartCapture={merkeDruck}
          className="mt-2 w-full max-w-[340px] bg-white border-[1.5px] border-pm-line rounded-[18px] p-3"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <button type="button" onClick={nurNachSperre(prevMonth)} aria-label="Voriger Monat" className="w-11 h-11 rounded-full hover:bg-pm-paper flex items-center justify-center text-pm-taupe-ink">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[15.5px] font-bold text-pm-ink">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nurNachSperre(nextMonth)} aria-label="Nächster Monat" className="w-11 h-11 rounded-full hover:bg-pm-paper flex items-center justify-center text-pm-taupe-ink">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(w => (
              <span key={w} className="h-7 flex items-center justify-center text-[12.5px] font-semibold text-pm-muted">{w}</span>
            ))}
          </div>
          <div ref={tageRef} className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const iso = toIso(viewYear, viewMonth, d);
              // !!(...) — sonst wäre disabled bei leerem min der String ''
              // (gleiche Falle wie im Vue-Original, dort als Bug gefixt).
              const disabled = !!(min && iso < min);
              const selected = value === iso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={nurNachSperre(() => { gewaehltRef.current = true; onChange(iso); setOpen(false); })}
                  className={`h-11 rounded-full text-[15px] flex items-center justify-center transition-colors ${
                    selected
                      ? 'bg-pm-taupe text-white font-bold'
                      : disabled
                        ? 'text-[#C9C4BC] cursor-default'
                        : 'text-pm-body hover:bg-pm-paper'
                  }${isToday && !selected ? ' font-bold ring-1 ring-inset ring-pm-taupe/50' : ''}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
