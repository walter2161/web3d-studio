/**
 * Helper objects (Create → Helpers tab). Non-renderable in the final output —
 * these exist only to assist positioning, animation, measurement and rig setup,
 * exactly like the 3ds Max Helpers category (Point / Dummy / Tape / Grid /
 * Compass / …).
 *
 * All helpers share one `Object3DData.type = 'helper'` slot and disambiguate via
 * `geometry.helperKind`.
 */

export type HelperKind = 'point' | 'dummy' | 'tape' | 'grid' | 'compass';

export const HELPER_KINDS: HelperKind[] = ['point', 'dummy', 'tape', 'grid', 'compass'];

export const HELPER_LABEL: Record<HelperKind, string> = {
  point:   'Point',
  dummy:   'Dummy',
  tape:    'Tape',
  grid:    'Grid',
  compass: 'Compass',
};

export interface HelperGeom {
  helperKind: HelperKind;
  // Point
  size?: number;
  showCross?: boolean;
  showBox?: boolean;
  showAxisTripod?: boolean;
  showCenterMarker?: boolean;
  constantScreenSize?: boolean;
  // Dummy
  length?: number;
  width?: number;
  height?: number;
  // Tape (world-space endpoints — pivot is start)
  endpointA?: [number, number, number];
  endpointB?: [number, number, number];
  specifyLength?: boolean;
  targetLength?: number;
  // Grid
  gridLength?: number;
  gridWidth?: number;
  gridSpacing?: number;
  // Compass
  radius?: number;
  showTicks?: boolean;
}

export const HELPER_DEFAULTS: Record<HelperKind, HelperGeom> = {
  point: {
    helperKind: 'point',
    size: 0.2,
    showCross: true,
    showBox: false,
    showAxisTripod: false,
    showCenterMarker: false,
    constantScreenSize: false,
  },
  dummy: {
    helperKind: 'dummy',
    length: 1,
    width: 1,
    height: 1,
  },
  tape: {
    helperKind: 'tape',
    endpointA: [0, 0, 0],
    endpointB: [1, 0, 0],
    specifyLength: false,
    targetLength: 1,
  },
  grid: {
    helperKind: 'grid',
    gridLength: 5,
    gridWidth: 5,
    gridSpacing: 0.5,
  },
  compass: {
    helperKind: 'compass',
    radius: 1,
    showTicks: true,
  },
};

/** Reads endpoint distance for the current tape helper. */
export const tapeDistance = (g: HelperGeom | undefined | null): number => {
  if (!g?.endpointA || !g?.endpointB) return 0;
  const dx = g.endpointB[0] - g.endpointA[0];
  const dy = g.endpointB[1] - g.endpointA[1];
  const dz = g.endpointB[2] - g.endpointA[2];
  return Math.hypot(dx, dy, dz);
};

/** Helpers do not render to the final image (no shadows, not exported). */
export const isHelperType = (t: string) => t === 'helper' || (typeof t === 'string' && t.startsWith('helper_'));
