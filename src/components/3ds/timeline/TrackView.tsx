/**
 * Track View — 3ds Max style animation editor for the selected object.
 *
 * Layout (compact, lives inside the main timeline panel):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [Dope Sheet] [Curve Editor]      Clip Tools:  In-Place ... │
 *   ├──────────────┬─────────────────────────────────────────────┤
 *   │ Tree (bones) │ Sheet / Curve area                          │
 *   │              ├─────────────────────────────────────────────┤
 *   │              │ Motion Panel (Key Info) — visible when      │
 *   │              │ a key/channel is selected                   │
 *   └──────────────┴─────────────────────────────────────────────┘
 */
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Copy, Trash2, RotateCcw, FlipHorizontal, Repeat, Timer, Move, Play as PlayIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BakedClipSet, ChannelTrack, ChannelKey, TangentKind, OutOfRange, ControllerKind,
  mirrorLR, retime, loopCyclic, toggleInPlace, trimRange, sampleTrack,
} from './channelTracks';

interface Props {
  clipSet: BakedClipSet;
  currentFrame: number;
  totalFrames: number;
  onFrameChange: (f: number) => void;
  onChange: (next: BakedClipSet) => void;
  /** Optional list of alternate clip names (if the model shipped many). */
  clipOptions?: { index: number; name: string }[];
  onSelectClip?: (index: number) => void;
  onBake?: () => void;
  /** When present, render a "Bake" chip that runs onBake for models that
   *  came with a THREE.AnimationClip but haven't been baked yet. */
  bakeAvailable?: boolean;
}

type Mode = 'dope' | 'curve';

export const TrackView = ({
  clipSet, currentFrame, totalFrames, onFrameChange, onChange,
  clipOptions, onSelectClip, onBake, bakeAvailable,
}: Props) => {
  const [mode, setMode] = useState<Mode>('dope');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(() => new Set()); // key: `${uuid}:${channel}`
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  // Group tracks per (node -> channel -> axisTrack)
  const grouped = useMemo(() => {
    const byNode = new Map<string, Map<'pos' | 'rot' | 'scale' | 'morph', ChannelTrack[]>>();
    for (const t of clipSet.tracks) {
      const nu = t.nodeUuid ?? '__root__';
      let m = byNode.get(nu);
      if (!m) { m = new Map(); byNode.set(nu, m); }
      if (!m.has(t.channel)) m.set(t.channel, []);
      m.get(t.channel)!.push(t);
    }
    return byNode;
  }, [clipSet]);

  const roots = useMemo(() => {
    // Nodes whose parent isn't in nodeOrder (or is null)
    return clipSet.nodeOrder.filter((u) => {
      const p = clipSet.nodeParents[u];
      return !p || !clipSet.nodeOrder.includes(p);
    });
  }, [clipSet]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of clipSet.nodeOrder) {
      const p = clipSet.nodeParents[u];
      if (!p) continue;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(u);
    }
    return m;
  }, [clipSet]);

  const toggleNode = (uuid: string) => {
    setExpandedNodes((prev) => {
      const n = new Set(prev);
      n.has(uuid) ? n.delete(uuid) : n.add(uuid);
      return n;
    });
  };
  const toggleChannel = (uuid: string, channel: string) => {
    const k = `${uuid}:${channel}`;
    setExpandedChannels((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  // Update a single key on a single track.
  const patchKey = useCallback((trackId: string, keyId: string, upd: Partial<ChannelKey>) => {
    onChange({
      ...clipSet,
      tracks: clipSet.tracks.map((t) =>
        t.id !== trackId ? t : { ...t, keys: t.keys.map((k) => (k.id !== keyId ? k : { ...k, ...upd })) },
      ),
    });
  }, [clipSet, onChange]);

  const patchTrack = useCallback((trackId: string, upd: Partial<ChannelTrack>) => {
    onChange({
      ...clipSet,
      tracks: clipSet.tracks.map((t) => (t.id !== trackId ? t : { ...t, ...upd })),
    });
  }, [clipSet, onChange]);

  const removeKey = useCallback((trackId: string, keyId: string) => {
    onChange({
      ...clipSet,
      tracks: clipSet.tracks.map((t) =>
        t.id !== trackId ? t : { ...t, keys: t.keys.filter((k) => k.id !== keyId) },
      ),
    });
    setSelectedKeyId(null);
  }, [clipSet, onChange]);

  const addKeyAtCurrent = useCallback((trackId: string) => {
    const track = clipSet.tracks.find((t) => t.id === trackId);
    if (!track) return;
    // Sample current value from the track (interpolated) to seed the new key.
    const value = sampleTrack(track, currentFrame);
    const existing = track.keys.find((k) => k.frame === currentFrame);
    if (existing) return;
    const newKey: ChannelKey = {
      id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      frame: currentFrame,
      value,
      inTan: 'smooth', outTan: 'smooth',
    };
    onChange({
      ...clipSet,
      tracks: clipSet.tracks.map((t) =>
        t.id !== trackId ? t : { ...t, keys: [...t.keys, newKey].sort((a, b) => a.frame - b.frame) },
      ),
    });
    setSelectedKeyId(newKey.id);
    setSelectedTrackId(trackId);
  }, [clipSet, currentFrame, onChange]);

  const selectedTrack = clipSet.tracks.find((t) => t.id === selectedTrackId) || null;
  const selectedKey = selectedTrack?.keys.find((k) => k.id === selectedKeyId) || null;

  // ---------- Render helpers ----------
  const CHANNEL_LABELS: Record<string, string> = {
    pos: 'Position', rot: 'Rotation', scale: 'Scale', morph: 'Morph',
  };
  const AXIS_COLOR: Record<string, string> = {
    x: 'text-red-400', y: 'text-emerald-400', z: 'text-sky-400',
  };

  const renderNode = (uuid: string, depth: number): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];
    const label = clipSet.nodeNames[uuid] || uuid.slice(0, 6);
    const kids = childrenOf.get(uuid) || [];
    const chans = grouped.get(uuid);
    const hasContent = !!chans || kids.length > 0;
    const isOpen = expandedNodes.has(uuid);

    rows.push(
      <div
        key={`node_${uuid}`}
        className="flex items-center gap-1 h-6 border-b border-panel-border/40 hover:bg-secondary/30 text-[11px]"
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
      >
        {hasContent ? (
          <button className="w-3 h-3 flex items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => toggleNode(uuid)}>
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-3 h-3" />
        )}
        <span className="truncate text-amber-300/90">{label}</span>
      </div>
    );

    if (isOpen && chans) {
      chans.forEach((axes, chan) => {
        const chKey = `${uuid}:${chan}`;
        const chOpen = expandedChannels.has(chKey);
        rows.push(
          <div
            key={`ch_${chKey}`}
            className="flex items-center gap-1 h-6 border-b border-panel-border/40 hover:bg-secondary/30 text-[11px]"
            style={{ paddingLeft: `${(depth + 1) * 10 + 4}px` }}
          >
            <button className="w-3 h-3 flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => toggleChannel(uuid, chan)}>
              {chOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            <span className="text-muted-foreground">{CHANNEL_LABELS[chan]}</span>
          </div>
        );
        if (chOpen) {
          axes.forEach((tr) => {
            const isSelected = tr.id === selectedTrackId;
            rows.push(
              <div
                key={`tr_${tr.id}`}
                data-track-id={tr.id}
                className={cn(
                  "flex items-center gap-1 h-6 border-b border-panel-border/40 text-[10px] cursor-pointer",
                  isSelected ? "bg-primary/15 text-primary" : "hover:bg-secondary/40"
                )}
                style={{ paddingLeft: `${(depth + 2) * 10 + 4}px` }}
                onClick={() => setSelectedTrackId(tr.id)}
              >
                <span className={cn("font-mono", AXIS_COLOR[String(tr.axis)] || 'text-muted-foreground')}>
                  {String(tr.axis).toUpperCase()}
                </span>
                <span className="ml-auto pr-2 text-muted-foreground">{tr.keys.length}k</span>
              </div>
            );
          });
        }
      });
    }

    kids.forEach((k) => { rows.push(...renderNode(k, depth + 1)); });
    return rows;
  };

  // ---------- Dope Sheet keyframe strip ----------
  const stripRef = useRef<HTMLDivElement>(null);
  const frameToPx = (f: number) => {
    const w = stripRef.current?.clientWidth ?? 800;
    return (f / Math.max(1, clipSet.frameEnd || totalFrames)) * w;
  };
  const pxToFrame = (px: number) => {
    const w = stripRef.current?.clientWidth ?? 800;
    return Math.round((px / w) * Math.max(1, clipSet.frameEnd || totalFrames));
  };

  const scrubTimeline = (e: React.MouseEvent) => {
    if (!stripRef.current) return;
    const rect = stripRef.current.getBoundingClientRect();
    onFrameChange(Math.max(0, Math.min(totalFrames, pxToFrame(e.clientX - rect.left))));
  };

  // Draggable keyframes (dope sheet mode)
  const dragRef = useRef<{ trackId: string; keyId: string; startFrame: number; startX: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !stripRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const w = stripRef.current.clientWidth;
      const dFrame = Math.round((dx / w) * Math.max(1, clipSet.frameEnd || totalFrames));
      const nextFrame = Math.max(0, dragRef.current.startFrame + dFrame);
      patchKey(dragRef.current.trackId, dragRef.current.keyId, { frame: nextFrame });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [clipSet, patchKey, totalFrames]);

  // Flat visible order matching tree render (for dope-sheet row alignment)
  const flatVisible = useMemo(() => {
    const order: Array<{ kind: 'node' | 'chan' | 'track'; uuid: string; track?: ChannelTrack; chan?: string }> = [];
    const walk = (uuid: string) => {
      order.push({ kind: 'node', uuid });
      if (!expandedNodes.has(uuid)) {
        (childrenOf.get(uuid) || []).forEach(walk);
        return;
      }
      const chans = grouped.get(uuid);
      if (chans) {
        chans.forEach((axes, chan) => {
          order.push({ kind: 'chan', uuid, chan });
          if (!expandedChannels.has(`${uuid}:${chan}`)) return;
          axes.forEach((tr) => order.push({ kind: 'track', uuid, track: tr }));
        });
      }
      (childrenOf.get(uuid) || []).forEach(walk);
    };
    roots.forEach(walk);
    return order;
  }, [roots, expandedNodes, expandedChannels, childrenOf, grouped]);

  // ---------- Curve editor for the selected track ----------
  const renderCurve = () => {
    if (!selectedTrack) {
      return <div className="text-[11px] text-muted-foreground p-4 italic">
        Select a channel (Position/Rotation/Scale X/Y/Z) to view its curve.
      </div>;
    }
    const keys = selectedTrack.keys;
    const w = 900, h = 220, pad = 20;
    const fmin = 0, fmax = Math.max(1, clipSet.frameEnd || totalFrames);
    const vmin = Math.min(...keys.map((k) => k.value), 0);
    const vmax = Math.max(...keys.map((k) => k.value), 0);
    const range = Math.max(1e-6, vmax - vmin);
    const fx = (f: number) => pad + ((f - fmin) / (fmax - fmin)) * (w - 2 * pad);
    const fy = (v: number) => h - pad - ((v - vmin) / range) * (h - 2 * pad);

    // Sample the interpolated curve for visualization.
    const path: string[] = [];
    const samples = 240;
    for (let i = 0; i <= samples; i++) {
      const f = fmin + (i / samples) * (fmax - fmin);
      const v = sampleTrack(selectedTrack, f);
      path.push(`${i === 0 ? 'M' : 'L'} ${fx(f).toFixed(1)} ${fy(v).toFixed(1)}`);
    }

    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="bg-secondary/30 border-t border-panel-border">
        {/* gridlines */}
        {Array.from({ length: 11 }).map((_, i) => {
          const x = pad + (i / 10) * (w - 2 * pad);
          return <line key={`gx${i}`} x1={x} y1={pad} x2={x} y2={h - pad} stroke="hsl(var(--panel-border))" strokeOpacity={0.4} />;
        })}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = pad + (i / 4) * (h - 2 * pad);
          return <line key={`gy${i}`} x1={pad} y1={y} x2={w - pad} y2={y} stroke="hsl(var(--panel-border))" strokeOpacity={0.4} />;
        })}
        {/* zero line */}
        {vmin < 0 && vmax > 0 && (
          <line x1={pad} y1={fy(0)} x2={w - pad} y2={fy(0)} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 3" />
        )}
        {/* curve */}
        <path d={path.join(' ')} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
        {/* keyframes */}
        {keys.map((k) => (
          <g key={k.id} transform={`translate(${fx(k.frame)}, ${fy(k.value)})`}
            onMouseDown={(e) => {
              e.stopPropagation();
              setSelectedKeyId(k.id);
              // Drag in both axes.
              const start = { fx: e.clientX, fy: e.clientY, kf: k.frame, kv: k.value };
              const onMove = (ev: MouseEvent) => {
                const dxf = ((ev.clientX - start.fx) / (w - 2 * pad)) * (fmax - fmin);
                const dyv = -((ev.clientY - start.fy) / (h - 2 * pad)) * range;
                patchKey(selectedTrack.id, k.id, {
                  frame: Math.max(0, Math.round(start.kf + dxf)),
                  value: start.kv + dyv,
                });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <rect x={-4} y={-4} width={8} height={8} transform="rotate(45)"
              fill={selectedKeyId === k.id ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'}
              stroke="hsl(var(--background))" strokeWidth={1} />
          </g>
        ))}
        {/* playhead */}
        <line x1={fx(currentFrame)} y1={0} x2={fx(currentFrame)} y2={h} stroke="hsl(var(--destructive))" strokeWidth={1} />
      </svg>
    );
  };

  // ---------- Motion Panel (Key Info) ----------
  const renderMotion = () => {
    if (!selectedTrack) return null;
    return (
      <div className="border-l border-panel-border bg-panel/60 w-64 flex-shrink-0 p-2 space-y-2 text-[11px]">
        <div className="font-semibold text-xs text-primary/90 uppercase tracking-wide">Motion Panel</div>
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground">{selectedTrack.nodeName}</div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Channel:</span>
            <span className="font-mono">{selectedTrack.channel}.{String(selectedTrack.axis)}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-panel-border">
          <div className="text-[10px] text-muted-foreground mb-1">Controller</div>
          <Select value={selectedTrack.controller} onValueChange={(v) => patchTrack(selectedTrack.id, { controller: v as ControllerKind })}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bezier">Bezier</SelectItem>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="tcb">TCB</SelectItem>
              <SelectItem value="noise">Noise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Out-of-Range</div>
          <Select value={selectedTrack.outOfRange} onValueChange={(v) => patchTrack(selectedTrack.id, { outOfRange: v as OutOfRange })}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="constant">Constant</SelectItem>
              <SelectItem value="loop">Loop</SelectItem>
              <SelectItem value="cycle">Cycle</SelectItem>
              <SelectItem value="pingpong">Ping Pong</SelectItem>
              <SelectItem value="relativeRepeat">Relative Repeat</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedKey && (
          <div className="pt-2 border-t border-panel-border space-y-1">
            <div className="font-semibold text-[10px] uppercase text-muted-foreground">Key Info</div>
            <label className="flex items-center gap-2">
              <span className="w-10 text-muted-foreground">Time</span>
              <input type="number" value={selectedKey.frame}
                onChange={(e) => patchKey(selectedTrack.id, selectedKey.id, { frame: parseInt(e.target.value) || 0 })}
                className="flex-1 h-6 bg-input border border-panel-border rounded px-1 font-mono" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-10 text-muted-foreground">Value</span>
              <input type="number" step={0.01} value={Number(selectedKey.value.toFixed(4))}
                onChange={(e) => patchKey(selectedTrack.id, selectedKey.id, { value: parseFloat(e.target.value) || 0 })}
                className="flex-1 h-6 bg-input border border-panel-border rounded px-1 font-mono" />
            </label>
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">In tangent</div>
              <Select value={selectedKey.inTan} onValueChange={(v) => patchKey(selectedTrack.id, selectedKey.id, { inTan: v as TangentKind })}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['bezier','linear','step','smooth','fast','slow'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">Out tangent</div>
              <Select value={selectedKey.outTan} onValueChange={(v) => patchKey(selectedTrack.id, selectedKey.id, { outTan: v as TangentKind })}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['bezier','linear','step','smooth','fast','slow'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1 pt-1">
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                onClick={() => removeKey(selectedTrack.id, selectedKey.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> Del
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                onClick={() => addKeyAtCurrent(selectedTrack.id)}>
                <PlayIcon className="w-3 h-3 mr-1" /> Add@F
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar: mode tabs + clip tools */}
      <div className="flex items-center gap-2 px-2 py-1 bg-panel/70 border-b border-panel-border text-[11px]">
        <div className="flex rounded overflow-hidden border border-panel-border">
          <button
            className={cn("px-2 py-0.5", mode === 'dope' ? "bg-primary text-primary-foreground" : "hover:bg-menu-hover")}
            onClick={() => setMode('dope')}>Dope Sheet</button>
          <button
            className={cn("px-2 py-0.5", mode === 'curve' ? "bg-primary text-primary-foreground" : "hover:bg-menu-hover")}
            onClick={() => setMode('curve')}>Curve Editor</button>
        </div>

        {clipOptions && clipOptions.length > 1 && onSelectClip && (
          <Select
            value={String(clipSet.sourceClipIndex)}
            onValueChange={(v) => onSelectClip(parseInt(v))}
          >
            <SelectTrigger className="h-6 text-[10px] w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {clipOptions.map((c) => (
                <SelectItem key={c.index} value={String(c.index)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {bakeAvailable && onBake && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onBake}>
            Re-bake clip
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground uppercase mr-1">Clip Tools:</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" title="In-Place / root motion toggle"
            onClick={() => onChange(toggleInPlace(clipSet))}>
            <Move className="w-3 h-3 mr-1" /> In-Place
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" title="Mirror Left↔Right"
            onClick={() => onChange(mirrorLR(clipSet))}>
            <FlipHorizontal className="w-3 h-3 mr-1" /> Mirror
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" title="Loop cyclic (blend endpoints)"
            onClick={() => onChange(loopCyclic(clipSet))}>
            <Repeat className="w-3 h-3 mr-1" /> Loop
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" title="Retime 0.5x"
            onClick={() => onChange(retime(clipSet, 0.5))}>
            <Timer className="w-3 h-3 mr-1" /> ½×
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" title="Retime 2x"
            onClick={() => onChange(retime(clipSet, 2))}>
            <Timer className="w-3 h-3 mr-1" /> 2×
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" title="Trim to timeline range"
            onClick={() => onChange(trimRange(clipSet, 0, totalFrames))}>
            <Copy className="w-3 h-3 mr-1" /> Trim
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Tree */}
        <div className="w-56 border-r border-panel-border overflow-auto panel-scroll">
          {roots.length === 0 && (
            <div className="text-[11px] text-muted-foreground italic p-3">
              No baked animation — click "Bake clip" to import keyframes from this model.
            </div>
          )}
          {roots.map((r) => renderNode(r, 0))}
        </div>

        {/* Sheet / Curve */}
        <div className="flex-1 flex flex-col min-h-0">
          {mode === 'dope' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Ruler */}
              <div className="h-5 relative border-b border-panel-border bg-secondary/30 text-[9px] font-mono">
                {Array.from({ length: 11 }).map((_, i) => {
                  const f = Math.round((i / 10) * (clipSet.frameEnd || totalFrames));
                  return (
                    <div key={i} className="absolute top-0 flex flex-col items-center"
                      style={{ left: `${(i / 10) * 100}%` }}>
                      <div className="w-px h-2 bg-muted-foreground/50" />
                      <span className="mt-0.5 text-muted-foreground">{f}</span>
                    </div>
                  );
                })}
              </div>
              {/* Rows */}
              <div ref={stripRef} className="flex-1 relative overflow-auto panel-scroll"
                onMouseDown={scrubTimeline}>
                {flatVisible.map((row, i) => {
                  if (row.kind !== 'track' || !row.track) {
                    return (
                      <div key={`v_${i}`} className="h-6 border-b border-panel-border/40 bg-secondary/10" />
                    );
                  }
                  const tr = row.track;
                  return (
                    <div key={`v_${i}`} className={cn("h-6 relative border-b border-panel-border/40",
                      tr.id === selectedTrackId && "bg-primary/10")}>
                      {tr.keys.map((k) => (
                        <div key={k.id}
                          className={cn("absolute top-1 w-2.5 h-2.5 rotate-45 -translate-x-1/2 cursor-pointer",
                            selectedKeyId === k.id ? "bg-primary ring-1 ring-primary-foreground"
                              : "bg-timeline-keyframe hover:bg-primary/80")}
                          style={{ left: `${(k.frame / Math.max(1, clipSet.frameEnd || totalFrames)) * 100}%`, top: '7px' }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedTrackId(tr.id);
                            setSelectedKeyId(k.id);
                            dragRef.current = { trackId: tr.id, keyId: k.id, startFrame: k.frame, startX: e.clientX };
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
                {/* Playhead */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none z-10"
                  style={{ left: `${(currentFrame / Math.max(1, clipSet.frameEnd || totalFrames)) * 100}%` }} />
              </div>
            </div>
          )}
          {mode === 'curve' && (
            <div className="flex-1 overflow-auto panel-scroll">
              {renderCurve()}
            </div>
          )}
        </div>

        {renderMotion()}
      </div>
    </div>
  );
};
