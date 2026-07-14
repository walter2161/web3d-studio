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
  line: 1, rectangle: 1, circle: 1, ellipse: 1, arc: 1, donut: 1, ngon: 1, star: 1, helix: 2,
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
      // Stage 0: two corners define width + depth.
      const w = Math.max(0.001, Math.abs(dBaseA));
      const d = Math.max(0.001, Math.abs(dBaseB));
      setBase(baseAxes[0], start[baseAxes[0]] + dBaseA / 2);
      setBase(baseAxes[1], start[baseAxes[1]] + dBaseB / 2);
      const h = stage >= 1 ? Math.max(0.001, Math.abs(dHeight)) : (prev?.geometry?.height ?? 0.001);
      setH(start[heightAxis] + (h / 2) * Math.sign(dHeight || 1));
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
      setH(start[heightAxis]);
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
      const r = Math.max(0.001, baseDist);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      const h = stage >= 1 ? Math.max(0.001, Math.abs(dHeight)) : (prev?.geometry?.height ?? 0.001);
      setH(start[heightAxis] + (h / 2) * Math.sign(dHeight || 1));
      geometry = { ...geometry, radius: r, radiusTop: r, radiusBottom: r, height: h };
      break;
    }
    case 'torus':
    case 'torusKnot':
    case 'donut':
    case 'ringWave': {
      const r = Math.max(0.001, baseDist);
      setBase(baseAxes[0], start[baseAxes[0]]);
      setBase(baseAxes[1], start[baseAxes[1]]);
      setH(start[heightAxis]);
      const tube = stage >= 1 ? Math.max(0.001, Math.min(r * 0.9, Math.abs(dHeight))) : (prev?.geometry?.tube ?? r * 0.25);
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

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
      const s = stageRef.current;
      if (!s) return;
      const pt = s.stage === 0 ? raycastBase(e) : raycastHeight(e, s.start);
      if (!pt) return;
      setGhost(buildGhost(armed, s.stage, s.start, pt, heightAxis, ghostRef.current));
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
        stageRef.current = null;
        setGhost(null);
        disarm();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      // Right-click also cancels current in-progress creation, like R3.
      if (stageRef.current) {
        e.preventDefault();
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
