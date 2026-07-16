import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Play, Pause, Square, SkipBack, SkipForward, 
  Circle, Eye, EyeOff, ChevronLeft, ChevronRight,
  Trash2, Copy, Repeat, Bone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrackView } from './timeline/TrackView';
import type { BakedClipSet } from './timeline/channelTracks';

export interface Keyframe {
  id: string;
  objectId: string;
  frame: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  // Bezier handles (in/out tangents for position interpolation)
  inTangent: [number, number, number];
  outTangent: [number, number, number];
}

export interface AnimationTrack {
  objectId: string;
  objectName: string;
  keyframes: Keyframe[];
  showTrajectory: boolean;
}

interface AnimationTimelineProps {
  tracks: AnimationTrack[];
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  selectedObject: string | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onFrameChange: (frame: number) => void;
  onAddKeyframe: (objectId: string, frame: number) => void;
  onRemoveKeyframe: (objectId: string, keyframeId: string) => void;
  onUpdateKeyframe: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onToggleTrajectory: (objectId: string) => void;
  onSelectKeyframe: (keyframe: Keyframe | null) => void;
  selectedKeyframe: Keyframe | null;
  loopPlayback?: boolean;
  onToggleLoopPlayback?: () => void;
  // ---- Rig / imported-clip Track View ----
  bakedClipSet?: BakedClipSet | null;
  bakedClipOptions?: { index: number; name: string }[];
  onBakeClip?: (clipIndex: number) => void;
  onChangeBakedSet?: (next: BakedClipSet) => void;
}

export const AnimationTimeline = ({
  tracks,
  currentFrame,
  totalFrames,
  isPlaying,
  selectedObject,
  onPlay,
  onPause,
  onStop,
  onFrameChange,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onToggleTrajectory,
  onSelectKeyframe,
  selectedKeyframe,
  loopPlayback = false,
  onToggleLoopPlayback,
  bakedClipSet,
  bakedClipOptions,
  onBakeClip,
  onChangeBakedSet,
}: AnimationTimelineProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [autoKey, setAutoKey] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const [view, setView] = useState<'basic' | 'trackview'>('basic');

  // Auto-switch to Track View when a baked clip becomes available
  // (matches the user request: opening a rigged character exposes its
  // per-bone tracks for editing right away).
  useEffect(() => {
    if (bakedClipSet && bakedClipSet.tracks.length > 0) setView('trackview');
  }, [bakedClipSet?.clipName]);

  const frameToPixel = useCallback((frame: number) => {
    if (!trackRef.current) return 0;
    return (frame / totalFrames) * trackRef.current.clientWidth;
  }, [totalFrames]);

  const pixelToFrame = useCallback((px: number) => {
    if (!trackRef.current) return 0;
    return Math.round((px / trackRef.current.clientWidth) * totalFrames);
  }, [totalFrames]);

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = pixelToFrame(x);
    onFrameChange(Math.max(0, Math.min(totalFrames, frame)));
  }, [pixelToFrame, onFrameChange, totalFrames]);

  const handlePlayheadDrag = useCallback((e: MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = pixelToFrame(x);
    onFrameChange(Math.max(0, Math.min(totalFrames, frame)));
  }, [pixelToFrame, onFrameChange, totalFrames]);

  useEffect(() => {
    if (!draggingPlayhead) return;
    const handleUp = () => setDraggingPlayhead(false);
    window.addEventListener('mousemove', handlePlayheadDrag);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handlePlayheadDrag);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingPlayhead, handlePlayheadDrag]);

  // Resize handle
  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      setTimelineHeight(prev => Math.max(120, Math.min(400, prev - e.movementY)));
    };
    const handleUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing]);

  // Frame tick marks
  const renderFrameTicks = () => {
    const ticks = [];
    const step = totalFrames <= 100 ? 10 : totalFrames <= 300 ? 25 : 50;
    for (let i = 0; i <= totalFrames; i += step) {
      const left = `${(i / totalFrames) * 100}%`;
      ticks.push(
        <div key={i} className="absolute flex flex-col items-center" style={{ left }}>
          <div className="w-px h-2 bg-muted-foreground/50" />
          <span className="text-[9px] text-muted-foreground mt-0.5 font-mono">{i}</span>
        </div>
      );
    }
    return ticks;
  };

  const currentTrack = tracks.find(t => t.objectId === selectedObject);

  return (
    <div className="bg-timeline border-t border-panel-border flex flex-col" style={{ height: timelineHeight }}>
      {/* Resize Handle */}
      <div 
        className="h-1 bg-panel-border cursor-ns-resize hover:bg-primary/50 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Transport Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border-b border-panel-border">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-secondary border-panel-border hover:bg-menu-hover"
            onClick={() => onFrameChange(0)}>
            <SkipBack className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-secondary border-panel-border hover:bg-menu-hover"
            onClick={() => onFrameChange(Math.max(0, currentFrame - 1))}>
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-secondary border-panel-border hover:bg-menu-hover"
            onClick={isPlaying ? onPause : onPlay}>
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-secondary border-panel-border hover:bg-menu-hover"
            onClick={onStop}>
            <Square className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-secondary border-panel-border hover:bg-menu-hover"
            onClick={() => onFrameChange(Math.min(totalFrames, currentFrame + 1))}>
            <ChevronRight className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-secondary border-panel-border hover:bg-menu-hover"
            onClick={() => onFrameChange(totalFrames)}>
            <SkipForward className="w-3 h-3" />
          </Button>
          {onToggleLoopPlayback && (
            <Button
              size="sm"
              variant={loopPlayback ? 'default' : 'outline'}
              title={loopPlayback ? 'Loop Playback: ON' : 'Loop Playback: OFF'}
              className={cn(
                "h-7 w-7 p-0 border-panel-border",
                loopPlayback
                  ? "bg-primary hover:bg-primary/80 text-primary-foreground"
                  : "bg-secondary hover:bg-menu-hover"
              )}
              onClick={onToggleLoopPlayback}
            >
              <Repeat className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Frame Counter */}
        <div className="flex items-center gap-1 ml-2">
          <span className="text-[10px] text-muted-foreground">Frame:</span>
          <input
            type="number"
            value={currentFrame}
            onChange={(e) => onFrameChange(Math.max(0, Math.min(totalFrames, parseInt(e.target.value) || 0)))}
            className="w-14 h-6 text-xs font-mono bg-input border border-panel-border rounded px-1 text-foreground text-center"
          />
          <span className="text-[10px] text-muted-foreground">/ {totalFrames}</span>
        </div>

        <div className="w-px h-5 bg-panel-border mx-1" />

        {/* Keyframe Controls */}
        <Button size="sm" variant="outline"
          className="h-7 px-2 bg-secondary border-panel-border hover:bg-menu-hover gap-1"
          onClick={() => selectedObject && onAddKeyframe(selectedObject, currentFrame)}
          disabled={!selectedObject}
        >
          <Circle className="w-3 h-3 fill-timeline-keyframe text-timeline-keyframe" />
          <span className="text-[10px]">Add Key</span>
        </Button>

        {selectedKeyframe && (
          <Button size="sm" variant="outline"
            className="h-7 px-2 bg-secondary border-panel-border hover:bg-destructive/20 gap-1"
            onClick={() => selectedKeyframe && onRemoveKeyframe(selectedKeyframe.objectId, selectedKeyframe.id)}
          >
            <Trash2 className="w-3 h-3 text-destructive" />
            <span className="text-[10px]">Del Key</span>
          </Button>
        )}

        <div className="w-px h-5 bg-panel-border mx-1" />

        {/* Auto Key */}
        <Button size="sm" variant={autoKey ? 'default' : 'outline'}
          className={cn(
            "h-7 px-2 gap-1",
            autoKey 
              ? "bg-destructive hover:bg-destructive/80 text-destructive-foreground" 
              : "bg-secondary border-panel-border hover:bg-menu-hover"
          )}
          onClick={() => setAutoKey(!autoKey)}
        >
          <Circle className={cn("w-2 h-2", autoKey && "fill-current")} />
          <span className="text-[10px]">Auto Key</span>
        </Button>

        <div className="w-px h-5 bg-panel-border mx-1" />

        {/* Trajectory Toggle */}
        {selectedObject && (
          <Button size="sm" variant="outline"
            className="h-7 px-2 bg-secondary border-panel-border hover:bg-menu-hover gap-1"
            onClick={() => selectedObject && onToggleTrajectory(selectedObject)}
          >
            {currentTrack?.showTrajectory ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span className="text-[10px]">Trajectory</span>
          </Button>
        )}

        <div className="w-px h-5 bg-panel-border mx-1" />

        {/* View mode: Basic timeline vs. 3ds Max style Track View */}
        <div className="flex rounded overflow-hidden border border-panel-border text-[10px]">
          <button
            className={cn("px-2 py-1", view === 'basic' ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-menu-hover")}
            onClick={() => setView('basic')}
            title="Basic timeline"
          >Basic</button>
          <button
            className={cn("px-2 py-1 flex items-center gap-1", view === 'trackview' ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-menu-hover")}
            onClick={() => setView('trackview')}
            title="3ds Max Track View (bones, curves, key info)"
          ><Bone className="w-3 h-3" />Track View</button>
        </div>

        {/* Bake clip button: appears when the selected imported model has
            AnimationClips that aren't yet baked into editable tracks. */}
        {bakedClipOptions && bakedClipOptions.length > 0 && !bakedClipSet && onBakeClip && (
          <Button size="sm" variant="default" className="h-7 px-2 text-[10px] gap-1 bg-amber-600 hover:bg-amber-500"
            onClick={() => onBakeClip(bakedClipOptions[0].index)}
            title="Convert the model's animation clip into editable per-bone tracks"
          >
            <Bone className="w-3 h-3" />
            Bake clip → tracks
          </Button>
        )}
      </div>


      {/* Timeline Content */}
      <div className="flex flex-1 min-h-0">
        {/* Track Labels */}
        <div className="w-40 border-r border-panel-border overflow-y-auto panel-scroll">
          {tracks.map(track => (
            <div key={track.objectId} 
              className={cn(
                "h-8 flex items-center px-2 border-b border-panel-border text-[10px] truncate",
                track.objectId === selectedObject && "bg-primary/10 text-primary"
              )}>
              <span className="truncate">{track.objectName}</span>
              <span className="ml-auto text-muted-foreground">{track.keyframes.length}k</span>
            </div>
          ))}
          {tracks.length === 0 && (
            <div className="h-8 flex items-center px-2 text-[10px] text-muted-foreground italic">
              No animation tracks
            </div>
          )}
        </div>

        {/* Timeline Track Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Frame Ruler */}
          <div className="h-5 relative border-b border-panel-border bg-secondary/30 flex-shrink-0">
            {renderFrameTicks()}
          </div>

          {/* Tracks */}
          <div ref={trackRef} className="flex-1 relative overflow-y-auto panel-scroll cursor-crosshair"
            onClick={handleTrackClick}>
            
            {/* Track rows */}
            {tracks.map(track => (
              <div key={track.objectId} className="h-8 relative border-b border-panel-border/50">
                {/* Keyframes */}
                {track.keyframes.map(kf => (
                  <div
                    key={kf.id}
                    className={cn(
                      "absolute top-1 w-3 h-6 cursor-pointer transform -translate-x-1/2 transition-colors",
                      selectedKeyframe?.id === kf.id
                        ? "z-10"
                        : "hover:brightness-125"
                    )}
                    style={{ left: `${(kf.frame / totalFrames) * 100}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectKeyframe(selectedKeyframe?.id === kf.id ? null : kf);
                      onFrameChange(kf.frame);
                    }}
                  >
                    {/* Diamond shape keyframe */}
                    <div className={cn(
                      "w-3 h-3 rotate-45 mt-1.5",
                      selectedKeyframe?.id === kf.id
                        ? "bg-primary ring-1 ring-primary-foreground"
                        : "bg-timeline-keyframe"
                    )} />
                  </div>
                ))}

                {/* Interpolation segments between keyframes */}
                {track.keyframes.length > 1 && track.keyframes.slice(0, -1).map((kf, i) => {
                  const next = track.keyframes[i + 1];
                  const left = (kf.frame / totalFrames) * 100;
                  const width = ((next.frame - kf.frame) / totalFrames) * 100;
                  return (
                    <div key={`seg-${kf.id}`}
                      className="absolute top-3.5 h-1 bg-primary/30 rounded"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  );
                })}
              </div>
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive z-20 cursor-ew-resize"
              style={{ left: `${(currentFrame / totalFrames) * 100}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggingPlayhead(true);
              }}
            >
              {/* Playhead top marker */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-3 h-4 bg-destructive" 
                style={{ clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
