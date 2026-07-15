import { ReactNode, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface R3DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
  initialPosition?: { x: number; y: number };
}

/**
 * Windows-95/3ds Max R3 style modal window.
 * - Navy title bar with white bold text and close button
 * - bevel-raised body on win-face background
 * - Draggable by title bar
 */
export const R3Dialog = ({ open, onClose, title, width = 480, children, initialPosition }: R3DialogProps) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const winRef = useRef<HTMLDivElement | null>(null);

  // Minimum Y: below the app's top bar (menu + toolbars). Keeps the title bar
  // reachable so dialogs dragged upward can always be grabbed and moved back.
  const TOP_MIN = 48;
  const clampPos = (p: { x: number; y: number }) => {
    if (typeof window === 'undefined') return p;
    const w = winRef.current?.offsetWidth ?? width;
    const h = winRef.current?.offsetHeight ?? 0;
    const minX = -(w - 80); // keep at least 80px of the title bar visible
    const maxX = window.innerWidth - 80;
    const minY = TOP_MIN;
    const maxY = window.innerHeight - 20; // keep title bar on-screen
    return {
      x: Math.min(maxX, Math.max(minX, p.x)),
      y: Math.min(maxY, Math.max(minY, p.y)),
    };
  };

  useEffect(() => {
    if (open && pos === null && typeof window !== 'undefined') {
      setPos(clampPos(initialPosition ?? {
        x: Math.max(20, Math.floor((window.innerWidth - width) / 2)),
        y: Math.max(TOP_MIN, Math.floor(window.innerHeight * 0.12)),
      }));
    }
  }, [open, pos, width, initialPosition]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos(clampPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Re-clamp on window resize so dialogs stay reachable.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={winRef}
        className="absolute pointer-events-auto bevel-raised bg-win-face shadow-lg"
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, width }}
      >

        {/* Title bar */}
        <div
          className="h-[18px] flex items-center justify-between px-1 select-none cursor-move"
          style={{ background: 'linear-gradient(to right, #000080, #1084d0)' }}
          onMouseDown={(e) => {
            dragRef.current = { dx: e.clientX - (pos?.x ?? 0), dy: e.clientY - (pos?.y ?? 0) };
          }}
        >
          <span className="text-white text-[11px] font-bold px-1">{title}</span>
          <button
            className="w-4 h-4 bevel-raised bg-win-face flex items-center justify-center hover:brightness-110"
            onClick={onClose}
            title="Close"
          >
            <X size={10} strokeWidth={3} />
          </button>
        </div>
        {/* Body: caps at the remaining viewport height below the title bar
            and scrolls when the content would otherwise extend past the
            bottom of the screen, so options never end up cut off. */}
        <div
          className="p-2 text-[11px] text-win-text overflow-auto"
          style={{
            maxHeight: typeof window !== 'undefined'
              ? Math.max(120, window.innerHeight - (pos?.y ?? TOP_MIN) - 18 /* title */ - 24 /* safety */)
              : undefined,
          }}
        >{children}</div>

      </div>
    </div>
  );
};

/** R3 group box with etched title border. */
export const GroupBox = ({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) => (
  <fieldset className={`border border-win-shadow px-2 pt-1 pb-2 ${className}`} style={{ borderStyle: 'groove' }}>
    {title && <legend className="px-1 text-[11px] text-win-text">{title}</legend>}
    {children}
  </fieldset>
);

/** R3-style numeric spinner. */
export const Spinner = ({
  value, onChange, min, max, step = 1, width = 56,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; width?: number }) => {
  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };
  return (
    <div className="inline-flex items-stretch" style={{ height: 18 }}>
      <input
        type="number"
        className="bevel-inset bg-white text-[11px] px-1 text-right outline-none"
        style={{ width, height: 18 }}
        value={value}
        step={step}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
      />
      <div className="flex flex-col ml-[1px]">
        <button
          className="bevel-raised bg-win-face leading-none"
          style={{ width: 12, height: 9, fontSize: 8 }}
          onClick={() => onChange(clamp(value + step))}
        >▲</button>
        <button
          className="bevel-raised bg-win-face leading-none"
          style={{ width: 12, height: 9, fontSize: 8 }}
          onClick={() => onChange(clamp(value - step))}
        >▼</button>
      </div>
    </div>
  );
};

/** R3-style push button. */
export const R3Button = ({ children, onClick, className = '', width, active = false }: {
  children: ReactNode; onClick?: () => void; className?: string; width?: number; active?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`${active ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[11px] text-win-text px-2 hover:brightness-105 active:bevel-inset ${className}`}
    style={{ height: 20, width, minWidth: 60 }}
  >
    {children}
  </button>
);

/** R3 label + control row. */
export const Row = ({ label, children, labelWidth = 90 }: { label?: string; children: ReactNode; labelWidth?: number }) => (
  <div className="flex items-center gap-1 py-[2px]">
    {label && <span className="text-[11px] text-win-text" style={{ width: labelWidth }}>{label}</span>}
    <div className="flex items-center gap-1">{children}</div>
  </div>
);
