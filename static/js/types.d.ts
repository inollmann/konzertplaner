// ══════════════════════════════════════════════════════════════════════
// types.d.ts — ambient type overrides for the vanilla-JS SPA
//
// The app calls `document.getElementById('x').value` / `.checked` freely
// on inputs, checkboxes, and textareas. TypeScript's built-in `getElementById`
// returns `HTMLElement | null`, which doesn't have those properties. Rather
// than casting at every call site, we widen the return types to `any` here.
// ══════════════════════════════════════════════════════════════════════

export {};

declare global {
  interface Document {
    getElementById(elementId: string): any;
    querySelector(selectors: string): any;
    querySelectorAll(selectors: string): any[];
  }
  interface Element {
    closest(selectors: string): any;
    querySelector(selectors: string): any;
    querySelectorAll(selectors: string): any[];
    dataset: any;
  }
  interface HTMLElement {
    dataset: any;
  }
  interface EventTarget {
    getBoundingClientRect(): any;
    closest(selectors: string): any;
  }

  const L: any;
  interface Window {
    [key: string]: any;
  }
}