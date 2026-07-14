import { cn } from '@/lib/utils';
import {
  Play, Pause, Square, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Key, ZoomIn, Maximize2, Move as PanIcon, Orbit, MousePointer2, Search, Focus,
} from 'lucide-react';

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
