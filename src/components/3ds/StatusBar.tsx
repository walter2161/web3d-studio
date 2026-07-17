import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import * as THREE from 'three';
import {
  Play, Pause, Square, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Key, ZoomIn, Maximize2, Move as PanIcon, Orbit, MousePointer2,
  Focus, ChevronsDown, ChevronsUp, Repeat,
  Frame, Crop, Camera as CameraIcon, PersonStanding, Target,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAllViewportHandles } from './r3/viewportRegistry';

// --- Viewport navigation helpers -------------------------------------------
// Full 3ds Max bottom-right nav cluster: Zoom / Zoom All / Zoom Extents /
// Zoom Extents All / Zoom Extents Selected / Field-of-View / Zoom Region /
// Pan / Walkthrough / Arc Rotate (+Selected) / Maximize.
//
// These operate on the currently active OrbitControls (registered globally by
// Viewport.tsx) plus, for the "*All*" variants, every registered viewport in
// the ViewportRegistry.

const getControls = (): any => (window as any).__activeOrbitControls || (window as any).__orbitControls;
const getScene = (): THREE.Scene | null => (window as any).__r3Scene || null;
const getSelectedIds = (): Set<string> => new Set(((window as any).__r3SelectedIds as string[]) || []);

const applyDolly = (controls: any, factor: number) => {
  if (!controls?.object || !controls?.target) return;
  const dir = new THREE.Vector3().subVectors(controls.object.position, controls.target);
  dir.multiplyScalar(factor);
  controls.object.position.copy(controls.target).add(dir);
  const cam: any = controls.object;
  if (cam.isOrthographicCamera) { cam.zoom = Math.max(0.001, cam.zoom / factor); cam.updateProjectionMatrix(); }
  controls.update();
};

const dolly = (factor: number) => applyDolly(getControls(), factor);
const dollyAll = (factor: number) => {
  for (const h of getAllViewportHandles()) applyDolly((h as any).controls, factor);
};

const computeSceneBBox = (targetsOnly: THREE.Object3D[] | null = null): THREE.Box3 | null => {
  const scene = getScene(); if (!scene) return null;
  const box = new THREE.Box3();
  let has = false;
  const roots = targetsOnly ?? [scene];
  for (const root of roots) {
    root.traverse((obj: any) => {
      if (!obj.visible) return;
      if (obj.userData?.__helper) return;
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      const b = new THREE.Box3().setFromObject(obj);
      if (isFinite(b.min.x) && isFinite(b.max.x)) { box.union(b); has = true; }
    });
  }
  return has ? box : null;
};

const computeSelectedBBox = (): THREE.Box3 | null => {
  const scene = getScene(); if (!scene) return null;
  const sel = getSelectedIds();
  if (sel.size === 0) return null;
  const roots: THREE.Object3D[] = [];
  scene.traverse((o: any) => {
    if (o.userData?.objectId && sel.has(o.userData.objectId)) roots.push(o);
  });
  if (roots.length === 0) return null;
  return computeSceneBBox(roots);
};

const frameBoxOn = (controls: any, box: THREE.Box3) => {
  if (!controls?.object) return;
  const cam: any = controls.object;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  if (cam.isPerspectiveCamera) {
    const fov = (cam.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.4;
    const dir = new THREE.Vector3().subVectors(cam.position, controls.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    controls.target.copy(center);
  } else if (cam.isOrthographicCamera) {
    const dir = new THREE.Vector3().subVectors(cam.position, controls.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0).normalize();
    cam.position.copy(center).addScaledVector(dir, Math.max(10, radius * 4));
    controls.target.copy(center);
    const halfH = (cam.top - cam.bottom) * 0.5 || 10;
    cam.zoom = (halfH / (radius * 1.2));
    cam.updateProjectionMatrix();
  }
  cam.lookAt(center);
  controls.update();
};

const zoomExtents = () => { const b = computeSceneBBox(); if (b) frameBoxOn(getControls(), b); };
const zoomExtentsAll = () => {
  const b = computeSceneBBox(); if (!b) return;
  for (const h of getAllViewportHandles()) frameBoxOn((h as any).controls, b);
};
const zoomExtentsSelected = () => {
  const b = computeSelectedBBox() ?? computeSceneBBox(); if (b) frameBoxOn(getControls(), b);
};

// Field-of-View: only meaningful on perspective cameras. Adjusts fov in place.
const setFOV = (deg: number) => {
  const c = getControls(); const cam: any = c?.object;
  if (!cam?.isPerspectiveCamera) return;
  cam.fov = Math.min(179, Math.max(1, deg));
  cam.updateProjectionMatrix();
};
const getFOV = (): number => {
  const c = getControls(); const cam: any = c?.object;
  return cam?.isPerspectiveCamera ? cam.fov : 50;
};

const setPrimaryMouse = (button: 'rotate' | 'pan' | 'dolly' | 'select') => {
  const c = getControls(); if (!c) return;
  const M = THREE.MOUSE;
  if (button === 'rotate') c.mouseButtons = { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  else if (button === 'pan') c.mouseButtons = { LEFT: M.PAN, MIDDLE: M.DOLLY, RIGHT: M.ROTATE };
  else if (button === 'dolly') c.mouseButtons = { LEFT: M.DOLLY, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  else c.mouseButtons = { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  c.update();
};

// Arc-Rotate-Selected: retarget the OrbitControls pivot to the selection center.
const arcRotateSelected = () => {
  const c = getControls(); if (!c) return;
  const b = computeSelectedBBox(); if (!b) return;
  const center = b.getCenter(new THREE.Vector3());
  c.target.copy(center);
  c.update();
  setPrimaryMouse('rotate');
};

// Walkthrough (FPS): WASD/QE moves the active camera, arrow keys look around.
// Toggled by the button; ESC or clicking the button again disables it.
const startWalkthrough = (setOn: (v: boolean) => void) => {
  const c = getControls(); const cam: any = c?.object;
  if (!cam?.isPerspectiveCamera) return; // ortho views can't walkthrough
  setOn(true);
  const speed = 0.15;
  const turn = 0.03;
  const keys = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { stop(); return; }
    keys.add(e.key.toLowerCase());
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  let raf = 0;
  const tick = () => {
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, cam.up).normalize();
    const up = cam.up.clone();
    let moved = false;
    if (keys.has('w')) { cam.position.addScaledVector(forward, speed); c.target.addScaledVector(forward, speed); moved = true; }
    if (keys.has('s')) { cam.position.addScaledVector(forward, -speed); c.target.addScaledVector(forward, -speed); moved = true; }
    if (keys.has('a')) { cam.position.addScaledVector(right, -speed); c.target.addScaledVector(right, -speed); moved = true; }
    if (keys.has('d')) { cam.position.addScaledVector(right, speed); c.target.addScaledVector(right, speed); moved = true; }
    if (keys.has('q')) { cam.position.addScaledVector(up, -speed); c.target.addScaledVector(up, -speed); moved = true; }
    if (keys.has('e')) { cam.position.addScaledVector(up, speed); c.target.addScaledVector(up, speed); moved = true; }
    // Arrow-key look: rotate target around camera.
    const rel = new THREE.Vector3().subVectors(c.target, cam.position);
    if (keys.has('arrowleft')) { rel.applyAxisAngle(up, turn); moved = true; }
    if (keys.has('arrowright')) { rel.applyAxisAngle(up, -turn); moved = true; }
    if (keys.has('arrowup')) { rel.applyAxisAngle(right, turn); moved = true; }
    if (keys.has('arrowdown')) { rel.applyAxisAngle(right, -turn); moved = true; }
    if (moved) { c.target.copy(cam.position).add(rel); c.update(); }
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    (window as any).__walkthroughStop = null;
    setOn(false);
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  (window as any).__walkthroughStop = stop;
  tick();
};
const stopWalkthrough = () => {
  const stop = (window as any).__walkthroughStop;
  if (typeof stop === 'function') stop();
};

interface StatusBarProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  autoKey: boolean;
  onToggleAutoKey: () => void;
  onSetKey: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onFrameChange: (frame: number) => void;
  selectedPosition?: [number, number, number] | null;
  prompt?: string;
  viewportLayout: 'single' | 'quad' | '2col-top-persp' | '2col-front-persp' | '2col-left-persp' | '2row-top-persp';
  onToggleViewportLayout: () => void;
  gridSpacing?: number;
  units?: { system: string; metric: string; us: string; precision: number };
  timelineVisible?: boolean;
  onToggleTimeline?: () => void;
  loopPlayback?: boolean;
  onToggleLoopPlayback?: () => void;
}

const Tool = ({
  onClick, title, active, children,
}: { onClick?: (e?: any) => void; title: string; active?: boolean; children: React.ReactNode }) => (
  <button
    title={title}
    onClick={onClick}
    className={cn(
      'w-[22px] h-[22px] flex items-center justify-center text-win-text',
      active ? 'bevel-sunken' : 'bevel-raised hover:brightness-105'
    )}
  >
    {children}
  </button>
);

const NumField = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-1">
    <span className="text-[11px] text-win-text w-3">{label}</span>
    <div className="bevel-sunken bg-white h-[18px] px-1 flex items-center min-w-[64px] text-[11px] font-mono text-win-text">
      {value.toFixed(3)}
    </div>
  </div>
);

const NumFieldStr = ({ label, text }: { label: string; text: string }) => (
  <div className="flex items-center gap-1">
    <span className="text-[11px] text-win-text w-3">{label}</span>
    <div className="bevel-sunken bg-white h-[18px] px-1 flex items-center min-w-[64px] text-[11px] font-mono text-win-text">
      {text}
    </div>
  </div>
);

export const StatusBar = ({
  currentFrame, totalFrames, isPlaying, autoKey, onToggleAutoKey, onSetKey,
  onPlay, onPause, onStop, onFrameChange, selectedPosition, prompt = 'Click and drag to select and move objects',
  viewportLayout, onToggleViewportLayout, gridSpacing = 1.0, units,
  timelineVisible = false, onToggleTimeline, loopPlayback = false, onToggleLoopPlayback,
}: StatusBarProps) => {
  const [x, y, z] = selectedPosition || [0, 0, 0];
  const suffix = !units || units.system === 'Generic' ? '' :
    units.system === 'Metric' ? ` ${units.metric}` :
    units.us === 'Inches' ? '"' : units.us === 'Feet' ? "'" : ' mi';
  const prec = units?.precision ?? 3;
  const fmt = (n: number) => n.toFixed(prec) + suffix;
  const [mouseMode, setMouseMode] = useState<'select' | 'pan' | 'rotate'>('select');
  const [walkOn, setWalkOn] = useState(false);
  const [fovValue, setFovValue] = useState<number>(50);

  // Zoom-drag session: mousedown on the Zoom button starts a vertical drag.
  // Drag up → dolly in; drag down → dolly out. Matches classic 3ds Max Zoom.
  const startZoomDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    let lastY = startY;
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - lastY; lastY = ev.clientY;
      if (Math.abs(dy) < 0.5) return;
      dolly(dy < 0 ? Math.pow(0.98, -dy) : Math.pow(1.02, dy));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 3ds Max keyboard shortcuts: Z (Zoom Extents Selected), Ctrl+Alt+Z (Zoom
  // Extents), Ctrl+Shift+Z (Zoom Extents All), Alt+W (Maximize toggle).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault(); onToggleViewportLayout();
      } else if (e.ctrlKey && e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); zoomExtents();
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); zoomExtentsAll();
      } else if (!e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); zoomExtentsSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleViewportLayout]);




  return (
    <div className="bevel-raised px-1 py-1 flex items-stretch gap-1 text-win-text">
      {/* Prompt / status text (left) */}
      <div className="bevel-sunken bg-white flex-1 min-w-[220px] px-2 flex items-center text-[11px]">
        {prompt}
      </div>

      {/* Coordinate display X / Y / Z */}
      <div className="bevel-sunken bg-win-face flex items-center gap-2 px-2">
        <NumFieldStr label="X:" text={fmt(x)} />
        <NumFieldStr label="Y:" text={fmt(y)} />
        <NumFieldStr label="Z:" text={fmt(z)} />
      </div>

      {/* Grid readout */}
      <div className="bevel-sunken bg-win-face flex items-center px-2 text-[11px]">
        Grid = {gridSpacing.toFixed(1)}{suffix}
      </div>

      {/* Auto Key + Set Key */}
      <button
        onClick={onToggleAutoKey}
        title="Auto Key toggle (N)"
        className={cn(
          'px-2 text-[11px]',
          autoKey ? 'bevel-sunken bg-red-600 text-white' : 'bevel-raised'
        )}
      >
        Auto Key
      </button>
      <Tool title="Set Key (K)" onClick={onSetKey}>
        <Key size={12} />
      </Tool>
      {onToggleTimeline && (
        <Tool
          title={timelineVisible ? 'Hide Timeline' : 'Show Timeline'}
          onClick={onToggleTimeline}
          active={timelineVisible}
        >
          {timelineVisible ? <ChevronsDown size={12} /> : <ChevronsUp size={12} />}
        </Tool>
      )}



      {/* Time / playback cluster */}
      <div className="bevel-sunken bg-win-face flex items-center gap-0.5 px-1">
        <Tool title="Go to Start (Home)" onClick={() => onFrameChange(0)}>
          <SkipBack size={12} />
        </Tool>
        <Tool title="Previous Frame" onClick={() => onFrameChange(Math.max(0, currentFrame - 1))}>
          <ChevronLeft size={12} />
        </Tool>
        {isPlaying ? (
          <Tool title="Pause" onClick={onPause} active>
            <Pause size={12} />
          </Tool>
        ) : (
          <Tool title="Play (/)" onClick={onPlay}>
            <Play size={12} />
          </Tool>
        )}
        <Tool title="Stop" onClick={onStop}>
          <Square size={10} />
        </Tool>
        <Tool title="Next Frame" onClick={() => onFrameChange(Math.min(totalFrames, currentFrame + 1))}>
          <ChevronRight size={12} />
        </Tool>
        <Tool title="Go to End (End)" onClick={() => onFrameChange(totalFrames)}>
          <SkipForward size={12} />
        </Tool>

        {/* Current frame numeric */}
        <div className="ml-1 bevel-sunken bg-white h-[18px] px-1 flex items-center min-w-[46px] text-[11px] font-mono">
          {currentFrame}/{totalFrames}
        </div>

        {onToggleLoopPlayback && (
          <Tool
            title={loopPlayback ? 'Loop Playback: ON' : 'Loop Playback: OFF'}
            onClick={onToggleLoopPlayback}
            active={loopPlayback}
          >
            <Repeat size={12} />
          </Tool>
        )}
      </div>

      {/* Viewport navigation cluster (right) */}
      <div className="bevel-sunken bg-win-face flex items-center gap-0.5 px-1">
        <Tool title="Zoom In (click) — Shift+click Zoom Out" onClick={(e: any) => dolly(e?.shiftKey ? 1.25 : 0.8)}>
          <ZoomIn size={12} />
        </Tool>
        <Tool title="Zoom Out" onClick={() => dolly(1.25)}>
          <ZoomOut size={12} />
        </Tool>
        <Tool title="Zoom Extents (fit all)" onClick={zoomExtents}>
          <Focus size={12} />
        </Tool>
        <Tool title="Zoom Region (2× closer)" onClick={() => dolly(0.5)}>
          <Search size={12} />
        </Tool>
        <Tool
          title="Pan mode (left-drag pans)"
          active={mouseMode === 'pan'}
          onClick={() => { setPrimaryMouse('pan'); setMouseMode('pan'); }}
        >
          <PanIcon size={12} />
        </Tool>
        <Tool
          title="Arc Rotate (left-drag orbits)"
          active={mouseMode === 'rotate'}
          onClick={() => { setPrimaryMouse('rotate'); setMouseMode('rotate'); }}
        >
          <Orbit size={12} />
        </Tool>
        <Tool
          title="Select (default left-click)"
          active={mouseMode === 'select'}
          onClick={() => { setPrimaryMouse('select'); setMouseMode('select'); }}
        >
          <MousePointer2 size={12} />
        </Tool>
        <Tool
          title={viewportLayout === 'quad' ? 'Min/Max Toggle → Single' : 'Min/Max Toggle → Quad'}
          onClick={onToggleViewportLayout}
          active={viewportLayout === 'quad'}
        >
          <Maximize2 size={12} />
        </Tool>
      </div>
    </div>
  );
};
