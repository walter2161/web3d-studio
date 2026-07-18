/**
 * UI colors store — persistent palette that customizes viewport paint, gizmo
 * axes and selection tints. Values are exposed both as CSS variables on
 * `<html>` (`--walt3d-*`) so shadcn tokens can consume them, and as raw hex on
 * `window.__uiColors` for the three.js code paths that draw with plain
 * `THREE.Color`.
 */

export interface UIColors {
  accent: string;          // primary UI accent (buttons, active tab)
  selectionOutline: string;
  wireframe: string;
  activeViewportBorder: string;
  gridMajor: string;
  gridMinor: string;
  axisX: string;
  axisY: string;
  axisZ: string;
  viewportBackground: string;
}

const DEFAULTS: UIColors = {
  accent: '#ffb020',
  selectionOutline: '#ffff00',
  wireframe: '#00e5ff',
  activeViewportBorder: '#ffdd33',
  gridMajor: '#606060',
  gridMinor: '#404040',
  axisX: '#e04a4a',
  axisY: '#4ae04a',
  axisZ: '#4a7ae0',
  viewportBackground: '#2a2a2a',
};

const STORAGE_KEY = 'walt3d.uiColors.v1';

let current: UIColors = load();
const listeners = new Set<() => void>();

function load(): UIColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<UIColors>;
    return { ...DEFAULTS, ...parsed };
  } catch { return { ...DEFAULTS }; }
}

function apply() {
  const root = document.documentElement;
  root.style.setProperty('--walt3d-accent', current.accent);
  root.style.setProperty('--walt3d-selection', current.selectionOutline);
  root.style.setProperty('--walt3d-wireframe', current.wireframe);
  root.style.setProperty('--walt3d-active-border', current.activeViewportBorder);
  root.style.setProperty('--walt3d-axis-x', current.axisX);
  root.style.setProperty('--walt3d-axis-y', current.axisY);
  root.style.setProperty('--walt3d-axis-z', current.axisZ);
  root.style.setProperty('--walt3d-viewport-bg', current.viewportBackground);
  (window as any).__uiColors = current;
  window.dispatchEvent(new CustomEvent('r3-uicolors-changed', { detail: current }));
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* noop */ }
  apply();
}

export function getUIColors(): UIColors { return current; }

export function subscribeUIColors(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setUIColor<K extends keyof UIColors>(key: K, value: UIColors[K]) {
  current = { ...current, [key]: value };
  persist();
  listeners.forEach((l) => l());
}

export function replaceUIColors(next: UIColors) {
  current = { ...DEFAULTS, ...next };
  persist();
  listeners.forEach((l) => l());
}

export function resetUIColors() {
  current = { ...DEFAULTS };
  persist();
  listeners.forEach((l) => l());
}

// Apply on module load so CSS vars exist before first paint.
apply();
