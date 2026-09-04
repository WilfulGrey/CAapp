import { describe, it, expect, vi } from 'vitest';
// Cross-App-Import (Ausnahme): das Pixel lebt im Kostenrechner
// (project 3/lib/oaiq.ts — pures Modul ohne Next-Imports), weil dort die
// Anfrage abgeschickt wird. Der Test steht hier, weil das die Suite ist, die
// als Pflicht-Check vor jedem Merge laeuft.
import { meldeAnfrage, WERT_ANFRAGE_EUR, OAIQ_PIXEL_ID } from '../../project 3/lib/oaiq';

describe('meldeAnfrage (OpenAI-Ads-Pixel)', () => {
  it('meldet lead_created als customer_action in Euro', () => {
    const oaiq = vi.fn();

    expect(meldeAnfrage(oaiq, 'lead-123')).toBe(true);
    expect(oaiq).toHaveBeenCalledTimes(1);
    expect(oaiq).toHaveBeenCalledWith(
      'measure',
      'lead_created',
      { type: 'customer_action', amount: WERT_ANFRAGE_EUR, currency: 'EUR' },
      { event_id: 'lead-123' },
    );
  });

  it('schweigt ohne Marketing-Einwilligung, statt zu werfen', () => {
    // Ohne Einwilligung laedt der Lader in app/layout.tsx das SDK nicht,
    // window.oaiq ist dann undefined. Das ist der Normalfall auf jeder Seite
    // vor dem Klick im Cookie-Banner — er darf die Anfrage nicht stoeren.
    expect(meldeAnfrage(undefined, 'lead-123')).toBe(false);
    expect(meldeAnfrage(null)).toBe(false);
    expect(meldeAnfrage({}, 'lead-123')).toBe(false);
  });

  it('laesst event_id weg, wenn keine leadId vorliegt', () => {
    const oaiq = vi.fn();

    meldeAnfrage(oaiq);

    expect(oaiq).toHaveBeenCalledWith(
      'measure',
      'lead_created',
      expect.anything(),
      undefined,
    );
  });

  it('haelt den Anfragewert auf der festen Staffelung, nicht am Eigenanteil', () => {
    // Der Eigenanteil liegt bei 2.000-3.000 €. Waere er hier der Wert, wuerde
    // das Gebotssystem teure Pflegefaelle bevorzugen — fuer uns ist aber jede
    // Anfrage gleich viel wert. Dieser Test ist die Bremse dagegen.
    expect(WERT_ANFRAGE_EUR).toBe(20);
  });

  it('haelt Pixel-ID und Ereignisnamen an das aus, was das SDK kennt', () => {
    // Die Namen sind nicht frei waehlbar: das SDK bildet sie fest auf Typen ab
    // (lead_created -> customer_action) und verwirft Unbekanntes still. Ein
    // Tippfehler waere also unsichtbar — deshalb hier festgenagelt.
    const oaiq = vi.fn();
    meldeAnfrage(oaiq, 'x');

    const [, name, details] = oaiq.mock.calls[0];
    expect(name).toBe('lead_created');
    expect(Object.keys(details as object).sort()).toEqual([
      'amount',
      'currency',
      'type',
    ]);
    expect(OAIQ_PIXEL_ID).toBe('6BMzErvmnYg7ibnpXriwfU');
  });
});
