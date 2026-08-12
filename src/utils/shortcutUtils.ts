/* ─────────────────────────────────────────────────────────────
 *  KEYBOARD SHORTCUT CAPTURE & MATCHING
 * ─────────────────────────────────────────────────────────────
 *  A combo is stored as an ordered token array — modifiers first in a fixed
 *  canonical order, then exactly one non-modifier key:
 *
 *      ['Control', 'Escape']        ['Control', 'Shift', 'H']
 *
 *  Canonical ordering matters because the array is compared element-wise:
 *  without it, Ctrl+Shift+H recorded on one machine would not match the same
 *  physical press normalised in a different order.
 *
 *  Letters are matched by `event.key`, upper-cased. That deliberately follows
 *  the user's active keyboard LAYOUT rather than the physical key position,
 *  because the shortcut is shown to them as text — a combo displayed as
 *  "Ctrl + H" should fire on the key printed H.
 * ───────────────────────────────────────────────────────────── */

export type Combo = string[];

/** Fixed order so two recordings of the same press always compare equal. */
const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Meta'] as const;

const MODIFIER_KEYS = new Set<string>(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);

/** True while the event's own key is just a modifier being held down. */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

/** Single characters normalise to upper case; named keys keep their spelling. */
function normalizeKey(key: string): string {
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Builds the canonical combo for a keydown.
 *
 * Returns null while only modifiers are held — that is a combo still being
 * typed, not a finished one, which is what lets the recorder show live
 * feedback without committing on the first Ctrl press.
 */
export function comboFromEvent(e: KeyboardEvent): Combo | null {
  if (isModifierKey(e.key)) return null;

  const combo: string[] = [];
  if (e.ctrlKey) combo.push('Control');
  if (e.altKey) combo.push('Alt');
  if (e.shiftKey) combo.push('Shift');
  if (e.metaKey) combo.push('Meta');
  combo.push(normalizeKey(e.key));
  return combo;
}

/** The modifiers currently held, for live recorder feedback. */
export function heldModifiers(e: KeyboardEvent): string[] {
  const out: string[] = [];
  if (e.ctrlKey) out.push('Control');
  if (e.altKey) out.push('Alt');
  if (e.shiftKey) out.push('Shift');
  if (e.metaKey) out.push('Meta');
  return out.sort((a, b) => MODIFIER_ORDER.indexOf(a as never) - MODIFIER_ORDER.indexOf(b as never));
}

/** Exact match — every modifier must agree, so Ctrl+H never fires on Ctrl+Shift+H. */
export function matchesCombo(e: KeyboardEvent, combo: Combo | null | undefined): boolean {
  if (!combo || combo.length === 0) return false;
  const pressed = comboFromEvent(e);
  if (!pressed) return false;
  if (pressed.length !== combo.length) return false;
  for (let i = 0; i < combo.length; i++) {
    if (pressed[i] !== combo[i]) return false;
  }
  return true;
}

/* Optional-chained off globalThis so importing this module never depends on
   a DOM being present (tests, any future non-browser context). */
const isMac = /mac/i.test(globalThis.navigator?.platform ?? '');

const SYMBOLS: Record<string, string> = {
  Control: 'Ctrl',
  Meta: isMac ? '⌘' : 'Win',
  Alt: isMac ? '⌥' : 'Alt',
  Shift: 'Shift',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Human-readable rendering, e.g. "Ctrl + Esc". */
export function formatCombo(combo: Combo | null | undefined): string {
  if (!combo || combo.length === 0) return 'Not set';
  return combo.map((k) => SYMBOLS[k] ?? k).join(' + ');
}

/**
 * A combo that is too easy to hit by accident would blank the screen mid-use,
 * and one with no modifier would fire while typing in the search box.
 */
export function validateCombo(combo: Combo): string | null {
  if (combo.length < 2) return 'Use at least one modifier (Ctrl, Alt, Shift or ⌘) plus a key.';
  const main = combo[combo.length - 1];
  if (isModifierKey(main)) return 'Finish with a non-modifier key.';
  return null;
}
