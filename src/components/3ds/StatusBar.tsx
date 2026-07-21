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

// ---------------------------------------------------------------------------
// FlyoutTool: a small 22×22 square button with an optional flyout triangle
// in its bottom-right corner. Clicking the main icon runs the primary action;
// clicking the triangle (or right-clicking the button) opens a Popover showing
// the alternative actions of the same "family" — exactly like 3ds Max.
// ---------------------------------------------------------------------------
const FlyoutTool = ({
  title, active, onClick, onMouseDown, icon, flyout,
}: {
  title: string;
  active?: boolean;
  onClick?: (e?: any) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  flyout?: { title: string; icon: React.ReactNode; onClick: () => void; active?: boolean }[];
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        title={title}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onContextMenu={(e) => { if (flyout && flyout.length) { e.preventDefault(); setOpen(true); } }}
        className={cn(
          'w-[22px] h-[22px] flex items-center justify-center text-win-text',
          active ? 'bevel-sunken' : 'bevel-raised hover:brightness-105'
        )}
      >
        {icon}
      </button>
      {flyout && flyout.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              title="More…"
              onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
              className="absolute bottom-0 right-0 w-[6px] h-[6px] cursor-pointer"
              style={{
                background:
                  'linear-gradient(135deg, transparent 0 45%, hsl(var(--foreground)) 45% 100%)',
              }}
            />
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="p-0.5 w-auto bg-win-face border border-black/40 text-win-text"
          >
            <div className="flex flex-col gap-0.5">
              {flyout.map((f, i) => (
                <button
                  key={i}
                  title={f.title}
                  onClick={() => { setOpen(false); f.onClick(); }}
                  className={cn(
                    'flex items-center gap-1 px-1 py-0.5 text-[11px]',
                    f.active ? 'bevel-sunken' : 'bevel-raised hover:brightness-105'
                  )}
                >
                  <span className="w-[16px] h-[16px] flex items-center justify-center">{f.icon}</span>
                  <span className="whitespace-nowrap pr-1">{f.title}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

// 4×2 grid of viewport nav tools with flyouts (matches 3ds Max nav cluster).
const ViewportNavCluster = ({
  dolly, dollyAll, startZoomDrag,
  zoomExtents, zoomExtentsSelected, zoomExtentsAll, zoomExtentsAllSelected,
  fovValue, setFovValue,
  mouseMode, setMouseMode,
  walkOn, setWalkOn,
  arcRotateSelected,
  viewportLayout, onToggleViewportLayout,
}: any) => {
  return (
    <div className="bevel-sunken bg-win-face px-1 py-0.5 grid grid-cols-4 gap-0.5" style={{ gridAutoRows: '22px' }}>
      {/* Row 1 */}
      <FlyoutTool
        title="Zoom (drag up = in, down = out)"
        onMouseDown={startZoomDrag}
        onClick={(e: any) => dolly(e?.shiftKey ? 1.25 : 0.8)}
        icon={<ZoomIn size={12} />}
      />
      <FlyoutTool
        title="Zoom All Viewports"
        onClick={(e: any) => dollyAll(e?.shiftKey ? 1.25 : 0.8)}
        icon={<div className="relative"><ZoomIn size={12} /><span className="absolute -bottom-1 -right-1 text-[7px] leading-none font-bold">A</span></div>}
      />
      <FlyoutTool
        title="Zoom Extents (Ctrl+Alt+Z)"
        onClick={zoomExtents}
        icon={<Focus size={12} />}
        flyout={[
          { title: 'Zoom Extents', icon: <Focus size={12} />, onClick: zoomExtents },
          { title: 'Zoom Extents Selected (Z)', icon: <Target size={12} />, onClick: zoomExtentsSelected },
        ]}
      />
      <FlyoutTool
        title="Zoom Extents All Viewports (Ctrl+Shift+Z)"
        onClick={zoomExtentsAll}
        icon={<div className="relative"><Focus size={12} /><span className="absolute -bottom-1 -right-1 text-[7px] leading-none font-bold">A</span></div>}
        flyout={[
          { title: 'Zoom Extents All', icon: <Focus size={12} />, onClick: zoomExtentsAll },
          { title: 'Zoom Extents All Selected', icon: <Target size={12} />, onClick: zoomExtentsAllSelected },
        ]}
      />
      {/* Row 2 */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Field of View / Zoom Region"
            className="w-[22px] h-[22px] flex items-center justify-center text-win-text bevel-raised hover:brightness-105"
            onClick={() => setFovValue(getFOV())}
          >
            <div className="relative">
              <CameraIcon size={12} />
              <span
                className="absolute bottom-0 right-0 w-[6px] h-[6px]"
                style={{ background: 'linear-gradient(135deg, transparent 0 45%, hsl(var(--foreground)) 45% 100%)' }}
              />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-56 p-2 bg-win-face border border-black/30 text-win-text">
          <div className="text-[11px] mb-1 flex items-center justify-between">
            <span>Field Of View</span>
            <span className="font-mono">{fovValue.toFixed(0)}°</span>
          </div>
          <input
            type="range" min={5} max={150} step={1} value={fovValue}
            onChange={(e) => { const v = Number(e.target.value); setFovValue(v); setFOV(v); }}
            className="w-full"
          />
          <div className="flex justify-between text-[9px] mt-0.5 opacity-70">
            <span>Tele (15°)</span><span>Normal (50°)</span><span>Fisheye (150°)</span>
          </div>
          <button
            className="mt-2 w-full bevel-raised text-[11px] py-0.5 flex items-center justify-center gap-1"
            onClick={() => dolly(0.5)}
          >
            <Crop size={12} /> Zoom Region (2× closer)
          </button>
        </PopoverContent>
      </Popover>
      <FlyoutTool
        title="Pan View"
        active={mouseMode === 'pan'}
        onClick={() => { setPrimaryMouse('pan'); setMouseMode('pan'); }}
        icon={<PanIcon size={12} />}
        flyout={[
          { title: 'Pan View', icon: <PanIcon size={12} />, onClick: () => { setPrimaryMouse('pan'); setMouseMode('pan'); }, active: mouseMode === 'pan' },
          { title: 'Walkthrough (WASD/QE, arrows)', icon: <PersonStanding size={12} />, onClick: () => { walkOn ? stopWalkthrough() : startWalkthrough(setWalkOn); }, active: walkOn },
        ]}
      />
      <FlyoutTool
        title="Orbit / Arc Rotate"
        active={mouseMode === 'rotate'}
        onClick={() => { setPrimaryMouse('rotate'); setMouseMode('rotate'); }}
        icon={<Orbit size={12} />}
        flyout={[
          { title: 'Arc Rotate', icon: <Orbit size={12} />, onClick: () => { setPrimaryMouse('rotate'); setMouseMode('rotate'); }, active: mouseMode === 'rotate' },
          { title: 'Arc Rotate Selected', icon: <Frame size={12} />, onClick: arcRotateSelected },
          { title: 'Select', icon: <MousePointer2 size={12} />, onClick: () => { setPrimaryMouse('select'); setMouseMode('select'); }, active: mouseMode === 'select' },
        ]}
      />
      <FlyoutTool
        title={viewportLayout === 'quad' ? 'Min Viewport → Single (Alt+W)' : 'Max Viewport → Quad (Alt+W)'}
        active={viewportLayout !== 'quad'}
        onClick={onToggleViewportLayout}
        icon={<Maximize2 size={12} />}
        flyout={[
          { title: viewportLayout === 'quad' ? 'Min Viewport → Single (Alt+W)' : 'Max Viewport → Quad (Alt+W)', icon: <Maximize2 size={12} />, onClick: onToggleViewportLayout, active: viewportLayout !== 'quad' },
          { title: 'Toggle App Fullscreen (F11)', icon: <Maximize2 size={12} />, onClick: () => {
              if (typeof document === 'undefined') return;
              if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
              else document.documentElement.requestFullscreen?.().catch(() => {});
            }, active: typeof document !== 'undefined' && !!document.fullscreenElement },
        ]}
      />

    </div>
  );
};

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
      {/* Simplified timeline (replaces the old name/coordinates readout).
          Transport controls + scrubber + frame counter + loop toggle. */}
      <div className="bevel-sunken bg-win-face flex-1 min-w-[260px] flex items-center gap-1 px-1">
        <Tool title="Go to Start" onClick={() => onFrameChange(0)}>
          <SkipBack size={12} />
        </Tool>
        <Tool title="Previous Frame" onClick={() => onFrameChange(Math.max(0, currentFrame - 1))}>
          <ChevronLeft size={12} />
        </Tool>
        <Tool
          title={isPlaying ? 'Pause' : 'Play'}
          active={isPlaying}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </Tool>
        <Tool title="Stop" onClick={onStop}>
          <Square size={12} />
        </Tool>
        <Tool title="Next Frame" onClick={() => onFrameChange(Math.min(totalFrames, currentFrame + 1))}>
          <ChevronRight size={12} />
        </Tool>
        <Tool title="Go to End" onClick={() => onFrameChange(totalFrames)}>
          <SkipForward size={12} />
        </Tool>
        <Tool
          title={loopPlayback ? 'Loop: On' : 'Loop: Off'}
          active={loopPlayback}
          onClick={onToggleLoopPlayback}
        >
          <Repeat size={12} />
        </Tool>
        <input
          type="range"
          min={0}
          max={totalFrames}
          step={1}
          value={currentFrame}
          onChange={(e) => onFrameChange(Number(e.target.value))}
          className="flex-1 h-[14px] mx-1 accent-[hsl(var(--primary))]"
          title="Scrub timeline"
        />
        <div className="bevel-sunken bg-white h-[18px] px-1 flex items-center min-w-[64px] text-[11px] font-mono text-win-text justify-end">
          {currentFrame} / {totalFrames}
        </div>
      </div>

      {/* Track Timeline toggle (replaces Auto Key) + Set Key */}
      {onToggleTimeline && (
        <button
          onClick={onToggleTimeline}
          title={timelineVisible ? 'Hide Track Timeline' : 'Show Track Timeline'}
          className={cn(
            'px-2 text-[11px] flex items-center gap-1',
            timelineVisible ? 'bevel-sunken bg-primary text-primary-foreground' : 'bevel-raised'
          )}
        >
          {timelineVisible ? <ChevronsDown size={12} /> : <ChevronsUp size={12} />}
          Track Timeline
        </button>
      )}
      <Tool title="Set Key (K)" onClick={onSetKey}>
        <Key size={12} />
      </Tool>





      {/* Viewport navigation cluster (right) — 3ds Max style 4×2 grid with
          small flyout menus (triangle in bottom-right corner) for zoom
          variants, exactly matching the classic bottom-right nav gizmo. */}
      <ViewportNavCluster
        dolly={dolly}
        dollyAll={dollyAll}
        startZoomDrag={startZoomDrag}
        zoomExtents={zoomExtents}
        zoomExtentsSelected={zoomExtentsSelected}
        zoomExtentsAll={zoomExtentsAll}
        zoomExtentsAllSelected={() => { const b = computeSelectedBBox(); if (!b) return; for (const h of getAllViewportHandles()) frameBoxOn((h as any).controls, b); }}
        fovValue={fovValue}
        setFovValue={setFovValue}
        mouseMode={mouseMode}
        setMouseMode={setMouseMode}
        walkOn={walkOn}
        setWalkOn={setWalkOn}
        arcRotateSelected={arcRotateSelected}
        viewportLayout={viewportLayout}
        onToggleViewportLayout={onToggleViewportLayout}
      />
    </div>
  );
};
