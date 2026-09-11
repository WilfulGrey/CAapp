import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { identifyClarity, _resetClarityIdentifyState } from '../lib/clarity';

// Lead-IDs (UUID) — the only thing Clarity may receive as userId.
const ID_A = '11111111-2222-4333-8444-555555555555';
const ID_B = '66666666-7777-4888-9999-aaaaaaaaaaaa';
// Shape of a magic-link token (generateToken: 32 alphanumerics).
const TOKEN = 'Ab3dEf6hIj9lMn2pQr5tUv8xYz1bCd4f';

describe('identifyClarity', () => {
  beforeEach(() => {
    _resetClarityIdentifyState();
    vi.useFakeTimers();
    // Default: clarity NOT yet on window
    delete (window as { clarity?: unknown }).clarity;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { clarity?: unknown }).clarity;
  });

  it('calls clarity("set", "userId", leadId) when window.clarity is already present', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity(ID_A);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('set', 'userId', ID_A);
  });

  it('dedupes identical lead ID across multiple calls', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity(ID_A);
    identifyClarity(ID_A);
    identifyClarity(ID_A);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fires again when lead ID changes', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity(ID_A);
    identifyClarity(ID_B);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 'set', 'userId', ID_A);
    expect(spy).toHaveBeenNthCalledWith(2, 'set', 'userId', ID_B);
  });

  it('retries until window.clarity appears, then identifies', async () => {
    identifyClarity(ID_A);
    // Tag not loaded yet — nothing happens after 1 tick
    vi.advanceTimersByTime(400);
    expect((window as { clarity?: unknown }).clarity).toBeUndefined();

    // Tag arrives mid-retry
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledWith('set', 'userId', ID_A);
  });

  it('gives up after RETRY_MAX_MS without throwing', () => {
    // clarity never gets defined
    expect(() => identifyClarity(ID_A)).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect((window as { clarity?: unknown }).clarity).toBeUndefined();
    // No exceptions, no console noise. Module state stays unidentified —
    // a later call with the same ID can still succeed if the tag
    // arrives. Verify:
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity(ID_A);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('no-op for null / undefined / empty ID', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity(null);
    identifyClarity(undefined);
    identifyClarity('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not throw when clarity itself throws', () => {
    const spy = vi.fn(() => {
      throw new Error('clarity boom');
    });
    (window as { clarity?: unknown }).clarity = spy;
    expect(() => identifyClarity(ID_A)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never passes a magic-link token (Kontozugang) to Clarity', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity(TOKEN);
    identifyClarity('not-a-uuid');
    vi.advanceTimersByTime(10_000);
    expect(spy).not.toHaveBeenCalled();
  });
});
