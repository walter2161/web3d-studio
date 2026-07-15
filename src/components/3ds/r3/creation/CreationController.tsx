import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCreation, CreatableTool, GhostObject } from './CreationContext';

interface Props {
  viewportType: 'perspective' | 'top' | 'front' | 'left';
  isActive: boolean;
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
  hedra: 1, chamferBox: 2, chamferCyl: 2, oilTank: 2, spindle: 2, gengon: 2, torusKnot: 1, ringWave: 1, prism: 2,
  line: 1, rectangle: 1, circle: 1, ellipse: 1, arc: 1, donut: 1, ngon: 1, star: 1, helix: 2, text: 1,
  wall: 1, // multi-click, handled by dedicated branch below
  door: 2, window: 2, // stage 0 drag = width × depth (box-like), stage 1 = height
  // Helpers: single-click place. Tape uses its own 2-click branch below.
  helper_point: 1, helper_dummy: 1, helper_grid: 1, helper_compass: 1, helper_tape: 1,
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
    case 'prism': {
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
    case 'sphere': {
      const r = Math.max(0.001, baseDist);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis] + r);
      geometry = { ...geometry, radius: r };
      break;
    }
    case 'cylinder':
    case 'cone':
    case 'chamferCyl':
    case 'oilTank':
    case 'spindle':
    case 'gengon':
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

export const CreationController = ({ viewportType, isActive }: Props) => {
  const { gl, camera } = useThree();
  const { armed, ghost, setGhost, commit, disarm } = useCreation();
  const stageRef = useRef<{ stage: number; start: THREE.Vector3 } | null>(null);
  const ghostRef = useRef<GhostObject | null>(ghost);
  ghostRef.current = ghost;


  useEffect(() => {
    if (!armed || !isActive) return;
    const dom = gl.domElement;
    dom.style.cursor = 'crosshair';

    // Disable orbit controls while a creation tool is armed.
    const controls = (window as any).__orbitControls;
    const prevEnabled = controls?.enabled;
    if (controls) controls.enabled = false;

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
      return hit;
    };

    // Vertical plane through the base center used to read height during stage >= 1.
    const raycastHeight = (e: PointerEvent, base: THREE.Vector3) => {
      raycaster.setFromCamera(toNdc(e), camera);
      const heightVec = heightAxis === 'y' ? new THREE.Vector3(0, 1, 0)
        : heightAxis === 'z' ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);
      const camDir = new THREE.Vector3().subVectors(camera.position, base);
      // Project into base plane, then use that direction as vertical-plane normal.
      camDir.sub(heightVec.clone().multiplyScalar(camDir.dot(heightVec)));
      if (camDir.lengthSq() < 1e-6) camDir.set(1, 0, 0);
      camDir.normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, base);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, hit);
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


    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

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
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // Commit preview corner, add new preview at the same spot.
          wallRef.pts[wallRef.pts.length - 1].copy(p);
          wallRef.pts.push(p.clone());
        }
        setGhost(buildWallGhost(wallRef.pts, false));
        e.preventDefault();
        e.stopPropagation();
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
            e.preventDefault();
            e.stopPropagation();
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
        dom.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const s = stageRef.current;
      if (!s) {
        // Stage 0 begins.
        const p = raycastBase(e);
        if (!p) return;
        stageRef.current = { stage: 0, start: p.clone() };
        setGhost(buildGhost(armed, 0, p, p, heightAxis));
        dom.setPointerCapture?.(e.pointerId);
      } else if (s.stage >= 1) {
        // Click confirms a "hovering" stage.
        if (s.stage >= totalStages - 1) {
          if (ghostRef.current) commit(ghostRef.current);
          stageRef.current = null;
        } else {
          stageRef.current = { ...s, stage: s.stage + 1 };
        }
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e: PointerEvent) => {
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
      const pt = s.stage === 0 ? raycastBase(e) : raycastHeight(e, s.start);
      if (!pt) return;
      setGhost(buildGhost(armed, s.stage, s.start, pt, heightAxis, ghostRef.current));
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
          stageRef.current = { ...s, stage: 1 };
        }
      }
      dom.releasePointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lineRef) { lineRef.knots = []; lineRef.draggingIdx = -1; }
        if (wallRef) { wallRef.pts = []; }
        stageRef.current = null;
        setGhost(null);
        disarm();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
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


    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);

    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      dom.style.cursor = '';
      if (controls) controls.enabled = prevEnabled ?? true;
      stageRef.current = null;
    };
    // ghost intentionally excluded — read via closure through setGhost's functional form isn't
    // needed since we always rebuild from start/current world points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, isActive, viewportType, camera, gl]);

  return null;
};
