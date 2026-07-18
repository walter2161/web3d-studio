/**
 * SelectionRegionOverlay — HTML/SVG marquee layer that reproduces the 3ds Max
 * "Selection Region" system per viewport. It supports Rectangle, Circle,
 * Fence, Lasso and Paint modes with Window vs Crossing behavior, plus Ctrl
 * (add) and Alt (remove) modifier keys.
 *
 * How it plugs in:
 *   - Sits on top of the R3F Canvas inside each Viewport wrapper.
 *   - Listens to pointerdown in the CAPTURE phase so it can decide before the
 *     Canvas whether the click starts on an empty area (region drag) or hits
 *     an existing object (let R3F handle the normal click-select).
 *   - Does its own manual raycast against the registered scene to detect
 *     "empty" clicks (via `viewportRegistry`).
 *
 * On release the overlay projects every scene object's position (and a small
 * screen-space extent) to screen coordinates and tests whether it falls
 * inside the drawn region. Matched ids are dispatched via a
 * `r3-region-select` window event which Studio3D consumes to update the
 * scene selection.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { getRegionState, subscribeRegion } from './selectionRegionStore';
import { getViewportHandle } from './viewportRegistry';

type Pt = { x: number; y: number };

interface Props {
  vkey: string;
  isActive: boolean;
  objects: Array<{ id: string; position?: [number, number, number]; scale?: [number, number, number]; visible?: boolean; parentId?: string | null }>;
  onSelectObjects: (ids: string[], additive: boolean, remove: boolean) => void;
}

const DRAG_THRESHOLD = 3; // px — below this counts as a plain click and passes through to Canvas.

export const SelectionRegionOverlay = ({ vkey, isActive, objects, onSelectObjects }: Props) => {
  const region = useSyncExternalStore(subscribeRegion, () => getRegionState(), () => getRegionState());
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Holds the OrbitControls instance we disabled at drag-threshold time so we
  // can guarantee we re-enable that SAME one (see comment inside effect).
  const disabledOCRef = useRef<any>(null);
  const [drag, setDrag] = useState<null | {
    kind: 'rect' | 'circle' | 'lasso' | 'fence' | 'paint';
    start: Pt;
    current: Pt;
    points: Pt[]; // for fence/lasso/paint
    additive: boolean;
    remove: boolean;
    painted: Set<string>; // for paint mode we accumulate hits as we move
  }>(null);

  // ---- Cursor +/- feedback --------------------------------------------------
  const [modKeys, setModKeys] = useState<{ ctrl: boolean; alt: boolean }>({ ctrl: false, alt: false });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setModKeys({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, []);

  // Manual raycast so we can decide if a mousedown is on empty space and
  // therefore should start a region drag rather than a click-pick.
  const rayHitsObject = (localX: number, localY: number, rect: DOMRect): boolean => {
    const handle = getViewportHandle(vkey);
    if (!handle) return false;
    const ndc = new THREE.Vector2(
      (localX / rect.width) * 2 - 1,
      -(localY / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, handle.camera as any);
    // Only test against user-visible objects: skip helpers/gizmos.
    const targets: THREE.Object3D[] = [];
    handle.scene.traverse((n) => {
      if ((n as any).isMesh && !(n as any).userData?.__helper) targets.push(n);
    });
    const hits = ray.intersectObjects(targets, false);
    return hits.length > 0;
  };

  // ---- Pointer handling ------------------------------------------------------
  // We attach the capture-phase pointerdown listener on the Canvas element
  // itself. The overlay DOM stays pointer-events:none until a region drag is
  // already active, otherwise it would sit above the canvas and block creation
  // tools (Box: click-drag base, release, then drag up for height).
  useEffect(() => {
    let canvas: HTMLCanvasElement | undefined;
    let disposed = false;
    let attached = false;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Pending drag candidate — we watch window pointermove until it either
    // exceeds DRAG_THRESHOLD (→ start marquee) or pointerup fires first
    // (→ it was a click, let R3F handle normal selection, we do nothing).
    let pending: null | {
      startClientX: number; startClientY: number;
      startLocal: Pt;
      rect: DOMRect;
      additive: boolean; remove: boolean;
      kind: 'rect' | 'circle' | 'lasso' | 'fence' | 'paint';
    } = null;

    // Track the exact OrbitControls instance we disabled so we always re-enable
    // the SAME one — the global `__activeOrbitControls` can point to another
    // viewport's controls by the time the drag ends, which would strand this
    // viewport's controls in disabled state (zoom/orbit stops working).
    let disabledOC: any = null;
    const grabOC = () => {
      const handle = getViewportHandle(vkey) as any;
      return handle?.controls ?? (window as any).__activeOrbitControls ?? null;
    };

    const onWinMove = (ev: PointerEvent) => {
      if (!pending) return;
      const dx = ev.clientX - pending.startClientX;
      const dy = ev.clientY - pending.startClientY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // Threshold crossed → promote to real marquee drag. Suppress OrbitControls
      // panning for the duration by grabbing it and disabling.
      disabledOC = grabOC();
      if (disabledOC) disabledOC.enabled = false;
      disabledOCRef.current = disabledOC;
      const curLocal = {
        x: ev.clientX - pending.rect.left,
        y: ev.clientY - pending.rect.top,
      };
      setDrag({
        kind: pending.kind,
        start: pending.startLocal,
        current: curLocal,
        points: [pending.startLocal, curLocal],
        additive: pending.additive,
        remove: pending.remove,
        painted: new Set(),
      });
      pending = null;
      window.removeEventListener('pointermove', onWinMove, true);
      window.removeEventListener('pointerup', onWinUp, true);
    };
    const onWinUp = () => {
      pending = null;
      window.removeEventListener('pointermove', onWinMove, true);
      window.removeEventListener('pointerup', onWinUp, true);
      if (disabledOC) { disabledOC.enabled = true; disabledOC = null; disabledOCRef.current = null; }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Don't hijack pointer events when a creation tool is armed — the
      // CreationController needs the pointerdown to start ghost placement.
      if ((window as any).__r3ArmedTool) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-viewport-chrome]')) return;

      const rect = wrapper.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // IMPORTANT: don't stopPropagation and don't setDrag yet. Let R3F handle
      // the click normally — if it lands on an object it selects, if it lands
      // on empty space onPointerMissed fires. We only take over if the user
      // actually drags past DRAG_THRESHOLD, at which point it becomes a
      // marquee selection.
      const kind: 'rect' | 'circle' | 'lasso' | 'fence' | 'paint' =
        region.regionMode === 'rectangle' ? 'rect'
        : region.regionMode === 'circle' ? 'circle'
        : region.regionMode === 'fence' ? 'fence'
        : region.regionMode === 'paint' ? 'paint'
        : 'lasso';

      pending = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLocal: { x: localX, y: localY },
        rect,
        additive: e.ctrlKey || e.metaKey,
        remove: e.altKey,
        kind,
      };
      window.addEventListener('pointermove', onWinMove, true);
      window.addEventListener('pointerup', onWinUp, true);
    };

    const tryAttach = () => {
      if (disposed || attached) return;
      const handle = getViewportHandle(vkey);
      if (!handle) return;
      canvas = handle.gl.domElement as HTMLCanvasElement;
      canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
      attached = true;
    };
    tryAttach();
    const iv = attached ? null : window.setInterval(() => { tryAttach(); if (attached && iv) window.clearInterval(iv); }, 100);
    return () => {
      disposed = true;
      if (iv) window.clearInterval(iv);
      if (canvas && attached) canvas.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
      window.removeEventListener('pointermove', onWinMove, true);
      window.removeEventListener('pointerup', onWinUp, true);
    };
  }, [region.regionMode, vkey]);

  // While dragging: track pointer on window so we don't lose the release even
  // if it leaves the viewport.
  useEffect(() => {
    if (!drag) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const localFromEvent = (e: PointerEvent | MouseEvent): Pt => {
      const r = wrapper.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      const p = localFromEvent(e);
      setDrag((prev) => {
        if (!prev) return prev;
        if (prev.kind === 'fence' || prev.kind === 'lasso' || prev.kind === 'paint') {
          const last = prev.points[prev.points.length - 1];
          const dx = p.x - last.x, dy = p.y - last.y;
          // sample the polyline; keep it light so SVG stays cheap
          const step = prev.kind === 'lasso' ? 4 : 6;
          if (dx * dx + dy * dy < step * step) {
            return { ...prev, current: p };
          }
          const nextPts = [...prev.points, p];
          const nextPainted = prev.painted;
          if (prev.kind === 'paint') {
            const hits = pickByPaint([p], region.paintRadius, objects, vkey);
            hits.forEach((id) => nextPainted.add(id));
          }
          return { ...prev, current: p, points: nextPts, painted: nextPainted };
        }
        return { ...prev, current: p };
      });
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const p = localFromEvent(e);
      const prev = drag;
      // Always clear the marquee first so the overlay disappears reliably,
      // even if the selection handler triggers a heavy re-render.
      setDrag(null);
      // Re-enable the SAME OrbitControls instance we disabled at threshold-cross
      // time. Using the global `__activeOrbitControls` here is unsafe because
      // the user may have activated a different viewport meanwhile, leaving
      // this viewport's controls stuck disabled (zoom/orbit stops working).
      const oc: any = disabledOCRef.current ?? (window as any).__activeOrbitControls;
      if (oc) oc.enabled = true;
      disabledOCRef.current = null;
      if (!prev || cancelled) return;
      const dragged = Math.hypot(p.x - prev.start.x, p.y - prev.start.y) >= DRAG_THRESHOLD || prev.points.length > 2;
      if (!dragged) {
        onSelectObjects([], prev.additive, prev.remove);
        return;
      }
      let ids: string[] = [];
      if (prev.kind === 'rect') {
        ids = pickByRect(prev.start, p, objects, vkey, region.windowCrossing);
      } else if (prev.kind === 'circle') {
        ids = pickByCircle(prev.start, p, objects, vkey);
      } else if (prev.kind === 'fence') {
        ids = pickByFence(prev.points, objects, vkey);
      } else if (prev.kind === 'lasso') {
        ids = pickByLasso(prev.points, objects, vkey, region.windowCrossing);
      } else if (prev.kind === 'paint') {
        ids = Array.from(prev.painted);
      }
      onSelectObjects(ids, prev.additive, prev.remove);
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', () => setDrag(null), { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, objects, vkey, region.windowCrossing, region.paintRadius, onSelectObjects]);


  // ---- Cursor style ----------------------------------------------------------
  const cursor = useMemo(() => {
    // Show +/- in the corner via CSS cursor SVG so it feels like 3ds Max.
    if (modKeys.ctrl) return "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><path d='M2 2h1v16h-1zM2 2h16v1h-16z' fill='white'/><text x='11' y='16' font-size='12' fill='white' font-family='monospace'>+</text></svg>\") 2 2, crosshair";
    if (modKeys.alt) return "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><path d='M2 2h1v16h-1zM2 2h16v1h-16z' fill='white'/><text x='11' y='16' font-size='12' fill='white' font-family='monospace'>-</text></svg>\") 2 2, crosshair";
    return 'crosshair';
  }, [modKeys]);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-[6]"
      style={{ pointerEvents: drag ? 'auto' : 'none', cursor: drag ? cursor : undefined }}
    >
      {/* Invisible capture layer sits above the canvas ONLY when dragging so
          click-picks pass through to R3F the rest of the time. Even when not
          dragging we still catch pointerdown via a capture-phase listener
          registered above (bubbles up from the child canvas region). */}
      <div className="absolute inset-0" style={{ pointerEvents: drag ? 'auto' : 'none', cursor, opacity: drag ? 1 : 0 }} />

      {drag && (
        <RegionShape drag={drag} paintRadius={region.paintRadius} />
      )}

      {isActive && (
        <div
          className="absolute top-1 right-8 z-10 pointer-events-none text-[9px] font-mono px-1 bg-black/50 text-viewport-label"
          style={{ opacity: 0.85 }}
        >
          {region.regionMode.toUpperCase()} · {region.windowCrossing.toUpperCase()}{region.ignoreBackfacing ? ' · IBF' : ''}
        </div>
      )}
    </div>
  );
};

// ---- Region shape SVG --------------------------------------------------------
const RegionShape = ({ drag, paintRadius }: { drag: NonNullable<Props extends any ? any : never>; paintRadius: number }) => {
  const { kind, start, current, points } = drag as any;
  let content: React.ReactNode = null;
  const stroke = '#e5e7eb';
  const fill = 'rgba(59,130,246,0.12)';
  if (kind === 'rect') {
    const x = Math.min(start.x, current.x); const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x); const h = Math.abs(current.y - start.y);
    content = <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeDasharray="4 3" strokeWidth={1} />;
  } else if (kind === 'circle') {
    const r = Math.hypot(current.x - start.x, current.y - start.y);
    content = <circle cx={start.x} cy={start.y} r={r} fill={fill} stroke={stroke} strokeDasharray="4 3" strokeWidth={1} />;
  } else if (kind === 'fence') {
    const d = points.map((p: Pt, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    content = <path d={d} fill="none" stroke={stroke} strokeDasharray="4 3" strokeWidth={1} />;
  } else if (kind === 'lasso') {
    const d = points.map((p: Pt, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
    content = <path d={d} fill={fill} stroke={stroke} strokeDasharray="4 3" strokeWidth={1} />;
  } else if (kind === 'paint') {
    content = (
      <>
        {points.map((p: Pt, i: number) => (
          <circle key={i} cx={p.x} cy={p.y} r={paintRadius} fill="rgba(59,130,246,0.06)" stroke="none" />
        ))}
        <circle cx={current.x} cy={current.y} r={paintRadius} fill="none" stroke={stroke} strokeWidth={1} />
      </>
    );
  }
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
      {content}
    </svg>
  );
};

// ---- Picking helpers ---------------------------------------------------------
function projectPoint(vkey: string, worldPos: THREE.Vector3): Pt | null {
  const handle = getViewportHandle(vkey);
  if (!handle) return null;
  const el = handle.gl.domElement as HTMLCanvasElement;
  const rect = el.getBoundingClientRect();
  const v = worldPos.clone().project(handle.camera as any);
  // In front of camera only (Z in NDC roughly < 1 & > -1). For ortho this is always true.
  if (v.z < -1 || v.z > 1) return null;
  return {
    x: (v.x + 1) * 0.5 * rect.width,
    y: (1 - (v.y + 1) * 0.5) * rect.height,
  };
}

function findSceneObject(vkey: string, id: string): THREE.Object3D | null {
  const handle = getViewportHandle(vkey);
  if (!handle) return null;
  let found: THREE.Object3D | null = null;
  handle.scene.traverse((n) => {
    if (!found && (n as any).userData?.objectId === id) found = n;
  });
  return found;
}

function objectScreenSamples(obj: Props['objects'][number], vkey: string): Pt[] {
  if (obj.visible === false) return [];
  const root = findSceneObject(vkey, obj.id);
  if (root) {
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty() && isFinite(box.min.x) && isFinite(box.max.x)) {
      const { min, max } = box;
      const corners = [
        new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
        new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(max.x, max.y, min.z),
        new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
        new THREE.Vector3(min.x, max.y, max.z), new THREE.Vector3(max.x, max.y, max.z),
        box.getCenter(new THREE.Vector3()),
      ];
      return corners.map((p) => projectPoint(vkey, p)).filter(Boolean) as Pt[];
    }
  }
  const p = projectPoint(vkey, new THREE.Vector3(...(obj.position || [0, 0, 0])));
  return p ? [p] : [];
}

function objectScreenBounds(obj: Props['objects'][number], vkey: string): { points: Pt[]; minX: number; minY: number; maxX: number; maxY: number } | null {
  const points = objectScreenSamples(obj, vkey);
  if (points.length === 0) return null;
  return {
    points,
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function pickByRect(a: Pt, b: Pt, objects: Props['objects'], vkey: string, mode: 'window' | 'crossing'): string[] {
  const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
  const out: string[] = [];
  for (const obj of objects) {
    const bnd = objectScreenBounds(obj, vkey); if (!bnd) continue;
    const inside = bnd.minX >= x1 && bnd.maxX <= x2 && bnd.minY >= y1 && bnd.maxY <= y2;
    const crossing = bnd.maxX >= x1 && bnd.minX <= x2 && bnd.maxY >= y1 && bnd.minY <= y2;
    if (mode === 'window' ? inside : crossing) out.push(obj.id);
  }
  return out;
}

function pickByCircle(center: Pt, edge: Pt, objects: Props['objects'], vkey: string): string[] {
  const r = Math.hypot(edge.x - center.x, edge.y - center.y);
  const r2 = r * r;
  const out: string[] = [];
  for (const obj of objects) {
    const pts = objectScreenSamples(obj, vkey);
    if (pts.some((p) => {
      const dx = p.x - center.x, dy = p.y - center.y;
      return dx * dx + dy * dy <= r2;
    })) out.push(obj.id);
  }
  return out;
}

function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const ccw = (p: Pt, q: Pt, r: Pt) => (r.y - p.y) * (q.x - p.x) - (q.y - p.y) * (r.x - p.x);
  return (ccw(a, c, d) > 0) !== (ccw(b, c, d) > 0) && (ccw(a, b, c) > 0) !== (ccw(a, b, d) > 0);
}

function pickByFence(points: Pt[], objects: Props['objects'], vkey: string): string[] {
  // Fence selects anything the polyline crosses. With single-point object
  // projection, "crosses" reduces to a small radius around the polyline.
  const R = 8;
  const out: string[] = [];
  for (const obj of objects) {
    const pts = objectScreenSamples(obj, vkey);
    let hit = false;
    for (const p of pts) {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        if (distancePointToSegment(p, a, b) <= R) { hit = true; break; }
      }
      if (hit) break;
    }
    if (hit) out.push(obj.id);
  }
  return out;
}

function distancePointToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx, cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

function pickByLasso(points: Pt[], objects: Props['objects'], vkey: string, mode: 'window' | 'crossing'): string[] {
  const out: string[] = [];
  for (const obj of objects) {
    const pts = objectScreenSamples(obj, vkey);
    const insideCount = pts.filter((p) => pointInPolygon(p, points)).length;
    if (mode === 'window' ? insideCount === pts.length && pts.length > 0 : insideCount > 0) out.push(obj.id);
  }
  return out;
}

function pickByPaint(brushPts: Pt[], radius: number, objects: Props['objects'], vkey: string): string[] {
  const r2 = radius * radius;
  const out: string[] = [];
  for (const obj of objects) {
    const pts = objectScreenSamples(obj, vkey);
    let hit = false;
    for (const p of pts) {
      for (const bp of brushPts) {
        const dx = p.x - bp.x, dy = p.y - bp.y;
        if (dx * dx + dy * dy <= r2) { hit = true; break; }
      }
      if (hit) break;
    }
    if (hit) out.push(obj.id);
  }
  return out;
}
