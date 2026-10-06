import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ABLAUF, AngebotAblaufStand, KompaktEinleitung, KompaktePflegekraefte, KompaktPflegekraefteBereich, KompaktVertrauen, PflegekraftZeile, STAND_TITEL_1, VERTRAUEN, interesseText, standSchritt2 } from '../../components/portal/KompaktEinstieg';
import type { Nurse } from '../../types';

const basis: Nurse = {
  caregiverId: 50002,
  name: 'Helena Kowalski',
  age: 41,
  experience: '6 J. Erfahrung',
  experienceYears: 6,
  availability: '',
  availableSoon: true,
  language: { level: 'Gut', bars: 3 },
  color: '#8B7355',
  addedTime: '',
  isLive: true,
  gender: 'female',
  history: { assignments: 14, avgDurationMonths: 2 },
};

const zeileVon = (name: string) => screen.getByRole('button', { name: `Profil von ${name} ansehen` });
// Runde 15: Erfahrung und Einsätze als ganze Teile; der Trenner „·" kommt per CSS vor den Teil und wird am
// Zeilenanfang abgeschnitten (Hülle overflow-hidden) — im Text steht er deshalb nicht.
const teileVon = (el: HTMLElement) => [...el.querySelectorAll('.whitespace-nowrap')].map((t) => t.textContent);
// Gefüllte Punkte der Deutsch-Anzeige (DeutschPunkte aus dem Profil „V").
const gefuellt = (el: HTMLElement) => el.querySelectorAll('span.bg-pm-taupe').length;

// Kompakt-Einstieg (Vorschlag 03.10.2026, Runde 3): Zeilen statt Karten, dieselben Daten wie das Profil.
describe('PflegekraftZeile', () => {
  it('Name und Alter, Deutsch mit Punkten, Erfahrung · Einsätze bei uns — keine Sterne', () => {
    render(<PflegekraftZeile nurse={basis} empfohlen={false} onClick={() => {}} />);
    const zeile = zeileVon('Helena K.');
    expect(within(zeile).getByText('Helena K.')).toBeTruthy();
    expect(within(zeile).getByText(', 41')).toBeTruthy();
    expect(within(zeile).getByText('Deutsch gut')).toBeTruthy();
    expect(gefuellt(zeile)).toBe(3);
    expect(teileVon(zeile)).toEqual(['6 Jahre Erfahrung', '14 Einsätze bei uns']);
    for (const teil of zeile.querySelectorAll('.whitespace-nowrap')) expect(teil.className).toContain("before:content-['·']");
    expect(zeile.querySelector('.whitespace-nowrap')!.parentElement!.parentElement!.className).toContain('overflow-hidden');
    // Runde 15: Name 17 px in 600, Alter in muted (AA), Foto 56 px mit runden Ecken.
    expect(within(zeile).getByText(', 41').className).toContain('text-pm-muted');
    const foto = zeile.firstElementChild as HTMLElement; // ohne Bild: Initialen in derselben Fläche
    expect(foto.className).toContain('h-14');
    expect(foto.className).toContain('rounded-xl');
    // Keine Bewertung je Pflegekraft: kein Stern, auch nicht für Elite/Stammkraft.
    expect(zeile.textContent).not.toContain('★');
    expect(within(zeile).queryByText('Unsere Empfehlung')).toBeNull();
  });

  it('Punkte nach Niveau: „mittel" zwei von drei', () => {
    render(<PflegekraftZeile nurse={{ ...basis, language: { level: 'Mittel', bars: 2 } }} empfohlen={false} onClick={() => {}} />);
    const zeile = zeileVon('Helena K.');
    expect(within(zeile).getByText('Deutsch mittel')).toBeTruthy();
    expect(gefuellt(zeile)).toBe(2);
  });

  it('Einzahl: „1 Jahr Erfahrung", „1 Einsatz bei uns"', () => {
    render(<PflegekraftZeile nurse={{ ...basis, experienceYears: 1, history: { assignments: 1, avgDurationMonths: 2 } }} empfohlen={false} onClick={() => {}} />);
    expect(teileVon(zeileVon('Helena K.'))).toEqual(['1 Jahr Erfahrung', '1 Einsatz bei uns']);
  });

  it('fehlende oder null Teile entfallen samt Trenner', () => {
    const { unmount } = render(<PflegekraftZeile nurse={{ ...basis, experienceYears: 0 }} empfohlen={false} onClick={() => {}} />);
    let zeile = zeileVon('Helena K.');
    expect(zeile.textContent).toContain('14 Einsätze bei uns');
    expect(zeile.textContent).not.toContain('Erfahrung');
    expect(zeile.textContent).not.toContain('·');
    unmount();
    render(<PflegekraftZeile nurse={{ ...basis, history: { assignments: 0, avgDurationMonths: 0 } }} empfohlen={false} onClick={() => {}} />);
    zeile = zeileVon('Helena K.');
    expect(zeile.textContent).toContain('6 Jahre Erfahrung');
    expect(zeile.textContent).not.toContain('Einsätze');
    expect(zeile.textContent).not.toContain('·');
  });

  it('ohne Sprache, Jahre und Einsätze nur der Name; Empfehlung als Etikett', () => {
    render(
      <PflegekraftZeile
        nurse={{ ...basis, age: 0, experienceYears: 0, language: { level: '—', bars: 0 }, history: undefined }}
        empfohlen
        onClick={() => {}}
      />,
    );
    const zeile = zeileVon('Helena K.');
    const empfehlung = within(zeile).getByText('Unsere Empfehlung');
    // Runde 13: leiser Text, keine Pille.
    expect(empfehlung.className).not.toContain('rounded-full');
    expect(empfehlung.className).not.toContain('bg-');
    expect(zeile.textContent).not.toMatch(/Deutsch|Erfahrung|Einsätze|, \d/);
    expect(gefuellt(zeile)).toBe(0);
  });

  it('die ganze Zeile öffnet das Profil', async () => {
    const onClick = vi.fn();
    render(<PflegekraftZeile nurse={basis} empfohlen={false} onClick={onClick} />);
    await userEvent.click(zeileVon('Helena K.'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('KompaktePflegekraefte', () => {
  const props = {
    laedt: false, alleBearbeitet: false, keineVorschlaege: false,
    onProfil: () => {}, telefonHref: 'tel:0',
  };

  // Runde 8: nur noch die Zeilen — der Kopf „Ihre passenden Pflegekräfte" steht im Bereich darüber.
  it('nur die Zeilen, ohne eigene Überschrift; Empfehlung nur in der ersten', () => {
    render(
      <KompaktePflegekraefte
        {...props}
        eintraege={[{ nurse: basis, i: 0 }, { nurse: { ...basis, caregiverId: 50003, name: 'Anna Nowak' }, i: 1 }]}
      />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Vor dem Einladen/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Profil von / })).toHaveLength(2);
    // Runde 15: EINE weiße Karte, Haarlinien zwischen den Zeilen.
    const liste = zeileVon('Helena K.').parentElement!;
    expect(liste.className).toContain('divide-y');
    expect(liste.className).toContain('rounded-card');
    expect(liste.className).toContain('bg-white');
    expect(screen.getAllByText('Unsere Empfehlung')).toHaveLength(1);
    expect(within(zeileVon('Helena K.')).getByText('Unsere Empfehlung')).toBeTruthy();
  });

  it('beim Laden: Hinweis statt Zeilen', () => {
    render(<KompaktePflegekraefte {...props} laedt eintraege={[{ nurse: basis, i: 0 }]} />);
    expect(screen.getByText('Wir laden Ihre Pflegekräfte …')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Profil von / })).toBeNull();
  });

  it('ohne Vorschläge: Leer-Zustand mit Marta', () => {
    render(<KompaktePflegekraefte {...props} keineVorschlaege eintraege={[]} />);
    expect(screen.getByText('Gerade keine weiteren Vorschläge')).toBeTruthy();
    const marta = screen.getByRole('link', { name: 'Mit Marta sprechen' });
    expect(marta.getAttribute('href')).toBe('tel:0');
    // Knöpfe einheitlich (Runde 15): 52 px hoch.
    expect(marta.className).toContain('min-h-[52px]');
  });
});

describe('KompaktEinleitung', () => {
  it('Einleitung unter dem Titel im Wortlaut der Geschäftsführung (Runde 14: positiv, ohne „Ausfall")', () => {
    const { container } = render(<KompaktEinleitung />);
    const absatz = container.querySelector('p')!;
    expect(absatz.textContent).toBe(
      'Ihr Angebot umfasst eine Rund-um-Betreuung zu Hause durch bei uns angestellte Betreuungskräfte. Anreise, Wechsel und Vertretung organisieren wir, und Ihre Ansprechpartnerin ist täglich von 8 bis 20 Uhr für Sie da.',
    );
    expect(absatz.textContent).not.toContain('Ausfall');
    // Uhrzeit und Satzende bleiben zusammen.
    expect(within(absatz).getByText('8 bis 20 Uhr').className).toContain('whitespace-nowrap');
    expect(within(absatz).getByText('für Sie da.').className).toContain('whitespace-nowrap');
  });
});

describe('KompaktVertrauen', () => {
  it('Siegel, daneben „6× in Folge Testsieger DIE WELT · über 20 Jahre Erfahrung", darunter die Sterne', () => {
    const { container } = render(<KompaktVertrauen sterne={{ schnitt: '4,9', wert: 4.9, anzahl: 126 }} />);
    const siegel = container.querySelector('img')!;
    expect(siegel.getAttribute('src')).toBe('/badge-testsieger.webp');
    const teile = screen.getAllByRole('listitem');
    expect(teile.map((li) => li.textContent)).toEqual(['6× in Folge Testsieger DIE WELT', 'über 20 Jahre Erfahrung']);
    expect(VERTRAUEN).toHaveLength(2);
    // Teile ganz, Umbruch nur zwischen ihnen; der Trenner sitzt vor dem Teil und wird am Zeilenanfang abgeschnitten.
    for (const li of teile) {
      expect(li.className).toContain('whitespace-nowrap');
      expect(li.className).toContain("before:content-['·']");
    }
    expect(screen.getByRole('list').parentElement!.className).toContain('overflow-hidden');
    const sterne = screen.getByRole('link', { name: /4,9 von 5 aus 126 Bewertungen/ });
    expect(sterne.getAttribute('href')).toBe('https://primundus.de/erfahrungen');
    // Runde 15: Die Sterne stehen unter Siegel und Text (neben dem Siegel ist die Spalte bei 24 px Innenabstand zu schmal).
    expect(siegel.parentElement!.contains(sterne)).toBe(false);
    expect(siegel.parentElement!.contains(teile[0])).toBe(true);
    expect(siegel.compareDocumentPosition(sterne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(siegel.className).toContain('h-10');
    // Mit einer Haarlinie von den Punkten darüber getrennt; beides im selben Block.
    const block = container.firstElementChild as HTMLElement;
    expect(block.className).toContain('border-t');
    expect(block.contains(sterne)).toBe(true);
  });

  it('ohne Bewertungsstand: Siegel und Testsieger-Zeile, keine Sterne', () => {
    const { container } = render(<KompaktVertrauen sterne={null} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('KompaktPflegekraefteBereich', () => {
  const props = { aktiv: true, offen: false, onOeffnen: () => {}, liste: <p>Zeilen</p> };

  it('Kopf, Status-Hinweis mit Knopf und kleiner Zeile, darunter die Zeilen', async () => {
    const onOeffnen = vi.fn();
    render(<KompaktPflegekraefteBereich {...props} onOeffnen={onOeffnen}><p>Formular</p></KompaktPflegekraefteBereich>);
    const bereich = screen.getByRole('region', { name: 'Ihre passenden Pflegekräfte' });
    // Runde 13: keine Versalien-Zeile über der Überschrift.
    expect(within(bereich).queryByText('Für Sie ausgewählt')).toBeNull();
    expect(within(bereich).getByText(/^Echte Profile, ausgewählt nach/).textContent).toBe('Echte Profile, ausgewählt nach Ihren Angaben.');
    const hinweis = document.getElementById('patientendaten')!;
    // Runde 12: Status-Hinweis statt „Noch 2 Minuten bis zum Einladen".
    expect(within(hinweis).queryByText('Hinweis')).toBeNull();
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeTruthy();
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine Bewerbungen erhalten.')).toBeTruthy();
    expect(screen.queryByText('Noch 2 Minuten bis zum Einladen')).toBeNull();
    // Look B, Runde 15 verfeinert: dunkles Kopfband (taupe-ink) mit dem Titel in Weiß (18 px, 600), weißer
    // Körper mit 16 px Text, weicher Schatten statt Rand.
    const rahmen = hinweis.firstElementChild as HTMLElement;
    expect(rahmen.className).toContain('shadow-lift');
    expect(rahmen.className).toContain('rounded-card');
    expect(rahmen.className).not.toMatch(/\bborder/);
    const band = within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig');
    expect(band.parentElement).toBe(rahmen);
    expect(band.className).toContain('bg-pm-taupe-ink');
    expect(band.className).toContain('text-white');
    expect(band.className).toContain('text-[18px]');
    const text16 = within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine Bewerbungen erhalten.');
    expect(text16.className).toContain('text-[16px]');
    const koerper = text16.parentElement!;
    expect(koerper.className).toContain('bg-white');
    const unverbindlich = within(hinweis).getByText(/^Vieles ist schon ausgefüllt\./);
    expect(unverbindlich.textContent).toBe('Vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot ausdrücklich annehmen.');
    expect(within(unverbindlich).getByText('ausdrücklich annehmen.').className).toContain('whitespace-nowrap');
    // Reihenfolge: Kopf → Hinweis → Zeilen.
    const zeilen = screen.getByText('Zeilen');
    expect(hinweis.compareDocumentPosition(zeilen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Formular')).toBeNull();
    await userEvent.click(within(hinweis).getByRole('button', { name: 'Pflegesituation vervollständigen →' }));
    expect(onOeffnen).toHaveBeenCalledTimes(1);
  });

  it('offen: das Formular steht im weißen Körper des Hinweises, Knopf und kleine Zeile sind weg', () => {
    render(<KompaktPflegekraefteBereich {...props} offen><p>Formular</p></KompaktPflegekraefteBereich>);
    const hinweis = document.getElementById('patientendaten')!;
    expect(within(hinweis).getByText('Formular')).toBeTruthy();
    expect(within(hinweis).getByText('Formular').parentElement!.className).toContain('border-t');
    expect(screen.queryByRole('button', { name: 'Pflegesituation vervollständigen →' })).toBeNull();
    expect(screen.queryByText(/^Vieles ist schon ausgefüllt\./)).toBeNull();
    // Der Status bleibt über dem Formular stehen.
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeTruthy();
  });

  it('nicht aktiv (alle anderen Zustände): nur der Inhalt, kein Kopf, kein Hinweis, keine Zeilen', () => {
    render(<KompaktPflegekraefteBereich {...props} aktiv={false}><p>Formular</p></KompaktPflegekraefteBereich>);
    expect(screen.getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeNull();
    expect(screen.queryByText('Zeilen')).toBeNull();
  });
});

// Fassung 31: „So geht es weiter" NACH dem Absenden — dieselben drei Schritte mit Stand (Texte OpenAI mutig30).
describe('AngebotAblaufStand', () => {
  it('Schritt 1 abgehakt mit Weg zu den Angaben, Schritt 2 läuft mit der Zahl der Pflegekräfte, Schritt 3 wie vor dem Absenden plus Wunschstart', async () => {
    const onAngaben = vi.fn();
    render(<AngebotAblaufStand passende={4} wunschstart="2026-10-15" onAngaben={onAngaben} />);
    const schritte = screen.getAllByRole('listitem');
    expect(schritte).toHaveLength(3);
    expect(within(schritte[0]).getByText(STAND_TITEL_1)).toBeInTheDocument();
    expect(within(schritte[0]).getByLabelText('erledigt')).toBeInTheDocument();
    expect(schritte[1]).toHaveAttribute('aria-current', 'step');
    expect(schritte[1].textContent).toContain('Für Ihre Pflegesituation gibt es aktuell 4 passende Pflegekräfte.');
    expect(schritte[2].textContent).toContain(ABLAUF[2].text);
    expect(schritte[2].textContent).toContain('Ihr Wunschstart: 15.10.');
    await userEvent.click(within(schritte[0]).getByRole('button', { name: /Angaben ansehen oder ändern/ }));
    expect(onAngaben).toHaveBeenCalledTimes(1);
  });

  it('ohne Wunschstart keine Startzeile; keine Reservierungsfrist, keine Zeitzusage', () => {
    render(<AngebotAblaufStand passende={null} wunschstart={null} onAngaben={() => {}} />);
    expect(screen.queryByText(/Wunschstart/)).toBeNull();
    expect(screen.queryByText(/72|Stunden|Tagen\b.*melde/)).toBeNull();
  });
});

describe('standSchritt2', () => {
  it('ohne Zahl oder bei 0 nur der Satz zur E-Mail, nie eine geratene Zahl', () => {
    expect(standSchritt2(null, 0)).toBe('Jede Bewerbung sehen Sie hier im Portal und erhalten sie per E\u2011Mail.');
    expect(standSchritt2(0, 0)).toBe('Jede Bewerbung sehen Sie hier im Portal und erhalten sie per E\u2011Mail.');
  });
  it('Einzahl und Mehrzahl', () => {
    expect(standSchritt2(1, 0)).toContain('aktuell 1 passende Pflegekraft.');
    expect(standSchritt2(1, 1)).toBe('Sie haben bisher eine Bewerbung erhalten. Jede weitere sehen Sie hier im Portal und erhalten sie per E\u2011Mail.');
    expect(standSchritt2(5, 3)).toContain('Sie haben bisher 3 Bewerbungen erhalten.');
  });
});

describe('interesseText', () => {
  it('Einzahl und Mehrzahl, ohne Gedankenstrich und ohne „stößt … an"', () => {
    expect(interesseText(1)).toBe('Diese Pflegekraft hat Ihre Anfrage gesehen und möchte die Betreuung übernehmen. Laden Sie sie ein, dann bereiten wir ihre Bewerbung vor.');
    expect(interesseText(2)).toContain('Diese Pflegekräfte haben Ihre Anfrage gesehen');
    for (const t of [interesseText(1), interesseText(3)]) {
      expect(t).not.toMatch(/—|stößt/);
    }
  });
});
