/**
 * WaltCad — Sidebar parameters panel.
 *
 * Renders the R3-style rollouts for the currently active WaltCad tool,
 * plus the persistent Layer Manager and Snap Modes rollouts. Emits
 * `waltcad:op` events with the current tool parameters when the user
 * clicks "Apply".
 */
import { useCadStore, type CadTool, type SnapMode, type MirrorAxis, type ArrayMode, type HatchPattern } from './cadStore';

const Rollout = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bevel-raised">
    <div className="bg-win-face-shadow/40 text-[11px] font-semibold px-2 py-[2px] text-win-text border-b border-win-shadow">
      {title}
    </div>
    <div className="p-1 space-y-1">{children}</div>
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-1 text-[11px] text-win-text">
    <span className="w-[70px] truncate">{label}</span>
    <div className="flex-1">{children}</div>
  </div>
);

const Num = ({ value, onChange, step = 0.01 }: { value: number; onChange: (v: number) => void; step?: number }) => (
  <input
    type="number"
    step={step}
    value={value}
    onFocus={(e) => e.currentTarget.select()}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full h-[18px] px-1 text-[11px] bevel-sunken bg-win-face text-win-text"
  />
);

const emit = (op: string, extra: any = {}) => {
  window.dispatchEvent(new CustomEvent('waltcad:op', { detail: { op, ...extra } }));
};

export function WaltCadPanel() {
  const s = useCadStore();

  return (
    <div className="space-y-1">
      <Rollout title="WaltCad — Active Tool">
        <div className="text-[11px] text-win-text px-1">
          {s.activeTool ? <span className="font-semibold">{s.activeTool.toUpperCase()}</span> : 'None — pick a tool from Create → Geometry → WaltCad'}
        </div>
      </Rollout>

      {/* -------- Layers ---------------------------------------------------- */}
      <Rollout title="Layers">
        <select
          value={s.currentLayerId}
          onChange={(e) => s.setCurrentLayer(e.target.value)}
          className="w-full h-[22px] text-[11px] bevel-sunken bg-win-face px-1 text-win-text"
        >
          {s.layers.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <div className="max-h-[120px] overflow-auto bevel-sunken bg-win-face p-1 space-y-[1px]">
          {s.layers.map((l) => (
            <div key={l.id} className="flex items-center gap-1 text-[10px] text-win-text">
              <button
                className="w-[10px] h-[10px] border border-win-shadow"
                style={{ background: l.color }}
                onClick={() => {
                  const c = prompt('Layer color (#rrggbb)', l.color);
                  if (c) s.updateLayer(l.id, { color: c });
                }}
              />
              <input type="checkbox" checked={l.visible} onChange={(e) => s.updateLayer(l.id, { visible: e.target.checked })} title="Visible" />
              <input type="checkbox" checked={l.locked}  onChange={(e) => s.updateLayer(l.id, { locked: e.target.checked })}  title="Locked" />
              <span className="flex-1 truncate">{l.name}</span>
              <button className="px-1 hover:brightness-110" onClick={() => s.removeLayer(l.id)} title="Delete">✕</button>
            </div>
          ))}
        </div>
        <button
          className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text"
          onClick={() => { const n = prompt('Layer name'); if (n) s.addLayer(n); }}
        >
          + New Layer
        </button>
      </Rollout>

      {/* -------- Snap modes ----------------------------------------------- */}
      <Rollout title="Object Snap">
        <div className="grid grid-cols-2 gap-[1px] text-[10px]">
          {(['endpoint','midpoint','center','intersection','perpendicular','tangent','quadrant','nearest','grid','vertex'] as SnapMode[]).map((m) => (
            <label key={m} className="flex items-center gap-1 text-win-text">
              <input type="checkbox" checked={s.snap[m]} onChange={() => s.toggleSnap(m)} />
              {m}
            </label>
          ))}
        </div>
        <Row label="Grid"><Num value={s.gridSize} step={0.01} onChange={(v) => s.set({ gridSize: v })} /></Row>
        <label className="flex items-center gap-1 text-[10px] text-win-text">
          <input type="checkbox" checked={s.orthoMode} onChange={(e) => s.set({ orthoMode: e.target.checked })} /> Ortho
        </label>
        <label className="flex items-center gap-1 text-[10px] text-win-text">
          <input type="checkbox" checked={s.smartGuides} onChange={(e) => s.set({ smartGuides: e.target.checked })} /> Smart Guides
        </label>
      </Rollout>

      {/* -------- Offset --------------------------------------------------- */}
      <Rollout title="Offset">
        <Row label="Distance"><Num value={s.offsetDistance} step={0.01} onChange={(v) => s.set({ offsetDistance: v })} /></Row>
        <Row label="Copies"><Num value={s.offsetMultiple} step={1} onChange={(v) => s.set({ offsetMultiple: Math.max(1, v) })} /></Row>
        <label className="flex items-center gap-1 text-[10px] text-win-text">
          <input type="checkbox" checked={s.offsetBothSides} onChange={(e) => s.set({ offsetBothSides: e.target.checked })} /> Both Sides
        </label>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('offset')}>Apply Offset</button>
      </Rollout>

      {/* -------- Fillet / Chamfer ---------------------------------------- */}
      <Rollout title="Fillet / Chamfer">
        <Row label="Fillet R"><Num value={s.filletRadius} onChange={(v) => s.set({ filletRadius: v })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('fillet')}>Apply Fillet</button>
        <Row label="Chamfer A"><Num value={s.chamferA} onChange={(v) => s.set({ chamferA: v })} /></Row>
        <Row label="Chamfer B"><Num value={s.chamferB} onChange={(v) => s.set({ chamferB: v })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('chamfer')}>Apply Chamfer</button>
      </Rollout>

      {/* -------- Mirror --------------------------------------------------- */}
      <Rollout title="Mirror">
        <Row label="Axis">
          <select
            value={s.mirrorAxis}
            onChange={(e) => s.set({ mirrorAxis: e.target.value as MirrorAxis })}
            className="w-full h-[18px] text-[11px] bevel-sunken bg-win-face px-1 text-win-text"
          >
            <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
          </select>
        </Row>
        <label className="flex items-center gap-1 text-[10px] text-win-text">
          <input type="checkbox" checked={s.mirrorCopy} onChange={(e) => s.set({ mirrorCopy: e.target.checked })} /> Keep Copy
        </label>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('mirror')}>Apply Mirror</button>
      </Rollout>

      {/* -------- Array ---------------------------------------------------- */}
      <Rollout title="Array">
        <Row label="Mode">
          <select
            value={s.arrayMode}
            onChange={(e) => s.set({ arrayMode: e.target.value as ArrayMode })}
            className="w-full h-[18px] text-[11px] bevel-sunken bg-win-face px-1 text-win-text"
          >
            <option value="linear">Linear</option><option value="radial">Radial</option>
          </select>
        </Row>
        <Row label="Count"><Num value={s.arrayCount} step={1} onChange={(v) => s.set({ arrayCount: Math.max(1, v) })} /></Row>
        {s.arrayMode === 'linear' ? (
          <>
            <Row label="dX"><Num value={s.arrayDX} onChange={(v) => s.set({ arrayDX: v })} /></Row>
            <Row label="dY"><Num value={s.arrayDY} onChange={(v) => s.set({ arrayDY: v })} /></Row>
            <Row label="dZ"><Num value={s.arrayDZ} onChange={(v) => s.set({ arrayDZ: v })} /></Row>
          </>
        ) : (
          <Row label="Sweep°"><Num value={s.arrayCenterSweep} step={1} onChange={(v) => s.set({ arrayCenterSweep: v })} /></Row>
        )}
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('array')}>Apply Array</button>
      </Rollout>

      {/* -------- Divide / Measure ---------------------------------------- */}
      <Rollout title="Divide / Measure">
        <Row label="Divisions"><Num value={s.divideCount} step={1} onChange={(v) => s.set({ divideCount: Math.max(1, v) })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('divide')}>Apply Divide</button>
        <Row label="Spacing"><Num value={s.measureSpacing} onChange={(v) => s.set({ measureSpacing: v })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('measure')}>Apply Measure</button>
      </Rollout>

      {/* -------- Break / Explode / Join ---------------------------------- */}
      <Rollout title="Break / Explode / Join">
        <Row label="Break t"><Num value={s.breakPointT} step={0.01} onChange={(v) => s.set({ breakPointT: v })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('break')}>Apply Break</button>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('explode')}>Explode Segments</button>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('join')}>Join (2 selected)</button>
      </Rollout>

      {/* -------- Hatch ---------------------------------------------------- */}
      <Rollout title="Hatch">
        <Row label="Pattern">
          <select
            value={s.hatchPattern}
            onChange={(e) => s.set({ hatchPattern: e.target.value as HatchPattern })}
            className="w-full h-[18px] text-[11px] bevel-sunken bg-win-face px-1 text-win-text"
          >
            {['concrete','brick','wood','grass','earth','steel','tile','lines','grid'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Row>
        <Row label="Spacing"><Num value={s.hatchSpacing} onChange={(v) => s.set({ hatchSpacing: v })} /></Row>
        <Row label="Angle°"><Num value={s.hatchAngle} step={1} onChange={(v) => s.set({ hatchAngle: v })} /></Row>
        <Row label="Color">
          <input type="color" value={s.hatchColor} onChange={(e) => s.set({ hatchColor: e.target.value })}
            className="w-full h-[18px] bevel-sunken bg-win-face" />
        </Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('hatch')}>Apply Hatch</button>
      </Rollout>

      {/* -------- Dimension ------------------------------------------------ */}
      <Rollout title="Dimension">
        <Row label="Precision"><Num value={s.dimensionPrecision} step={1} onChange={(v) => s.set({ dimensionPrecision: Math.max(0, v) })} /></Row>
        <Row label="Text H"><Num value={s.dimensionTextHeight} onChange={(v) => s.set({ dimensionTextHeight: v })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('dimension')}>Create Dimension</button>
      </Rollout>

      {/* -------- Generate 3D --------------------------------------------- */}
      <Rollout title="Generate 3D">
        <Row label="Wall H"><Num value={s.wallHeight} onChange={(v) => s.set({ wallHeight: v })} /></Row>
        <Row label="Wall Th"><Num value={s.wallThickness} onChange={(v) => s.set({ wallThickness: v })} /></Row>
        <button className="w-full h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text" onClick={() => emit('generate_wall')}>Walls from Spline</button>
      </Rollout>
    </div>
  );
}
