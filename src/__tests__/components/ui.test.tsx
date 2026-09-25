import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../components/ui/Button';
import { ProgressSteps } from '../../components/ui/ProgressSteps';
import { Sheet } from '../../components/ui/Sheet';
import { FormField } from '../../components/ui/FormField';
import { FormNav } from '../../components/ui/FormNav';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';

describe('Button', () => {
  it('ist ein Knopf mit mindestens 44 px Höhe und ruft onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Weiter →</Button>);
    const knopf = screen.getByRole('button', { name: 'Weiter →' });
    expect(knopf.className).toMatch(/min-h-\[(44|52)px\]/);
    await userEvent.click(knopf);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('wird zum Link, wenn href gesetzt ist', () => {
    render(<Button href="tel:+4989200000830" variante="sekundaer">Anrufen</Button>);
    expect(screen.getByRole('link', { name: 'Anrufen' })).toHaveAttribute('href', 'tel:+4989200000830');
  });

  it('zeigt beim Laden den Ladetext und ist gesperrt', () => {
    render(<Button laedt ladeText="Speichern…">Speichern</Button>);
    const knopf = screen.getByRole('button', { name: 'Speichern…' });
    expect(knopf).toBeDisabled();
  });
});

describe('ProgressSteps', () => {
  const schritte = ['Zur Person', 'Pflegebedarf', 'Einsatzort & Start', 'Wünsche & Aufgaben'];

  it('zeigt „Schritt 2 von 4 · Pflegebedarf" und einen Fortschrittsbalken', () => {
    render(<ProgressSteps schritte={schritte} aktuell={1} onSchritt={() => {}} />);
    expect(screen.getByText('Schritt 2 von 4')).toBeInTheDocument();
    expect(screen.getByText('Pflegebedarf')).toBeInTheDocument();
    const balken = screen.getByRole('progressbar');
    expect(balken).toHaveAttribute('aria-valuenow', '2');
    expect(balken).toHaveAttribute('aria-valuemax', '4');
  });

  it('erlaubt nur Klicks auf frühere Schritte', async () => {
    const onSchritt = vi.fn();
    render(<ProgressSteps schritte={schritte} aktuell={2} onSchritt={onSchritt} />);
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu Schritt 1: Zur Person' }));
    expect(onSchritt).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: /Schritt 4/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Schritt 3/ })).toBeNull();
  });
});

describe('Sheet', () => {
  it('schließt über das X oben rechts, über Esc und über den Hintergrund', async () => {
    const onClose = vi.fn();
    render(<Sheet offen titel="Bestpreisgarantie" onClose={onClose}><p>Inhalt</p></Sheet>);
    expect(screen.getByRole('dialog', { name: 'Bestpreisgarantie' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await userEvent.click(screen.getByTestId('sheet-hintergrund'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('rendert nichts, wenn es geschlossen ist', () => {
    render(<Sheet offen={false} titel="X" onClose={() => {}}><p>Inhalt</p></Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('FormField', () => {
  it('markiert fehlende Pflichtfelder und zeigt den Fehler am Feld', () => {
    render(
      <FormField feld="pflegegrad" label="Pflegegrad" pflicht fehler="Bitte Pflegegrad wählen">
        <span>Auswahl</span>
      </FormField>,
    );
    const wrapper = screen.getByText('Auswahl').closest('[data-field]')!;
    expect(wrapper).toHaveAttribute('data-field', 'pflegegrad');
    expect(wrapper).toHaveAttribute('data-invalid', '1');
    expect(screen.getByText('Bitte Pflegegrad wählen')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('ohne Fehler kein data-invalid', () => {
    render(<FormField feld="gewicht" label="Gewicht"><span>x</span></FormField>);
    expect(screen.getByText('x').closest('[data-field]')).not.toHaveAttribute('data-invalid');
  });
});

describe('FormNav', () => {
  it('Zurück und Weiter gleich hoch, Hinweis sichtbar', async () => {
    const onZurueck = vi.fn();
    const onWeiter = vi.fn();
    render(<FormNav onZurueck={onZurueck} onWeiter={onWeiter} weiterText="Weiter →" hinweis="Pflegegrad fehlt" />);
    const zurueck = screen.getByRole('button', { name: 'Zurück' });
    const weiter = screen.getByRole('button', { name: 'Weiter →' });
    expect(zurueck.className).toMatch(/min-h-\[52px\]/);
    expect(weiter.className).toMatch(/min-h-\[52px\]/);
    expect(screen.getByText('Pflegegrad fehlt')).toBeInTheDocument();
    await userEvent.click(zurueck);
    await userEvent.click(weiter);
    expect(onZurueck).toHaveBeenCalledTimes(1);
    expect(onWeiter).toHaveBeenCalledTimes(1);
  });

  it('ohne onZurueck gibt es keinen Zurück-Knopf', () => {
    render(<FormNav onWeiter={() => {}} weiterText="Weiter →" />);
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
  });
});

describe('SectionHeader + StatusBadge', () => {
  it('zeigt Eyebrow, Überschrift, Zeile und Status', () => {
    render(
      <SectionHeader eyebrow="Für Ihre Bewerbungen" titel="Pflegesituation" zeile="Ein Satz." rechts={<StatusBadge ton="offen">Unvollständig</StatusBadge>} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Pflegesituation' })).toBeInTheDocument();
    expect(screen.getByText('Für Ihre Bewerbungen')).toBeInTheDocument();
    expect(screen.getByText('Unvollständig')).toBeInTheDocument();
  });
});

describe('FormNav – letzter Schritt', () => {
  it('Hauptknopf allein, „Zurück" als Link darunter', async () => {
    const onZurueck = vi.fn();
    render(<FormNav onZurueck={onZurueck} onWeiter={() => {}} weiterText="Bewerbungen anfragen" zurueckAlsLink="Zurück zu Schritt 3" />);
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu Schritt 3' }));
    expect(onZurueck).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Bewerbungen anfragen' }).className).toMatch(/w-full/);
  });
});
