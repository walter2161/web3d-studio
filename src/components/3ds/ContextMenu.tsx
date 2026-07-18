// Walt3D Right-Click / Quad Menu system.
//
// Lightweight imperative context-menu portal. Any component in the app can call
// `openContextMenu({ x, y, sections })` to show a 3ds Max-style contextual
// menu, and the menu closes itself on outside-click, Escape, resize or scroll.
// The `<ContextMenuRoot />` component (mounted once in Studio3D) renders the
// active menu into a portal so the menu escapes clipping containers.
import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export type MenuItem =
  | 'separator'
  | {
      label: string;
      onClick?: () => void;
      disabled?: boolean;
      checked?: boolean;
      danger?: boolean;
      hint?: string;
      submenu?: MenuItem[];
    };

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  sections: MenuSection[];
}

// simple pub/sub state ------------------------------------------------------
let currentState: ContextMenuState | null = null;
const listeners = new Set<(s: ContextMenuState | null) => void>();
const setState = (s: ContextMenuState | null) => {
  currentState = s;
  listeners.forEach((l) => l(s));
};

export const openContextMenu = (state: ContextMenuState) => setState(state);
export const closeContextMenu = () => setState(null);

// ---------------------------------------------------------------------------

const Item = ({ item, onDone }: { item: Exclude<MenuItem, 'separator'>; onDone: () => void }) => {
  const [hover, setHover] = useState(false);
  const hasSub = !!item.submenu && item.submenu.length > 0;
  return (
    <div
      className={cn(
        'relative flex items-center justify-between gap-4 px-2 py-[3px] text-xs cursor-default select-none',
        item.disabled ? 'text-muted-foreground/50' : 'text-foreground hover:bg-primary/25',
        item.danger && !item.disabled && 'text-red-400 hover:bg-red-500/30'
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (item.disabled || hasSub) return;
        try { item.onClick?.(); } finally { onDone(); }
      }}
    >
      <span className="flex items-center gap-1.5">
        <span className="w-3 text-center">{item.checked ? '✓' : ''}</span>
        <span>{item.label}</span>
      </span>
      <span className="flex items-center gap-2">
        {item.hint && <span className="text-[10px] text-muted-foreground">{item.hint}</span>}
        {hasSub && <ChevronRight size={11} />}
      </span>
      {hasSub && hover && (
        <div
          className="absolute left-full top-0 -mt-1 ml-0 min-w-[180px] py-1 bg-popover border border-panel-border shadow-xl z-[10001]"
          onMouseLeave={() => setHover(false)}
        >
          {renderItems(item.submenu!, onDone)}
        </div>
      )}
    </div>
  );
};

const renderItems = (items: MenuItem[], onDone: () => void) =>
  items.map((it, i) =>
    it === 'separator' ? (
      <div key={`sep-${i}`} className="my-1 border-t border-panel-border/60" />
    ) : (
      <Item key={`${it.label}-${i}`} item={it} onDone={onDone} />
    )
  );

export const ContextMenuRoot = () => {
  const [state, setLocal] = useState<ContextMenuState | null>(currentState);

  useEffect(() => {
    const cb = (s: ContextMenuState | null) => setLocal(s);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onWin = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWin);
    window.addEventListener('wheel', onWin, { passive: true });
    window.addEventListener('blur', onWin);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWin);
      window.removeEventListener('wheel', onWin as any);
      window.removeEventListener('blur', onWin);
    };
  }, [state, close]);

  if (!state) return null;

  // Clamp inside viewport
  const est = { w: 220, h: Math.min(400, 22 * state.sections.reduce((n, s) => n + s.items.length, 0) + 20) };
  const x = Math.min(state.x, window.innerWidth - est.w - 4);
  const y = Math.min(state.y, window.innerHeight - est.h - 4);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000]"
      onMouseDown={close}
      onContextMenu={(e) => { e.preventDefault(); close(); }}
    >
      <div
        role="menu"
        className="absolute min-w-[200px] py-1 bg-popover border border-panel-border shadow-2xl text-foreground"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        {state.sections.map((sec, i) => (
          <div key={i}>
            {i > 0 && <div className="my-1 border-t border-panel-border/60" />}
            {sec.title && (
              <div className="px-2 py-[2px] text-[10px] uppercase tracking-wide text-muted-foreground/80">
                {sec.title}
              </div>
            )}
            {renderItems(sec.items, close)}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
};
