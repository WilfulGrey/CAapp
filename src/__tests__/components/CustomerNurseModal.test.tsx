import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerNurseModal } from '../../components/portal/CustomerNurseModal';
import type { Nurse } from '../../types';

const nurse = {
  caregiverId: 7, name: 'Maria Kowalska', age: 52, experience: '8 Jahre', experienceYears: 8,
  availability: 'ab sofort', availableSoon: true, language: { level: 'Gut', bars: 3 },
  color: '#fff', addedTime: '', isLive: false, gender: 'female',
} as Nurse;

// Review 25.09.: Aus dem Gebucht-Bildschirm, dem Vertrag und den erledigten
// Karten öffnet die Seite das Profil ohne onInvite. „Einladen" darf dort nicht
// stehen, sonst meldet es Erfolg, ohne etwas zu senden.
describe('CustomerNurseModal – Aktionen', () => {
  it('ohne Einladen-Aktion: weder „Einladen" noch „Nein danke"', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /Einladen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
  });

  it('mit Einladen-Aktion (Pflegekraft-Karte): beide Knöpfe', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} onInvite={vi.fn(async () => {})} onDeclineMatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Einladen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nein danke' })).toBeInTheDocument();
  });

  it('eingeladen, aus einer erledigten Karte: „Eingeladen — warten auf Bewerbung"', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} isInvited />);
    expect(screen.getByText(/Eingeladen — warten auf Bewerbung/)).toBeInTheDocument();
  });

  it('gebucht (nurProfil): keine Aktionen, auch wenn früher eingeladen', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} isInvited nurProfil onInvite={vi.fn(async () => {})} />);
    expect(screen.queryByText(/Eingeladen — warten auf Bewerbung/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Einladen/ })).toBeNull();
  });
});

// Registry #126: Pflegekraft gerade woanders im Einsatz — nicht „Noch kein
// Einsatz über Primundus", sondern der Hinweis wie im SA-Portal.
describe('CustomerNurseModal – Letzte Einsätze', () => {
  it('gerade woanders im Einsatz, ohne abgeschlossene: Hinweis statt „Noch kein Einsatz"', () => {
    render(<CustomerNurseModal nurse={{ ...nurse, onOtherJob: true }} onClose={() => {}} />);
    expect(screen.getByText('Letzte Einsätze')).toBeInTheDocument();
    expect(screen.getByText('Derzeit im Einsatz bei einem anderen Kunden.')).toBeInTheDocument();
    expect(screen.queryByText(/Noch kein Einsatz über Primundus/)).toBeNull();
  });

  it('ohne Einsätze und nicht im Einsatz: kein Abschnitt, Erklärung wie bisher', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} />);
    expect(screen.queryByText('Letzte Einsätze')).toBeNull();
    expect(screen.getByText(/Noch kein Einsatz über Primundus/)).toBeInTheDocument();
  });

  it('Abfrage gescheitert: sichtbarer Hinweis', () => {
    render(<CustomerNurseModal nurse={{ ...nurse, einsaetzeError: 'boom' }} onClose={() => {}} />);
    expect(screen.getByText('Die Einsätze können wir gerade nicht abrufen.')).toBeInTheDocument();
  });
});
