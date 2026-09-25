import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lead } from '../../lib/supabase';

vi.mock('../../lib/leadEvents', () => ({ reportLeadEvent: vi.fn() }));
vi.mock('../../lib/mamamia/client', () => ({ callMamamia: vi.fn(async () => ({ LocationsWithPagination: { data: [] } })) }));

import { AngebotCard } from '../../components/portal/AngebotCard';
import { reportLeadEvent } from '../../lib/leadEvents';

const TOKEN = 'angebot-test';
const lead = { token: TOKEN, telefon: '0170 1234567' } as unknown as Lead;

// Vollständiger Entwurf: alle Pflichtfelder aller vier Schritte.
const VOLL = {
  _isDraft: true,
  anzahl: '1', geschlecht: 'Weiblich',
  mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
  plz: '80331', ort: 'München',
  wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Großstadt', startDate: '2099-12-01',
  wunschGeschlecht: 'Weiblich', fuehrerschein: 'Nein',
};

const entwurf = (daten: Record<string, unknown>) =>
  localStorage.setItem(`patient_${TOKEN}`, JSON.stringify(daten));

const weiter = () => userEvent.click(screen.getByRole('button', { name: 'Weiter →' }));
const schritt = (n: number) => expect(screen.getByText(`Schritt ${n} von 4`)).toBeInTheDocument();

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(reportLeadEvent).mockClear();
});

describe('AngebotCard – Pflichtfelder', () => {
  it('Schritt 1: Fehler erst nach „Weiter", mit Feldname über den Knöpfen', async () => {
    render(<AngebotCard lead={lead} />);
    schritt(1);
    expect(screen.queryByText('Bitte eine Antwort wählen')).toBeNull();

    await weiter();
    schritt(1);
    expect(screen.getByRole('button', { name: 'Geschlecht fehlt' })).toBeInTheDocument();
    expect(screen.getByText('Bitte eine Antwort wählen')).toBeInTheDocument();

    // Ausfüllen lässt Hinweis und Feldfehler sofort verschwinden.
    await userEvent.click(screen.getByRole('button', { name: 'Weiblich' }));
    expect(screen.queryByText('Geschlecht fehlt')).toBeNull();
    expect(screen.queryByText('Bitte eine Antwort wählen')).toBeNull();
    await weiter();
    schritt(2);
  });

  it('Geburtsjahr und Pflegegrad bleiben optional', async () => {
    entwurf({ _isDraft: true, anzahl: '1', geschlecht: 'Männlich' });
    render(<AngebotCard lead={lead} />);
    await weiter();
    schritt(2);
  });

  it('Geburtsjahr ist ein Zahlenfeld: nur Ziffern, höchstens 4, 1920–2010', async () => {
    entwurf({ _isDraft: true, anzahl: '1', geschlecht: 'Männlich' });
    render(<AngebotCard lead={lead} />);
    const jahr = screen.getByPlaceholderText('z. B. 1948');
    expect(jahr).toHaveAttribute('inputmode', 'numeric');

    await userEvent.type(jahr, '19a4');
    expect(jahr).toHaveValue('194');
    await weiter();
    schritt(1);
    expect(screen.getByRole('button', { name: 'Geburtsjahr prüfen' })).toBeInTheDocument();
    expect(screen.getByText('Bitte ein Jahr zwischen 1920 und 2010 eintragen')).toBeInTheDocument();

    await userEvent.type(jahr, '8');
    expect(jahr).toHaveValue('1948');
    await weiter();
    schritt(2);
    expect(JSON.parse(localStorage.getItem(`patient_${TOKEN}`)!).geburtsjahr).toBe('1948');
  });

  it('zwei Personen: Geschlecht von Person 2 ist Pflicht', async () => {
    entwurf({ _isDraft: true, anzahl: '2', geschlecht: 'Weiblich' });
    render(<AngebotCard lead={lead} />);
    expect(screen.getByText('Person 2')).toBeInTheDocument();
    await weiter();
    expect(screen.getByRole('button', { name: 'Geschlecht (Person 2) fehlt' })).toBeInTheDocument();
  });

  it('Schritt 2: Heben und Demenz sind Pflicht, bei zwei Personen auch alle vier von Person 2', async () => {
    entwurf({ _isDraft: true, anzahl: '2', geschlecht: 'Weiblich', p2_geschlecht: 'Männlich' });
    render(<AngebotCard lead={lead} />);
    await weiter();
    schritt(2);
    await weiter();
    expect(screen.getByRole('button', {
      name: '6 Angaben offen: Heben erforderlich (Person 1), Demenz (Person 1), Mobilität (Person 2), Heben erforderlich (Person 2), Demenz (Person 2), Nachteinsätze (Person 2)',
    })).toBeInTheDocument();
  });

  it('Schritt 3: Einsatzort, Lage, Wohnungstyp, Startdatum und Telefon', async () => {
    entwurf({ _isDraft: true, anzahl: '1', geschlecht: 'Weiblich', heben: 'Nein', demenz: 'Nein' });
    render(<AngebotCard lead={{ token: TOKEN } as unknown as Lead} />);
    await weiter();
    await weiter();
    schritt(3);
    await weiter();
    schritt(3);
    expect(screen.getByRole('button', {
      name: '5 Angaben offen: Einsatzort, Wohnungstyp, Lage, Startdatum, Telefonnummer',
    })).toBeInTheDocument();
    expect(screen.getByText('Bitte eine Telefonnummer eintragen')).toBeInTheDocument();
  });
});

describe('AngebotCard – Auswahl-Beschriftungen', () => {
  it('Pflegegrad-Chip „3" speichert „Pflegegrad 3", Gewicht „71–80" speichert „71-80 kg"', async () => {
    entwurf({ _isDraft: true, anzahl: '1', geschlecht: 'Weiblich' });
    render(<AngebotCard lead={lead} />);
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: '71–80' }));
    const gespeichert = JSON.parse(localStorage.getItem(`patient_${TOKEN}`)!);
    expect(gespeichert.pflegegrad).toBe('Pflegegrad 3');
    expect(gespeichert.gewicht).toBe('71-80 kg');
  });

  it('stellt einen Entwurf wieder her', () => {
    entwurf({ _isDraft: true, anzahl: '1', geschlecht: 'Weiblich', pflegegrad: 'Pflegegrad 2', geburtsjahr: '1939' });
    render(<AngebotCard lead={lead} />);
    expect(screen.getByRole('button', { name: 'Weiblich' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText('z. B. 1948')).toHaveValue('1939');
  });
});

describe('AngebotCard – Schritte und Speichern', () => {
  it('meldet patient_form_step je Schritt genau einmal', async () => {
    entwurf(VOLL);
    render(<AngebotCard lead={lead} />);
    await weiter();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    await weiter();
    await weiter();
    const schritte = vi.mocked(reportLeadEvent).mock.calls
      .filter(c => c[1] === 'patient_form_step')
      .map(c => (c[2] as { step: number }).step);
    expect(schritte).toEqual([1, 2]);
  });

  it('„Bewerbungen anfragen" ist immer aktiv und zeigt, was fehlt, statt abzusenden', async () => {
    entwurf({ ...VOLL, wunschGeschlecht: '' });
    const onSave = vi.fn(async () => {});
    render(<AngebotCard lead={lead} mamamiaEnabled onSaveToMamamia={onSave} />);
    for (let i = 0; i < 3; i++) await weiter();
    schritt(4);
    const speichern = screen.getByRole('button', { name: 'Bewerbungen anfragen' });
    expect(speichern).toBeEnabled();
    await userEvent.click(speichern);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Gewünschtes Geschlecht fehlt' })).toBeInTheDocument();
  });

  it('speichert einen vollständigen Bogen und meldet „gespeichert" nach oben', async () => {
    entwurf(VOLL);
    const onSave = vi.fn(async () => {});
    const onPatientSaved = vi.fn();
    render(<AngebotCard lead={lead} mamamiaEnabled onSaveToMamamia={onSave} onPatientSaved={onPatientSaved} />);
    for (let i = 0; i < 3; i++) await weiter();
    await userEvent.click(screen.getByRole('button', { name: 'Bewerbungen anfragen' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ geschlecht: 'Weiblich', plz: '80331', phone: '0170 1234567' });
    expect(onPatientSaved).toHaveBeenLastCalledWith(true);
    // Nach Erfolg ist der Entwurf als fertig markiert.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`patient_${TOKEN}`)!)._isDraft).toBe(false));
  });

  it('zeigt den Hinweis zum lokalen Speichern', () => {
    render(<AngebotCard lead={lead} />);
    expect(screen.getByText('Ihre Eingaben bleiben auf diesem Gerät gespeichert.')).toBeInTheDocument();
  });
});

describe('AngebotCard – letzter Schritt', () => {
  it('sagt, was das Absenden bedeutet, und führt „Zurück" als Link', async () => {
    entwurf(VOLL);
    render(<AngebotCard lead={lead} />);
    for (let i = 0; i < 3; i++) await weiter();
    expect(screen.getByText(/Mit dem Absenden fragen Sie Bewerbungen an/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu Schritt 3' }));
    schritt(3);
  });
});

describe('AngebotCard – Angaben ändern nach dem Absenden', () => {
  it('schon abgeschickt: „Änderungen speichern“ statt „Bewerbungen anfragen“, kein 72-h-Satz', async () => {
    localStorage.setItem(`patient_${TOKEN}`, JSON.stringify({ ...VOLL, _isDraft: false }));
    const onAbgesendet = vi.fn();
    render(<AngebotCard lead={lead} onAbgesendet={onAbgesendet} />);
    for (let i = 0; i < 3; i++) await weiter();
    expect(screen.queryByRole('button', { name: 'Bewerbungen anfragen' })).toBeNull();
    expect(screen.queryByText(/Mit dem Absenden fragen Sie Bewerbungen an/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(onAbgesendet).toHaveBeenCalledWith(true);
  });
});
