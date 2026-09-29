/** @vitest-environment jsdom */
// Buchen: sichtbar machen, was fehlt (Martin 29.09.2026). Kunden riefen an,
// weil „Kostenpflichtig unterschreiben" grau blieb und nirgends stand, welches
// Feld fehlt. Jetzt: Zusammenfassung oben mit Sprung zum Feld, Markierung am
// Feld, Knöpfe immer antippbar — ein Tipp mit offenen Angaben sagt, was fehlt.
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AngebotPruefenModal, fehlendeAngaben, type ContractFormData } from '../../components/portal/AngebotPruefenModal';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

const app: Application = {
  id: '13721',
  nurse: {
    id: 1, caregiverId: 25407, name: 'Halina J.', age: 60, color: '#8B7355',
    experience: '5 J. Erfahrung', experienceYears: 5, language: { level: 'B1', bars: 3 },
    history: { assignments: 7, avgDurationMonths: 2 }, availability: '', availableSoon: false,
    addedTime: '', isLive: false, gender: 'female',
  } as unknown as Nurse,
  agencyName: 'Pflegeagentur', appliedAt: '—', status: 'new', message: '',
  offer: {
    monatlicheKosten: 2650, anreisedatum: '01.10.2026', abreisedatum: '15.12.2026',
    anreisekosten: 125, abreisekosten: 125, reisetage: 'Halb', feiertagszuschlag: 88,
    kuendigungsfrist: 'Täglich kündbar', submittedAt: '25.09.2026',
  },
};

// Typischer Fall aus dem Rechner: Name und Kontakt da, Adresse der betreuten Person fehlt.
const prefill: Partial<ContractFormData> = {
  anrede: 'Frau', vorname: 'Erika', nachname: 'Muster', strasse: '', einsatzort: '',
  telefon: '', email: '', agGleich: true,
  kpAnrede: 'Frau', kpVorname: 'Petra', kpNachname: 'Muster', kpTelefon: '0171 1234567', kpEmail: 'petra@example.de',
};

function renderModal(over: Partial<ContractFormData> = {}, contractOnly = true) {
  const onAccept = vi.fn();
  const onClose = vi.fn();
  render(
    <AngebotPruefenModal app={app} prefill={{ ...prefill, ...over }} contractOnly={contractOnly}
      onClose={onClose} onAccept={onAccept} onNurseClick={vi.fn()} />,
  );
  return { onAccept, onClose };
}

const le = () => within(screen.getByRole('region', { name: /Betreute Person/ }));

// Der Dialog merkt sich Eingaben im sessionStorage (je Bewerbung) — Tests sollen bei null anfangen.
beforeEach(() => window.sessionStorage.clear());

describe('fehlendeAngaben — dieselben Regeln wie das bisherige Tor', () => {
  const voll: ContractFormData = {
    anrede: 'Herr', vorname: 'A', nachname: 'B', strasse: 'S 1', einsatzort: '80331 München', telefon: '', email: '',
    agGleich: true, agAnrede: '', agVorname: '', agNachname: '', agStrasse: '', agOrt: '', agTelefon: '', agEmail: '',
    kpAnrede: '', kpVorname: 'K', kpNachname: 'P', kpTelefon: '0171', kpEmail: 'k@p.de',
  };

  it('vollständig ⇒ nichts offen', () => {
    expect(fehlendeAngaben(voll)).toEqual([]);
  });

  it('leere Pflichtfelder ⇒ je Block benannt', () => {
    const f = fehlendeAngaben({ ...voll, strasse: ' ', einsatzort: '', kpVorname: '' });
    expect(f.map((a) => `${a.block}:${a.feld}`)).toEqual(['le:strasse', 'le:einsatzort', 'kp:kpVorname']);
  });

  it('Anrede nur Frau/Herr (Registry #88)', () => {
    expect(fehlendeAngaben({ ...voll, anrede: 'Divers' })[0]).toMatchObject({ feld: 'anrede', grund: 'leer' });
  });

  it('E-Mails: leer oder gültig, Kontaktperson Pflicht (Registry #52)', () => {
    expect(fehlendeAngaben({ ...voll, email: 'x@t-online.de@t-online.de' })[0]).toMatchObject({ feld: 'email', grund: 'ungueltig' });
    expect(fehlendeAngaben({ ...voll, kpEmail: '' })[0]).toMatchObject({ feld: 'kpEmail', grund: 'leer' });
    expect(fehlendeAngaben({ ...voll, kpEmail: 'Michael.kopka @ Freenet.de' })[0]).toMatchObject({ feld: 'kpEmail', grund: 'ungueltig' });
  });

  it('Vertragspartner nur, wenn jemand anderes unterschreibt', () => {
    expect(fehlendeAngaben({ ...voll, agGleich: false }).map((a) => a.feld)).toEqual(['agVorname', 'agNachname']);
    expect(fehlendeAngaben({ ...voll, agGleich: false, agVorname: 'T', agNachname: 'M', agEmail: 'kaputt' }).map((a) => a.feld)).toEqual(['agEmail']);
  });
});

describe('AngebotPruefenModal — was fehlt, steht da', () => {
  it('Zusammenfassung nennt die offenen Angaben, Felder sind markiert', () => {
    renderModal();
    expect(screen.getByText('Es fehlen 2 Angaben')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Betreute Person: Straße und Hausnummer · PLZ und Ort' })).toBeTruthy();
    // Block-Status
    expect(within(screen.getByRole('region', { name: /Betreute Person/ })).getByText('2 Angaben fehlen')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /Kontaktperson/ })).getByText('✓ Vollständig')).toBeTruthy();
    // Feld-Hinweis (gelb, noch nicht rot)
    const strasse = le().getByLabelText(/^Straße und Hausnummer/);
    expect(strasse.getAttribute('aria-describedby')).toBeTruthy();
    expect(strasse.getAttribute('aria-invalid')).toBeNull();
    expect(le().getAllByText('Bitte ausfüllen')).toHaveLength(2);
  });

  it('Tipp auf eine Zeile der Zusammenfassung setzt den Cursor ins erste offene Feld', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /Betreute Person: Straße/ }));
    expect(document.activeElement).toBe(le().getByLabelText(/^Straße und Hausnummer/));
  });

  it('„Weiter zur Unterschrift" mit offenen Angaben: bleibt, markiert rot, springt ins Feld', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));
    expect(screen.queryByRole('button', { name: /Kostenpflichtig unterschreiben/ })).toBeNull();
    const strasse = le().getByLabelText(/^Straße und Hausnummer/);
    expect(strasse.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(strasse);
  });

  it('alles ausgefüllt ⇒ grün, dann Unterschrift-Schritt', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(le().getByLabelText(/^Straße und Hausnummer/), 'Rosenweg 3');
    await user.type(le().getByLabelText(/^PLZ und Ort/), '96120 Bischberg');
    expect(screen.getByText('Alle Pflichtangaben vorhanden.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));
    expect(await screen.findByRole('button', { name: /Kostenpflichtig unterschreiben/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vertrag & Unterschrift' })).toBeTruthy();
  });

  it('Unterschrift ohne Name und Häkchen: sagt was fehlt, sendet nichts', async () => {
    const user = userEvent.setup();
    const { onAccept } = renderModal({ strasse: 'Rosenweg 3', einsatzort: '96120 Bischberg' });
    await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));
    await user.click(await screen.findByRole('button', { name: /Kostenpflichtig unterschreiben/ }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Bitte Ihren Namen eintippen und beide Häkchen setzen.');
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Vor- und Nachname'));
    expect(screen.getAllByText('Bitte bestätigen')).toHaveLength(2);

    await user.type(screen.getByPlaceholderText('Vor- und Nachname'), 'Petra Muster');
    await user.click(screen.getByText(/Ich habe den gesamten Vertragsinhalt gelesen/));
    expect(screen.getByRole('alert').textContent).toBe('Bitte das fehlende Häkchen setzen.');
    await user.click(screen.getByText(/Ich verlange ausdrücklich/));
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Kostenpflichtig unterschreiben/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0][1]).toMatchObject({ signatur: 'Petra Muster', strasse: 'Rosenweg 3', kpVorname: 'Petra' });
  });

  it('andere Person unterschreibt ⇒ Vertragspartner-Felder erscheinen und fehlen', async () => {
    const user = userEvent.setup();
    renderModal({ strasse: 'Rosenweg 3', einsatzort: '96120 Bischberg' });
    await user.click(screen.getByRole('radio', { name: /Eine andere Person/ }));
    expect(screen.getByRole('button', { name: 'Vertragspartner: Vorname · Nachname' })).toBeTruthy();
  });

  it('über dem Knopf steht immer, was offen ist (wie im Patientenbogen)', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Noch 2 Angaben offen' }));
    expect(document.activeElement).toBe(le().getByLabelText(/^Straße und Hausnummer/));
    await user.type(le().getByLabelText(/^Straße und Hausnummer/), 'Rosenweg 3');
    expect(screen.getByRole('button', { name: 'PLZ und Ort fehlt' })).toBeTruthy();
  });

  it('Eingaben bleiben nach dem Schließen erhalten (Name und Häkchen der Unterschrift nicht)', async () => {
    const user = userEvent.setup();
    const erst = render(
      <AngebotPruefenModal app={app} prefill={prefill} contractOnly onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    await user.type(le().getByLabelText(/^Straße und Hausnummer/), 'Rosenweg 3');
    await user.type(le().getByLabelText(/^PLZ und Ort/), '96120 Bischberg');
    await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));
    await user.type(await screen.findByPlaceholderText('Vor- und Nachname'), 'Petra Muster');
    erst.unmount();
    render(<AngebotPruefenModal app={app} prefill={prefill} contractOnly onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />);
    expect(le().getByLabelText(/^Straße und Hausnummer/)).toHaveValue('Rosenweg 3');
    expect(le().getByLabelText(/^PLZ und Ort/)).toHaveValue('96120 Bischberg');
    await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));
    expect(await screen.findByPlaceholderText('Vor- und Nachname')).toHaveValue('');
  });

  it('Tipp neben den Dialog schließt nur auf dem Angebot', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({}, false);
    // Schritt 1: Hintergrund schließt.
    const hintergrund = document.querySelector('.backdrop-blur-sm') as HTMLElement;
    await user.click(hintergrund);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Schritt 2: nicht mehr — Eingetipptes bliebe sonst weg.
    await user.click(screen.getByRole('button', { name: /Weiter →/ }));
    await user.click(document.querySelector('.backdrop-blur-sm') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Ihre Angaben' })).toBeTruthy();
  });
});
