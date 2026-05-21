import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { identifyClarity, _resetClarityIdentifyState } from '../lib/clarity';

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

  it('calls clarity("set", "userId", token) when window.clarity is already present', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity('tok-abc');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('set', 'userId', 'tok-abc');
  });

  it('dedupes identical token across multiple calls', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity('tok-1');
    identifyClarity('tok-1');
    identifyClarity('tok-1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fires again when token changes', () => {
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity('tok-1');
    identifyClarity('tok-2');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 'set', 'userId', 'tok-1');
    expect(spy).toHaveBeenNthCalledWith(2, 'set', 'userId', 'tok-2');
  });

  it('retries until window.clarity appears, then identifies', async () => {
    identifyClarity('tok-late');
    // Tag not loaded yet — nothing happens after 1 tick
    vi.advanceTimersByTime(400);
    expect((window as { clarity?: unknown }).clarity).toBeUndefined();

    // Tag arrives mid-retry
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledWith('set', 'userId', 'tok-late');
  });

  it('gives up after RETRY_MAX_MS without throwing', () => {
    // clarity never gets defined
    expect(() => identifyClarity('tok-never')).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect((window as { clarity?: unknown }).clarity).toBeUndefined();
    // No exceptions, no console noise. Module state stays unidentified —
    // a later call with the same token can still succeed if the tag
    // arrives. Verify:
    const spy = vi.fn();
    (window as { clarity?: unknown }).clarity = spy;
    identifyClarity('tok-never');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('no-op for null / undefined / empty token', () => {
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
    expect(() => identifyClarity('tok-throwy')).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
