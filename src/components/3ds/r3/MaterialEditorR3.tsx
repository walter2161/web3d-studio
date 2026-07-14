import { useState, useEffect } from 'react';
import { R3Dialog, R3Button, GroupBox, Row, Spinner } from './R3Dialog';

/**
 * Material Editor R3 — 24 sample slots + material tree + maps browser.
 * Slots live in localStorage so they survive HMR/refresh, matching R3 workflow.
 */

export interface R3Material {
  name: string;
  type: 'Standard' | 'Blend' | 'Composite' | 'Double Sided' | 'Multi/Sub-Object' | 'Raytrace' | 'Matte/Shadow' | 'Top/Bottom' | 'Shellac';
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  specular: number;
  glossiness: number;
  // Maps
  diffuseMap?: string;
  bumpMap?: string;
  bumpAmount?: number;
  reflectMap?: string;
  reflectAmount?: number;
}

const DEFAULT_MATERIAL: R3Material = {
  name: '01 - Default',
  type: 'Standard',
  color: '#c8c8c8',
  metalness: 0,
  roughness: 0.5,
  opacity: 1,
  emissive: '#000000',
  emissiveIntensity: 0,
  specular: 0.5,
  glossiness: 0.5,
};

const SLOT_COUNT = 24;
const STORAGE = '3dsled-mateditor-slots-v1';

function loadSlots(): R3Material[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === SLOT_COUNT) return arr;
    }
  } catch {}
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({
    ...DEFAULT_MATERIAL,
    name: `${String(i + 1).padStart(2, '0')} - Default`,
  }));
}

function saveSlots(slots: R3Material[]) {
  try { localStorage.setItem(STORAGE, JSON.stringify(slots)); } catch {}
}

const MATERIAL_LIBRARY: Partial<R3Material>[] = [
  { name: 'Metal - Chrome',    color: '#c9d0d5', metalness: 1, roughness: 0.05 },
  { name: 'Metal - Brushed',   color: '#a8a8ac', metalness: 0.9, roughness: 0.4 },
  { name: 'Gold',              color: '#ffd54a', metalness: 1, roughness: 0.2 },
  { name: 'Copper',            color: '#b87333', metalness: 1, roughness: 0.25 },
  { name: 'Plastic - Red',     color: '#e53935', metalness: 0, roughness: 0.6 },
  { name: 'Plastic - Blue',    color: '#1976d2', metalness: 0, roughness: 0.6 },
  { name: 'Rubber',            color: '#1a1a1a', metalness: 0, roughness: 0.95 },
  { name: 'Glass - Clear',     color: '#c8ecff', metalness: 0, roughness: 0, opacity: 0.35 },
  { name: 'Glass - Tinted',    color: '#4a90a4', metalness: 0, roughness: 0, opacity: 0.5 },
  { name: 'Wood - Oak',        color: '#a0724b', metalness: 0, roughness: 0.85 },
  { name: 'Wood - Walnut',     color: '#5c3d24', metalness: 0, roughness: 0.9 },
  { name: 'Concrete',          color: '#8a8a86', metalness: 0, roughness: 1 },
  { name: 'Brick',             color: '#8b3a1f', metalness: 0, roughness: 0.9 },
  { name: 'Marble',            color: '#eeece5', metalness: 0.1, roughness: 0.2 },
  { name: 'Leather',           color: '#3d2418', metalness: 0, roughness: 0.75 },
  { name: 'Fabric',            color: '#a4b8c8', metalness: 0, roughness: 0.95 },
  { name: 'Ceramic - White',   color: '#f5f5f0', metalness: 0.05, roughness: 0.3 },
  { name: 'Skin',              color: '#e4b28a', metalness: 0, roughness: 0.6 },
  { name: 'Water',             color: '#4a9ec9', metalness: 0, roughness: 0.05, opacity: 0.6 },
  { name: 'Ice',               color: '#c8e8ff', metalness: 0, roughness: 0.1, opacity: 0.7 },
  { name: 'Emissive - Neon',   color: '#00ffaa', emissive: '#00ffaa', emissiveIntensity: 2, metalness: 0, roughness: 0.5 },
  { name: 'Grass',             color: '#4a7a2c', metalness: 0, roughness: 1 },
  { name: 'Asphalt',           color: '#2a2a2a', metalness: 0, roughness: 0.95 },
  { name: 'Aluminum',          color: '#dcdcdc', metalness: 1, roughness: 0.35 },
];

function SamplePreview({ mat, size = 60 }: { mat: R3Material; size?: number }) {
  // CSS sphere approximation with radial gradient + highlight tuned by metalness/roughness.
  const specHardness = Math.max(4, 40 - mat.roughness * 36);
  const specSize = Math.max(6, 22 - mat.roughness * 18);
  return (
    <div
      className="rounded-full relative"
      style={{
        width: size,
        height: size,
        opacity: mat.opacity,
        background: `radial-gradient(circle at 30% 28%, #ffffff ${specSize * 0.15}%, ${mat.color} ${specHardness}%, #000 130%)`,
        boxShadow: mat.emissiveIntensity > 0 ? `0 0 ${8 + mat.emissiveIntensity * 8}px ${mat.emissive}` : 'inset -6px -8px 12px rgba(0,0,0,.35)',
      }}
    />
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedObject: any;
  onMaterialChange: (objectId: string, material: any) => void;
}

export const MaterialEditorR3 = ({ open, onOpenChange, selectedObject, onMaterialChange }: Props) => {
  const [slots, setSlots] = useState<R3Material[]>(loadSlots);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<'Basic' | 'Maps' | 'Advanced'>('Basic');

  useEffect(() => { if (open) setSlots(loadSlots()); }, [open]);
  useEffect(() => { saveSlots(slots); }, [slots]);

  const mat = slots[active];
  const update = (patch: Partial<R3Material>) => {
    setSlots((prev) => prev.map((m, i) => (i === active ? { ...m, ...patch } : m)));
  };

  const assignToSelection = () => {
    if (!selectedObject) return;
    onMaterialChange(selectedObject.id, {
      color: mat.color, metalness: mat.metalness, roughness: mat.roughness,
      opacity: mat.opacity, emissive: mat.emissive, emissiveIntensity: mat.emissiveIntensity,
    });
  };

  const getFromScene = () => {
    if (!selectedObject) return;
    update({
      color: selectedObject.color || mat.color,
      ...(selectedObject.material || {}),
    });
  };

  const resetSlot = () => update({ ...DEFAULT_MATERIAL, name: `${String(active + 1).padStart(2, '0')} - Default` });

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Material Editor" width={720}>
      <div className="flex gap-2">
        {/* Left: 24 slots grid (4 x 6) */}
        <div className="bevel-inset bg-win-face p-1" style={{ width: 268 }}>
          <div className="grid grid-cols-4 gap-1">
            {slots.map((m, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`p-1 flex items-center justify-center ${i === active ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'}`}
                title={m.name}
              >
                <SamplePreview mat={m} size={54} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <R3Button width={90} onClick={getFromScene}>Get from Sel</R3Button>
            <R3Button width={90} onClick={assignToSelection}>Assign to Sel</R3Button>
            <R3Button width={80} onClick={resetSlot}>Reset</R3Button>
          </div>
        </div>

        {/* Right: parameter rollouts */}
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            <input
              value={mat.name}
              onChange={(e) => update({ name: e.target.value })}
              className="flex-1 bevel-inset bg-white px-1 h-[20px] text-[11px]"
            />
            <select
              value={mat.type}
              onChange={(e) => update({ type: e.target.value as any })}
              className="bevel-inset bg-white h-[20px] text-[11px]"
            >
              {['Standard','Blend','Composite','Double Sided','Multi/Sub-Object','Raytrace','Matte/Shadow','Top/Bottom','Shellac'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-[2px] mb-1">
            {(['Basic', 'Maps', 'Advanced'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2 py-[2px] text-[11px] ${tab === t ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'}`}>{t}</button>
            ))}
          </div>

          <div className="bevel-inset bg-win-face p-2" style={{ minHeight: 260 }}>
            {tab === 'Basic' && (
              <>
                <GroupBox title="Blinn Basic Parameters">
                  <Row label="Diffuse:" labelWidth={90}>
                    <input type="color" value={mat.color} onChange={(e) => update({ color: e.target.value })} className="w-[40px] h-[18px]" />
                    <input value={mat.color} onChange={(e) => update({ color: e.target.value })} className="bevel-inset bg-white h-[18px] text-[11px] px-1 ml-1 w-[80px]" />
                  </Row>
                  <Row label="Ambient:" labelWidth={90}>
                    <input type="color" defaultValue="#4a4a4a" className="w-[40px] h-[18px]" />
                  </Row>
                  <Row label="Specular:" labelWidth={90}>
                    <Spinner value={Math.round(mat.specular * 100)} onChange={(v) => update({ specular: v / 100 })} step={1} min={0} max={100} />
                  </Row>
                  <Row label="Glossiness:" labelWidth={90}>
                    <Spinner value={Math.round(mat.glossiness * 100)} onChange={(v) => update({ glossiness: v / 100 })} step={1} min={0} max={100} />
                  </Row>
                  <Row label="Metalness:" labelWidth={90}>
                    <Spinner value={Math.round(mat.metalness * 100)} onChange={(v) => update({ metalness: v / 100 })} step={1} min={0} max={100} />
                  </Row>
                  <Row label="Roughness:" labelWidth={90}>
                    <Spinner value={Math.round(mat.roughness * 100)} onChange={(v) => update({ roughness: v / 100 })} step={1} min={0} max={100} />
                  </Row>
                  <Row label="Opacity:" labelWidth={90}>
                    <Spinner value={Math.round(mat.opacity * 100)} onChange={(v) => update({ opacity: v / 100 })} step={1} min={0} max={100} />
                  </Row>
                </GroupBox>
                <GroupBox title="Self-Illumination">
                  <Row label="Color:" labelWidth={90}>
                    <input type="color" value={mat.emissive} onChange={(e) => update({ emissive: e.target.value })} className="w-[40px] h-[18px]" />
                  </Row>
                  <Row label="Intensity:" labelWidth={90}>
                    <Spinner value={mat.emissiveIntensity} onChange={(v) => update({ emissiveIntensity: v })} step={0.1} min={0} max={10} />
                  </Row>
                </GroupBox>
              </>
            )}

            {tab === 'Maps' && (
              <GroupBox title="Maps">
                {(['Diffuse', 'Bump', 'Specular', 'Glossiness', 'Self-Illumination', 'Opacity', 'Reflection', 'Refraction'] as const).map((slot) => (
                  <Row key={slot} label={`${slot}:`} labelWidth={130}>
                    <button className="bevel-raised bg-win-face h-[18px] px-2 text-[11px] flex-1 text-left">None</button>
                    <span className="ml-1 text-[11px]">100%</span>
                  </Row>
                ))}
              </GroupBox>
            )}

            {tab === 'Advanced' && (
              <>
                <GroupBox title="Extended Parameters">
                  <div className="text-[11px] text-win-text-disabled">Advanced: Falloff, Index of Refraction, Wire, Faceted, 2-Sided — coming next sprint.</div>
                </GroupBox>
                <GroupBox title="Dynamics Properties">
                  <Row label="Bounce Coefficient:" labelWidth={140}><Spinner value={1} onChange={() => {}} step={0.1} min={0} max={2} /></Row>
                  <Row label="Static Friction:" labelWidth={140}><Spinner value={0.3} onChange={() => {}} step={0.01} min={0} max={1} /></Row>
                  <Row label="Sliding Friction:" labelWidth={140}><Spinner value={0.3} onChange={() => {}} step={0.01} min={0} max={1} /></Row>
                </GroupBox>
              </>
            )}
          </div>
        </div>

        {/* Far right: preset library */}
        <div className="bevel-inset bg-win-face p-1" style={{ width: 150 }}>
          <div className="text-[11px] font-bold px-1 mb-1">Material Library</div>
          <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
            {MATERIAL_LIBRARY.map((preset, i) => (
              <button
                key={i}
                onClick={() => update({ ...preset } as any)}
                className="w-full flex items-center gap-1 px-1 py-[2px] hover:bg-win-highlight hover:text-white text-[11px] text-left"
              >
                <span className="w-3 h-3 border border-black inline-block" style={{ background: preset.color }} />
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={() => onOpenChange(false)}>Close</R3Button>
      </div>
    </R3Dialog>
  );
};
