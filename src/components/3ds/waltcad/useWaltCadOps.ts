/**
 * WaltCad — Runtime hook.
 *
 * Listens for `waltcad:op` events dispatched by the WaltCad panel / sidebar
 * buttons and translates them into concrete scene edits (spawn new spline
 * objects, replace the selected spline's data, generate walls/doors/windows).
 *
 * Mounted once inside Studio3D. All heavy geometry math lives in `cadOps.ts`
 * so this hook stays a thin translator.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  extractPolyline, polylineToSerialized, polylineLength,
  offsetPolyline, mirrorPolyline, arrayLinear, arrayRadial,
  explodeToSegments, joinPolylines, filletCorners, chamferCorners,
  dividePolyline, measurePolyline, breakPolyline, hatchLines,
  type Pt,
} from './cadOps';
import { useCadStore } from './cadStore';

interface Deps {
  objectsRef: React.MutableRefObject<any[]>;
  setObjects: (updater: (prev: any[]) => any[]) => void;
  saveState: () => void;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  setSelectedObject: (id: string | null) => void;
}

/** Build a fresh editable_spline scene object with an auto-name. */
function makeSplineObject(name: string, points: Pt[], closed: boolean, color: string) {
  const id = `cad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name,
    type: 'editable_spline' as const,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale:    [1, 1, 1] as [number, number, number],
    color,
    visible: true,
    locked: false,
    modifiers: [],
    geometry: { editableSpline: polylineToSerialized(points, closed) },
    userData: { cadLayer: useCadStore.getState().currentLayerId },
    ref: { current: null } as any,
  };
}

/** Pull the currently selected editable_spline (or its converted equivalent). */
function getSelectedSplineData(objs: any[], id: string | null) {
  if (!id) return null;
  const obj = objs.find((o) => o.id === id);
  if (!obj) return null;
  const serialized = obj.geometry?.editableSpline;
  if (!serialized) return null;
  const poly = extractPolyline(serialized);
  return { obj, ...poly };
}

export function useWaltCadOps(deps: Deps) {
  const { objectsRef, setObjects, saveState, selectedObjectId, selectedObjectIds, setSelectedObject } = deps;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const op: string = detail.op;
      const s = useCadStore.getState();
      const objs = objectsRef.current;

      // Ops that need a selected spline.
      const needSel = ['offset', 'mirror', 'array', 'explode', 'fillet', 'chamfer',
                      'divide', 'measure', 'break', 'hatch', 'dimension', 'generate_wall'];
      if (needSel.includes(op)) {
        const sel = getSelectedSplineData(objs, selectedObjectId);
        if (!sel) { toast.error('WaltCad — select a spline first'); return; }
        saveState();

        // ---------- OFFSET --------------------------------------------------
        if (op === 'offset') {
          const d = detail.distance ?? s.offsetDistance;
          const multi = Math.max(1, detail.multiple ?? s.offsetMultiple);
          const both = detail.bothSides ?? s.offsetBothSides;
          const newObjs: any[] = [];
          for (let i = 1; i <= multi; i++) {
            const pos = offsetPolyline(sel.points, d * i, sel.closed);
            newObjs.push(makeSplineObject(`${sel.obj.name}_Off${i}`, pos, sel.closed, sel.obj.color));
            if (both) {
              const neg = offsetPolyline(sel.points, -d * i, sel.closed);
              newObjs.push(makeSplineObject(`${sel.obj.name}_Off-${i}`, neg, sel.closed, sel.obj.color));
            }
          }
          setObjects((prev) => [...prev, ...newObjs]);
          toast.success(`Offset — ${newObjs.length} copies`);
          return;
        }

        // ---------- MIRROR --------------------------------------------------
        if (op === 'mirror') {
          const axis = (detail.axis ?? s.mirrorAxis) as 'x' | 'y' | 'z';
          const pivot: Pt = detail.pivot ?? [0, 0, 0];
          const mirrored = mirrorPolyline(sel.points, axis, pivot);
          if (s.mirrorCopy) {
            const newObj = makeSplineObject(`${sel.obj.name}_Mirror`, mirrored, sel.closed, sel.obj.color);
            setObjects((prev) => [...prev, newObj]);
            toast.success('Mirror — copy created');
          } else {
            setObjects((prev) => prev.map((o) => o.id === sel.obj.id
              ? { ...o, geometry: { editableSpline: polylineToSerialized(mirrored, sel.closed) } }
              : o));
            toast.success('Mirror applied');
          }
          return;
        }

        // ---------- ARRAY ---------------------------------------------------
        if (op === 'array') {
          const mode = detail.mode ?? s.arrayMode;
          const count = Math.max(1, detail.count ?? s.arrayCount);
          const items = mode === 'radial'
            ? arrayRadial(sel.points, count, detail.sweep ?? s.arrayCenterSweep)
            : arrayLinear(sel.points, count, detail.dx ?? s.arrayDX, detail.dy ?? s.arrayDY, detail.dz ?? s.arrayDZ);
          const newObjs = items.map((pts, i) =>
            makeSplineObject(`${sel.obj.name}_Arr${i + 1}`, pts, sel.closed, sel.obj.color));
          setObjects((prev) => [...prev, ...newObjs]);
          toast.success(`Array — ${newObjs.length} copies`);
          return;
        }

        // ---------- EXPLODE -------------------------------------------------
        if (op === 'explode') {
          const segs = explodeToSegments(sel.points, sel.closed);
          const newObjs = segs.map((seg, i) =>
            makeSplineObject(`${sel.obj.name}_S${i + 1}`, seg.points, false, sel.obj.color));
          setObjects((prev) => [...prev.filter((o) => o.id !== sel.obj.id), ...newObjs]);
          setSelectedObject(null);
          toast.success(`Explode — ${newObjs.length} segments`);
          return;
        }

        // ---------- FILLET / CHAMFER ----------------------------------------
        if (op === 'fillet') {
          const r = detail.radius ?? s.filletRadius;
          const next = filletCorners(sel.points, r, sel.closed);
          setObjects((prev) => prev.map((o) => o.id === sel.obj.id
            ? { ...o, geometry: { editableSpline: polylineToSerialized(next, sel.closed) } } : o));
          toast.success('Fillet applied');
          return;
        }
        if (op === 'chamfer') {
          const a = detail.a ?? s.chamferA, b = detail.b ?? s.chamferB;
          const next = chamferCorners(sel.points, a, b, sel.closed);
          setObjects((prev) => prev.map((o) => o.id === sel.obj.id
            ? { ...o, geometry: { editableSpline: polylineToSerialized(next, sel.closed) } } : o));
          toast.success('Chamfer applied');
          return;
        }

        // ---------- DIVIDE / MEASURE ---------------------------------------
        if (op === 'divide' || op === 'measure') {
          const pts = op === 'divide'
            ? dividePolyline(sel.points, detail.count ?? s.divideCount, sel.closed)
            : measurePolyline(sel.points, detail.spacing ?? s.measureSpacing, sel.closed);
          const helpers = pts.map((p, i) => ({
            id: `mark_${Date.now()}_${i}`,
            name: `${op === 'divide' ? 'Div' : 'Msr'}${i + 1}`,
            type: 'helper' as const,
            position: p, rotation: [0, 0, 0], scale: [1, 1, 1],
            color: '#ffff55', visible: true, locked: false, modifiers: [],
            geometry: { helperKind: 'point', size: 0.05, showAxis: false },
            userData: { cadLayer: useCadStore.getState().currentLayerId },
            ref: { current: null } as any,
          }));
          setObjects((prev) => [...prev, ...helpers]);
          toast.success(`${op === 'divide' ? 'Divide' : 'Measure'} — ${helpers.length} points`);
          return;
        }

        // ---------- BREAK ---------------------------------------------------
        if (op === 'break') {
          const [a, b] = breakPolyline(sel.points, detail.t ?? s.breakPointT);
          const A = makeSplineObject(`${sel.obj.name}_A`, a, false, sel.obj.color);
          const B = makeSplineObject(`${sel.obj.name}_B`, b, false, sel.obj.color);
          setObjects((prev) => [...prev.filter((o) => o.id !== sel.obj.id), A, B]);
          setSelectedObject(A.id);
          toast.success('Break — split into 2 splines');
          return;
        }

        // ---------- HATCH ---------------------------------------------------
        if (op === 'hatch') {
          const lines = hatchLines(sel.points, detail.spacing ?? s.hatchSpacing, detail.angle ?? s.hatchAngle);
          const newObjs = lines.map((ln, i) =>
            makeSplineObject(`${sel.obj.name}_Hatch${i + 1}`, ln.points, false, s.hatchColor));
          setObjects((prev) => [...prev, ...newObjs]);
          toast.success(`Hatch — ${newObjs.length} lines`);
          return;
        }

        // ---------- DIMENSION -----------------------------------------------
        if (op === 'dimension') {
          const L = polylineLength(sel.points, sel.closed);
          const text = `${L.toFixed(s.dimensionPrecision)} m`;
          const mid = sel.points[Math.floor(sel.points.length / 2)];
          const dim = {
            id: `dim_${Date.now()}`,
            name: `Dim_${sel.obj.name}`,
            type: 'text' as const,
            position: [mid[0], mid[1] + 0.1, mid[2] || 0],
            rotation: [0, 0, 0], scale: [1, 1, 1],
            color: '#ffff55', visible: true, locked: false, modifiers: [],
            geometry: { text, size: s.dimensionTextHeight, extrudeDepth: 0, bevelEnabled: false },
            userData: { cadLayer: 'l7', cadDimensionOf: sel.obj.id },
            ref: { current: null } as any,
          };
          setObjects((prev) => [...prev, dim as any]);
          toast.success(`Dimension: ${text}`);
          return;
        }

        // ---------- WALL from spline ---------------------------------------
        if (op === 'generate_wall') {
          const height = detail.height ?? s.wallHeight;
          const thickness = detail.thickness ?? s.wallThickness;
          const wall = {
            id: `wall_${Date.now()}`,
            name: `${sel.obj.name}_Walls`,
            type: 'wall' as const,
            position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
            color: '#dddddd', visible: true, locked: false, modifiers: [],
            geometry: {
              height, width: thickness,
              path: sel.points.map((p) => [p[0], p[2] || 0, -p[1]]), // CAD XY → world XZ
              closed: sel.closed,
            },
            userData: { cadLayer: 'l1' },
            ref: { current: null } as any,
          };
          setObjects((prev) => [...prev, wall as any]);
          toast.success('Walls generated from spline');
          return;
        }
      }

      // ---------- JOIN (needs 2+ selected) ----------------------------------
      if (op === 'join') {
        if (selectedObjectIds.length < 2) { toast.error('WaltCad — select 2 splines to join'); return; }
        const a = getSelectedSplineData(objs, selectedObjectIds[0]);
        const b = getSelectedSplineData(objs, selectedObjectIds[1]);
        if (!a || !b) { toast.error('WaltCad — both must be splines'); return; }
        const joined = joinPolylines(a.points, b.points, detail.tolerance ?? 0.05);
        if (!joined) { toast.error('WaltCad — endpoints too far apart'); return; }
        saveState();
        const merged = makeSplineObject(`${a.obj.name}_Join`, joined, false, a.obj.color);
        setObjects((prev) => [...prev.filter((o) => o.id !== a.obj.id && o.id !== b.obj.id), merged]);
        setSelectedObject(merged.id);
        toast.success('Splines joined');
        return;
      }

      // ---------- Tools we route as pure toasts for now ---------------------
      if (['trim', 'extend', 'stretch', 'scale_ref', 'align', 'match_props'].includes(op)) {
        toast.info(`WaltCad — ${op}: interactive picker coming soon`);
        return;
      }
    };
    window.addEventListener('waltcad:op', handler as EventListener);
    return () => window.removeEventListener('waltcad:op', handler as EventListener);
  }, [objectsRef, setObjects, saveState, selectedObjectId, selectedObjectIds, setSelectedObject]);
}
