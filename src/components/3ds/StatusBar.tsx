import { cn } from '@/lib/utils';
import * as THREE from 'three';
import {
  Play, Pause, Square, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Key, ZoomIn, ZoomOut, Maximize2, Move as PanIcon, Orbit, MousePointer2, Search, Focus, ChevronsDown, ChevronsUp, Repeat,
} from 'lucide-react';

// --- Viewport navigation helpers -------------------------------------------
// These act on the currently active OrbitControls (registered globally by
// Viewport.tsx as `__activeOrbitControls`) and the active three.js scene
// (`__r3Scene`). They mirror the 3ds Max bottom-right nav cluster.

const getControls = (): any => (window as any).__activeOrbitControls || (window as any).__orbitControls;
const getScene = (): THREE.Scene | null => (window as any).__r3Scene || null;

const dolly = (factor: number) => {
  const c = getControls(); if (!c?.object || !c?.target) return;
  const dir = new THREE.Vector3().subVectors(c.object.position, c.target);
  dir.multiplyScalar(factor);
  c.object.position.copy(c.target).add(dir);
  const cam: any = c.object;
  if (cam.isOrthographicCamera) { cam.zoom = Math.max(0.001, cam.zoom / factor); cam.updateProjectionMatrix(); }
  c.update();
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

const frameBox = (box: THREE.Box3) => {
  const c = getControls(); if (!c?.object) return;
  const cam: any = c.object;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  if (cam.isPerspectiveCamera) {
    const fov = (cam.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.4;
    const dir = new THREE.Vector3().subVectors(cam.position, c.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    c.target.copy(center);
  } else if (cam.isOrthographicCamera) {
    const dir = new THREE.Vector3().subVectors(cam.position, c.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0).normalize();
    cam.position.copy(center).addScaledVector(dir, Math.max(10, radius * 4));
    c.target.copy(center);
    const halfH = (cam.top - cam.bottom) * 0.5 || 10;
    cam.zoom = (halfH / (radius * 1.2));
    cam.updateProjectionMatrix();
  }
  cam.lookAt(center);
  c.update();
};

const zoomExtents = () => { const b = computeSceneBBox(); if (b) frameBox(b); };


const setPrimaryMouse = (button: 'rotate' | 'pan' | 'dolly' | 'select') => {
  const c = getControls(); if (!c) return;
  const M = THREE.MOUSE;
  if (button === 'rotate') c.mouseButtons = { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  else if (button === 'pan') c.mouseButtons = { LEFT: M.PAN, MIDDLE: M.DOLLY, RIGHT: M.ROTATE };
  else if (button === 'dolly') c.mouseButtons = { LEFT: M.DOLLY, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  else c.mouseButtons = { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  c.update();
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
  viewportLayout: 'single' | 'quad';
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
}: { onClick?: () => void; title: string; active?: boolean; children: React.ReactNode }) => (
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
        <Tool title="Zoom">
          <ZoomIn size={12} />
        </Tool>
        <Tool title="Zoom Extents">
          <Focus size={12} />
        </Tool>
        <Tool title="Zoom Region">
          <Search size={12} />
        </Tool>
        <Tool title="Pan">
          <PanIcon size={12} />
        </Tool>
        <Tool title="Arc Rotate">
          <Orbit size={12} />
        </Tool>
        <Tool title="Select">
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
