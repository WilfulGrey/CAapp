import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AngebotFrage } from '../../components/portal/AngebotFrage';

const aufbau = (beantwortet = false) => {
  const onAnswer = vi.fn();
  const onAnfragen = vi.fn();
  const onErledigt = vi.fn();
  const onBestpreis = vi.fn();
  render(<AngebotFrage beantwortet={beantwortet} onAnswer={onAnswer} onAnfragen={onAnfragen} onErledigt={onErledigt} onBestpreis={onBestpreis} />);
  return { onAnswer, onAnfragen, onErledigt, onBestpreis };
};

describe('AngebotFrage', () => {
  it('„Ja" meldet loslegen genau einmal endgültig und springt ins Formular', async () => {
    const { onAnswer, onAnfragen, onErledigt } = aufbau();
    expect(screen.getByText('Passt Ihnen das Angebot?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ja, Bewerbungen anfragen' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('loslegen', undefined, true);
    expect(onAnfragen).toHaveBeenCalledTimes(1);
    expect(onErledigt).toHaveBeenCalledTimes(1);
    // Danach nur noch der Weg nach vorn, keine zweite Frage.
    expect(screen.getByRole('button', { name: 'Zur Pflegesituation' })).toBeInTheDocument();
  });

  it('„Passt nicht": erst still, dann mit Grund genau einmal endgültig', async () => {
    const { onAnswer, onErledigt } = aufbau();
    await userEvent.click(screen.getByRole('button', { name: 'Passt nicht' }));
    expect(onAnswer).toHaveBeenLastCalledWith('passt_nicht', undefined, false);
    await userEvent.click(screen.getByRole('button', { name: 'Doch ein Heim' }));
    expect(onAnswer).toHaveBeenLastCalledWith('passt_nicht', 'Doch ein Heim', true);
    expect(onAnswer.mock.calls.filter(c => c[2] === true)).toHaveLength(1);
    expect(onErledigt).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Danke für Ihre Rückmeldung.')).toBeInTheDocument();
  });

  it('„Zu teuer" bietet die Bestpreisgarantie an', async () => {
    const { onBestpreis } = aufbau();
    await userEvent.click(screen.getByRole('button', { name: 'Passt nicht' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zu teuer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestpreisgarantie' }));
    expect(onBestpreis).toHaveBeenCalledTimes(1);
  });

  it('„Vielleicht später" lässt sich überspringen und danach doch anfragen, ohne zweite Team-Mail', async () => {
    const { onAnswer, onAnfragen } = aufbau();
    await userEvent.click(screen.getByRole('button', { name: 'Vielleicht später' }));
    await userEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
    expect(onAnswer).toHaveBeenLastCalledWith('spaeter', undefined, true);
    await userEvent.click(screen.getByRole('button', { name: 'Doch Bewerbungen anfragen' }));
    expect(onAnfragen).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls.filter(c => c[2] === true)).toHaveLength(1);
  });

  it('wer schon geantwortet hat, sieht keine Frage mehr, nur den Weg zu den Bewerbungen', async () => {
    const { onAnswer, onAnfragen } = aufbau(true);
    expect(screen.queryByText('Passt Ihnen das Angebot?')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Zur Pflegesituation' }));
    expect(onAnfragen).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
