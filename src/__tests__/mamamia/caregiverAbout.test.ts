import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the proxy client so we can count calls / control resolution.
vi.mock('../../lib/mamamia/client', () => ({ callMamamia: vi.fn() }));
import { callMamamia } from '../../lib/mamamia/client';
import {
  ABOUT_DE_MAX_OLD_LENGTH,
  isAboutDeStale,
  regenerateGermanDescription,
  _resetRegenerateCache,
} from '../../lib/mamamia/caregiverAbout';

const mockCall = callMamamia as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockCall.mockReset();
  _resetRegenerateCache();
});

describe('isAboutDeStale', () => {
  it('null / undefined / empty → stale', () => {
    expect(isAboutDeStale(null)).toBe(true);
    expect(isAboutDeStale(undefined)).toBe(true);
    expect(isAboutDeStale('')).toBe(true);
  });

  it('≤ 200 chars → stale (incl. exactly 200)', () => {
    expect(isAboutDeStale('x'.repeat(150))).toBe(true);
    expect(isAboutDeStale('x'.repeat(ABOUT_DE_MAX_OLD_LENGTH))).toBe(true); // =200
  });

  it('> 200 chars → fresh', () => {
    expect(isAboutDeStale('x'.repeat(201))).toBe(false);
    expect(isAboutDeStale('x'.repeat(500))).toBe(false);
  });

  it('threshold constant is 200', () => {
    expect(ABOUT_DE_MAX_OLD_LENGTH).toBe(200);
  });
});

describe('regenerateGermanDescription', () => {
  it('maps about_de + motivation from the proxy result + calls the right action', async () => {
    mockCall.mockResolvedValueOnce({ about_de: 'x'.repeat(300), motivation: 'meine Worte' });
    const r = await regenerateGermanDescription(42);
    expect(r).toEqual({ aboutDe: 'x'.repeat(300), motivation: 'meine Worte' });
    expect(mockCall).toHaveBeenCalledWith('generateCaregiverGermanDescription', { id: 42 });
  });

  it('coerces missing fields to null', async () => {
    mockCall.mockResolvedValueOnce({ about_de: null, motivation: null });
    const r = await regenerateGermanDescription(1);
    expect(r).toEqual({ aboutDe: null, motivation: null });
  });

  it('dedups concurrent calls per caregiver → exactly one proxy call', async () => {
    mockCall.mockResolvedValue({ about_de: 'fresh', motivation: null });
    const [a, b] = await Promise.all([
      regenerateGermanDescription(7),
      regenerateGermanDescription(7),
    ]);
    expect(a).toEqual(b);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache failures → a retry re-calls the proxy', async () => {
    mockCall.mockRejectedValueOnce(new Error('boom'));
    await expect(regenerateGermanDescription(9)).rejects.toThrow('boom');

    mockCall.mockResolvedValueOnce({ about_de: 'now-fresh', motivation: null });
    const r = await regenerateGermanDescription(9);
    expect(r.aboutDe).toBe('now-fresh');
    expect(mockCall).toHaveBeenCalledTimes(2);
  });
});
