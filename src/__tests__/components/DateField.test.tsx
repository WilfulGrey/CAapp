import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  DateField, kalenderNachschub, KALENDER_LUFT_UNTEN, EINBLEND_SPERRE_MS, SCROLL_RUHE_MS, EINBLEND_SPERRE_MAX_MS,
} from '../../components/portal/DateField';
import { FormNav, meldeFeldAufgeklappt, TASTATUR_NACHLAUF_MS } from '../../components/ui/FormNav';

// jsdom kennt kein PointerEvent: als MouseEvent mit isPrimary nachbauen, damit clientX/Y ankommen.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventNachbau extends MouseEvent {
      isPrimary: boolean;
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.isPrimary = init.isPrimary ?? true;
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'touch';
      }
    }
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventNachbau;
  }
});

let scrollBy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollBy = vi.fn();
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
});
afterEach(() => vi.restoreAllMocks());

// Formular wie Schritt 3: Feld, darunter etwas anderes, unten die Knopfleiste.
function Formular({ onWeiter = () => {}, onDraussen = () => {}, start = '' }: { onWeiter?: () => void; onDraussen?: () => void; start?: string }) {
  const [wert, setWert] = useState(start);
  return (
    <div>
      <DateField value={wert} onChange={setWert} min="2000-01-01" />
      <button type="button" onClick={onDraussen}>Draußen</button>
      <FormNav onZurueck={() => {}} onWeiter={onWeiter} weiterText="Weiter →" />
    </div>
  );
}

const feldKnopf = () => screen.getByRole('button', { name: /Datum wählen|\d{2}\.\d{2}\.\d{4}/ });
const kalenderOffen = () => screen.queryByRole('button', { name: 'Voriger Monat' }) !== null;
const leiste = () => screen.getByRole('button', { name: 'Weiter →' }).closest('[data-knopfleiste]') as HTMLElement;
const tippen = (el: Element, x = 50, y = 50) => {
  fireEvent.pointerDown(el, { clientX: x, clientY: y });
  fireEvent.pointerUp(el, { clientX: x, clientY: y });
  fireEvent.click(el, { clientX: x, clientY: y });
};

describe('FormNav – im Fluss, solange ein Feld aufgeklappt ist', () => {
  it('klebt unten; ein aufgeklapptes Feld schaltet auf „im Fluss“, zu wieder zurück', () => {
    render(<FormNav onWeiter={() => {}} weiterText="Weiter →" />);
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
    act(() => meldeFeldAufgeklappt(true));
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    act(() => meldeFeldAufgeklappt(false));
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
  });

  it('zählt: erst wenn alle aufgeklappten Felder zu sind, klebt die Leiste wieder', () => {
    render(<FormNav onWeiter={() => {}} weiterText="Weiter →" />);
    act(() => { meldeFeldAufgeklappt(true); meldeFeldAufgeklappt(true); meldeFeldAufgeklappt(false); });
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    act(() => { meldeFeldAufgeklappt(false); meldeFeldAufgeklappt(false); });
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
  });
});

describe('FormNav – nach dem Verlassen eines Eingabefelds klebt die Leiste erst nach dem Tipp wieder', () => {
  afterEach(() => vi.useRealTimers());

  function MitFeld() {
    return (
      <div>
        <input aria-label="Ort" />
        <button type="button">Dorf/Land</button>
        <FormNav onWeiter={() => {}} weiterText="Weiter →" />
      </div>
    );
  }

  it('Fokus im Feld → im Fluss; Fokus weg → bleibt kurz im Fluss, klebt nach TASTATUR_NACHLAUF_MS', () => {
    vi.useFakeTimers();
    render(<MitFeld />);
    const feld = screen.getByRole('textbox', { name: 'Ort' });
    act(() => { fireEvent.focusIn(feld); });
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    act(() => { fireEvent.focusOut(feld); });
    // Zwischen mousedown und click: die Leiste darf noch nicht unter den Finger rücken.
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    act(() => { vi.advanceTimersByTime(TASTATUR_NACHLAUF_MS - 1); });
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    act(() => { vi.advanceTimersByTime(1); });
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
  });

  it('Fokus springt gleich ins nächste Feld → bleibt im Fluss, kein Zwischenkleben', () => {
    vi.useFakeTimers();
    render(<MitFeld />);
    const feld = screen.getByRole('textbox', { name: 'Ort' });
    act(() => { fireEvent.focusIn(feld); fireEvent.focusOut(feld); });
    act(() => { vi.advanceTimersByTime(100); fireEvent.focusIn(feld); });
    act(() => { vi.advanceTimersByTime(TASTATUR_NACHLAUF_MS * 2); });
    expect(leiste().className).not.toMatch(/\bsticky\b/);
  });

  it('Tipp auf eine Antwort direkt nach dem Feld kommt an (Leiste rückt nicht dazwischen)', () => {
    vi.useFakeTimers();
    const getippt = vi.fn();
    render(
      <div>
        <input aria-label="Ort" />
        <button type="button" onClick={getippt}>Dorf/Land</button>
        <FormNav onWeiter={() => {}} weiterText="Weiter →" />
      </div>,
    );
    const feld = screen.getByRole('textbox', { name: 'Ort' });
    act(() => { fireEvent.focusIn(feld); });
    const knopf = screen.getByRole('button', { name: 'Dorf/Land' });
    act(() => { fireEvent.mouseDown(knopf); fireEvent.focusOut(feld); });
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    act(() => { fireEvent.click(knopf); });
    expect(getippt).toHaveBeenCalledTimes(1);
  });
});

describe('DateField – Knopfleiste läuft mit offenem Kalender im Fluss', () => {
  it('Kalender auf → Leiste im Fluss; Tag gewählt → Leiste klebt wieder, Datum steht im Feld', async () => {
    render(<Formular />);
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
    await userEvent.click(feldKnopf());
    expect(kalenderOffen()).toBe(true);
    expect(leiste().className).not.toMatch(/\bsticky\b/);

    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await userEvent.click(screen.getAllByRole('button', { name: '15' })[0]);
    expect(kalenderOffen()).toBe(false);
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
    expect(feldKnopf()).toHaveTextContent(/^15\.\d{2}\.\d{4}$/);
  });

  it('Kalender unmountet offen (Schrittwechsel) → Leiste klebt wieder', async () => {
    const { rerender } = render(<Formular />);
    await userEvent.click(feldKnopf());
    expect(leiste().className).not.toMatch(/\bsticky\b/);
    rerender(<div><FormNav onWeiter={() => {}} weiterText="Weiter →" /></div>);
    expect(leiste().className).toMatch(/\bsticky bottom-0\b/);
  });
});

describe('DateField – schließen nur bei echtem Tipp außerhalb', () => {
  it('Tipp außerhalb schließt — aber erst nach dem Klick, der Klick landet bei offenem Kalender', async () => {
    let offenBeimKlick: boolean | null = null;
    render(<Formular onDraussen={() => { offenBeimKlick = kalenderOffen(); }} />);
    await userEvent.click(feldKnopf());
    tippen(screen.getByRole('button', { name: 'Draußen' }));
    expect(offenBeimKlick).toBe(true);
    expect(kalenderOffen()).toBe(false);
  });

  it('Tipp auf „Weiter“ löst Weiter aus und schließt den Kalender', async () => {
    const onWeiter = vi.fn();
    render(<Formular onWeiter={onWeiter} />);
    await userEvent.click(feldKnopf());
    await userEvent.click(screen.getByRole('button', { name: 'Weiter →' }));
    expect(onWeiter).toHaveBeenCalledTimes(1);
    expect(kalenderOffen()).toBe(false);
  });

  it('Wisch, der auf der Knopfleiste beginnt (Bewegung > 10 px), schließt nicht', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    const weiter = screen.getByRole('button', { name: 'Weiter →' });
    fireEvent.pointerDown(weiter, { clientX: 100, clientY: 700 });
    fireEvent.pointerMove(weiter, { clientX: 100, clientY: 640 });
    fireEvent.pointerUp(weiter, { clientX: 100, clientY: 600 });
    fireEvent.click(weiter);
    expect(kalenderOffen()).toBe(true);
  });

  it('Wisch, den der Browser als Scrollen übernimmt (pointercancel), schließt nicht', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    const draussen = screen.getByRole('button', { name: 'Draußen' });
    fireEvent.pointerDown(draussen, { clientX: 50, clientY: 50 });
    fireEvent.pointerCancel(draussen);
    fireEvent.pointerUp(draussen, { clientX: 50, clientY: 50 });
    expect(kalenderOffen()).toBe(true);
  });

  it('Scrollen zwischen Aufsetzen und Loslassen schließt nicht', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    const draussen = screen.getByRole('button', { name: 'Draußen' });
    // Fenster-Scroll feuert der Browser am document, Scroll eines Containers am Element.
    fireEvent.pointerDown(draussen, { clientX: 50, clientY: 50 });
    fireEvent.scroll(document);
    fireEvent.pointerUp(draussen, { clientX: 52, clientY: 51 });
    fireEvent.click(draussen);
    expect(kalenderOffen()).toBe(true);

    fireEvent.pointerDown(draussen, { clientX: 50, clientY: 50 });
    fireEvent.scroll(draussen.parentElement!);
    fireEvent.pointerUp(draussen, { clientX: 50, clientY: 50 });
    fireEvent.click(draussen);
    expect(kalenderOffen()).toBe(true);
  });

  it('ein touchstart allein schließt nicht mehr', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    fireEvent.touchStart(screen.getByRole('button', { name: 'Weiter →' }));
    expect(kalenderOffen()).toBe(true);
  });

  it('Tipps im Kalender (Monat blättern) lassen ihn offen, zweiter Tipp aufs Feld schließt', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voriger Monat' }));
    expect(kalenderOffen()).toBe(true);
    await userEvent.click(feldKnopf());
    expect(kalenderOffen()).toBe(false);
  });

  it('Tipp ohne folgenden click (iOS auf nicht klickbarer Fläche) schließt trotzdem', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    const flaeche = document.body;
    fireEvent.pointerDown(flaeche, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(flaeche, { clientX: 5, clientY: 5 });
    expect(kalenderOffen()).toBe(true);
    await waitFor(() => expect(kalenderOffen()).toBe(false), { timeout: 1500 });
  });
});

describe('kalenderNachschub', () => {
  it('scrollt um die Differenz zwischen Kalender-Unterkante und Grenze minus 12 px', () => {
    expect(kalenderNachschub({ kalenderUnten: 900, feldOben: 500, kopfUnten: 56, grenzeUnten: 553 }))
      .toBe(900 - (553 - KALENDER_LUFT_UNTEN));
  });
  it('nie weiter, als das Feld unter dem Seitenkopf (+ 8 px) bleibt', () => {
    expect(kalenderNachschub({ kalenderUnten: 900, feldOben: 200, kopfUnten: 56, grenzeUnten: 553 })).toBe(200 - 64);
  });
  it('passt der Kalender schon, wird nicht gescrollt', () => {
    expect(kalenderNachschub({ kalenderUnten: 500, feldOben: 100, kopfUnten: 56, grenzeUnten: 553 })).toBe(0);
  });
  it('Feld schon unter dem Kopf: nicht scrollen (nie negativ)', () => {
    expect(kalenderNachschub({ kalenderUnten: 900, feldOben: 40, kopfUnten: 56, grenzeUnten: 553 })).toBe(0);
  });
});

describe('DateField – Kalender holt sich beim Öffnen ins Bild', () => {
  type Rechteck = { top: number; bottom: number };
  const rechtecke = new Map<Element, Rechteck>();
  const rect = ({ top, bottom }: Rechteck) =>
    ({ top, bottom, left: 0, right: 390, width: 390, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  beforeEach(() => {
    rechtecke.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rect(rechtecke.get(this) ?? { top: 0, bottom: 0 });
    });
  });
  // Feld-Wurzel = Elternteil des Feld-Knopfs, Kalender = ihr letztes Kind (erst nach dem Öffnen da).
  // fireEvent statt userEvent: synchron, damit die Maße stehen, bevor der rAF des Effekts läuft
  // (mit `await userEvent.click` lief er unter Last manchmal vorher, und der Test sah keinen Scroll).
  const oeffnen = async (feld: Rechteck, kalender: Rechteck) => {
    const wurzel = feldKnopf().parentElement!;
    rechtecke.set(wurzel, feld);
    fireEvent.click(feldKnopf());
    rechtecke.set(wurzel.lastElementChild!, kalender);
  };
  const innerHeight = window.innerHeight;

  it('beim Laden wird nichts gescrollt', async () => {
    render(<Formular />);
    await new Promise(r => setTimeout(r, 50));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('Handy: das Fenster scrollt um den verdeckten Teil + 12 px', async () => {
    render(<Formular />);
    await oeffnen({ top: 500, bottom: 548 }, { top: 556, bottom: 900 });
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ top: 900 - (innerHeight - 12), behavior: 'smooth' }));
  });

  it('passt der Kalender, wird nicht gescrollt', async () => {
    render(<Formular />);
    await oeffnen({ top: 100, bottom: 148 }, { top: 156, bottom: 500 });
    await new Promise(r => setTimeout(r, 50));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('klebt die Knopfleiste noch, zählt ihre tatsächliche Höhe', async () => {
    render(<><Formular /><div data-testid="leiste" data-knopfleiste="" style={{ position: 'sticky' }} /></>);
    rechtecke.set(screen.getByTestId('leiste'), { top: innerHeight - 117, bottom: innerHeight });
    await oeffnen({ top: 500, bottom: 548 }, { top: 556, bottom: 900 });
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ top: 900 - (innerHeight - 117 - 12), behavior: 'smooth' }));
  });

  it('nie so weit, dass das Feld unter den Seitenkopf rutscht', async () => {
    render(<><nav data-testid="kopf" style={{ position: 'sticky', top: 0 }} /><Formular /></>);
    rechtecke.set(screen.getByTestId('kopf'), { top: 0, bottom: 56 });
    await oeffnen({ top: 100, bottom: 148 }, { top: 156, bottom: 900 });
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ top: 100 - 56 - 8, behavior: 'smooth' }));
  });

  it('Desktop: scrollt den Telefon-Rahmen, nicht das Fenster', async () => {
    render(<div id="portal-scroll-container" data-testid="rahmen" style={{ overflowY: 'auto' }}><Formular /></div>);
    const rahmen = screen.getByTestId('rahmen');
    Object.defineProperty(rahmen, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(rahmen, 'clientHeight', { configurable: true, value: 700 });
    const rahmenScroll = vi.fn();
    rahmen.scrollBy = rahmenScroll as unknown as typeof rahmen.scrollBy;
    rechtecke.set(rahmen, { top: 0, bottom: 700 });
    await oeffnen({ top: 400, bottom: 448 }, { top: 456, bottom: 900 });
    await waitFor(() => expect(rahmenScroll).toHaveBeenCalledWith({ top: 900 - (700 - 12), behavior: 'smooth' }));
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

// Gegenprüfung 13.10.: (a) ein schneller zweiter Tipp aufs Feld traf nach dem Einblend-Scroll einen Tag
// und setzte still ein Datum; (b) beim Blättern scrollte der Kalender nach, „Nächster Monat“ rutschte
// unter dem Daumen weg (Oktober 5 → November 6 Wochenzeilen).
describe('DateField – Einblend-Scroll nur beim Öffnen, Tipps während des Scrolls zählen nicht', () => {
  type Rechteck = { top: number; bottom: number };
  const rechtecke = new Map<Element, Rechteck>();
  const rect = ({ top, bottom }: Rechteck) =>
    ({ top, bottom, left: 0, right: 390, width: 390, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  let jetzt = 1000;
  beforeEach(() => {
    rechtecke.clear();
    jetzt = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => jetzt);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rect(rechtecke.get(this) ?? { top: 0, bottom: 0 });
    });
  });
  const innerHeight = window.innerHeight;
  const ZEILE = 46; // Tag 44 px + Abstand 2 px
  // Öffnen wie ein Kunde mit Feld in der unteren Bildhälfte: der Kalender ragt unter den Rand, also wird gescrollt.
  const oeffnenUnten = async (zeilen: number) => {
    const wurzel = feldKnopf().parentElement!;
    rechtecke.set(wurzel, { top: 500, bottom: 548 });
    fireEvent.click(feldKnopf());
    const kalender = wurzel.lastElementChild!;
    rechtecke.set(kalender, { top: 556, bottom: 556 + 110 + zeilen * ZEILE });
    rechtecke.set(kalender.lastElementChild!, { top: 650, bottom: 650 + zeilen * ZEILE });
    await waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1));
    return 556 + 110 + zeilen * ZEILE;
  };
  const tag = (n: number) => screen.getAllByRole('button', { name: String(n) })[0];
  const monat = () => screen.getByText(/^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4}$/).textContent;

  it('beim Öffnen gleich Platz für einen Monat mit sechs Wochenzeilen (Oktober 2026 hat fünf)', async () => {
    render(<Formular start="2026-10-20" />);
    const unten = await oeffnenUnten(5);
    expect(scrollBy).toHaveBeenCalledWith({ top: unten + ZEILE - (innerHeight - KALENDER_LUFT_UNTEN), behavior: 'smooth' });
  });

  it('Monat mit sechs Zeilen (November 2026): kein Aufschlag', async () => {
    render(<Formular start="2026-11-20" />);
    const unten = await oeffnenUnten(6);
    expect(scrollBy).toHaveBeenCalledWith({ top: unten - (innerHeight - KALENDER_LUFT_UNTEN), behavior: 'smooth' });
  });

  it('Blättern scrollt nicht: Oktober → November → Dezember, ein einziger Scroll beim Öffnen', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += EINBLEND_SPERRE_MS + 50;
    tippen(screen.getByRole('button', { name: 'Nächster Monat' }));
    await new Promise(r => setTimeout(r, 80));
    expect(monat()).toBe('November 2026');
    tippen(screen.getByRole('button', { name: 'Nächster Monat' }));
    await new Promise(r => setTimeout(r, 80));
    expect(monat()).toBe('Dezember 2026');
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it('Doppeltipp: zweiter Tipp landet während des Einblend-Scrolls auf einem Tag → kein Datum, Kalender bleibt offen', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += 200;
    tippen(tag(15));
    expect(feldKnopf()).toHaveTextContent('20.10.2026');
    expect(kalenderOffen()).toBe(true);
    // Auch „Nächster Monat“ zählt in dieser Zeit nicht.
    tippen(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(monat()).toBe('Oktober 2026');
  });

  it('nach dem Ende der Sperre zählt der Tipp sofort', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += EINBLEND_SPERRE_MS;
    tippen(tag(15));
    expect(feldKnopf()).toHaveTextContent('15.10.2026');
    expect(kalenderOffen()).toBe(false);
  });

  it('maßgeblich ist das Aufsetzen: begonnen in der Sperre, losgelassen danach → zählt nicht', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += 300;
    fireEvent.pointerDown(tag(15), { clientX: 50, clientY: 50 });
    jetzt += 400;
    fireEvent.pointerUp(tag(15), { clientX: 50, clientY: 50 });
    fireEvent.click(tag(15));
    expect(feldKnopf()).toHaveTextContent('20.10.2026');
    expect(kalenderOffen()).toBe(true);
  });

  it('läuft das Scrollen länger, gilt die Sperre bis kurz nach dem letzten Scroll-Ereignis', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += EINBLEND_SPERRE_MS - 10;
    fireEvent.scroll(document);
    jetzt += 40; // nach der Grundsperre, aber noch in der Ruhezeit nach dem Scroll
    tippen(tag(15));
    expect(feldKnopf()).toHaveTextContent('20.10.2026');
    jetzt += SCROLL_RUHE_MS;
    tippen(tag(15));
    expect(feldKnopf()).toHaveTextContent('15.10.2026');
  });

  it('Scroll-Ereignisse nach EINBLEND_SPERRE_MAX_MS verlängern nichts (der Kunde scrollt selbst)', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += EINBLEND_SPERRE_MAX_MS + 10;
    fireEvent.scroll(document);
    tippen(tag(15));
    expect(feldKnopf()).toHaveTextContent('15.10.2026');
  });

  it('ohne Einblend-Scroll keine Sperre: passt der Kalender, zählt auch ein sofortiger Tipp', async () => {
    render(<Formular start="2026-10-20" />);
    const wurzel = feldKnopf().parentElement!;
    rechtecke.set(wurzel, { top: 100, bottom: 148 });
    fireEvent.click(feldKnopf());
    rechtecke.set(wurzel.lastElementChild!, { top: 156, bottom: 500 });
    await new Promise(r => setTimeout(r, 50));
    expect(scrollBy).not.toHaveBeenCalled();
    tippen(tag(15));
    expect(feldKnopf()).toHaveTextContent('15.10.2026');
  });

  it('zu und wieder auf: die Sperre vom letzten Öffnen gilt nicht weiter', async () => {
    render(<Formular start="2026-10-20" />);
    await oeffnenUnten(5);
    jetzt += 100;
    tippen(tag(15)); // in der Sperre, zählt nicht
    fireEvent.click(feldKnopf()); // zu
    expect(kalenderOffen()).toBe(false);
    rechtecke.set(feldKnopf().parentElement!, { top: 100, bottom: 148 });
    fireEvent.click(feldKnopf()); // wieder auf, passt jetzt ohne Scroll
    await new Promise(r => setTimeout(r, 50));
    tippen(tag(16));
    expect(feldKnopf()).toHaveTextContent('16.10.2026');
  });
});

// Messpunkte (Registry #123): DateField bleibt generisch und meldet nur Öffnen und Schließen; was daraus ein Messpunkt
// wird („zu ohne Datum"), entscheidet der Aufrufer (AngebotCard).
describe('DateField – Rückrufe beim Öffnen und Schließen', () => {
  function MitRueckrufen({ onGeoeffnet, onGeschlossen, start = '' }: {
    onGeoeffnet: () => void; onGeschlossen: (gewaehlt: boolean) => void; start?: string;
  }) {
    const [wert, setWert] = useState(start);
    return (
      <div>
        <DateField value={wert} onChange={setWert} min="2000-01-01" onGeoeffnet={onGeoeffnet} onGeschlossen={onGeschlossen} />
        <button type="button">Draußen</button>
        <FormNav onWeiter={() => {}} weiterText="Weiter →" />
      </div>
    );
  }
  const setup = (start = '') => {
    const onGeoeffnet = vi.fn();
    const onGeschlossen = vi.fn();
    const r = render(<MitRueckrufen onGeoeffnet={onGeoeffnet} onGeschlossen={onGeschlossen} start={start} />);
    return { onGeoeffnet, onGeschlossen, ...r };
  };

  it('Öffnen meldet einmal, Blättern nichts, ein gewählter Tag schließt mit gewaehlt=true', async () => {
    const { onGeoeffnet, onGeschlossen } = setup();
    expect(onGeoeffnet).not.toHaveBeenCalled();
    await userEvent.click(feldKnopf());
    expect(onGeoeffnet).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voriger Monat' }));
    expect(onGeoeffnet).toHaveBeenCalledTimes(1);
    expect(onGeschlossen).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: '15' })[0]);
    expect(kalenderOffen()).toBe(false);
    expect(onGeschlossen).toHaveBeenCalledTimes(1);
    expect(onGeschlossen).toHaveBeenLastCalledWith(true);
  });

  it('zu über das Feld ohne Tag: gewaehlt=false; wieder auf meldet erneut', async () => {
    const { onGeoeffnet, onGeschlossen } = setup();
    await userEvent.click(feldKnopf());
    await userEvent.click(feldKnopf());
    expect(onGeschlossen).toHaveBeenLastCalledWith(false);
    await userEvent.click(feldKnopf());
    expect(onGeoeffnet).toHaveBeenCalledTimes(2);
  });

  it('Tipp außerhalb ohne Tag: gewaehlt=false', async () => {
    const { onGeschlossen } = setup();
    await userEvent.click(feldKnopf());
    tippen(screen.getByRole('button', { name: 'Draußen' }));
    expect(kalenderOffen()).toBe(false);
    expect(onGeschlossen).toHaveBeenCalledTimes(1);
    expect(onGeschlossen).toHaveBeenLastCalledWith(false);
  });

  it('verschwindet offen (Schrittwechsel über „Zurück“/„Weiter“): gewaehlt=false', async () => {
    const { onGeschlossen, rerender } = setup();
    await userEvent.click(feldKnopf());
    rerender(<div><FormNav onWeiter={() => {}} weiterText="Weiter →" /></div>);
    expect(onGeschlossen).toHaveBeenCalledTimes(1);
    expect(onGeschlossen).toHaveBeenLastCalledWith(false);
  });

  it('ohne Rückrufe wie bisher', async () => {
    render(<Formular />);
    await userEvent.click(feldKnopf());
    await userEvent.click(screen.getAllByRole('button', { name: '20' })[0]);
    expect(kalenderOffen()).toBe(false);
  });
});
