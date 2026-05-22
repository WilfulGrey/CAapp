// Defensive patch for React vs. browser translation extensions
// (Google Translate, Chrome built-in translate, Edge translate, etc.).
//
// Problem
// -------
// Browser translators replace text nodes by wrapping them in <font> elements
// to swap content in place. That breaks React's reconciler: when a conditional
// branch unmounts (e.g. step === 0 → step === 1 in the patient form wizard),
// React calls Node.prototype.removeChild on what it remembers as the text
// node's parent — but the translator has reparented the text node into a
// <font>, so `child.parentNode !== this` and `removeChild` throws. The throw
// propagates up and the entire root unmounts, leaving a blank page.
//
// Reported repro: 5-step PatientForm in the kundenportal with Google Translate
// active. Click "Weiter" anywhere → blank screen.
//
// Fix
// ---
// Make removeChild / insertBefore no-op (with console warning) when the
// parent chain has been mutated out from under React. React then proceeds
// with the next reconciliation step instead of throwing. The translated DOM
// can look slightly off until React re-renders, but the app keeps running —
// vastly better than the white screen.
//
// This is the long-standing workaround from facebook/react#11538 — same
// shape used by Gatsby, Next.js (in their docs), and many production apps
// with multilingual user bases. We can't disable Google Translate because
// non-German family members (often Ukrainian / Polish / Russian) use it to
// help elderly parents read the portal.
//
// Idempotent: re-importing this module won't double-patch.

declare global {
  interface Node {
    __caappTranslatePatched?: boolean;
  }
}

export function installTranslateGuard(): void {
  if (typeof Node === 'undefined' || !Node.prototype) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((Node.prototype as any).__caappTranslatePatched) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function patchedRemoveChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[translateGuard] removeChild called on wrong parent — likely browser translator interference. Skipping to avoid React crash.',
        );
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function patchedInsertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[translateGuard] insertBefore called with reference node from wrong parent — likely browser translator interference. Falling back to appendChild.',
        );
      }
      // Best-effort: keep newNode in the tree by appending. Better than
      // throw + unmount.
      return this.appendChild(newNode) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Node.prototype as any).__caappTranslatePatched = true;
}
