// 3ds Max-style Command Panel primitives.
//
// A "rollout" is the collapsible titled block ([ - Parameters ]) used across
// the Modify panel. A "spinner" is the classic numeric field: right-aligned
// label with colon, small numeric input with up/down chevrons, and drag-to-
// change on the spinner arrows column (drag up = increase). Values commit on
// every step so the viewport updates live.

import { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface RolloutProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function MaxRollout({ title, children, defaultOpen = true, className }: RolloutProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        'border border-panel-border bg-panel/40 rounded-[2px] select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-2 py-[3px] bg-gradient-to-b from-muted/60 to-muted/30 hover:from-muted/80 hover:to-muted/50 border-b border-panel-border text-[10px] font-semibold uppercase tracking-wider text-foreground/90"
      >
        <span className="inline-flex items-center justify-center w-3 h-3 border border-panel-border bg-background/80 text-[10px] leading-none font-mono">
          {open ? '−' : '+'}
        </span>
        <span className="flex-1 text-center">{title}</span>
        <span className="w-3" />
      </button>
      {open && <div className="p-2 space-y-[3px]">{children}</div>}
    </div>
  );
}

interface SpinnerProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  isInt?: boolean;
  precision?: number;
  labelWidth?: number;
  className?: string;
}

export function MaxSpinner({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  isInt = false,
  precision,
  labelWidth,
  className,
}: SpinnerProps) {
  const clamp = useCallback(
    (v: number) => {
      if (!Number.isFinite(v)) v = 0;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return isInt ? Math.round(v) : v;
    },
    [min, max, isInt],
  );

  const commit = (v: number) => onChange(clamp(v));
  const bump = (dir: 1 | -1) => commit((value ?? 0) + dir * step);

  // Drag-to-scrub. Base drag rate = one `step` per pixel, but Alt slows it 5×
  // and Shift accelerates 5× (matches the R3 spinner behaviour).
  const dragRef = useRef<{ y: number; v: number } | null>(null);
  const onDragDown = (e: React.PointerEvent) => {
    dragRef.current = { y: e.clientY, v: value ?? 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.y - e.clientY;
    const mult = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
    commit(dragRef.current.v + dy * step * mult);
  };
  const onDragUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const displayVal = (() => {
    const n = Number.isFinite(value) ? value : 0;
    if (isInt) return String(Math.round(n));
    const p = precision ?? (step >= 1 ? 1 : step >= 0.1 ? 2 : 3);
    return n.toFixed(p);
  })();

  return (
    <div className={cn('flex items-center gap-1 text-[11px] leading-none', className)}>
      <label
        className="text-right pr-1 text-foreground/85 shrink-0"
        style={{ width: labelWidth ?? 74 }}
      >
        {label}:
      </label>
      <div className="flex items-stretch border border-panel-border bg-background rounded-[2px] h-[19px] flex-1 min-w-0">
        <input
          type="text"
          inputMode="decimal"
          value={displayVal}
          onChange={(e) => {
            const parsed = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
            if (Number.isFinite(parsed)) commit(parsed);
          }}
          onBlur={(e) => {
            const parsed = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
            commit(Number.isFinite(parsed) ? parsed : 0);
          }}
          className="w-full min-w-0 px-1 bg-transparent text-[11px] outline-none text-right tabular-nums"
        />
        <div
          className="flex flex-col border-l border-panel-border cursor-ns-resize touch-none shrink-0"
          onPointerDown={onDragDown}
          onPointerMove={onDragMove}
          onPointerUp={onDragUp}
          onPointerCancel={onDragUp}
          title="Drag vertically to scrub. Hold Shift = ×5, Alt = ÷5."
        >
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => bump(1)}
            className="w-[13px] h-[9px] flex items-center justify-center hover:bg-muted/60 active:bg-muted/80 leading-none"
          >
            <span className="text-[7px]">▲</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => bump(-1)}
            className="w-[13px] h-[9px] flex items-center justify-center hover:bg-muted/60 active:bg-muted/80 leading-none border-t border-panel-border"
          >
            <span className="text-[7px]">▼</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact 3ds Max-style checkbox row (used for "Generate Mapping Coords." etc.)
export function MaxCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none py-[1px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3 h-3 accent-primary"
      />
      <span className="text-foreground/85">{label}</span>
    </label>
  );
}

// Small dropdown styled to match the panel — used for Justification, Type, etc.
export function MaxSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  labelWidth,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  labelWidth?: number;
}) {
  return (
    <div className="flex items-center gap-1 text-[11px] leading-none">
      <label
        className="text-right pr-1 text-foreground/85 shrink-0"
        style={{ width: labelWidth ?? 74 }}
      >
        {label}:
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="flex-1 min-w-0 h-[19px] bg-background border border-panel-border rounded-[2px] px-1 text-[11px] outline-none capitalize"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
