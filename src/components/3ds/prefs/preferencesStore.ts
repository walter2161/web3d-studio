/**
 * Preferences store — persistent global settings that mirror the 3ds Max
 * `Customize → Preferences...` dialog tabs. Values are read via
 * `useSyncExternalStore` and by imperative consumers via `getPrefs()` /
 * `window.__prefs`.
 *
 * Every field here is a real switch: several are consulted at runtime (spinner
 * drag mode, statistics HUD, undo cap, FPS cap, gizmo size, etc.). Fields
 * without a runtime consumer yet are still persisted so the dialog "remembers"
 * the user's choice across sessions.
 */

export interface Preferences {
  general: {
    undoLevels: number;
    /** Show the yellow-border viewport activation toast (debug aid). */
    showActivationHint: boolean;
    autoBackupEnabled: boolean;
    autoBackupIntervalMin: number;
  };
  files: {
    recentFilesMax: number;
    compressOnSave: boolean;
    incrementalSave: boolean;
  };
  viewports: {
    /** Cap frames per second — 0 = uncapped. */
    fpsCap: number;
    showStatistics: boolean;
    showAxisTriad: boolean;
    showGrid: boolean;
    updateDuringSpinnerDrag: boolean;
    /** Wireframe silhouette angle (degrees). */
    wireframeAngle: number;
  };
  gamma: {
    /** Enable output gamma / LUT display correction. */
    enabled: boolean;
    displayGamma: number; // 1.0..3.0
    inputGamma: number;
    outputGamma: number;
  };
  rendering: {
    /** Default output width / height when the user opens the render dialog. */
    outputWidth: number;
    outputHeight: number;
    /** Antialiasing filter passes (0..8). */
    aaSamples: number;
    /** Enable shadow maps globally. */
    shadows: boolean;
  };
  animation: {
    defaultInTangent: 'auto' | 'linear' | 'step' | 'bezier';
    defaultOutTangent: 'auto' | 'linear' | 'step' | 'bezier';
    /** Playback speed multiplier applied to the timeline scrubber. */
    playbackSpeed: number;
    keyBrightness: number; // 0..1
  };
  inverseKinematics: {
    /** IK position threshold (world units) — solver stops iterating below. */
    positionThreshold: number;
    /** IK rotation threshold (degrees). */
    rotationThreshold: number;
    iterations: number;
    useDampening: boolean;
  };
  gizmos: {
    /** Screen-space size for the transform gizmo (px @ 1x). */
    transformSize: number;
    /** Show sub-object gizmos when appropriate. */
    showSubObjectGizmos: boolean;
    /** Tint gizmos with the active viewport accent. */
    tintWithAccent: boolean;
  };
  maxscript: {
    /** Print evaluation results to the Listener automatically. */
    autoPrint: boolean;
    /** Show line numbers in the mini editor. */
    lineNumbers: boolean;
    /** Font size in the Listener. */
    fontSize: number;
  };
}

const DEFAULTS: Preferences = {
  general: { undoLevels: 50, showActivationHint: false, autoBackupEnabled: false, autoBackupIntervalMin: 5 },
  files: { recentFilesMax: 9, compressOnSave: true, incrementalSave: false },
  viewports: { fpsCap: 0, showStatistics: false, showAxisTriad: true, showGrid: true, updateDuringSpinnerDrag: true, wireframeAngle: 1 },
  gamma: { enabled: false, displayGamma: 2.2, inputGamma: 2.2, outputGamma: 2.2 },
  rendering: { outputWidth: 1280, outputHeight: 720, aaSamples: 4, shadows: true },
  animation: { defaultInTangent: 'bezier', defaultOutTangent: 'bezier', playbackSpeed: 1, keyBrightness: 0.9 },
  inverseKinematics: { positionThreshold: 0.001, rotationThreshold: 0.5, iterations: 25, useDampening: true },
  gizmos: { transformSize: 100, showSubObjectGizmos: true, tintWithAccent: false },
  maxscript: { autoPrint: true, lineNumbers: true, fontSize: 12 },
};

const STORAGE_KEY = 'walt3d.preferences.v1';

// ---- Store internals -------------------------------------------------------
let current: Preferences = load();
const listeners = new Set<() => void>();

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    // Deep-merge with defaults so new fields introduced in later releases are
    // populated even when the persisted blob predates them.
    return {
      general: { ...DEFAULTS.general, ...(parsed.general || {}) },
      files: { ...DEFAULTS.files, ...(parsed.files || {}) },
      viewports: { ...DEFAULTS.viewports, ...(parsed.viewports || {}) },
      gamma: { ...DEFAULTS.gamma, ...(parsed.gamma || {}) },
      rendering: { ...DEFAULTS.rendering, ...(parsed.rendering || {}) },
      animation: { ...DEFAULTS.animation, ...(parsed.animation || {}) },
      inverseKinematics: { ...DEFAULTS.inverseKinematics, ...(parsed.inverseKinematics || {}) },
      gizmos: { ...DEFAULTS.gizmos, ...(parsed.gizmos || {}) },
      maxscript: { ...DEFAULTS.maxscript, ...(parsed.maxscript || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* noop */ }
  // Sync window bridges consumed by the rest of the app.
  const w = window as any;
  w.__prefs = current;
  w.__showStatistics = current.viewports.showStatistics;
  w.__updateDuringSpinnerDrag = current.viewports.updateDuringSpinnerDrag;
  w.__fpsCap = current.viewports.fpsCap;
  w.__undoLevels = current.general.undoLevels;
  w.__gizmoSize = current.gizmos.transformSize;
  w.__wireframeAngle = current.viewports.wireframeAngle;
  window.dispatchEvent(new CustomEvent('r3-prefs-changed', { detail: current }));
}

export function getPrefs(): Preferences { return current; }

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateSection<K extends keyof Preferences>(section: K, patch: Partial<Preferences[K]>) {
  current = { ...current, [section]: { ...current[section], ...patch } };
  persist();
  listeners.forEach((l) => l());
}

export function replaceAll(next: Preferences) {
  current = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetToDefaults() {
  replaceAll(structuredClone(DEFAULTS));
}

// Initial sync so global bridges are populated on module load.
persist();
