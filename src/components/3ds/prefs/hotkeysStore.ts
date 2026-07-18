/**
 * Hotkeys store — persistent map of command → key chord that the customizable
 * global listener in Studio3D consults. Chords are strings like
 * `"Ctrl+Z"`, `"Alt+W"`, `"Shift+G"`, `"F4"`, so users can rebind visually
 * in the Customize UI dialog.
 *
 * The command name matches the label passed to `handleMenuAction()` in
 * Studio3D so a hotkey trigger and a menu click land on the same handler.
 */

export interface HotkeyBinding {
  command: string;
  /** Human label surfaced in the customize dialog. */
  label: string;
  /** Persisted chord string (empty = unbound). */
  chord: string;
  /** Category shown in the customize list. */
  category: 'Edit' | 'Views' | 'Create' | 'Modifiers' | 'Animation' | 'Tools' | 'File' | 'Group';
}

const DEFAULTS: HotkeyBinding[] = [
  // Edit
  { command: 'Undo',             label: 'Undo',            chord: 'Ctrl+Z',       category: 'Edit' },
  { command: 'Redo',             label: 'Redo',            chord: 'Ctrl+Y',       category: 'Edit' },
  { command: 'Delete',           label: 'Delete Selected', chord: 'Delete',       category: 'Edit' },
  { command: 'Clone',            label: 'Clone',           chord: 'Ctrl+V',       category: 'Edit' },
  { command: 'Select All',       label: 'Select All',      chord: 'Ctrl+A',       category: 'Edit' },
  { command: 'Select None',      label: 'Deselect All',    chord: 'Ctrl+D',       category: 'Edit' },
  // Views
  { command: 'Maximize Viewport',label: 'Maximize Viewport', chord: 'Alt+W',      category: 'Views' },
  { command: 'Zoom Extents',     label: 'Zoom Extents',    chord: 'Ctrl+Shift+Z', category: 'Views' },
  { command: 'Toggle Grid',      label: 'Toggle Grid',     chord: 'G',            category: 'Views' },
  { command: 'Wireframe',        label: 'Wireframe View',  chord: 'F3',           category: 'Views' },
  { command: 'Smooth+Highlights',label: 'Smooth + Highlights', chord: 'F4',       category: 'Views' },
  // Tools
  { command: 'Move',             label: 'Move Tool',       chord: 'W',            category: 'Tools' },
  { command: 'Rotate',           label: 'Rotate Tool',     chord: 'E',            category: 'Tools' },
  { command: 'Scale',            label: 'Scale Tool',      chord: 'R',            category: 'Tools' },
  { command: 'Select',           label: 'Select Tool',     chord: 'Q',            category: 'Tools' },
  // Animation
  { command: 'Set Key',          label: 'Set Key',         chord: 'K',            category: 'Animation' },
  { command: 'Play Animation',   label: 'Play / Pause',    chord: '/',            category: 'Animation' },
  // Group
  { command: 'Group',            label: 'Group',           chord: 'Ctrl+G',       category: 'Group' },
  { command: 'Ungroup',          label: 'Ungroup',         chord: 'Ctrl+Shift+G', category: 'Group' },
  // File
  { command: 'Save',             label: 'Save Scene',      chord: 'Ctrl+S',       category: 'File' },
  { command: 'Open',             label: 'Open Scene',      chord: 'Ctrl+O',       category: 'File' },
  { command: 'New',              label: 'New Scene',       chord: 'Ctrl+N',       category: 'File' },
];

const STORAGE_KEY = 'walt3d.hotkeys.v1';

let bindings: HotkeyBinding[] = load();
const listeners = new Set<() => void>();

function load(): HotkeyBinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as HotkeyBinding[];
    // Merge — start with defaults, override chords from parsed by command name.
    const map = new Map(parsed.map((b) => [b.command, b.chord] as const));
    return DEFAULTS.map((d) => ({ ...d, chord: map.get(d.command) ?? d.chord }));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('r3-hotkeys-changed'));
}

export function getHotkeys(): HotkeyBinding[] { return bindings; }

export function subscribeHotkeys(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setChord(command: string, chord: string) {
  bindings = bindings.map((b) => (b.command === command ? { ...b, chord } : b));
  persist();
  listeners.forEach((l) => l());
}

export function replaceHotkeys(next: HotkeyBinding[]) {
  bindings = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetHotkeys() {
  bindings = structuredClone(DEFAULTS);
  persist();
  listeners.forEach((l) => l());
}

// ---- Keyboard-event → chord serialiser -------------------------------------
/**
 * Convert a KeyboardEvent to a chord string like `"Ctrl+Shift+G"`.
 * Ignores lone modifier presses.
 */
export function eventToChord(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const k = e.key;
  if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return null;
  let key = k;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

/** Match a KeyboardEvent against a chord — case-insensitive on the key part. */
export function chordMatches(chord: string, e: KeyboardEvent): boolean {
  if (!chord) return false;
  const built = eventToChord(e);
  if (!built) return false;
  return built.toLowerCase() === chord.toLowerCase();
}

/** Find the command bound to a key event, if any. */
export function commandForEvent(e: KeyboardEvent): string | null {
  for (const b of bindings) {
    if (b.chord && chordMatches(b.chord, e)) return b.command;
  }
  return null;
}
