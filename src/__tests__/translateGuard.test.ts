// Smoke tests for the Google Translate guard. We can't load a real GT
// extension in jsdom, so we replicate the failure mode it produces:
// React holds a reference to a text node whose parent has been swapped
// from <p> to <font> (GT wraps the original text).
//
// Before the patch: parent.removeChild(textNode) throws DOMException
// because textNode.parentNode !== parent. After: returns the node and
// logs a warning.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTranslateGuard } from '../lib/translateGuard';

describe('translateGuard', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installTranslateGuard();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('removeChild — no-op + warn when child has been reparented (GT scenario)', () => {
    const originalParent = document.createElement('div');
    const text = document.createTextNode('Weiter');
    originalParent.appendChild(text);

    // Simulate GT: rewrap the text into a <font> inside originalParent.
    const font = document.createElement('font');
    originalParent.removeChild(text); // legit remove
    font.appendChild(text);
    originalParent.appendChild(font);

    // React still believes `text.parentNode === originalParent` and tries
    // to remove it directly. Pre-patch this throws; post-patch it returns
    // the node and warns.
    expect(() => originalParent.removeChild(text)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('removeChild'),
    );
  });

  it('insertBefore — falls back to appendChild when reference is reparented', () => {
    const parent = document.createElement('div');
    const a = document.createTextNode('A');
    const b = document.createTextNode('B');
    parent.appendChild(a);

    // GT moves `a` somewhere else.
    const elsewhere = document.createElement('span');
    parent.removeChild(a);
    elsewhere.appendChild(a);

    // React tries to insert `b` before `a` — now in a different parent.
    expect(() => parent.insertBefore(b, a)).not.toThrow();
    // b should still end up in the tree (appended).
    expect(parent.contains(b)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('insertBefore'),
    );
  });

  it('removeChild — still works normally when parent matches', () => {
    const parent = document.createElement('div');
    const text = document.createTextNode('hello');
    parent.appendChild(text);

    const result = parent.removeChild(text);
    expect(result).toBe(text);
    expect(parent.contains(text)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('insertBefore — still works normally when reference matches', () => {
    const parent = document.createElement('div');
    const a = document.createTextNode('A');
    const b = document.createTextNode('B');
    parent.appendChild(a);

    parent.insertBefore(b, a);
    expect(parent.childNodes[0]).toBe(b);
    expect(parent.childNodes[1]).toBe(a);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('is idempotent — calling installTranslateGuard twice does not double-wrap', () => {
    const before = Node.prototype.removeChild;
    installTranslateGuard();
    installTranslateGuard();
    expect(Node.prototype.removeChild).toBe(before);
  });
});
