import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { R3Dialog, R3Button, GroupBox, Row, Spinner } from './R3Dialog';

/**
 * Material Editor R3 — faithful clone of the 3ds Max R3 (1999) Material Editor.
 *
 *   Sample Slots (24)  |  Vertical Toolbar  |  Material Name + Type
 *                                             Shader Basic Parameters
 *                                             Extended Parameters
 *                                             Maps (with amount spinners)
 *                                             Dynamics Properties
 *
 * Slots persist in localStorage. Two-way "Get from Selection" / "Assign to Selection"
 * mirror the classic workflow.
 */

export type ShaderType =
  | 'Blinn'
  | 'Phong'
  | 'Metal'
  | 'Anisotropic'
  | 'Multi-Layer'
  | 'Oren-Nayar-Blinn'
  | 'Strauss'
  | 'Constant';

export interface R3MapCoords {
  mappingChannel: number;
  offsetU: number; offsetV: number;
  tilingU: number; tilingV: number;
  angleU: number; angleV: number; angleW: number;
  mirrorU: boolean; mirrorV: boolean;
  tileU: boolean; tileV: boolean;
  blur: number; blurOffset: number;
}
export interface R3MapOutput {
  outputAmount: number; // 0..2
  rgbOffset: number;    // -1..1
  rgbLevel: number;     // 0..4
  invert: boolean;
  clamp: boolean;
  bumpAmount: number;   // used for bump only
}
export interface R3MapParams {
  // Bitmap
  filename: string;
  monoChannel: 'RGB Intensity' | 'Alpha';
  rgbChannel: 'RGB' | 'Alpha as Gray';
  alphaSource: 'Image Alpha' | 'RGB Intensity' | 'None';
  // Procedural common
  color1: string; color2: string; color3: string;
  size: number;
  // Noise
  noiseType: 'Regular' | 'Fractal' | 'Turbulence';
  levels: number; phase: number; low: number; high: number;
  // Checker soften
  soften: number;
  // Marble
  veinWidth: number; turbulence: number;
  // Falloff
  falloffType: 'Perpendicular / Parallel' | 'Towards / Away' | 'Fresnel' | 'Shadow/Light' | 'Distance Blend';
  // Mix
  mixAmount: number;
  coords: R3MapCoords;
  output: R3MapOutput;
}
export interface R3MapSlot {
  enabled: boolean;
  amount: number; // 0-100
  name: string;   // 'None' or map type
  params?: R3MapParams;
}

const defaultCoords = (): R3MapCoords => ({
  mappingChannel: 1,
  offsetU: 0, offsetV: 0,
  tilingU: 1, tilingV: 1,
  angleU: 0, angleV: 0, angleW: 0,
  mirrorU: false, mirrorV: false,
  tileU: true, tileV: true,
  blur: 1, blurOffset: 0,
});
const defaultOutput = (): R3MapOutput => ({
  outputAmount: 1, rgbOffset: 0, rgbLevel: 1, invert: false, clamp: false, bumpAmount: 30,
});
const defaultMapParams = (): R3MapParams => ({
  filename: '',
  monoChannel: 'RGB Intensity',
  rgbChannel: 'RGB',
  alphaSource: 'Image Alpha',
  color1: '#000000', color2: '#ffffff', color3: '#808080',
  size: 25,
  noiseType: 'Regular',
  levels: 3, phase: 0, low: 0, high: 1,
  soften: 0,
  veinWidth: 0.025, turbulence: 1,
  falloffType: 'Perpendicular / Parallel',
  mixAmount: 0.5,
  coords: defaultCoords(),
  output: defaultOutput(),
});

export interface R3Material {
  name: string;
  type: 'Standard' | 'Blend' | 'Composite' | 'Double Sided' | 'Multi/Sub-Object' | 'Raytrace' | 'Matte/Shadow' | 'Top/Bottom' | 'Shellac' | 'Morpher';
  shader: ShaderType;
  // Colors
  ambient: string;
  diffuse: string;
  specular: string;
  filter: string;
  ambientLocked: boolean; // R3 "lock ambient to diffuse"
  // Blinn/Phong
  specularLevel: number; // 0-100
  glossiness: number;    // 0-100
  softenHighlight: number; // 0-100
  // Common
  selfIllumination: number; // 0-100
  opacity: number;          // 0-100
  // Flags
  wire: boolean;
  twoSided: boolean;
  faceMap: boolean;
  faceted: boolean;
  // Wire settings
  wireSize: number;
  // PBR bridge (used when applying to three material)
  metalness: number;
  roughness: number;
  emissiveIntensity: number;
  // Maps
  maps: {
    ambient: R3MapSlot;
    diffuse: R3MapSlot;
    specular: R3MapSlot;
    specLevel: R3MapSlot;
    glossiness: R3MapSlot;
    selfIllum: R3MapSlot;
    opacity: R3MapSlot;
    filter: R3MapSlot;
    bump: R3MapSlot;
    reflection: R3MapSlot;
    refraction: R3MapSlot;
    displacement: R3MapSlot;
  };
}

const emptyMap = (): R3MapSlot => ({ enabled: true, amount: 100, name: 'None' });
const bumpMap = (): R3MapSlot => ({ enabled: true, amount: 30, name: 'None' });

const DEFAULT_MATERIAL: R3Material = {
  name: '01 - Default',
  type: 'Standard',
  shader: 'Blinn',
  ambient: '#4a4a4a',
  diffuse: '#c8c8c8',
  specular: '#ffffff',
  filter: '#000000',
  ambientLocked: true,
  specularLevel: 0,
  glossiness: 10,
  softenHighlight: 10,
  selfIllumination: 0,
  opacity: 100,
  wire: false,
  twoSided: false,
  faceMap: false,
  faceted: false,
  wireSize: 1,
  metalness: 0,
  roughness: 0.5,
  emissiveIntensity: 0,
  maps: {
    ambient: emptyMap(),
    diffuse: emptyMap(),
    specular: emptyMap(),
    specLevel: emptyMap(),
    glossiness: emptyMap(),
    selfIllum: emptyMap(),
    opacity: emptyMap(),
    filter: emptyMap(),
    bump: bumpMap(),
    reflection: emptyMap(),
    refraction: emptyMap(),
    displacement: { ...emptyMap(), amount: 20 },
  },
};

const SLOT_COUNT = 24;
const STORAGE = '3dsled-mateditor-slots-v2';

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
    maps: JSON.parse(JSON.stringify(DEFAULT_MATERIAL.maps)),
  }));
}

function saveSlots(slots: R3Material[]) {
  try { localStorage.setItem(STORAGE, JSON.stringify(slots)); } catch {}
}

const MATERIAL_LIBRARY: Array<{ name: string; patch: Partial<R3Material> }> = [
  { name: 'Metal - Chrome',   patch: { shader: 'Metal', diffuse: '#c9d0d5', specular: '#ffffff', glossiness: 85, specularLevel: 90, metalness: 1, roughness: 0.05 } },
  { name: 'Metal - Brushed',  patch: { shader: 'Anisotropic', diffuse: '#a8a8ac', glossiness: 40, specularLevel: 60, metalness: 0.9, roughness: 0.4 } },
  { name: 'Gold',             patch: { shader: 'Metal', diffuse: '#ffd54a', specular: '#fff2b0', glossiness: 75, specularLevel: 80, metalness: 1, roughness: 0.2 } },
  { name: 'Copper',           patch: { shader: 'Metal', diffuse: '#b87333', glossiness: 65, specularLevel: 75, metalness: 1, roughness: 0.25 } },
  { name: 'Plastic - Red',    patch: { shader: 'Blinn', diffuse: '#e53935', glossiness: 30, specularLevel: 40, roughness: 0.6 } },
  { name: 'Plastic - Blue',   patch: { shader: 'Blinn', diffuse: '#1976d2', glossiness: 30, specularLevel: 40, roughness: 0.6 } },
  { name: 'Rubber',           patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#1a1a1a', glossiness: 5, specularLevel: 5, roughness: 0.95 } },
  { name: 'Glass - Clear',    patch: { shader: 'Blinn', diffuse: '#c8ecff', opacity: 35, glossiness: 90, specularLevel: 90, roughness: 0 } },
  { name: 'Glass - Tinted',   patch: { shader: 'Blinn', diffuse: '#4a90a4', opacity: 50, glossiness: 90, specularLevel: 90, roughness: 0 } },
  { name: 'Wood - Oak',       patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#a0724b', glossiness: 15, specularLevel: 15, roughness: 0.85 } },
  { name: 'Wood - Walnut',    patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#5c3d24', glossiness: 15, specularLevel: 15, roughness: 0.9 } },
  { name: 'Concrete',         patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#8a8a86', glossiness: 5, specularLevel: 5, roughness: 1 } },
  { name: 'Brick',            patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#8b3a1f', glossiness: 5, specularLevel: 5, roughness: 0.9 } },
  { name: 'Marble',           patch: { shader: 'Blinn', diffuse: '#eeece5', glossiness: 60, specularLevel: 40, metalness: 0.1, roughness: 0.2 } },
  { name: 'Leather',          patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#3d2418', glossiness: 20, specularLevel: 20, roughness: 0.75 } },
  { name: 'Fabric',           patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#a4b8c8', glossiness: 5, specularLevel: 5, roughness: 0.95 } },
  { name: 'Ceramic - White',  patch: { shader: 'Blinn', diffuse: '#f5f5f0', glossiness: 70, specularLevel: 60, metalness: 0.05, roughness: 0.3 } },
  { name: 'Skin',             patch: { shader: 'Blinn', diffuse: '#e4b28a', glossiness: 20, specularLevel: 20, roughness: 0.6 } },
  { name: 'Water',            patch: { shader: 'Blinn', diffuse: '#4a9ec9', opacity: 60, glossiness: 95, specularLevel: 95, roughness: 0.05 } },
  { name: 'Ice',              patch: { shader: 'Blinn', diffuse: '#c8e8ff', opacity: 70, glossiness: 90, specularLevel: 80, roughness: 0.1 } },
  { name: 'Emissive - Neon',  patch: { shader: 'Constant', diffuse: '#00ffaa', selfIllumination: 100, emissiveIntensity: 2 } },
  { name: 'Grass',            patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#4a7a2c', glossiness: 0, specularLevel: 0, roughness: 1 } },
  { name: 'Asphalt',          patch: { shader: 'Oren-Nayar-Blinn', diffuse: '#2a2a2a', glossiness: 5, specularLevel: 5, roughness: 0.95 } },
  { name: 'Aluminum',         patch: { shader: 'Metal', diffuse: '#dcdcdc', glossiness: 45, specularLevel: 55, metalness: 1, roughness: 0.35 } },
];

type PreviewShape = 'sphere' | 'cylinder' | 'cube';

function SamplePreview({ mat, size = 60, shape = 'sphere' }: { mat: R3Material; size?: number; shape?: PreviewShape }) {
  const gloss = mat.glossiness / 100;
  const spec = mat.specularLevel / 100;
  const specSize = Math.max(4, 22 - gloss * 18);
  const specHardness = Math.max(4, 40 - gloss * 36);
  const opacity = mat.opacity / 100;
  const selfIll = mat.selfIllumination / 100;
  const highlight = `rgba(255,255,255,${0.3 + spec * 0.7})`;
  const bg = `radial-gradient(circle at 30% 28%, ${highlight} ${specSize * 0.15}%, ${mat.diffuse} ${specHardness}%, #000 130%)`;
  const shadow = selfIll > 0
    ? `0 0 ${8 + selfIll * 14}px ${mat.diffuse}`
    : 'inset -6px -8px 12px rgba(0,0,0,.35)';
  if (shape === 'cube') {
    return <div style={{ width: size, height: size, background: bg, opacity, boxShadow: shadow, transform: 'perspective(80px) rotateX(-18deg) rotateY(24deg)' }} />;
  }
  if (shape === 'cylinder') {
    return <div style={{ width: size * 0.7, height: size, background: bg, opacity, boxShadow: shadow, borderRadius: `${size * 0.25}px / ${size * 0.08}px`, margin: '0 auto' }} />;
  }
  return <div className="rounded-full" style={{ width: size, height: size, background: bg, opacity, boxShadow: shadow }} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedObject: any;
  onMaterialChange: (objectId: string, material: any) => void;
}

type Tab = 'Shader' | 'Extended' | 'Maps' | 'Dynamics';

export const MaterialEditorR3 = ({ open, onOpenChange, selectedObject, onMaterialChange }: Props) => {
  const [slots, setSlots] = useState<R3Material[]>(loadSlots);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<Tab>('Shader');
  const [previewShape, setPreviewShape] = useState<PreviewShape>('sphere');
  const [pickMode, setPickMode] = useState(false);
  const [mapBrowserOpen, setMapBrowserOpen] = useState<null | keyof R3Material['maps']>(null);
  const [mapParamsOpen, setMapParamsOpen] = useState<null | keyof R3Material['maps']>(null);

  useEffect(() => { if (open) setSlots(loadSlots()); }, [open]);
  useEffect(() => { saveSlots(slots); }, [slots]);

  const mat = slots[active];
  const update = (patch: Partial<R3Material>) => {
    setSlots((prev) => prev.map((m, i) => (i === active ? { ...m, ...patch, ...(patch.diffuse && m.ambientLocked ? { ambient: patch.diffuse } : {}) } : m)));
  };
  const updateMap = (key: keyof R3Material['maps'], patch: Partial<R3MapSlot>) => {
    setSlots((prev) => prev.map((m, i) => i === active ? { ...m, maps: { ...m.maps, [key]: { ...m.maps[key], ...patch } } } : m));
  };
  const updateMapParams = (key: keyof R3Material['maps'], patch: Partial<R3MapParams>) => {
    setSlots((prev) => prev.map((m, i) => {
      if (i !== active) return m;
      const slot = m.maps[key];
      const params = { ...(slot.params || defaultMapParams()), ...patch };
      return { ...m, maps: { ...m.maps, [key]: { ...slot, params } } };
    }));
  };
  const openMapSlot = (key: keyof R3Material['maps']) => {
    const slot = mat.maps[key];
    if (slot.name === 'None') setMapBrowserOpen(key);
    else setMapParamsOpen(key);
  };

  const matToThree = (m: R3Material) => ({
    color: m.diffuse,
    metalness: m.metalness,
    roughness: m.roughness,
    opacity: m.opacity / 100,
    emissive: m.diffuse,
    emissiveIntensity: m.selfIllumination > 0 ? (m.selfIllumination / 100) * (m.emissiveIntensity || 1) : 0,
  });

  const assignToSelection = () => {
    if (!selectedObject) {
      toast.error('Select an object first');
      return;
    }
    onMaterialChange(selectedObject.id, matToThree(mat));
  };

  // HTML5 drag: when a slot starts being dragged, stash the three material payload
  // on window so Object3D's onPointerUp can read it while raycasting the viewport.
  const beginSlotDrag = (i: number, e: React.DragEvent) => {
    const payload = matToThree(slots[i]);
    (window as any).__matDragPayload = payload;
    try {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-r3-material', JSON.stringify(payload));
    } catch {}
  };
  const endSlotDrag = () => {
    // Clear shortly after so Object3D onPointerUp still sees it.
    setTimeout(() => { (window as any).__matDragPayload = null; }, 250);
  };

  const getFromScene = () => {
    if (!selectedObject) return;
    update({ diffuse: selectedObject.color || mat.diffuse });
  };

  const resetSlot = () => {
    setSlots((prev) => prev.map((m, i) => i === active ? {
      ...DEFAULT_MATERIAL,
      name: `${String(active + 1).padStart(2, '0')} - Default`,
      maps: JSON.parse(JSON.stringify(DEFAULT_MATERIAL.maps)),
    } : m));
  };

  const SHADERS: ShaderType[] = ['Anisotropic', 'Blinn', 'Metal', 'Multi-Layer', 'Oren-Nayar-Blinn', 'Phong', 'Strauss', 'Constant'];

  const mapEntries = useMemo(() => ([
    ['ambient', 'Ambient Color'],
    ['diffuse', 'Diffuse Color'],
    ['specular', 'Specular Color'],
    ['specLevel', 'Specular Level'],
    ['glossiness', 'Glossiness'],
    ['selfIllum', 'Self-Illumination'],
    ['opacity', 'Opacity'],
    ['filter', 'Filter Color'],
    ['bump', 'Bump'],
    ['reflection', 'Reflection'],
    ['refraction', 'Refraction'],
    ['displacement', 'Displacement'],
  ] as const), []);

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Material Editor" width={880}>
      <div className="flex gap-1">
        {/* LEFT: 24 sample slots + preview shape picker */}
        <div className="bevel-inset bg-win-face p-1" style={{ width: 280 }}>
          <div className="grid grid-cols-4 gap-[2px]">
            {slots.map((m, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                onDoubleClick={() => { setActive(i); if (selectedObject) onMaterialChange(selectedObject.id, matToThree(m)); }}
                draggable
                onDragStart={(e) => { setActive(i); beginSlotDrag(i, e); }}
                onDragEnd={endSlotDrag}
                title={`${m.name} — drag onto an object to apply, or double-click to assign to selection`}
                className={`p-[2px] flex items-center justify-center cursor-grab active:cursor-grabbing ${i === active ? 'bevel-inset' : 'bevel-raised'} bg-black`}
                style={{ aspectRatio: '1', background: i === active ? '#000' : '#111' }}
              >
                <SamplePreview mat={m} size={54} shape={previewShape} />
              </button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-[2px]">
            <span className="text-[10px] text-win-text mr-1">Preview:</span>
            {(['sphere', 'cylinder', 'cube'] as PreviewShape[]).map((s) => (
              <button
                key={s}
                onClick={() => setPreviewShape(s)}
                className={`${previewShape === s ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[10px] px-1`}
                style={{ height: 18 }}
              >{s === 'sphere' ? '●' : s === 'cylinder' ? '▮' : '◼'}</button>
            ))}
          </div>
        </div>

        {/* MIDDLE: vertical R3-style toolbar strip */}
        <div className="bevel-inset bg-win-face flex flex-col gap-[2px] p-[2px]" style={{ width: 22 }}>
          {[
            { l: 'Get from Sel', s: '⇦', fn: getFromScene },
            { l: 'Assign to Sel', s: '⇨', fn: assignToSelection },
            { l: 'Reset', s: '↺', fn: resetSlot },
            { l: 'Make Copy', s: '❐', fn: () => { const copy = { ...mat, name: mat.name + ' (copy)' }; setSlots((prev) => prev.map((m, i) => i === active ? copy : m)); } },
            { l: 'Pick from Object', s: '👁', fn: () => setPickMode((v) => !v), active: pickMode },
            { l: 'Put to Library', s: '☰', fn: () => {} },
            { l: 'Show Map in Viewport', s: '⎔', fn: () => {} },
            { l: 'Options', s: '⚙', fn: () => {} },
          ].map((b, i) => (
            <button
              key={i}
              onClick={b.fn}
              title={b.l}
              className={`${(b as any).active ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[11px] leading-none`}
              style={{ width: 18, height: 18 }}
            >{b.s}</button>
          ))}
        </div>

        {/* RIGHT: parameter rollouts */}
        <div className="flex-1" style={{ minWidth: 380 }}>
          {/* Material name + type */}
          <div className="flex items-center gap-1 mb-1">
            <input
              value={mat.name}
              onChange={(e) => update({ name: e.target.value })}
              className="flex-1 bevel-inset bg-white px-1 h-[20px] text-[11px]"
            />
            <R3Button width={24}>?</R3Button>
            <select
              value={mat.type}
              onChange={(e) => update({ type: e.target.value as any })}
              className="bevel-inset bg-white h-[20px] text-[11px]"
            >
              {['Standard','Blend','Composite','Double Sided','Multi/Sub-Object','Raytrace','Matte/Shadow','Top/Bottom','Shellac','Morpher'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Tabs */}
          <div className="flex gap-[2px] mb-1">
            {(['Shader', 'Extended', 'Maps', 'Dynamics'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-[2px] text-[11px] ${tab === t ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'}`}
              >{t}</button>
            ))}
          </div>

          <div className="bevel-inset bg-win-face p-2" style={{ minHeight: 340, maxHeight: 440, overflowY: 'auto' }}>
            {tab === 'Shader' && (
              <>
                <GroupBox title="Shader Basic Parameters">
                  <Row label="Shader:" labelWidth={70}>
                    <select
                      value={mat.shader}
                      onChange={(e) => update({ shader: e.target.value as ShaderType })}
                      className="bevel-inset bg-white h-[20px] text-[11px]"
                      style={{ width: 150 }}
                    >
                      {SHADERS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <label className="ml-2 flex items-center gap-1 text-[11px]">
                      <input type="checkbox" checked={mat.wire} onChange={(e) => update({ wire: e.target.checked })} /> Wire
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input type="checkbox" checked={mat.twoSided} onChange={(e) => update({ twoSided: e.target.checked })} /> 2-Sided
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input type="checkbox" checked={mat.faceMap} onChange={(e) => update({ faceMap: e.target.checked })} /> Face Map
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input type="checkbox" checked={mat.faceted} onChange={(e) => update({ faceted: e.target.checked })} /> Faceted
                    </label>
                  </Row>
                </GroupBox>

                <GroupBox title={`${mat.shader} Basic Parameters`}>
                  {/* Ambient / Diffuse / Specular color rows with lock */}
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-[2px]">
                      <Row label="Ambient:" labelWidth={70}>
                        <input
                          type="color"
                          value={mat.ambient}
                          disabled={mat.ambientLocked}
                          onChange={(e) => update({ ambient: e.target.value })}
                          className="w-[36px] h-[16px]"
                        />
                        <button
                          onClick={() => update({ ambientLocked: !mat.ambientLocked })}
                          title={mat.ambientLocked ? 'Unlock ambient from diffuse' : 'Lock ambient to diffuse'}
                          className={`${mat.ambientLocked ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[10px]`}
                          style={{ width: 14, height: 14 }}
                        >🔒</button>
                        <button
                          onClick={() => openMapSlot('ambient')}
                          className={`${mat.maps.ambient.name !== 'None' ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[10px] ml-1`}
                          style={{ width: 14, height: 14 }}
                          title={mat.maps.ambient.name === 'None' ? 'Ambient map (None)' : `Ambient map: ${mat.maps.ambient.name}`}
                        >M</button>
                      </Row>
                      <Row label="Diffuse:" labelWidth={70}>
                        <input type="color" value={mat.diffuse} onChange={(e) => update({ diffuse: e.target.value })} className="w-[36px] h-[16px]" />
                        <button onClick={() => openMapSlot('diffuse')} className={`${mat.maps.diffuse.name !== 'None' ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[10px] ml-1`} style={{ width: 14, height: 14 }} title={mat.maps.diffuse.name === 'None' ? 'Diffuse map (None)' : `Diffuse map: ${mat.maps.diffuse.name}`}>M</button>
                      </Row>
                      <Row label="Specular:" labelWidth={70}>
                        <input type="color" value={mat.specular} onChange={(e) => update({ specular: e.target.value })} className="w-[36px] h-[16px]" />
                        <button onClick={() => openMapSlot('specular')} className={`${mat.maps.specular.name !== 'None' ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[10px] ml-1`} style={{ width: 14, height: 14 }} title={mat.maps.specular.name === 'None' ? 'Specular map (None)' : `Specular map: ${mat.maps.specular.name}`}>M</button>
                      </Row>

                    </div>

                    <div className="flex-1">
                      <Row label="Self-Illum:" labelWidth={80}>
                        <Spinner value={mat.selfIllumination} onChange={(v) => update({ selfIllumination: v })} step={1} min={0} max={100} />
                      </Row>
                      <Row label="Opacity:" labelWidth={80}>
                        <Spinner value={mat.opacity} onChange={(v) => update({ opacity: v })} step={1} min={0} max={100} />
                      </Row>
                    </div>
                  </div>

                  <div className="mt-2 border-t border-win-shadow pt-2">
                    <div className="text-[11px] mb-1 text-win-text">Specular Highlights</div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Row label="Specular Level:" labelWidth={100}>
                          <Spinner value={mat.specularLevel} onChange={(v) => { update({ specularLevel: v, metalness: mat.shader === 'Metal' ? Math.max(mat.metalness, v / 100) : mat.metalness }); }} step={1} min={0} max={100} />
                        </Row>
                        <Row label="Glossiness:" labelWidth={100}>
                          <Spinner value={mat.glossiness} onChange={(v) => update({ glossiness: v, roughness: 1 - v / 100 })} step={1} min={0} max={100} />
                        </Row>
                        <Row label="Soften:" labelWidth={100}>
                          <Spinner value={mat.softenHighlight} onChange={(v) => update({ softenHighlight: v })} step={1} min={0} max={100} />
                        </Row>
                      </div>
                      {/* Fake highlight curve preview */}
                      <div className="bevel-inset bg-black" style={{ width: 140, height: 70, position: 'relative' }}>
                        <svg viewBox="0 0 140 70" width={140} height={70}>
                          <path
                            d={(() => {
                              const g = mat.glossiness / 100;
                              const s = mat.specularLevel / 100;
                              const peak = 20 + (1 - s) * 45;
                              const width = 6 + (1 - g) * 40;
                              const pts: string[] = [];
                              for (let x = 0; x <= 140; x += 4) {
                                const d = (x - 70) / width;
                                const y = peak - (65 - peak) * Math.exp(-d * d);
                                pts.push(`${x === 0 ? 'M' : 'L'}${x},${y.toFixed(1)}`);
                              }
                              return pts.join(' ');
                            })()}
                            stroke="#00ff88"
                            fill="none"
                            strokeWidth={1}
                          />
                          <line x1={0} y1={65} x2={140} y2={65} stroke="#333" />
                          <line x1={70} y1={0} x2={70} y2={70} stroke="#333" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </GroupBox>
              </>
            )}

            {tab === 'Extended' && (
              <>
                <GroupBox title="Advanced Transparency">
                  <Row label="Falloff:" labelWidth={90}>
                    <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="falloff" defaultChecked /> In</label>
                    <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="falloff" /> Out</label>
                    <span className="mx-2 text-[11px]">Amt:</span>
                    <Spinner value={0} onChange={() => {}} step={1} min={0} max={100} />
                  </Row>
                  <Row label="Type:" labelWidth={90}>
                    <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="ttype" defaultChecked /> Filter</label>
                    <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="ttype" /> Subtractive</label>
                    <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="ttype" /> Additive</label>
                  </Row>
                  <Row label="Index of Refraction:" labelWidth={140}>
                    <Spinner value={1.5} onChange={() => {}} step={0.01} min={0.01} max={5} />
                  </Row>
                </GroupBox>
                <GroupBox title="Wire">
                  <Row label="Size:" labelWidth={70}>
                    <Spinner value={mat.wireSize} onChange={(v) => update({ wireSize: v })} step={0.1} min={0} max={20} />
                    <span className="ml-2 text-[11px]">Units:</span>
                    <label className="flex items-center gap-1 text-[11px] ml-1"><input type="radio" name="wu" defaultChecked /> Pixels</label>
                    <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="wu" /> Units</label>
                  </Row>
                </GroupBox>
                <GroupBox title="Reflection Dimming">
                  <Row label="Apply:" labelWidth={70}><input type="checkbox" /></Row>
                  <Row label="Dim Level:" labelWidth={70}><Spinner value={0} onChange={() => {}} step={0.01} min={0} max={1} /></Row>
                  <Row label="Refl. Level:" labelWidth={70}><Spinner value={3} onChange={() => {}} step={0.1} min={0} max={10} /></Row>
                </GroupBox>
              </>
            )}

            {tab === 'Maps' && (
              <GroupBox title="Maps">
                <div className="grid grid-cols-[24px_130px_60px_1fr] gap-x-1 gap-y-[2px] items-center">
                  <div className="text-[11px] font-bold">On</div>
                  <div className="text-[11px] font-bold">Slot</div>
                  <div className="text-[11px] font-bold">Amount</div>
                  <div className="text-[11px] font-bold">Map</div>
                  {mapEntries.map(([key, label]) => {
                    const slot = mat.maps[key];
                    return (
                      <div key={key} className="contents">
                        <div><input type="checkbox" checked={slot.enabled} onChange={(e) => updateMap(key, { enabled: e.target.checked })} /></div>
                        <div className="text-[11px]">{label}</div>
                        <div><Spinner value={slot.amount} onChange={(v) => updateMap(key, { amount: v })} step={1} min={0} max={100} width={44} /></div>
                        <div>
                          <button
                            onClick={() => setMapBrowserOpen(key)}
                            className={`${slot.name !== 'None' ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'} h-[18px] px-2 text-[11px] w-full text-left overflow-hidden text-ellipsis whitespace-nowrap`}
                          >{slot.name === 'None' ? 'None' : `Map #${active + 1} (${slot.name})`}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GroupBox>
            )}

            {tab === 'Dynamics' && (
              <GroupBox title="Dynamics Properties">
                <Row label="Bounce Coefficient:" labelWidth={140}><Spinner value={1} onChange={() => {}} step={0.1} min={0} max={2} /></Row>
                <Row label="Static Friction:" labelWidth={140}><Spinner value={0.3} onChange={() => {}} step={0.01} min={0} max={1} /></Row>
                <Row label="Sliding Friction:" labelWidth={140}><Spinner value={0.3} onChange={() => {}} step={0.01} min={0} max={1} /></Row>
              </GroupBox>
            )}
          </div>
        </div>

        {/* FAR RIGHT: preset library */}
        <div className="bevel-inset bg-win-face p-1" style={{ width: 150 }}>
          <div className="text-[11px] font-bold px-1 mb-1">Material Library</div>
          <div className="overflow-y-auto" style={{ maxHeight: 440 }}>
            {MATERIAL_LIBRARY.map((preset, i) => (
              <button
                key={i}
                onClick={() => update(preset.patch)}
                className="w-full flex items-center gap-1 px-1 py-[2px] hover:bg-win-highlight hover:text-white text-[11px] text-left"
              >
                <span className="w-3 h-3 border border-black inline-block" style={{ background: preset.patch.diffuse || '#888' }} />
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-win-text-disabled flex-1">
          {selectedObject
            ? `Selection: ${selectedObject.name || selectedObject.id} — click "Apply to Selection" or drag a sphere onto any object`
            : 'No selection — drag a sample sphere onto an object in the viewport to apply the material'}
        </div>
        <div className="flex gap-1">
          <R3Button width={140} onClick={assignToSelection}>Apply to Selection</R3Button>
          <R3Button width={70} onClick={() => onOpenChange(false)}>Close</R3Button>
        </div>
      </div>

      {mapBrowserOpen && (
        <MapBrowserPopup
          slotName={mapBrowserOpen}
          current={mat.maps[mapBrowserOpen].name}
          onSelect={(name) => { updateMap(mapBrowserOpen, { name }); setMapBrowserOpen(null); }}
          onClose={() => setMapBrowserOpen(null)}
        />
      )}
    </R3Dialog>
  );
};

/** Simple Material/Map Browser popup — classic R3 map picker (Bitmap, Noise, Checker, Gradient, etc). */
function MapBrowserPopup({ slotName, current, onSelect, onClose }: {
  slotName: string; current: string; onSelect: (n: string) => void; onClose: () => void;
}) {
  const maps = [
    'None',
    'Bitmap', 'Checker', 'Gradient', 'Gradient Ramp', 'Marble', 'Noise', 'Perlin Marble',
    'Planet', 'Smoke', 'Speckle', 'Splat', 'Stucco', 'Swirl', 'Water', 'Wood',
    'Cellular', 'Dent', 'Falloff', 'Flat Mirror', 'Mask', 'Mix', 'Output',
    'Particle Age', 'Raytrace', 'Reflect/Refract', 'RGB Multiply', 'RGB Tint', 'Thin Wall Refraction', 'Vertex Color',
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="bevel-raised bg-win-face p-2" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className="h-[18px] flex items-center px-1 mb-1" style={{ background: 'linear-gradient(to right, #000080, #1084d0)' }}>
          <span className="text-white text-[11px] font-bold">Material/Map Browser — {slotName}</span>
        </div>
        <div className="bevel-inset bg-white overflow-y-auto" style={{ height: 260 }}>
          {maps.map((m) => (
            <div
              key={m}
              onDoubleClick={() => onSelect(m)}
              onClick={() => onSelect(m)}
              className={`px-2 py-[2px] text-[11px] cursor-pointer ${m === current ? 'bg-win-highlight text-white' : 'hover:bg-win-highlight hover:text-white'}`}
            >{m === 'None' ? '(None)' : `⧫ ${m}`}</div>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-1">
          <R3Button width={70} onClick={onClose}>Cancel</R3Button>
        </div>
      </div>
    </div>
  );
}
