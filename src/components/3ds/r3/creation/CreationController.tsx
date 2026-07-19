import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCreation, CreatableTool, GhostObject } from './CreationContext';
import { buildBoneChainFromPoints } from '../../rig/bones';
import { buildBiped } from '../../rig/biped';

interface Props {
  viewportType: 'perspective' | 'top' | 'front' | 'left';
  isActive: boolean;
  snapEnabled?: boolean;
  snapGridSpacing?: number;
}

// Per-viewport base plane + height axis. Height is always along the world axis
// pointing "up" toward the viewer for that view, matching 3ds Max's convention
// of drawing the base on the visible ground plane and rising toward the camera.
function planeForViewport(v: Props['viewportType']) {
  switch (v) {
    case 'front':
      return { normal: new THREE.Vector3(0, 0, 1), heightAxis: 'z' as const };
    case 'left':
      return { normal: new THREE.Vector3(1, 0, 0), heightAxis: 'x' as const };
    case 'top':
    case 'perspective':
    default:
      return { normal: new THREE.Vector3(0, 1, 0), heightAxis: 'y' as const };
  }
}

function snap(v: number, step: number) {
  if (!step) return v;
  return Math.round(v / step) * step;
}
function snapPoint(p: THREE.Vector3, step: number) {
  return new THREE.Vector3(snap(p.x, step), snap(p.y, step), snap(p.z, step));
}

const COLOR_GHOST = '#f5a742';

/**
 * FSM per primitive type:
 *   idle → down (starts stage 0) → move (updates) → up (advance)
 *          → move (updates next stage) → down (advance)
 *          → ... → commit.
 *
 * Radius-from-center tools (sphere/cylinder/cone/torus) treat pointer-down as
 * the pivot and drag length as radius, mirroring the classic R3 flow.
 */

const STAGES: Record<CreatableTool, number> = {
  box: 2, plane: 1, cylinder: 2, cone: 2, sphere: 1, torus: 2,
  teapot: 1, tube: 2, pyramid: 2, geoSphere: 1,
  hedra: 1, chamferBox: 2, chamferCyl: 2, oilTank: 2, spindle: 2, gengon: 2, torusKnot: 1, ringWave: 1, prism: 2,
  capsule: 2, lExt: 2, cExt: 2, hose: 2, foliage: 1,
  line: 1, rectangle: 1, circle: 1, ellipse: 1, arc: 1, donut: 1, ngon: 1, star: 1, helix: 2, text: 1,
  wall: 1,
  door: 2, window: 2,
  helper_point: 1, helper_dummy: 1, helper_grid: 1, helper_compass: 1, helper_tape: 1,
  sys_bones: 1,
  sys_biped: 1,
  sys_print_bed: 1,
  part_spray: 1, part_snow: 1, part_super_spray: 1, part_parray: 1, part_pcloud: 1, part_blizzard: 1,
};


function buildGhost(
  tool: CreatableTool,
  stage: number,
  start: THREE.Vector3,
  current: THREE.Vector3,
  heightAxis: 'x' | 'y' | 'z',
  prev?: GhostObject | null
): GhostObject {
  // Base-plane axes (the two world axes NOT equal to heightAxis).
  const baseAxes: ('x' | 'y' | 'z')[] = (['x', 'y', 'z'] as const).filter((a) => a !== heightAxis) as any;
  const dBaseA = current[baseAxes[0]] - start[baseAxes[0]];
  const dBaseB = current[baseAxes[1]] - start[baseAxes[1]];
  const dHeight = current[heightAxis] - start[heightAxis];
  const baseDist = Math.hypot(dBaseA, dBaseB);

  const centerBase: [number, number, number] = [0, 0, 0];
  const setBase = (axis: 'x' | 'y' | 'z', val: number) => {
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    centerBase[idx] = val;
  };
  const setH = (val: number) => setBase(heightAxis, val);

  let geometry: any = { ...(prev?.geometry || {}) };

  switch (tool) {
    case 'box':
    case 'chamferBox':
    case 'prism':
    case 'pyramid':
    case 'lExt':
    case 'cExt': {
      // Stage 0 (base): drag two corners → width + depth. Freeze base at stage ≥1.
      let w: number, d: number, cA: number, cB: number;
      if (stage === 0) {
        w = Math.max(0.001, Math.abs(dBaseA));
        d = Math.max(0.001, Math.abs(dBaseB));
        cA = start[baseAxes[0]] + dBaseA / 2;
        cB = start[baseAxes[1]] + dBaseB / 2;
      } else {
        w = heightAxis === 'y' ? (prev?.geometry?.width ?? 1) : heightAxis === 'z' ? (prev?.geometry?.width ?? 1) : (prev?.geometry?.height ?? 1);
        d = heightAxis === 'y' ? (prev?.geometry?.depth ?? 1) : heightAxis === 'z' ? (prev?.geometry?.height ?? 1) : (prev?.geometry?.depth ?? 1);
        const bIdxA = baseAxes[0] === 'x' ? 0 : baseAxes[0] === 'y' ? 1 : 2;
        const bIdxB = baseAxes[1] === 'x' ? 0 : baseAxes[1] === 'y' ? 1 : 2;
        cA = prev?.position[bIdxA] ?? 0;
        cB = prev?.position[bIdxB] ?? 0;
      }
      setBase(baseAxes[0], cA);
      setBase(baseAxes[1], cB);
      const h = stage >= 1 ? Math.max(0.001, Math.abs(dHeight)) : 0.001;
      // Base pivot: sit on the base plane, grow along heightAxis toward the cursor.
      setH(start[heightAxis] + (h / 2) * (stage >= 1 ? Math.sign(dHeight || 1) : 1));
      if (heightAxis === 'y') geometry = { ...geometry, width: w, depth: d, height: h };
      else if (heightAxis === 'z') geometry = { ...geometry, width: w, height: d, depth: h };
      else geometry = { ...geometry, height: w, depth: d, width: h };
      break;
    }
    case 'plane':
    case 'rectangle': {
      const w = Math.max(0.001, Math.abs(dBaseA));
      const d = Math.max(0.001, Math.abs(dBaseB));
      setBase(baseAxes[0], start[baseAxes[0]] + dBaseA / 2);
      setBase(baseAxes[1], start[baseAxes[1]] + dBaseB / 2);
      setH(start[heightAxis]);
      geometry = { ...geometry, width: w, height: d };
      break;
    }
    case 'sphere':
    case 'teapot':
    case 'geoSphere': {
      const r = Math.max(0.001, baseDist);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis] + r);
      geometry = { ...geometry, radius: r };
      break;
    }
    case 'foliage': {
      // Foliage é criada como o Box: um único click-and-drag define a ALTURA.
      // A copa (crownRadius) vem do preset da espécie selecionada na paleta,
      // então o usuário só precisa apontar o solo e arrastar para cima.
      const sp = (window as any).__foliageSpecies;
      const species = typeof sp === 'number' ? sp : (prev?.geometry?.species ?? 0);
      const preset = (window as any).__foliageSpeciesPreset?.[species];
      const presetCrown = preset?.crownRadius ?? prev?.geometry?.crownRadius ?? 3;
      const presetH     = preset?.height      ?? 6;
      // Enquanto o usuário ainda não arrastou o suficiente, mostra a altura
      // do preset para dar feedback visual do porte da árvore.
      const dragged = Math.abs(dHeight);
      const h = dragged > 0.05 ? dragged : presetH;
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = { ...geometry, species, radius: presetCrown, crownRadius: presetCrown, height: h };
      break;
    }
    case 'cylinder':
    case 'cone':
    case 'chamferCyl':
    case 'oilTank':
    case 'spindle':
    case 'gengon':
    case 'capsule':
    case 'hose':
    case 'tube':
    case 'helix': {
      // Stage 0: radius from center. Stage 1+: freeze radius, drag height.
      const r = stage === 0 ? Math.max(0.001, baseDist) : (prev?.geometry?.radius ?? 0.001);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      const h = stage >= 1 ? Math.max(0.001, Math.abs(dHeight)) : 0.001;
      setH(start[heightAxis] + (h / 2) * (stage >= 1 ? Math.sign(dHeight || 1) : 1));
      geometry = { ...geometry, radius: r, radiusTop: r, radiusBottom: r, height: h };
      break;
    }
    case 'torus':
    case 'torusKnot':
    case 'donut':
    case 'ringWave': {
      // Stage 0: main radius. Stage 1: freeze radius, drag height axis for tube.
      const r = stage === 0 ? Math.max(0.001, baseDist) : (prev?.geometry?.radius ?? 0.5);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      const tube = stage >= 1
        ? Math.max(0.001, Math.min(r * 0.9, Math.abs(dHeight)))
        : (prev?.geometry?.tube ?? r * 0.25);
      geometry = { ...geometry, radius: r, tube };
      break;
    }
    case 'hedra':
    case 'circle':
    case 'ellipse':
    case 'arc':
    case 'ngon':
    case 'star':
    case 'line': {
      const r = Math.max(0.001, baseDist);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = { ...geometry, radius: r, size: r };
      break;
    }
    case 'text': {
      // Drag length → font size. Default 1 when click without drag.
      const size = Math.max(0.1, baseDist || 1);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = { ...geometry, text: 'LEDMKT', font: 'helvetiker', bold: false, size, kerning: 0, curveSegments: 6 };
      break;
    }
    case 'door':
    case 'window': {
      // Same drag flow as Box: stage 0 sets the width × depth footprint,
      // stage 1 sets the height. Object grows up from the base plane so its
      // pivot sits on the floor (matches 3ds Max AEC convention).
      let w: number, d: number, cA: number, cB: number;
      if (stage === 0) {
        w = Math.max(0.05, Math.abs(dBaseA));
        d = Math.max(0.02, Math.abs(dBaseB));
        cA = start[baseAxes[0]] + dBaseA / 2;
        cB = start[baseAxes[1]] + dBaseB / 2;
      } else {
        w = prev?.geometry?.width ?? 0.9;
        d = prev?.geometry?.frameDepth ?? 0.2;
        const bIdxA = baseAxes[0] === 'x' ? 0 : baseAxes[0] === 'y' ? 1 : 2;
        const bIdxB = baseAxes[1] === 'x' ? 0 : baseAxes[1] === 'y' ? 1 : 2;
        cA = prev?.position[bIdxA] ?? 0;
        cB = prev?.position[bIdxB] ?? 0;
      }
      setBase(baseAxes[0], cA);
      setBase(baseAxes[1], cB);
      const h = stage >= 1
        ? Math.max(0.1, Math.abs(dHeight))
        : (tool === 'door' ? 2.1 : 1.2);
      // Pivot sits at the base — grow upward from start[heightAxis].
      setH(start[heightAxis]);
      geometry = {
        ...geometry,
        width: w,
        frameDepth: d,
        height: h,
        openPercentage: 0,
        ...(tool === 'door'
          ? { subtype: geometry.subtype ?? 'pivot', thickness: 0.04, frameSize: 0.05 }
          : { subtype: geometry.subtype ?? 'casement', frameThickness: 0.05, glassThickness: 0.01, sillHeight: 1.0 }),
      };
      break;
    }

    // Helpers — single-click placement (Point / Dummy / Grid / Compass).
    // Tape is handled by its own two-click branch in the controller so it
    // never enters buildGhost with a real ghost.
    case 'helper_point': {
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = {
        helperKind: 'point',
        size: 0.2, showCross: true, showBox: false,
        showAxisTripod: false, showCenterMarker: false, constantScreenSize: false,
      };
      break;
    }
    case 'helper_dummy': {
      // Drag defines size on the base plane; height mirrors width.
      const s = Math.max(0.01, baseDist || 0.5);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis] + s / 2);
      geometry = { helperKind: 'dummy', length: s, width: s, height: s };
      break;
    }
    case 'helper_grid': {
      const s = Math.max(0.1, baseDist * 2 || 5);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = { helperKind: 'grid', gridLength: s, gridWidth: s, gridSpacing: Math.max(0.05, s / 10) };
      break;
    }
    case 'helper_compass': {
      const r = Math.max(0.1, baseDist || 1);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = { helperKind: 'compass', radius: r, showTicks: true };
      break;
    }
    case 'helper_tape': {
      // Two-click flow handled separately (see tapeRef branch). Fallback:
      // a zero-length preview at the start point.
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = {
        helperKind: 'tape',
        endpointA: [0, 0, 0],
        endpointB: [current.x - start.x, current.y - start.y, current.z - start.z],
      };
      break;
    }

    // Particle emitters — drag defines the emitter footprint on the base
    // plane. Height axis is used only for the emission direction (visual
    // arrow); actual sim runs at commit time.
    case 'part_spray':
    case 'part_snow':
    case 'part_super_spray':
    case 'part_parray':
    case 'part_pcloud':
    case 'part_blizzard': {
      const w = Math.max(0.2, Math.abs(dBaseA) * 2 || 1);
      const l = Math.max(0.2, Math.abs(dBaseB) * 2 || 1);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      geometry = { ...(prev?.geometry || {}), emitterKind: tool.replace('part_', ''), width: w, length: l };
      break;
    }

  }



  return {
    id: '__ghost',
    type: tool,
    position: centerBase,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: COLOR_GHOST,
    geometry,
    visible: true,
    __creating: true,
  };
}

export const CreationController = ({ viewportType, isActive, snapEnabled, snapGridSpacing = 1 }: Props) => {
  const r3 = useThree();
  const { gl, camera } = r3;
  const { armed, ghost, setGhost, commit, disarm } = useCreation();
  const stageRef = useRef<{ stage: number; start: THREE.Vector3; heightStartClientY?: number; confirming?: boolean } | null>(null);
  const ghostRef = useRef<GhostObject | null>(ghost);
  ghostRef.current = ghost;


  useEffect(() => {
    if (!armed) return;
    const dom = gl.domElement;
    // Attach pointer listeners to the viewport wrapper (canvas parent) rather
    // than the <canvas> itself. This guarantees the FIRST pointerdown in a
    // cold Top/Front/Left viewport is caught in the same capture pass that
    // activates it — without racing R3F's own canvas handlers, overlay divs
    // or any per-viewport state that only settles after activation. The
    // wrapper is the same element that owns the yellow-border "active"
    // outline, so it exactly matches the click target the user aims at.
    const listenTarget: HTMLElement = (dom.parentElement as HTMLElement) || (dom as unknown as HTMLElement);
    dom.style.cursor = 'crosshair';
    listenTarget.style.cursor = 'crosshair';


    // Disable this viewport's navigation controls while a creation tool is
    // armed. The previous implementation disabled only the globally active
    // controls, so Top/Front/Left could still pan/zoom while drawing.
    const localControls = (r3 as any).controls;
    const globalControls = (window as any).__orbitControls;
    const controlsToDisable = Array.from(new Set([localControls, globalControls].filter(Boolean)));
    const prevEnabled = new Map<any, boolean>();
    controlsToDisable.forEach((controls: any) => {
      prevEnabled.set(controls, controls.enabled);
      controls.enabled = false;
    });

    const consume = (e: PointerEvent | MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
    };

    const { normal, heightAxis } = planeForViewport(viewportType);
    const basePlane = new THREE.Plane(normal, 0);
    const raycaster = new THREE.Raycaster();

    const toNdc = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
    };

    const raycastBase = (e: PointerEvent) => {
      raycaster.setFromCamera(toNdc(e), camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(basePlane, hit);
      if (snapEnabled) return snapPoint(hit, snapGridSpacing);
      return hit;
    };

    // Height stage: in a perspective viewport we intersect a vertical plane;
    // in an orthographic viewport the height axis is perpendicular to the
    // screen, so any world-vertical plane through `base` ends up parallel to
    // the picking ray and `intersectPlane` fails. Fall back to screen-Y
    // displacement (drag up on screen ⇒ height grows toward the camera).
    const raycastHeight = (e: PointerEvent, base: THREE.Vector3) => {
      const heightVec = heightAxis === 'y' ? new THREE.Vector3(0, 1, 0)
        : heightAxis === 'z' ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);

      const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
      if (isOrtho) {
        // Convert screen-Y delta (pixels, up = +) into world units using the
        // orthographic camera's visible height and zoom.
        const rect = dom.getBoundingClientRect();
        const startY = stageRef.current?.heightStartClientY ?? e.clientY;
        const dyPx = startY - e.clientY;
        const ortho = camera as THREE.OrthographicCamera;
        const worldHeight = (ortho.top - ortho.bottom) / Math.max(ortho.zoom, 1e-6);
        const worldPerPixel = worldHeight / Math.max(1, rect.height);
        // Sign: point the growth toward the viewer along the height axis.
        const camToBase = new THREE.Vector3().subVectors(base, camera.position);
        const sign = Math.sign(-camToBase.dot(heightVec)) || 1;
        const dWorld = dyPx * worldPerPixel * sign;
        const hit = base.clone().add(heightVec.clone().multiplyScalar(dWorld));
        if (snapEnabled) return snapPoint(hit, snapGridSpacing);
        return hit;
      }

      raycaster.setFromCamera(toNdc(e), camera);
      const camDir = new THREE.Vector3().subVectors(camera.position, base);
      // Project into base plane, then use that direction as vertical-plane normal.
      camDir.sub(heightVec.clone().multiplyScalar(camDir.dot(heightVec)));
      if (camDir.lengthSq() < 1e-6) camDir.set(1, 0, 0);
      camDir.normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, base);
      const hit = new THREE.Vector3();
      const ok = raycaster.ray.intersectPlane(plane, hit);
      if (!ok) return null;
      if (snapEnabled) return snapPoint(hit, snapGridSpacing);
      return hit;
    };

    const totalStages = STAGES[armed];

    // -------- Line tool: multi-click FSM with Bezier drag ---------
    // Each anchor is a "knot": position + in/out tangent handles.
    // Click without drag => Corner (zero handles). Click + drag => Bezier
    // (handles mirrored around the anchor, length = drag distance).
    // The LAST knot is always the live preview tracking the cursor.
    type Knot = { pos: THREE.Vector3; inH: THREE.Vector3; outH: THREE.Vector3 };
    const lineRef: { knots: Knot[]; draggingIdx: number } | null =
      armed === 'line' ? { knots: [], draggingIdx: -1 } : null;

    const buildLineGhost = (knots: Knot[], closed: boolean): GhostObject => {
      const centroid = new THREE.Vector3();
      knots.forEach((k) => centroid.add(k.pos));
      centroid.multiplyScalar(1 / knots.length);
      const local = knots.map((k) => ({
        pos: [k.pos.x - centroid.x, k.pos.y - centroid.y, k.pos.z - centroid.z] as [number, number, number],
        inH: [k.inH.x, k.inH.y, k.inH.z] as [number, number, number],
        outH: [k.outH.x, k.outH.y, k.outH.z] as [number, number, number],
      }));
      return {
        id: '__ghost',
        type: 'line',
        position: [centroid.x, centroid.y, centroid.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: COLOR_GHOST,
        geometry: { knots: local, closed },
        visible: true,
        __creating: true,
      };
    };

    const commitLine = (closed: boolean) => {
      if (!lineRef) return;
      const real = lineRef.knots.slice(0, -1); // drop preview
      if (real.length >= 2) {
        commit(buildLineGhost(real, closed));
      } else {
        setGhost(null);
      }
      lineRef.knots = [];
      lineRef.draggingIdx = -1;
    };

    const mkKnot = (p: THREE.Vector3): Knot => ({
      pos: p.clone(),
      inH: new THREE.Vector3(),
      outH: new THREE.Vector3(),
    });

    // -------- Wall tool: multi-click polyline, no bezier handles ---------
    // Each click drops a corner; a live preview segment tracks the cursor.
    // Right-click or ESC finishes (open). Clicking near the first point
    // closes the wall.
    const wallRef: { pts: THREE.Vector3[] } | null =
      armed === 'wall' ? { pts: [] } : null;

    const buildWallGhost = (pts: THREE.Vector3[], closed: boolean): GhostObject => {
      const centroid = new THREE.Vector3();
      pts.forEach((p) => centroid.add(p));
      centroid.multiplyScalar(1 / pts.length);
      const local = pts.map((p) => [p.x - centroid.x, 0, p.z - centroid.z] as [number, number, number]);
      return {
        id: '__ghost',
        type: 'wall',
        position: [centroid.x, centroid.y, centroid.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: COLOR_GHOST,
        geometry: { path: local, width: 0.2, height: 2.7, justification: 'center', closed },
        visible: true,
        __creating: true,
      };
    };

    const commitWall = (closed: boolean) => {
      if (!wallRef) return;
      const real = wallRef.pts.slice(0, -1); // drop preview
      if (real.length >= 2) {
        commit(buildWallGhost(real, closed));
      } else {
        setGhost(null);
      }
      wallRef.pts = [];
    };

    // -------- Tape helper: two-click distance measurement ----------------
    const tapeRef: { start: THREE.Vector3 | null; cursor: THREE.Vector3 } | null =
      armed === 'helper_tape' ? { start: null, cursor: new THREE.Vector3() } : null;

    const buildTapeGhost = (a: THREE.Vector3, b: THREE.Vector3): GhostObject => ({
      id: '__ghost',
      type: 'helper_tape',
      position: [a.x, a.y, a.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: COLOR_GHOST,
      geometry: {
        helperKind: 'tape',
        endpointA: [0, 0, 0],
        endpointB: [b.x - a.x, b.y - a.y, b.z - a.z],
        specifyLength: false,
        targetLength: 1,
      },
      visible: true,
      __creating: true,
    });

    // -------- Bones (Systems → Bones): multi-click chain, RMB or ESC ends.
    // Each click adds a new joint at the picked ground-plane point. A live
    // preview joint tracks the cursor between clicks.
    const bonesRef: { pts: THREE.Vector3[] } | null =
      armed === 'sys_bones' ? { pts: [] } : null;

    const buildBonesGhost = (pts: THREE.Vector3[]): GhostObject => {
      const worldPts: [number, number, number][] = pts.map((p) => [p.x, p.y, p.z]);
      const { position, geometry } = buildBoneChainFromPoints(worldPts);
      // Emit type='bone_chain' straight away so the renderer's isBoneType()
      // branch picks up the ghost during the multi-click preview.
      return {
        id: '__ghost',
        type: 'bone_chain' as any,
        position,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: COLOR_GHOST,
        geometry,
        visible: true,
        __creating: true,
      };
    };

    const commitBones = () => {
      if (!bonesRef) return;
      // Drop the trailing preview point.
      const real = bonesRef.pts.slice(0, -1);
      if (real.length >= 2) {
        commit(buildBonesGhost(real));
      } else {
        setGhost(null);
      }
      bonesRef.pts = [];
    };

    // -------- Biped (Systems → Biped): click-drag height, release spawns skeleton.
    const bipedRef: { start: THREE.Vector3 | null; height: number } | null =
      armed === 'sys_biped' ? { start: null, height: 0 } : null;

    const buildBipedGhost = (origin: THREE.Vector3, height: number): GhostObject => {
      // Preview as a single vertical bone_chain that grows with the drag.
      const h = Math.max(0.1, height);
      const worldPts: [number, number, number][] = [
        [origin.x, origin.y, origin.z],
        [origin.x, origin.y + h, origin.z],
      ];
      const { position, geometry } = buildBoneChainFromPoints(worldPts);
      return {
        id: '__ghost',
        type: 'bone_chain' as any,
        position,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: COLOR_GHOST,
        geometry: { ...geometry, width: h * 0.03, height: h * 0.03 },
        visible: true,
        __creating: true,
      };
    };

    const commitBiped = (origin: THREE.Vector3, height: number) => {
      // Fire a window event so Studio3D can spawn every bone_chain part in one
      // undoable batch. The context's single-object commit path is bypassed.
      const parts = buildBiped(height, [origin.x, origin.y, origin.z]);
      window.dispatchEvent(new CustomEvent('r3-spawn-biped', { detail: { parts } }));
      setGhost(null);
    };
    // -------- Print3D (Systems → Print3D): single-click placement on the base plane.
    // A ghost of the build plate follows the cursor; click commits at that spot.
    const printBedRef: { active: boolean } | null =
      armed === 'sys_print_bed' ? { active: true } : null;

    const buildPrintBedGhost = (p: THREE.Vector3): GhostObject => ({
      id: '__ghost',
      type: 'print_bed' as any,
      position: [p.x, p.y, p.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#5f7fa0',
      geometry: {},
      visible: true,
      __creating: true,
    });



    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      consume(e);

      if (printBedRef) {
        const p = raycastBase(e);
        if (!p) return;
        commit(buildPrintBedGhost(p));
        return;
      }


      if (bipedRef) {
        const p = raycastBase(e);
        if (!p) return;
        bipedRef.start = p.clone();
        bipedRef.height = 0.1;
        setGhost(buildBipedGhost(p, 0.1));
        listenTarget.setPointerCapture?.(e.pointerId);
        return;
      }


      if (bonesRef) {
        const p = raycastBase(e);
        if (!p) return;
        if (bonesRef.pts.length === 0) {
          bonesRef.pts.push(p.clone(), p.clone()); // first joint + live preview
        } else {
          bonesRef.pts[bonesRef.pts.length - 1].copy(p); // commit preview joint
          bonesRef.pts.push(p.clone()); // new preview
        }
        setGhost(buildBonesGhost(bonesRef.pts));
        return;
      }

      if (tapeRef) {
        const p = raycastBase(e);
        if (!p) return;
        if (!tapeRef.start) {
          tapeRef.start = p.clone();
          tapeRef.cursor.copy(p);
          setGhost(buildTapeGhost(p, p));
        } else {
          commit(buildTapeGhost(tapeRef.start, p));
          tapeRef.start = null;
        }
        return;
      }


      if (wallRef) {

        const p = raycastBase(e);
        if (!p) return;
        if (wallRef.pts.length === 0) {
          // First corner + live preview.
          wallRef.pts.push(p.clone(), p.clone());
        } else {
          const first = wallRef.pts[0];
          const camDist = camera.position.distanceTo(first);
          const tol = Math.max(0.05, camDist * 0.02);
          if (wallRef.pts.length >= 3 && p.distanceTo(first) < tol) {
            wallRef.pts[wallRef.pts.length - 1].copy(first);
            commitWall(true);
            return;
          }
          // Commit preview corner, add new preview at the same spot.
          wallRef.pts[wallRef.pts.length - 1].copy(p);
          wallRef.pts.push(p.clone());
        }
        setGhost(buildWallGhost(wallRef.pts, false));
        return;
      }


      if (lineRef) {
        const p = raycastBase(e);
        if (!p) return;
        if (lineRef.knots.length === 0) {
          // First anchor + live preview. Start dragging first anchor's handles.
          lineRef.knots.push(mkKnot(p), mkKnot(p));
          lineRef.draggingIdx = 0;
        } else {
          // Close-on-first-point check (world-space tolerance).
          const first = lineRef.knots[0].pos;
          const camDist = camera.position.distanceTo(first);
          const tol = Math.max(0.05, camDist * 0.02);
          if (lineRef.knots.length >= 3 && p.distanceTo(first) < tol) {
            // Snap preview to first knot, commit closed.
            lineRef.knots[lineRef.knots.length - 1].pos.copy(first);
            commitLine(true);
            return;
          }
          // Commit preview as anchor; drag will now shape its handles.
          const anchorIdx = lineRef.knots.length - 1;
          const anchor = lineRef.knots[anchorIdx];
          anchor.pos.copy(p);
          anchor.inH.set(0, 0, 0);
          anchor.outH.set(0, 0, 0);
          lineRef.draggingIdx = anchorIdx;
          // Add a new preview knot at the same position.
          lineRef.knots.push(mkKnot(p));
        }
        setGhost(buildLineGhost(lineRef.knots, false));
        listenTarget.setPointerCapture?.(e.pointerId);
        return;
      }

      const s = stageRef.current;
      if (!s) {
        // Stage 0 begins.
        const p = raycastBase(e);
        if (!p) return;
        stageRef.current = { stage: 0, start: p.clone(), heightStartClientY: e.clientY };
        setGhost(buildGhost(armed, 0, p, p, heightAxis));
        listenTarget.setPointerCapture?.(e.pointerId);
      } else if (s.stage >= 1) {
        // Height/secondary stages support BOTH classic 3ds Max behavior
        // (move mouse, click to confirm) and click-drag behavior (press, drag
        // upward, release to confirm). Commit is therefore delayed until up.
        stageRef.current = { ...s, heightStartClientY: e.clientY, confirming: true };
        listenTarget.setPointerCapture?.(e.pointerId);
      }
    };

    const onMove = (e: PointerEvent) => {
      consume(e);
      if (printBedRef) {
        const p = raycastBase(e);
        if (!p) return;
        setGhost(buildPrintBedGhost(p));
        return;
      }
      if (bipedRef) {
        if (!bipedRef.start) return;
        // Drag distance from start (screen-agnostic: use ray on a vertical plane).
        const pt = raycastHeight(e, bipedRef.start);
        if (!pt) return;
        const h = Math.max(0.1, Math.abs(pt.y - bipedRef.start.y));
        bipedRef.height = h;
        setGhost(buildBipedGhost(bipedRef.start, h));
        return;
      }
      if (bonesRef) {
        if (bonesRef.pts.length === 0) return;
        const p = raycastBase(e);
        if (!p) return;
        bonesRef.pts[bonesRef.pts.length - 1].copy(p);
        setGhost(buildBonesGhost(bonesRef.pts));
        return;
      }
      if (tapeRef) {
        if (!tapeRef.start) return;
        const p = raycastBase(e);
        if (!p) return;
        tapeRef.cursor.copy(p);
        setGhost(buildTapeGhost(tapeRef.start, p));
        return;
      }
      if (wallRef) {
        if (wallRef.pts.length === 0) return;
        const p = raycastBase(e);
        if (!p) return;
        wallRef.pts[wallRef.pts.length - 1].copy(p);
        setGhost(buildWallGhost(wallRef.pts, false));
        return;
      }
      if (lineRef) {
        if (lineRef.knots.length === 0) return;
        const p = raycastBase(e);
        if (!p) return;
        if (lineRef.draggingIdx >= 0) {
          // Button held after clicking anchor: drag defines Bezier handles.
          const anchor = lineRef.knots[lineRef.draggingIdx];
          const outH = p.clone().sub(anchor.pos);
          anchor.outH.copy(outH);
          anchor.inH.copy(outH.clone().multiplyScalar(-1));
        } else {
          // Between clicks: last knot is preview and follows the cursor.
          lineRef.knots[lineRef.knots.length - 1].pos.copy(p);
        }
        setGhost(buildLineGhost(lineRef.knots, false));
        return;
      }
      const s = stageRef.current;
      if (!s) return;
      // Foliage: um único stage cuja "base" fica ancorada no ponto de clique
      // e a distância vertical do cursor define a altura da árvore.
      const useHeightRay = armed === 'foliage' || s.stage >= 1;
      const pt = useHeightRay ? raycastHeight(e, s.start) : raycastBase(e);
      if (!pt) return;
      setGhost(buildGhost(armed, s.stage, s.start, pt, heightAxis, ghostRef.current));
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      consume(e);
      if (bipedRef) {
        if (bipedRef.start && bipedRef.height > 0.1) {
          commitBiped(bipedRef.start, bipedRef.height);
        } else {
          setGhost(null);
        }
        bipedRef.start = null;
        bipedRef.height = 0;
        dom.releasePointerCapture?.(e.pointerId);
        disarm();
        return;
      }
      if (lineRef) {
        // End of drag on an anchor; keep the anchor, wait for the next click.
        if (lineRef.draggingIdx >= 0) {
          lineRef.draggingIdx = -1;
          dom.releasePointerCapture?.(e.pointerId);
        }
        return;
      }


      const s = stageRef.current;
      if (!s) return;
      if (s.stage === 0) {
        if (totalStages === 1) {
          // Single-stage tools commit on release.
          if (ghostRef.current) commit(ghostRef.current);
          stageRef.current = null;
        } else {
          stageRef.current = { ...s, stage: 1, heightStartClientY: e.clientY };
        }
      } else if (s.confirming) {
        if (s.stage >= totalStages - 1) {
          if (ghostRef.current) commit(ghostRef.current);
          stageRef.current = null;
        } else {
          stageRef.current = { ...s, stage: s.stage + 1, heightStartClientY: e.clientY, confirming: false };
        }
      }
      dom.releasePointerCapture?.(e.pointerId);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lineRef) { lineRef.knots = []; lineRef.draggingIdx = -1; }
        if (wallRef) { wallRef.pts = []; }
        if (tapeRef) { tapeRef.start = null; }
        if (bonesRef && bonesRef.pts.length > 0) { commitBones(); }
        stageRef.current = null;
        setGhost(null);
        disarm();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      consume(e);
      if (bonesRef && bonesRef.pts.length > 0) {
        commitBones();
        return;
      }
      if (wallRef && wallRef.pts.length > 0) {
        commitWall(false);
        return;
      }
      if (lineRef && lineRef.knots.length > 0) {
        commitLine(false);
        return;
      }
      if (stageRef.current) {
        stageRef.current = null;
        setGhost(null);
      }
    };



    const capture = { capture: true } as AddEventListenerOptions;
    listenTarget.addEventListener('pointerdown', onDown as any, capture);
    listenTarget.addEventListener('pointermove', onMove as any, capture);
    listenTarget.addEventListener('pointerup', onUp as any, capture);
    listenTarget.addEventListener('contextmenu', onContextMenu as any, capture);
    window.addEventListener('keydown', onKey);

    return () => {
      listenTarget.removeEventListener('pointerdown', onDown as any, capture);
      listenTarget.removeEventListener('pointermove', onMove as any, capture);
      listenTarget.removeEventListener('pointerup', onUp as any, capture);
      listenTarget.removeEventListener('contextmenu', onContextMenu as any, capture);
      window.removeEventListener('keydown', onKey);
      dom.style.cursor = '';
      listenTarget.style.cursor = '';
      controlsToDisable.forEach((controls: any) => {
        controls.enabled = prevEnabled.get(controls) ?? true;
      });
      stageRef.current = null;
    };

    // ghost intentionally excluded — read via closure through setGhost's functional form isn't
    // needed since we always rebuild from start/current world points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, viewportType, camera, gl, snapEnabled, snapGridSpacing]);

  return null;
};
