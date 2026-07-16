/**
 * ClipGanttLane — Gantt-style editor for imported-model clip segments.
 *
 * Each bar plays a specific AnimationClip from startFrame..endFrame on the
 * scene timeline. Users can:
 *   • Drag the bar body to reposition (keeps its length)
 *   • Drag the left/right edge to resize the range
 *   • Change the assigned clip via the inline dropdown
 *   • Remove the segment with the × button
 *
 * The bars only render inside their lane — parent controls layout.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClipSegment {
  id: string;
  startFrame: number;
  endFrame: number;
  clipIndex: number;
  /** Length in frames of the crossfade transition from the previous segment
   *  into this one. Rendered as a triangular band on the segment's left edge.
   *  0 (default) = hard cut. */
  blendIn?: number;
}

interface Props {
  segments: ClipSegment[];
  clipOptions: { index: number; name: string }[];
  currentFrame: number;
  totalFrames: number;
  onChange: (next: ClipSegment[]) => void;
}

type DragMode = 'move' | 'resize-l' | 'resize-r' | 'blend';

interface DragState {
  id: string;
  mode: DragMode;
  startX: number;
  origStart: number;
  origEnd: number;
  origBlend: number;
  laneWidth: number;
}

export const ClipGanttLane = ({ segments, clipOptions, currentFrame, totalFrames, onChange }: Props) => {
  const laneRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const pxPerFrame = useCallback(() => {
    const w = laneRef.current?.clientWidth ?? 1;
    return w / Math.max(1, totalFrames);
  }, [totalFrames]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX;
      const dFrame = Math.round((dx / Math.max(1, drag.laneWidth)) * totalFrames);
      onChange(
        segments.map((s) => {
          if (s.id !== drag.id) return s;
          if (drag.mode === 'move') {
            const len = drag.origEnd - drag.origStart;
            const start = Math.max(0, Math.min(totalFrames - len, drag.origStart + dFrame));
            const end = start + len;
            return { ...s, startFrame: start, endFrame: end };
          }
          if (drag.mode === 'resize-l') {
            const start = Math.max(0, Math.min(drag.origEnd - 1, drag.origStart + dFrame));
            return { ...s, startFrame: start };
          }
          if (drag.mode === 'blend') {
            const segLen = Math.max(1, drag.origEnd - drag.origStart);
            const nextBlend = Math.max(0, Math.min(segLen, drag.origBlend + dFrame));
            return { ...s, blendIn: nextBlend };
          }
          const end = Math.max(drag.origStart + 1, Math.min(totalFrames, drag.origEnd + dFrame));
          return { ...s, endFrame: end };
        }),
      );
    };
    const handleUp = () => setDrag(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drag, segments, totalFrames, onChange]);

  const beginDrag = (
    e: React.MouseEvent,
    seg: ClipSegment,
    mode: DragMode,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!laneRef.current) return;
    setDrag({
      id: seg.id,
      mode,
      startX: e.clientX,
      origStart: seg.startFrame,
      origEnd: seg.endFrame,
      origBlend: seg.blendIn || 0,
      laneWidth: laneRef.current.clientWidth,
    });
  };

  return (
    <div
      ref={laneRef}
      className="relative flex-1 h-7 bg-secondary/30 rounded border border-panel-border/60 overflow-hidden"
    >
      {/* Playhead marker */}
      <div
        className="absolute top-0 bottom-0 w-px bg-destructive/70 pointer-events-none z-20"
        style={{ left: `${(currentFrame / Math.max(1, totalFrames)) * 100}%` }}
      />

      {segments.map((seg) => {
        const clip = clipOptions.find((c) => c.index === seg.clipIndex);
        const leftPct = (seg.startFrame / Math.max(1, totalFrames)) * 100;
        const widthPct = Math.max(0.5, ((seg.endFrame - seg.startFrame) / Math.max(1, totalFrames)) * 100);
        const blendLen = Math.max(0, Math.min(seg.blendIn || 0, seg.endFrame - seg.startFrame));
        const blendWidthPct = ((blendLen) / Math.max(1, totalFrames)) * 100;
        return (
          <div
            key={seg.id}
            className={cn(
              "absolute top-0.5 bottom-0.5 flex items-center gap-1 rounded px-1 text-[9px] font-mono text-primary-foreground",
              "bg-primary/85 hover:bg-primary shadow cursor-grab active:cursor-grabbing select-none z-10"
            )}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title={`${clip?.name || 'clip ' + seg.clipIndex} · F${seg.startFrame}–F${seg.endFrame}${blendLen > 0 ? ` · transition ${blendLen}f` : ''}`}
            onMouseDown={(e) => beginDrag(e, seg, 'move')}
          >
            {/* Transition (blend-in) band: gradient overlay on the left of the
                segment representing the crossfade from the previous clip. */}
            {blendLen > 0 && (
              <div
                className="absolute left-0 top-0 bottom-0 pointer-events-none rounded-l z-[5]"
                style={{
                  width: `${(blendLen / Math.max(1, seg.endFrame - seg.startFrame)) * 100}%`,
                  background:
                    'linear-gradient(to right, hsl(var(--accent)) 0%, hsl(var(--accent) / 0.7) 40%, transparent 100%)',
                }}
              />
            )}
            {/* Left resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary-foreground/25 hover:bg-primary-foreground/60 z-[15]"
              onMouseDown={(e) => beginDrag(e, seg, 'resize-l')}
            />
            {/* Transition drag handle: small pill sitting on the segment's
                top-left. Drag right to lengthen the crossfade from the
                previous clip, left to shorten it. */}
            <div
              className="absolute top-0 left-1.5 h-2 w-2 -translate-y-1/2 rounded-full bg-accent border border-accent-foreground/40 cursor-ew-resize z-[16] shadow"
              style={{ left: `calc(${(blendLen / Math.max(1, seg.endFrame - seg.startFrame)) * 100}% - 4px)` }}
              onMouseDown={(e) => beginDrag(e, seg, 'blend')}
              title="Drag to set transition length from previous clip"
            />
            <span className="ml-1 truncate relative z-[12]">
              F{seg.startFrame}
            </span>
            <select
              value={seg.clipIndex}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const nextIndex = parseInt(e.target.value, 10);
                onChange(segments.map((s) => (s.id === seg.id ? { ...s, clipIndex: nextIndex } : s)));
              }}
              className="bg-transparent text-primary-foreground text-[9px] outline-none max-w-[80px] cursor-pointer relative z-[12]"
            >
              {clipOptions.map((c) => (
                <option key={c.index} value={c.index} className="text-foreground">
                  {c.name}
                </option>
              ))}
            </select>
            <span className="truncate relative z-[12]">–F{seg.endFrame}</span>
            {blendLen > 0 && (
              <span className="truncate text-[8px] opacity-80 relative z-[12]" title="Crossfade length">
                ~{blendLen}f
              </span>
            )}
            <button
              className="ml-auto mr-1 hover:text-destructive-foreground relative z-[12]"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onChange(segments.filter((s) => s.id !== seg.id));
              }}
              title="Remove segment"
            >
              <X className="w-2.5 h-2.5" />
            </button>
            {/* Right resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary-foreground/25 hover:bg-primary-foreground/60 z-[15]"
              onMouseDown={(e) => beginDrag(e, seg, 'resize-r')}
            />
            {void blendWidthPct}
          </div>
        );
      })}
    </div>
  );
};
