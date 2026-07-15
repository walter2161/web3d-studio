import { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CaddyWrapper, CaddySpec, buildCaddy } from './editable/CaddyPanel';
import { toast } from 'sonner';

/**
 * ModifierControls — 3ds Max Modify panel style
 *
 * All rollouts use win9x bevel tokens (bevel-raised, bevel-sunken, bevel-inset,
 * bevel-group) so the modifier UI matches the rest of the app. No shadcn Cards
 * are used here on purpose: 3ds Max panels are flat, bevelled and dense.
 */

interface ModifierControlsProps {
  modifier: any;
  objectId?: string;
  onUpdateModifier: (params: any) => void;
  onRemoveModifier: () => void;
}


// ------- Building blocks (win9x style) -------

const Rollout = ({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bevel-group bg-win-face-2/60 mb-[3px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-[16px] flex items-center gap-[4px] px-[3px] text-[11px] font-semibold text-win-text bevel-raised"
      >
        <span className="w-[10px] text-center text-[9px]">{open ? '−' : '+'}</span>
        <span className="flex-1 text-center tracking-tight">{title}</span>
        <span className="w-[10px]" />
      </button>
      {open && <div className="px-[4px] py-[4px]">{children}</div>}
    </div>
  );
};

const Group = ({ title, children }: { title?: string; children: ReactNode }) => (
  <fieldset className="bevel-group px-[4px] pb-[4px] pt-[2px] mb-[3px] bg-transparent">
    {title && (
      <legend className="text-[10px] px-[3px] text-win-text">{title}</legend>
    )}
    {children}
  </fieldset>
);

const BtnRow = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-[3px] mb-[3px]">{children}</div>
);

const BtnCol3 = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-3 gap-[3px] mb-[3px]">{children}</div>
);

const WinBtn = ({
  children,
  onClick,
  active,
  title,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <button
    type="button"
    disabled={disabled}
    title={title}
    onClick={onClick}
    className={cn(
      'h-[19px] px-[4px] text-[11px] text-win-text truncate flex items-center justify-center leading-none',
      active ? 'bevel-sunken bg-win-highlight/25' : 'bevel-raised hover:brightness-105',
      disabled && 'opacity-50 cursor-not-allowed',
      className,
    )}
  >
    {children}
  </button>
);

const NumField = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) => (
  <label className="flex items-center gap-[4px] text-[11px] text-win-text mb-[2px]">
    {label && <span className="min-w-[54px]">{label}</span>}
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-[18px] bevel-sunken bg-white text-[11px] px-[3px] outline-none"
    />
  </label>
);

const SliderRow = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}) => (
  <div className="flex items-center gap-[4px] mb-[2px]">
    <span className="min-w-[54px] text-[11px] text-win-text">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-[14px]"
    />
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-[52px] h-[18px] bevel-sunken bg-white text-[11px] px-[3px] outline-none text-right"
    />
    {unit && <span className="text-[10px] text-win-text w-[8px]">{unit}</span>}
  </div>
);

const CheckRow = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-center gap-[4px] text-[11px] text-win-text mb-[2px] cursor-pointer">
    <input
      type="checkbox"
      className="w-[12px] h-[12px]"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span>{label}</span>
  </label>
);

const SelectRow = ({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) => (
  <label className="flex items-center gap-[4px] text-[11px] text-win-text mb-[2px]">
    {label && <span className="min-w-[54px]">{label}</span>}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 h-[18px] bevel-sunken bg-white text-[11px] px-[2px] outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  </label>
);

// ------- Modifier-specific rollouts -------

export const ModifierControls = ({ modifier, objectId, onUpdateModifier, onRemoveModifier }: ModifierControlsProps) => {
  const params = modifier.params || {};
  const set = (patch: any) => onUpdateModifier({ ...params, ...patch });
  const updateParam = (k: string, v: any) => set({ [k]: v });
  const [caddy, setCaddy] = useState<CaddySpec | null>(null);
  const dispatchOp = (kind: string, opParams?: any) => {
    if (!objectId) return;
    window.dispatchEvent(new CustomEvent('r3-subobj-op', {
      detail: { objectId, modifierId: modifier.id, op: { kind, params: opParams } },
    }));
  };
  const clearSelection = () => set({ selectedIds: [] });
  const clearOps = () => set({ ops: [] });
  const selCount = (params.selectedIds ?? []).length;


  const renderBend = () => (
    <Rollout title="Parameters">
      <Group title="Bend">
        <SliderRow label="Angle" value={params.angle ?? 0} min={-360} max={360} step={1} unit="°" onChange={(v) => updateParam('angle', v)} />
        <SliderRow label="Direction" value={params.direction ?? 0} min={-360} max={360} step={1} unit="°" onChange={(v) => updateParam('direction', v)} />
      </Group>
      <Group title="Bend Axis">
        <div className="flex gap-[3px]">
          {(['X', 'Y', 'Z'] as const).map((ax) => (
            <WinBtn key={ax} active={(params.bendAxis || 'Z') === ax} onClick={() => updateParam('bendAxis', ax)} className="flex-1">{ax}</WinBtn>
          ))}
        </div>
      </Group>
      <Group title="Limits">
        <CheckRow label="Limit Effect" checked={!!params.limits} onChange={(v) => updateParam('limits', v)} />
        <NumField label="Upper Limit" value={params.upperLimit ?? 0} step={0.01} onChange={(v) => updateParam('upperLimit', v)} />
        <NumField label="Lower Limit" value={params.lowerLimit ?? 0} step={0.01} onChange={(v) => updateParam('lowerLimit', v)} />
      </Group>
    </Rollout>
  );

  const renderTwist = () => (
    <Rollout title="Parameters">
      <Group title="Twist">
        <SliderRow label="Angle" value={params.angle ?? 0} min={-720} max={720} step={1} unit="°" onChange={(v) => updateParam('angle', v)} />
        <SliderRow label="Bias" value={params.bias ?? 0} min={-1} max={1} step={0.01} onChange={(v) => updateParam('bias', v)} />
      </Group>
      <Group title="Twist Axis">
        <div className="flex gap-[3px]">
          {(['X', 'Y', 'Z'] as const).map((ax) => (
            <WinBtn key={ax} active={(params.twistAxis || 'Z') === ax} onClick={() => updateParam('twistAxis', ax)} className="flex-1">{ax}</WinBtn>
          ))}
        </div>
      </Group>
    </Rollout>
  );

  const renderTaper = () => (
    <Rollout title="Parameters">
      <Group title="Taper">
        <SliderRow label="Amount" value={params.amount ?? 0} min={-10} max={10} step={0.01} onChange={(v) => updateParam('amount', v)} />
        <SliderRow label="Curve" value={params.curve ?? 0} min={-10} max={10} step={0.01} onChange={(v) => updateParam('curve', v)} />
      </Group>
      <Group title="Taper Axis">
        <SelectRow label="Primary" value={params.primaryAxis || 'Z'} options={['X', 'Y', 'Z']} onChange={(v) => updateParam('primaryAxis', v)} />
        <SelectRow label="Effect" value={params.effectAxis || 'XY'} options={['X', 'Y', 'XY']} onChange={(v) => updateParam('effectAxis', v)} />
      </Group>
    </Rollout>
  );

  const renderNoise = () => (
    <Rollout title="Parameters">
      <Group title="Noise">
        <NumField label="Seed" value={params.seed ?? 1} step={1} onChange={(v) => updateParam('seed', Math.floor(v))} />
        <NumField label="Scale" value={params.scale ?? 1} step={0.1} onChange={(v) => updateParam('scale', v)} />
        <CheckRow label="Fractal" checked={!!params.fractal} onChange={(v) => updateParam('fractal', v)} />
      </Group>
      <Group title="Strength">
        <NumField label="X" value={params.strengthX ?? 0} step={0.1} onChange={(v) => updateParam('strengthX', v)} />
        <NumField label="Y" value={params.strengthY ?? 0} step={0.1} onChange={(v) => updateParam('strengthY', v)} />
        <NumField label="Z" value={params.strengthZ ?? 0} step={0.1} onChange={(v) => updateParam('strengthZ', v)} />
      </Group>
    </Rollout>
  );

  const renderTurboSmooth = () => (
    <Rollout title="TurboSmooth">
      <Group title="Main">
        <NumField label="Iterations" value={params.iterations ?? 1} min={0} max={4} step={1} onChange={(v) => updateParam('iterations', Math.floor(v))} />
        <NumField label="Render It." value={params.renderIterations ?? 2} min={0} max={6} step={1} onChange={(v) => updateParam('renderIterations', Math.floor(v))} />
        <CheckRow label="Isoline Display" checked={!!params.isolineDisplay} onChange={(v) => updateParam('isolineDisplay', v)} />
      </Group>
    </Rollout>
  );

  const renderSymmetry = () => (
    <Rollout title="Parameters">
      <Group title="Mirror Axis">
        <div className="flex gap-[3px]">
          {(['X', 'Y', 'Z'] as const).map((ax) => (
            <WinBtn key={ax} active={(params.mirrorAxis || 'X') === ax} onClick={() => updateParam('mirrorAxis', ax)} className="flex-1">{ax}</WinBtn>
          ))}
        </div>
      </Group>
      <Group>
        <CheckRow label="Weld Seam" checked={params.weldSeam !== false} onChange={(v) => updateParam('weldSeam', v)} />
        <NumField label="Threshold" value={params.threshold ?? 0.1} step={0.001} onChange={(v) => updateParam('threshold', v)} />
      </Group>
    </Rollout>
  );

  const renderExtrude = () => (
    <Rollout title="Parameters">
      <Group>
        <NumField label="Amount" value={params.amount ?? 1} step={0.01} onChange={(v) => updateParam('amount', v)} />
        <NumField label="Segments" value={params.segments ?? 1} min={1} max={64} step={1} onChange={(v) => updateParam('segments', Math.max(1, Math.floor(v)))} />
      </Group>
      <Group title="Capping">
        <CheckRow label="Cap Start" checked={params.capStart !== false} onChange={(v) => updateParam('capStart', v)} />
        <CheckRow label="Cap End" checked={params.capEnd !== false} onChange={(v) => updateParam('capEnd', v)} />
      </Group>
    </Rollout>
  );

  // ---- Edit Poly / Edit Mesh — full 3ds Max Modify layout ----

  const renderEditPoly = (isMesh: boolean) => {
    const levels = isMesh
      ? [
          { key: 'vertex', icon: '·', label: 'Vertex' },
          { key: 'edge', icon: '/', label: 'Edge' },
          { key: 'face', icon: '△', label: 'Face' },
          { key: 'polygon', icon: '▰', label: 'Polygon' },
          { key: 'element', icon: '◈', label: 'Element' },
        ]
      : [
          { key: 'vertex', icon: '·', label: 'Vertex' },
          { key: 'edge', icon: '/', label: 'Edge' },
          { key: 'border', icon: '◌', label: 'Border' },
          { key: 'face', icon: '△', label: 'Face' },
          { key: 'polygon', icon: '▰', label: 'Polygon' },
          { key: 'element', icon: '◈', label: 'Element' },
        ];
    const activeLevel = (params.selectionLevel || 'vertex').toLowerCase();
    const stub = () => { /* Sub-object editing runs from the viewport; UI stubs surface parity for now. */ };

    return (
      <>
        <Rollout title={isMesh ? 'Edit Mesh Mode' : 'Edit Poly Mode'}>
          <div className="grid grid-cols-2 gap-[3px]">
            <WinBtn active title="Model" onClick={stub}>Model</WinBtn>
            <WinBtn title="Animate" onClick={stub}>Animate</WinBtn>
          </div>
        </Rollout>

        <Rollout title="Selection">
          <div className={cn('grid gap-[3px] mb-[4px]', isMesh ? 'grid-cols-5' : 'grid-cols-6')}>
            {levels.map((l) => (
              <WinBtn
                key={l.key}
                active={activeLevel === l.key}
                onClick={() => set({ selectionLevel: l.key, selectedIds: [] })}
                title={l.label}
                className="text-[13px]"
              >
                <span className="inline-block leading-none">{l.icon}</span>
              </WinBtn>
            ))}
          </div>
          <CheckRow label="Use Stack Selection" checked={!!params.useStackSelection} onChange={(v) => updateParam('useStackSelection', v)} />
          <CheckRow label="By Vertex" checked={!!params.byVertex} onChange={(v) => updateParam('byVertex', v)} />
          <CheckRow label="Ignore Backfacing" checked={!!params.ignoreBackfacing} onChange={(v) => updateParam('ignoreBackfacing', v)} />
          <div className="flex items-center gap-[4px] mb-[2px]">
            <input
              type="checkbox"
              className="w-[12px] h-[12px]"
              checked={!!params.byAngle}
              onChange={(e) => updateParam('byAngle', e.target.checked)}
            />
            <span className="text-[11px] text-win-text">By Angle:</span>
            <input
              type="number"
              value={params.byAngleValue ?? 45}
              step={0.1}
              onChange={(e) => updateParam('byAngleValue', parseFloat(e.target.value))}
              className="w-[54px] h-[18px] bevel-sunken bg-white text-[11px] px-[3px] outline-none text-right"
            />
          </div>
          <BtnRow>
            <WinBtn onClick={() => dispatchOp('shrink')}>Shrink</WinBtn>
            <WinBtn onClick={() => dispatchOp('grow')}>Grow</WinBtn>
            <WinBtn onClick={() => dispatchOp('ring')}>Ring</WinBtn>
            <WinBtn onClick={() => dispatchOp('loop')}>Loop</WinBtn>
          </BtnRow>
          <WinBtn onClick={clearSelection} className="w-full">Clear Selection</WinBtn>
          <Group title="Preview Selection">
            <div className="grid grid-cols-3 gap-[3px]">
              <WinBtn active={params.previewSelection === 'off' || !params.previewSelection} onClick={() => updateParam('previewSelection', 'off')}>Off</WinBtn>
              <WinBtn active={params.previewSelection === 'subobj'} onClick={() => updateParam('previewSelection', 'subobj')}>SubObj</WinBtn>
              <WinBtn active={params.previewSelection === 'multi'} onClick={() => updateParam('previewSelection', 'multi')}>Multi</WinBtn>
            </div>
          </Group>
          <div className="text-[11px] text-win-text mt-[2px]">
            {selCount} {levels.find((l) => l.key === activeLevel)?.label}(s) selected
          </div>
        </Rollout>

        <Rollout title="Transform Selection" defaultOpen>
          <div className="text-[10px] text-win-text mb-[3px]">Move Delta (applied to current selection):</div>
          <div className="grid grid-cols-3 gap-[3px] mb-[3px]">
            <NumField label="X" value={params.moveX ?? 0} step={0.05} onChange={(v) => updateParam('moveX', v)} />
            <NumField label="Y" value={params.moveY ?? 0} step={0.05} onChange={(v) => updateParam('moveY', v)} />
            <NumField label="Z" value={params.moveZ ?? 0} step={0.05} onChange={(v) => updateParam('moveZ', v)} />
          </div>
          <WinBtn
            className="w-full mb-[3px]"
            onClick={() => {
              dispatchOp('move', { delta: [params.moveX ?? 0, params.moveY ?? 0, params.moveZ ?? 0] });
              set({ moveX: 0, moveY: 0, moveZ: 0 });
            }}
          >Apply Move</WinBtn>
          <BtnRow>
            <WinBtn onClick={clearOps}>Reset All Ops</WinBtn>
            <WinBtn onClick={() => {
              const ops = Array.isArray(params.ops) ? params.ops : [];
              set({ ops: ops.slice(0, -1) });
            }}>Undo Last Op</WinBtn>
          </BtnRow>
          <div className="text-[10px] text-win-text mt-[2px]">Ops recorded: {(params.ops ?? []).length}</div>
        </Rollout>


        <Rollout title="Soft Selection" defaultOpen={false}>
          <CheckRow label="Use Soft Selection" checked={!!params.softSelection} onChange={(v) => updateParam('softSelection', v)} />
          <NumField label="Falloff" value={params.softFalloff ?? 20} step={0.1} onChange={(v) => updateParam('softFalloff', v)} />
          <NumField label="Pinch" value={params.softPinch ?? 0} step={0.01} onChange={(v) => updateParam('softPinch', v)} />
          <NumField label="Bubble" value={params.softBubble ?? 0} step={0.01} onChange={(v) => updateParam('softBubble', v)} />
        </Rollout>

        <ContextualEditTools
          level={activeLevel}
          onOp={dispatchOp}
          openCaddy={(kind) => setCaddy(buildCaddy(kind, { dispatch: dispatchOp, toast: (m) => toast(m) }))}
        />

        <Rollout title="Edit Geometry" defaultOpen={false}>
          <WinBtn onClick={() => toast('Repeat Last: coming next phase')} className="w-full mb-[3px]">Repeat Last</WinBtn>
          <Group title="Constraints">
            <div className="grid grid-cols-2 gap-[3px]">
              <WinBtn active={params.constraint === 'none' || !params.constraint} onClick={() => updateParam('constraint', 'none')}>None</WinBtn>
              <WinBtn active={params.constraint === 'edge'} onClick={() => updateParam('constraint', 'edge')}>Edge</WinBtn>
              <WinBtn active={params.constraint === 'face'} onClick={() => updateParam('constraint', 'face')}>Face</WinBtn>
              <WinBtn active={params.constraint === 'normal'} onClick={() => updateParam('constraint', 'normal')}>Normal</WinBtn>
            </div>
          </Group>
          <CheckRow label="Preserve UVs" checked={!!params.preserveUVs} onChange={(v) => updateParam('preserveUVs', v)} />
          <BtnRow>
            <WinBtn onClick={() => dispatchOp('hide')}>Hide Sel.</WinBtn>
            <WinBtn onClick={() => dispatchOp('unhide')}>Unhide All</WinBtn>
            <WinBtn onClick={() => dispatchOp('hideUnselected')}>Hide Unsel.</WinBtn>
            <WinBtn onClick={() => setCaddy(buildCaddy('makePlanar', { dispatch: dispatchOp, toast: (m) => toast(m) }))}>Make Planar</WinBtn>
          </BtnRow>
          <CheckRow label="Delete Isolated Vertices" checked={!!params.deleteIsolated} onChange={(v) => updateParam('deleteIsolated', v)} />
        </Rollout>

        <Rollout title="Polygon: Material IDs" defaultOpen={false}>
          <NumField label="Set ID" value={params.setId ?? 1} step={1} min={1} onChange={(v) => updateParam('setId', Math.max(1, Math.floor(v)))} />
          <WinBtn onClick={() => dispatchOp('setMaterialId', { id: params.setId ?? 1 })} className="w-full mb-[2px]">Apply Material ID</WinBtn>
        </Rollout>

      </>
    );
  };

  const renderDefault = () => (
    <Rollout title="Parameters">
      <div className="text-[11px] text-win-text">
        Controls for <strong>{modifier.type}</strong> in development.
      </div>
    </Rollout>
  );

  const body = (() => {
    switch (modifier.type) {
      case 'Bend': return renderBend();
      case 'Twist': return renderTwist();
      case 'Taper': return renderTaper();
      case 'Noise': return renderNoise();
      case 'TurboSmooth': return renderTurboSmooth();
      case 'Symmetry': return renderSymmetry();
      case 'Extrude': return renderExtrude();
      case 'Edit Poly': return renderEditPoly(false);
      case 'Edit Mesh': return renderEditPoly(true);
      default: return renderDefault();
    }
  })();

  return (
    <div className="mt-[3px]">
      {body}
      <CaddyWrapper spec={caddy} onClose={() => setCaddy(null)} />
    </div>
  );
};

// ---- Contextual toolset per sub-object level (matches 3ds Max tool matrix) ----

interface CtxProps {
  level: string;
  onOp: (kind: string, params?: any) => void;
  openCaddy: (kind: string) => void;
}

const CtxRollout = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bevel-group bg-win-face-2/60 mb-[3px]">
    <div className="w-full h-[16px] flex items-center px-[3px] text-[11px] font-semibold text-win-text bevel-raised">
      <span className="flex-1 text-center tracking-tight">{title}</span>
    </div>
    <div className="px-[4px] py-[4px]">{children}</div>
  </div>
);

const CtxBtn = ({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      'h-[19px] px-[4px] text-[11px] text-win-text truncate flex items-center justify-center leading-none',
      'bevel-raised hover:brightness-105',
    )}
  >{children}</button>
);

const ContextualEditTools = ({ level, onOp, openCaddy }: CtxProps) => {
  // Tool availability matrix (from 3ds Max Edit Poly reference).
  // A tool renders only in levels where it is enabled.
  const grid = (items: { label: string; onClick: () => void; title?: string }[]) => (
    <div className="grid grid-cols-2 gap-[3px] mb-[3px]">
      {items.map((it) => (
        <CtxBtn key={it.label} onClick={it.onClick} title={it.title}>{it.label}</CtxBtn>
      ))}
    </div>
  );

  const notYet = (name: string) => () => toast(`${name}: coming in next phase`);

  if (level === 'vertex') {
    return (
      <CtxRollout title="Edit Vertices">
        {grid([
          { label: 'Weld', onClick: () => openCaddy('weld') },
          { label: 'Target Weld', onClick: notYet('Target Weld') },
          { label: 'Chamfer', onClick: () => openCaddy('chamferVertex') },
          { label: 'Remove', onClick: () => onOp('delete') },
          { label: 'Break', onClick: notYet('Break') },
          { label: 'Connect', onClick: notYet('Connect Verts') },
        ])}
        <div className="grid grid-cols-2 gap-[3px] mb-[3px]">
          <CtxBtn onClick={() => onOp('hide')}>Hide</CtxBtn>
          <CtxBtn onClick={() => onOp('unhide')}>Unhide All</CtxBtn>
        </div>
      </CtxRollout>
    );
  }

  if (level === 'edge') {
    return (
      <CtxRollout title="Edit Edges">
        {grid([
          { label: 'Insert Vertex', onClick: notYet('Insert Vertex') },
          { label: 'Remove', onClick: notYet('Remove Edge') },
          { label: 'Split', onClick: notYet('Split Edge') },
          { label: 'Extrude', onClick: () => openCaddy('extrudeEdge') },
          { label: 'Weld', onClick: () => openCaddy('weld') },
          { label: 'Chamfer', onClick: () => openCaddy('chamferEdge') },
          { label: 'Bridge', onClick: () => openCaddy('bridge') },
          { label: 'Connect', onClick: () => openCaddy('connect') },
          { label: 'Create Shape', onClick: notYet('Create Shape From Selection') },
        ])}
      </CtxRollout>
    );
  }

  if (level === 'border') {
    return (
      <CtxRollout title="Edit Borders">
        {grid([
          { label: 'Extrude', onClick: () => openCaddy('extrudeBorder') },
          { label: 'Chamfer', onClick: () => openCaddy('chamferEdge') },
          { label: 'Cap', onClick: () => onOp('cap') },
          { label: 'Bridge', onClick: () => openCaddy('bridge') },
          { label: 'Connect', onClick: () => openCaddy('connect') },
          { label: 'Create Shape', onClick: notYet('Create Shape From Selection') },
        ])}
      </CtxRollout>
    );
  }

  if (level === 'face' || level === 'polygon') {
    return (
      <>
        <CtxRollout title="Edit Polygons">
          {grid([
            { label: 'Extrude', onClick: () => openCaddy('extrude') },
            { label: 'Outline', onClick: () => openCaddy('outline') },
            { label: 'Bevel', onClick: () => openCaddy('bevel') },
            { label: 'Inset', onClick: () => openCaddy('inset') },
            { label: 'Bridge', onClick: () => openCaddy('bridge') },
            { label: 'Flip', onClick: () => onOp('flip') },
            { label: 'Hinge From Edge', onClick: () => openCaddy('hinge') },
            { label: 'Extr. Along Spline', onClick: notYet('Extrude Along Spline') },
            { label: 'Retriangulate', onClick: notYet('Retriangulate') },
            { label: 'Edit Triangulation', onClick: notYet('Edit Triangulation') },
          ])}
        </CtxRollout>
        <CtxRollout title="Polygon Geometry">
          {grid([
            { label: 'Tessellate', onClick: () => openCaddy('tessellate') },
            { label: 'MSmooth', onClick: notYet('MSmooth') },
            { label: 'Cut', onClick: notYet('Cut') },
            { label: 'QuickSlice', onClick: notYet('QuickSlice') },
            { label: 'Slice Plane', onClick: notYet('Slice Plane') },
            { label: 'Make Planar', onClick: () => openCaddy('makePlanar') },
            { label: 'Relax', onClick: () => openCaddy('relax') },
            { label: 'Detach', onClick: notYet('Detach') },
            { label: 'Attach', onClick: notYet('Attach') },
            { label: 'Delete', onClick: () => onOp('delete') },
          ])}
        </CtxRollout>
      </>
    );
  }

  if (level === 'element') {
    return (
      <CtxRollout title="Edit Elements">
        {grid([
          { label: 'Attach', onClick: notYet('Attach') },
          { label: 'Detach', onClick: notYet('Detach') },
          { label: 'Delete', onClick: () => onOp('delete') },
          { label: 'Flip', onClick: () => onOp('flip') },
          { label: 'Hide', onClick: () => onOp('hide') },
          { label: 'Unhide All', onClick: () => onOp('unhide') },
        ])}
      </CtxRollout>
    );
  }

  return null;
};
