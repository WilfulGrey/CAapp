// MamamiaError.category — parses `category` out of the proxy error body so
// the frontend can drive retry decisions (cat=validation = transient race
// from Mamamia translator wiping fields mid-invite; cat=authorization = fail
// fast).

import { describe, it, expect } from 'vitest';
import { MamamiaError } from '../../lib/mamamia/client';

describe('MamamiaError.category', () => {
  it('returns the category string from a JSON body', () => {
    const err = new MamamiaError(502, JSON.stringify({ error: 'upstream failed', category: 'validation' }));
    expect(err.category).toBe('validation');
  });

  it('returns authorization for cat=authorization shape', () => {
    const err = new MamamiaError(502, JSON.stringify({ error: 'upstream failed', category: 'authorization' }));
    expect(err.category).toBe('authorization');
  });

  it('returns null when body is valid JSON but has no category', () => {
    const err = new MamamiaError(502, JSON.stringify({ error: 'upstream failed' }));
    expect(err.category).toBeNull();
  });

  it('returns null when body is not JSON', () => {
    const err = new MamamiaError(500, 'Internal Server Error');
    expect(err.category).toBeNull();
  });

  it('returns null when body is empty', () => {
    const err = new MamamiaError(502, '');
    expect(err.category).toBeNull();
  });

  it('returns null when category is not a string', () => {
    const err = new MamamiaError(502, JSON.stringify({ error: 'x', category: 42 }));
    expect(err.category).toBeNull();
  });

  it('returns null when category is null', () => {
    const err = new MamamiaError(502, JSON.stringify({ error: 'x', category: null }));
    expect(err.category).toBeNull();
  });
});
