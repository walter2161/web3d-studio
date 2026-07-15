import { useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * CaddyPanel — floating parametric panel matching 3ds Max's "Caddy" UI.
 * Opens next to the Modify panel when the user clicks a parametric operation
 * (Extrude, Bevel, Inset, ...). The user tweaks parameters, sees a preview
 * (op is dispatched on every param change with `previewKey` so Undo squashes
 * to a single record), then commits with Apply or cancels with X.
 */

export interface CaddyField {
  key: string;
  label: string;
  type?: 'number' | 'radio' | 'check';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

export interface CaddySpec {
  title: string;
  fields: CaddyField[];
  onApply: (values: Record<string, any>) => void;
  onCancel?: () => void;
  /** Dispatched whenever a field changes (for live preview). */
  onPreview?: (values: Record<string, any>) => void;
}

export const CaddyPanel = ({ spec, onClose }: { spec: CaddySpec; onClose: () => void }) => {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    spec.fields.forEach((f) => { init[f.key] = f.value; });
    return init;
  });

  useEffect(() => { spec.onPreview?.(values); /* eslint-disable-next-line */ }, [values]);

  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <div
      className="fixed z-[9998] bevel-raised bg-win-face p-[4px] shadow-[2px_2px_0_rgba(0,0,0,0.4)]"
      style={{ right: 340, top: 120, width: 220 }}
    >
      <div className="flex items-center justify-between h-[16px] bevel-sunken bg-win-highlight/40 px-[3px] mb-[4px]">
        <span className="text-[11px] font-semibold text-win-text truncate">{spec.title}</span>
        <button
          type="button"
          className="w-[14px] h-[14px] text-[11px] bevel-raised leading-none"
          onClick={() => { spec.onCancel?.(); onClose(); }}
          title="Cancel"
        >×</button>
      </div>

      {spec.fields.map((f) => (
        <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
      ))}

      <div className="grid grid-cols-2 gap-[3px] mt-[4px]">
        <button
          type="button"
          className="h-[19px] bevel-raised text-[11px]"
          onClick={() => { spec.onCancel?.(); onClose(); }}
        >Cancel</button>
        <button
          type="button"
          className="h-[19px] bevel-raised text-[11px] bg-win-highlight/20"
          onClick={() => { spec.onApply(values); onClose(); }}
        >Apply</button>
      </div>
    </div>
  );
};

const FieldRow = ({ field, value, onChange }: { field: CaddyField; value: any; onChange: (v: any) => void }) => {
  if (field.type === 'radio' && field.options) {
    return (
      <div className="mb-[3px]">
        <div className="text-[11px] text-win-text mb-[2px]">{field.label}:</div>
        <div className="flex flex-col gap-[1px] pl-[4px]">
          {field.options.map((o) => (
            <label key={o.value} className="flex items-center gap-[4px] text-[11px] text-win-text cursor-pointer">
              <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} className="w-[11px] h-[11px]" />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === 'check') {
    return (
      <label className="flex items-center gap-[4px] text-[11px] text-win-text mb-[2px] cursor-pointer">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-[12px] h-[12px]" />
        <span>{field.label}</span>
      </label>
    );
  }
  return (
    <label className="flex items-center gap-[4px] text-[11px] text-win-text mb-[2px]">
      <span className="min-w-[70px]">{field.label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={field.min}
        max={field.max}
        step={field.step ?? 0.01}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-[18px] bevel-sunken bg-white text-[11px] px-[3px] outline-none text-right"
      />
    </label>
  );
};

/** Convenience builders for each 3ds Max tool. */
export const buildCaddy = (
  kind: string,
  ctx: { dispatch: (opKind: string, params?: any) => void; toast: (msg: string) => void },
): CaddySpec | null => {
  const d = ctx.dispatch;
  switch (kind) {
    case 'extrude':
      return {
        title: 'Extrude',
        fields: [
          { key: 'amount', label: 'Height', value: 0.2, step: 0.05 },
          { key: 'type', label: 'Extrusion Type', type: 'radio', value: 'local',
            options: [
              { label: 'Group', value: 'group' },
              { label: 'Local Normal', value: 'local' },
              { label: 'By Polygon', value: 'byPolygon' },
            ] },
        ],
        onApply: (v) => d('extrude', { amount: v.amount, type: v.type }),
      };
    case 'bevel':
      return {
        title: 'Bevel',
        fields: [
          { key: 'height', label: 'Height', value: 0.2, step: 0.05 },
          { key: 'outline', label: 'Outline', value: -0.05, step: 0.01 },
          { key: 'type', label: 'Type', type: 'radio', value: 'local',
            options: [
              { label: 'Group', value: 'group' },
              { label: 'Local Normal', value: 'local' },
              { label: 'By Polygon', value: 'byPolygon' },
            ] },
        ],
        onApply: (v) => d('bevel', v),
      };
    case 'inset':
      return {
        title: 'Inset',
        fields: [
          { key: 'amount', label: 'Amount', value: 0.1, step: 0.01 },
          { key: 'byPolygon', label: 'By Polygon', type: 'check', value: true },
        ],
        onApply: (v) => d('inset', v),
      };
    case 'outline':
      return {
        title: 'Outline',
        fields: [{ key: 'amount', label: 'Amount', value: 0.05, step: 0.01 }],
        onApply: (v) => d('outline', v),
      };
    case 'weld':
      return {
        title: 'Weld',
        fields: [{ key: 'threshold', label: 'Threshold', value: 0.01, step: 0.001 }],
        onApply: (v) => d('weld', { threshold: v.threshold }),
      };
    case 'connect':
      return {
        title: 'Connect Edges',
        fields: [
          { key: 'segments', label: 'Segments', value: 1, min: 1, max: 32, step: 1 },
          { key: 'pinch', label: 'Pinch', value: 0, step: 0.01 },
          { key: 'slide', label: 'Slide', value: 0, step: 0.01 },
        ],
        onApply: () => ctx.toast('Connect: coming in next phase'),
      };
    case 'chamferVertex':
      return {
        title: 'Chamfer Vertex',
        fields: [
          { key: 'amount', label: 'Amount', value: 0.05, step: 0.01 },
          { key: 'open', label: 'Open', type: 'check', value: false },
        ],
        onApply: () => ctx.toast('Chamfer Vertex: coming in next phase'),
      };
    case 'chamferEdge':
      return {
        title: 'Chamfer Edge',
        fields: [
          { key: 'amount', label: 'Amount', value: 0.05, step: 0.01 },
          { key: 'segments', label: 'Segments', value: 1, min: 1, max: 16, step: 1 },
          { key: 'open', label: 'Open', type: 'check', value: false },
        ],
        onApply: () => ctx.toast('Chamfer Edge: coming in next phase'),
      };
    case 'extrudeEdge':
    case 'extrudeBorder':
      return {
        title: 'Extrude',
        fields: [
          { key: 'height', label: 'Height', value: 0.2, step: 0.05 },
          { key: 'width', label: 'Width', value: 0, step: 0.01 },
        ],
        onApply: () => ctx.toast('Extrude Edge/Border: coming in next phase'),
      };
    case 'bridge':
      return {
        title: 'Bridge',
        fields: [
          { key: 'segments', label: 'Segments', value: 1, min: 1, max: 32, step: 1 },
          { key: 'taper', label: 'Taper', value: 0, step: 0.01 },
          { key: 'bias', label: 'Bias', value: 0, step: 0.01 },
          { key: 'twist', label: 'Twist', value: 0, step: 1 },
        ],
        onApply: () => ctx.toast('Bridge: coming in next phase'),
      };
    case 'hinge':
      return {
        title: 'Hinge From Edge',
        fields: [
          { key: 'angle', label: 'Angle', value: 45, step: 1 },
          { key: 'segments', label: 'Segments', value: 1, min: 1, max: 32, step: 1 },
        ],
        onApply: () => ctx.toast('Hinge From Edge: pick edge in next phase'),
      };
    case 'relax':
      return {
        title: 'Relax',
        fields: [
          { key: 'amount', label: 'Amount', value: 0.5, min: 0, max: 1, step: 0.05 },
          { key: 'iterations', label: 'Iterations', value: 1, min: 1, max: 20, step: 1 },
          { key: 'keepBoundary', label: 'Keep Boundary', type: 'check', value: true },
        ],
        onApply: (v) => d('relax', v),
      };
    case 'tessellate':
      return {
        title: 'Tessellate',
        fields: [{ key: 'tension', label: 'Tension', value: 0, step: 0.05 }],
        onApply: () => d('tessellate'),
      };
    case 'makePlanar':
      return {
        title: 'Make Planar',
        fields: [
          { key: 'axis', label: 'Axis', type: 'radio', value: 'auto',
            options: [
              { label: 'Auto (Best Fit)', value: 'auto' },
              { label: 'X', value: 'X' },
              { label: 'Y', value: 'Y' },
              { label: 'Z', value: 'Z' },
            ] },
        ],
        onApply: (v) => d('makePlanar', { axis: v.axis }),
      };
    default:
      return null;
  }
};

export const CaddyWrapper = ({ spec, onClose }: { spec: CaddySpec | null; onClose: () => void }) => {
  if (!spec) return null;
  return <CaddyPanel spec={spec} onClose={onClose} />;
};
