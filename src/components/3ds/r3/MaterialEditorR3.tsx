import { useState, useEffect, useMemo, useRef } from 'react';
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
const BITMAP_STORAGE = '3dsled-mateditor-bitmaps-v1';

/**
 * Persistent bitmap store. Blob URLs from URL.createObjectURL do NOT survive
 * a page reload, so any material referencing them would render blank after
 * refresh. We store bitmaps as data URLs in localStorage keyed by filename
 * and rehydrate `window.__r3BitmapUrls` on module load, so both the sample
 * slot preview and the viewport texture keep working after refresh.
 */
function loadBitmapStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BITMAP_STORAGE);
    if (raw) return JSON.parse(raw) || {};
  } catch {}
  return {};
}
function saveBitmapStore(store: Record<string, string>) {
  try { localStorage.setItem(BITMAP_STORAGE, JSON.stringify(store)); } catch {}
}
if (typeof window !== 'undefined') {
  const existing = (window as any).__r3BitmapUrls || {};
  (window as any).__r3BitmapUrls = { ...loadBitmapStore(), ...existing };
}

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

import { getMaterialPreview, PreviewShape } from '../utils/materialPreview';

/**
 * Real 3D preview of a sample slot: PBR sphere/cylinder/cube rendered by
 * three.js with IBL reflections. Result is cached by material signature so
 * scrolling the slot grid is instant.
 */
function SamplePreview({ mat, size = 60, shape = 'sphere' }: { mat: R3Material; size?: number; shape?: PreviewShape }) {
  const diffSlot = mat.maps?.diffuse;
  const bmpFile = diffSlot?.name === 'Bitmap' ? diffSlot.params?.filename : undefined;
  const bmpUrl = bmpFile ? ((window as any).__r3BitmapUrls?.[bmpFile] as string | undefined) : undefined;

  const input = useMemo(() => ({
    shape,
    color: mat.diffuse,
    metalness: mat.metalness ?? 0,
    roughness: mat.roughness ?? 0.5,
    opacity: (mat.opacity ?? 100) / 100,
    emissive: mat.diffuse,
    emissiveIntensity: mat.selfIllumination > 0 ? (mat.selfIllumination / 100) * (mat.emissiveIntensity || 1) : 0,
    bitmapUrl: bmpUrl || null,
    size: Math.max(48, size),
  }), [shape, mat.diffuse, mat.metalness, mat.roughness, mat.opacity, mat.selfIllumination, mat.emissiveIntensity, bmpUrl, size]);

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMaterialPreview(input)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [input]);

  return (
    <div style={{ width: size, height: size, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url ? (
        <img src={url} alt="" width={size} height={size} style={{ display: 'block' }} draggable={false} />
      ) : (
        <div style={{ width: size * 0.7, height: size * 0.7, borderRadius: shape === 'sphere' ? '50%' : 2, background: mat.diffuse, opacity: 0.4 }} />
      )}
    </div>
  );
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
  const [typePopupOpen, setTypePopupOpen] = useState(false);

  useEffect(() => { if (open) setSlots(loadSlots()); }, [open]);
  useEffect(() => { saveSlots(slots); }, [slots]);

  // Live-link (Max behavior): once a material has been assigned to the
  // selected object, any change to that active slot re-applies to it in
  // real time — including bitmap loads, tiling/offset tweaks, colors, etc.
  const lastAppliedRef = useRef<string | null>(null);

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

  const mapPayload = (slot?: R3MapSlot) => {
    if (!slot || slot.name !== 'Bitmap' || !slot.params?.filename) return null;
    const url = (window as any).__r3BitmapUrls?.[slot.params.filename];
    if (!url) return null;
    const c = slot.params.coords;
    return {
      url,
      filename: slot.params.filename,
      repeat: [c.tilingU, c.tilingV] as [number, number],
      offset: [c.offsetU, c.offsetV] as [number, number],
      rotation: ((c.angleW || 0) * Math.PI) / 180,
      mirrorU: !!c.mirrorU, mirrorV: !!c.mirrorV,
      tileU: c.tileU !== false, tileV: c.tileV !== false,
      amount: (slot.amount ?? 100) / 100,
    };
  };

  const matToThree = (m: R3Material) => ({
    color: m.diffuse,
    metalness: m.metalness,
    roughness: m.roughness,
    opacity: m.opacity / 100,
    emissive: m.diffuse,
    emissiveIntensity: m.selfIllumination > 0 ? (m.selfIllumination / 100) * (m.emissiveIntensity || 1) : 0,
    map: mapPayload(m.maps.diffuse),
    bumpMap: mapPayload(m.maps.bump),
    bumpScale: (m.maps.bump?.amount ?? 30) / 100,
    opacityMap: mapPayload(m.maps.opacity),
    emissiveMap: mapPayload(m.maps.selfIllum),
  });

  const assignToSelection = () => {
    if (!selectedObject) {
      toast.error('Select an object first');
      return;
    }
    onMaterialChange(selectedObject.id, matToThree(mat));
    lastAppliedRef.current = `${selectedObject.id}:${active}`;
  };

  // Reset the live-link binding whenever the selection or active slot changes.
  useEffect(() => {
    lastAppliedRef.current = null;
  }, [selectedObject?.id, active]);

  // Live-link: re-apply the current slot to the selected object ONLY when the
  // user has already explicitly bound this slot to it (via "Apply to Selection",
  // drag-and-drop onto the object, or double-clicking the sample slot).
  // Loading/previewing a texture must NOT auto-apply to the selected object.
  useEffect(() => {
    if (!open || !selectedObject) return;
    const key = `${selectedObject.id}:${active}`;
    if (lastAppliedRef.current === key) {
      onMaterialChange(selectedObject.id, matToThree(mat));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mat, selectedObject?.id, open]);



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
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Material Editor" width={640}>
      {/* TOP: sample slots — 2 visible rows with vertical scrollbar */}
      <div className="bevel-inset bg-win-face p-1 mb-1">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-win-text">Sample Slots · Preview:</span>
          {(['sphere', 'cylinder', 'cube'] as PreviewShape[]).map((s) => (
            <button
              key={s}
              onClick={() => setPreviewShape(s)}
              className={`${previewShape === s ? 'bevel-inset' : 'bevel-raised'} bg-win-face text-[10px] px-1`}
              style={{ height: 18 }}
              title={`Preview shape: ${s}`}
            >{s === 'sphere' ? '● Sphere' : s === 'cylinder' ? '▮ Cylinder' : '◼ Cube'}</button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px] text-win-text-disabled">Slot {active + 1} / {SLOT_COUNT}</span>
        </div>
        <div
          className="panel-scroll overflow-y-auto"
          style={{ maxHeight: 2 * 132 + 6 /* 2 rows visible; rest scrolls */ }}
        >
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
            {slots.map((m, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                onDoubleClick={() => { setActive(i); if (selectedObject) onMaterialChange(selectedObject.id, matToThree(m)); }}
                draggable
                onDragStart={(e) => { setActive(i); beginSlotDrag(i, e); }}
                onDragEnd={endSlotDrag}
                title={`${m.name} — drag onto an object to apply, or double-click to assign to selection`}
                className={`p-[2px] flex items-center justify-center cursor-grab active:cursor-grabbing ${i === active ? 'bevel-inset' : 'bevel-raised'}`}
                style={{ aspectRatio: '1', background: i === active ? '#000' : '#111' }}
              >
                <SamplePreview mat={m} size={64} shape={previewShape} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        {/* LEFT: vertical R3-style toolbar strip */}
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
            <button
              onClick={() => setTypePopupOpen(true)}
              title="Material type / library"
              className="bevel-raised bg-win-face h-[20px] text-[11px] px-2 flex items-center gap-1"
            >
              <span className="truncate" style={{ maxWidth: 110 }}>{mat.type}</span>
              <span className="text-[9px]">▼</span>
            </button>

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
                            onClick={() => openMapSlot(key)}
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
          onSelect={(name) => {
            const key = mapBrowserOpen;
            if (name === 'None') {
              updateMap(key, { name: 'None' });
              setMapBrowserOpen(null);
            } else {
              // ensure params object exists for the new map, then open params editor
              updateMap(key, { name, params: mat.maps[key].params || defaultMapParams() });
              setMapBrowserOpen(null);
              setMapParamsOpen(key);
            }
          }}
          onClose={() => setMapBrowserOpen(null)}
        />
      )}

      {mapParamsOpen && (
        <MapParametersDialog
          slotKey={mapParamsOpen}
          slotLabel={String(mapParamsOpen)}
          slot={mat.maps[mapParamsOpen]}
          onChange={(patch) => updateMapParams(mapParamsOpen, patch)}
          onChangeSlot={(patch) => updateMap(mapParamsOpen, patch)}
          onChangeType={() => { setMapParamsOpen(null); setMapBrowserOpen(mapParamsOpen); }}
          onClose={() => setMapParamsOpen(null)}
        />
      )}

      {typePopupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setTypePopupOpen(false)}>
          <div className="bevel-raised bg-win-face p-2" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="h-[18px] flex items-center justify-between px-1 mb-1" style={{ background: 'linear-gradient(to right, #000080, #1084d0)' }}>
              <span className="text-white text-[11px] font-bold">Material/Map Browser</span>
              <button onClick={() => setTypePopupOpen(false)} className="text-white bevel-raised bg-win-face px-1 text-[10px]" style={{ color: 'black' }}>X</button>
            </div>
            <div className="flex gap-2">
              <div className="bevel-inset bg-white overflow-y-auto flex-1" style={{ height: 320 }}>
                <div className="text-[11px] font-bold px-1 py-[1px] bg-menu-hover text-menu-hover-fg">Materials</div>
                {['Standard','Blend','Composite','Double Sided','Multi/Sub-Object','Raytrace','Matte/Shadow','Top/Bottom','Shellac','Morpher'].map((t) => (
                  <div
                    key={t}
                    onClick={() => { update({ type: t as any }); setTypePopupOpen(false); }}
                    className={`px-2 py-[2px] text-[11px] cursor-pointer ${mat.type === t ? 'bg-win-highlight text-white' : 'hover:bg-win-highlight hover:text-white'}`}
                  >● {t}</div>
                ))}
                <div className="text-[11px] font-bold px-1 py-[1px] bg-menu-hover text-menu-hover-fg mt-1">Material Library</div>
                {MATERIAL_LIBRARY.map((preset, i) => (
                  <div
                    key={i}
                    onClick={() => { update(preset.patch); setTypePopupOpen(false); }}
                    className="px-2 py-[2px] text-[11px] cursor-pointer hover:bg-win-highlight hover:text-white flex items-center gap-1"
                  >
                    <span className="w-3 h-3 border border-black inline-block" style={{ background: preset.patch.diffuse || '#888' }} />
                    <span className="truncate">{preset.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-1">
              <R3Button width={70} onClick={() => setTypePopupOpen(false)}>Cancel</R3Button>
            </div>
          </div>
        </div>
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

/* ============================================================================
 * MapParametersDialog — 3ds Max R3 map parameter editor.
 *  Shows rollouts depending on the selected map type (Bitmap, Noise, Checker,
 *  Gradient, Marble, Falloff, Cellular, Mix, ...) plus universal Coordinates
 *  and Output rollouts.
 * ==========================================================================*/
function Rollout({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left bevel-raised bg-win-face px-1 text-[11px] font-bold flex items-center gap-1"
        style={{ height: 18 }}
      >
        <span>{open ? '▼' : '▶'}</span>{title}
      </button>
      {open && <div className="bevel-inset bg-win-face p-2">{children}</div>}
    </div>
  );
}

function MapParametersDialog({
  slotKey, slotLabel, slot, onChange, onChangeSlot, onChangeType, onClose,
}: {
  slotKey: string;
  slotLabel: string;
  slot: R3MapSlot;
  onChange: (patch: Partial<R3MapParams>) => void;
  onChangeSlot: (patch: Partial<R3MapSlot>) => void;
  onChangeType: () => void;
  onClose: () => void;
}) {
  const p = slot.params || defaultMapParams();
  const c = p.coords;
  const o = p.output;
  const setCoords = (patch: Partial<R3MapCoords>) => onChange({ coords: { ...c, ...patch } });
  const setOutput = (patch: Partial<R3MapOutput>) => onChange({ output: { ...o, ...patch } });
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: Math.max(20, Math.floor((window.innerWidth - 460) / 2) + 80),
    y: Math.max(20, Math.floor(window.innerHeight * 0.08)),
  }));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (dragRef.current) setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }); };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);

  const isBitmap = slot.name === 'Bitmap';
  const isNoise = slot.name === 'Noise';
  const isChecker = slot.name === 'Checker';
  const isGradient = slot.name === 'Gradient' || slot.name === 'Gradient Ramp';
  const isMarble = slot.name === 'Marble' || slot.name === 'Perlin Marble';
  const isFalloff = slot.name === 'Falloff';
  const isCellular = slot.name === 'Cellular';
  const isMix = slot.name === 'Mix';

  const loadBitmap = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      // Read as data URL so the bitmap survives page reloads (blob: URLs
      // are lost when the page refreshes, blanking the texture on the object).
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || '');
        if (!url) return;
        const next = { ...(window as any).__r3BitmapUrls, [f.name]: url };
        (window as any).__r3BitmapUrls = next;
        try {
          localStorage.setItem('3dsled-mateditor-bitmaps-v1', JSON.stringify(next));
        } catch {
          // localStorage quota exceeded — texture still works this session.
        }
        onChange({ filename: f.name });
        onChangeSlot({}); // trigger rerender
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };


  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div className="absolute pointer-events-auto bevel-raised bg-win-face shadow-lg" style={{ left: pos.x, top: pos.y, width: 460 }}>
        <div
          className="h-[18px] flex items-center justify-between px-1 select-none cursor-move"
          style={{ background: 'linear-gradient(to right, #000080, #1084d0)' }}
          onMouseDown={(e) => { dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
        >
          <span className="text-white text-[11px] font-bold">Map #{slotLabel} — {slot.name}</span>
          <button onClick={onClose} className="text-white bevel-raised bg-win-face px-1 text-[10px]" style={{ color: 'black' }}>X</button>
        </div>

        <div className="p-2" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Navigation / header */}
          <div className="flex items-center gap-1 mb-2">
            <R3Button width={80} onClick={onClose}>◀ Parent</R3Button>
            <R3Button width={80} onClick={onChangeType}>Type: {slot.name}</R3Button>
            <div className="flex-1 text-[11px] px-1">Channel: {slotLabel}</div>
          </div>

          {/* Coordinates */}
          <Rollout title="Coordinates">
            <Row label="Mapping:" labelWidth={70}>
              <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`crd-${slotKey}`} defaultChecked /> Texture</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`crd-${slotKey}`} /> Environ</label>
              <span className="ml-2 text-[11px]">Channel:</span>
              <Spinner value={c.mappingChannel} onChange={(v) => setCoords({ mappingChannel: Math.max(1, Math.round(v)) })} step={1} min={1} max={99} width={40} />
            </Row>
            <div className="grid grid-cols-[50px_1fr_1fr_1fr_60px_60px] gap-x-1 gap-y-[2px] items-center mt-1">
              <div></div>
              <div className="text-[11px] font-bold text-center">Offset</div>
              <div className="text-[11px] font-bold text-center">Tiling</div>
              <div className="text-[11px] font-bold text-center">Angle</div>
              <div className="text-[11px] font-bold text-center">Mirror</div>
              <div className="text-[11px] font-bold text-center">Tile</div>

              <div className="text-[11px]">U:</div>
              <Spinner value={c.offsetU} onChange={(v) => setCoords({ offsetU: v })} step={0.01} min={-10} max={10} width={70} />
              <Spinner value={c.tilingU} onChange={(v) => setCoords({ tilingU: v })} step={0.1} min={0.01} max={100} width={70} />
              <Spinner value={c.angleU} onChange={(v) => setCoords({ angleU: v })} step={1} min={-360} max={360} width={70} />
              <div className="text-center"><input type="checkbox" checked={c.mirrorU} onChange={(e) => setCoords({ mirrorU: e.target.checked })} /></div>
              <div className="text-center"><input type="checkbox" checked={c.tileU} onChange={(e) => setCoords({ tileU: e.target.checked })} /></div>

              <div className="text-[11px]">V:</div>
              <Spinner value={c.offsetV} onChange={(v) => setCoords({ offsetV: v })} step={0.01} min={-10} max={10} width={70} />
              <Spinner value={c.tilingV} onChange={(v) => setCoords({ tilingV: v })} step={0.1} min={0.01} max={100} width={70} />
              <Spinner value={c.angleV} onChange={(v) => setCoords({ angleV: v })} step={1} min={-360} max={360} width={70} />
              <div className="text-center"><input type="checkbox" checked={c.mirrorV} onChange={(e) => setCoords({ mirrorV: e.target.checked })} /></div>
              <div className="text-center"><input type="checkbox" checked={c.tileV} onChange={(e) => setCoords({ tileV: e.target.checked })} /></div>

              <div className="text-[11px]">W:</div>
              <div></div><div></div>
              <Spinner value={c.angleW} onChange={(v) => setCoords({ angleW: v })} step={1} min={-360} max={360} width={70} />
              <div></div><div></div>
            </div>
            <Row label="Blur:" labelWidth={70}>
              <Spinner value={c.blur} onChange={(v) => setCoords({ blur: v })} step={0.1} min={0} max={10} />
              <span className="ml-2 text-[11px]">Blur offset:</span>
              <Spinner value={c.blurOffset} onChange={(v) => setCoords({ blurOffset: v })} step={0.01} min={0} max={1} />
            </Row>
          </Rollout>

          {/* Bitmap parameters */}
          {isBitmap && (
            <Rollout title="Bitmap Parameters">
              <Row label="Bitmap:" labelWidth={70}>
                <button onClick={loadBitmap} className="bevel-raised bg-win-face h-[20px] px-2 text-[11px] flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">
                  {p.filename || '<none>'}
                </button>
                <R3Button width={54} onClick={loadBitmap}>Reload</R3Button>
              </Row>
              <Row label="Filtering:" labelWidth={70}>
                <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`filt-${slotKey}`} defaultChecked /> Pyramidal</label>
                <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`filt-${slotKey}`} /> Summed Area</label>
                <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`filt-${slotKey}`} /> None</label>
              </Row>
              <div className="flex gap-3 mt-1">
                <GroupBox title="Mono Channel Output:">
                  <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`mc-${slotKey}`} checked={p.monoChannel === 'RGB Intensity'} onChange={() => onChange({ monoChannel: 'RGB Intensity' })} /> RGB Intensity</label>
                  <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`mc-${slotKey}`} checked={p.monoChannel === 'Alpha'} onChange={() => onChange({ monoChannel: 'Alpha' })} /> Alpha</label>
                </GroupBox>
                <GroupBox title="RGB Channel Output:">
                  <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`rc-${slotKey}`} checked={p.rgbChannel === 'RGB'} onChange={() => onChange({ rgbChannel: 'RGB' })} /> RGB</label>
                  <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`rc-${slotKey}`} checked={p.rgbChannel === 'Alpha as Gray'} onChange={() => onChange({ rgbChannel: 'Alpha as Gray' })} /> Alpha as Gray</label>
                </GroupBox>
                <GroupBox title="Alpha Source:">
                  {(['Image Alpha', 'RGB Intensity', 'None'] as const).map((a) => (
                    <label key={a} className="flex items-center gap-1 text-[11px]"><input type="radio" name={`as-${slotKey}`} checked={p.alphaSource === a} onChange={() => onChange({ alphaSource: a })} /> {a}</label>
                  ))}
                </GroupBox>
              </div>
            </Rollout>
          )}

          {/* Noise */}
          {isNoise && (
            <Rollout title="Noise Parameters">
              <Row label="Noise Type:" labelWidth={80}>
                {(['Regular', 'Fractal', 'Turbulence'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1 text-[11px] mr-1"><input type="radio" name={`nt-${slotKey}`} checked={p.noiseType === t} onChange={() => onChange({ noiseType: t })} /> {t}</label>
                ))}
              </Row>
              <Row label="Size:" labelWidth={80}><Spinner value={p.size} onChange={(v) => onChange({ size: v })} step={1} min={0} max={1000} /></Row>
              <Row label="Levels:" labelWidth={80}><Spinner value={p.levels} onChange={(v) => onChange({ levels: v })} step={1} min={1} max={10} /></Row>
              <Row label="Phase:" labelWidth={80}><Spinner value={p.phase} onChange={(v) => onChange({ phase: v })} step={0.1} min={-100} max={100} /></Row>
              <Row label="Low:" labelWidth={80}><Spinner value={p.low} onChange={(v) => onChange({ low: v })} step={0.01} min={0} max={1} /></Row>
              <Row label="High:" labelWidth={80}><Spinner value={p.high} onChange={(v) => onChange({ high: v })} step={0.01} min={0} max={1} /></Row>
              <Row label="Color #1:" labelWidth={80}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Color #2:" labelWidth={80}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
            </Rollout>
          )}

          {/* Checker */}
          {isChecker && (
            <Rollout title="Checker Parameters">
              <Row label="Soften:" labelWidth={80}><Spinner value={p.soften} onChange={(v) => onChange({ soften: v })} step={0.01} min={0} max={1} /></Row>
              <Row label="Color #1:" labelWidth={80}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Color #2:" labelWidth={80}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
            </Rollout>
          )}

          {/* Gradient */}
          {isGradient && (
            <Rollout title="Gradient Parameters">
              <Row label="Color #1:" labelWidth={80}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Color #2:" labelWidth={80}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Color #3:" labelWidth={80}><input type="color" value={p.color3} onChange={(e) => onChange({ color3: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Noise Amt:" labelWidth={80}><Spinner value={p.mixAmount} onChange={(v) => onChange({ mixAmount: v })} step={0.01} min={0} max={1} /></Row>
              <Row label="Gradient Type:" labelWidth={100}>
                <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`gt-${slotKey}`} defaultChecked /> Linear</label>
                <label className="flex items-center gap-1 text-[11px]"><input type="radio" name={`gt-${slotKey}`} /> Radial</label>
              </Row>
            </Rollout>
          )}

          {/* Marble */}
          {isMarble && (
            <Rollout title="Marble Parameters">
              <Row label="Size:" labelWidth={80}><Spinner value={p.size} onChange={(v) => onChange({ size: v })} step={0.1} min={0} max={1000} /></Row>
              <Row label="Vein Width:" labelWidth={80}><Spinner value={p.veinWidth} onChange={(v) => onChange({ veinWidth: v })} step={0.001} min={0} max={1} /></Row>
              <Row label="Turbulence:" labelWidth={80}><Spinner value={p.turbulence} onChange={(v) => onChange({ turbulence: v })} step={0.1} min={0} max={10} /></Row>
              <Row label="Color #1:" labelWidth={80}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Color #2:" labelWidth={80}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
            </Rollout>
          )}

          {/* Falloff */}
          {isFalloff && (
            <Rollout title="Falloff Parameters">
              <Row label="Type:" labelWidth={80}>
                <select
                  value={p.falloffType}
                  onChange={(e) => onChange({ falloffType: e.target.value as R3MapParams['falloffType'] })}
                  className="bevel-inset bg-white h-[20px] text-[11px]"
                >
                  {['Perpendicular / Parallel','Towards / Away','Fresnel','Shadow/Light','Distance Blend'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Row>
              <Row label="Front:" labelWidth={80}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Side:" labelWidth={80}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
            </Rollout>
          )}

          {/* Cellular */}
          {isCellular && (
            <Rollout title="Cellular Parameters">
              <Row label="Cell Color:" labelWidth={80}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Div. Color:" labelWidth={80}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Size:" labelWidth={80}><Spinner value={p.size} onChange={(v) => onChange({ size: v })} step={1} min={0} max={1000} /></Row>
              <Row label="Spread:" labelWidth={80}><Spinner value={p.turbulence} onChange={(v) => onChange({ turbulence: v })} step={0.01} min={0} max={1} /></Row>
            </Rollout>
          )}

          {/* Mix */}
          {isMix && (
            <Rollout title="Mix Parameters">
              <Row label="Mix Amount:" labelWidth={90}><Spinner value={p.mixAmount} onChange={(v) => onChange({ mixAmount: v })} step={0.01} min={0} max={1} /></Row>
              <Row label="Color #1:" labelWidth={90}><input type="color" value={p.color1} onChange={(e) => onChange({ color1: e.target.value })} className="w-[36px] h-[16px]" /></Row>
              <Row label="Color #2:" labelWidth={90}><input type="color" value={p.color2} onChange={(e) => onChange({ color2: e.target.value })} className="w-[36px] h-[16px]" /></Row>
            </Rollout>
          )}

          {/* Bump amount (only visible when this slot is bump-like) */}
          {slotKey === 'bump' && (
            <Rollout title="Bump">
              <Row label="Amount:" labelWidth={80}><Spinner value={o.bumpAmount} onChange={(v) => setOutput({ bumpAmount: v })} step={1} min={-999} max={999} /></Row>
            </Rollout>
          )}

          {/* Output */}
          <Rollout title="Output">
            <Row label="Output Amount:" labelWidth={110}><Spinner value={o.outputAmount} onChange={(v) => setOutput({ outputAmount: v })} step={0.01} min={0} max={4} /></Row>
            <Row label="RGB Offset:" labelWidth={110}><Spinner value={o.rgbOffset} onChange={(v) => setOutput({ rgbOffset: v })} step={0.01} min={-1} max={1} /></Row>
            <Row label="RGB Level:" labelWidth={110}><Spinner value={o.rgbLevel} onChange={(v) => setOutput({ rgbLevel: v })} step={0.01} min={0} max={4} /></Row>
            <Row label=" " labelWidth={110}>
              <label className="flex items-center gap-1 text-[11px] mr-2"><input type="checkbox" checked={o.invert} onChange={(e) => setOutput({ invert: e.target.checked })} /> Invert</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={o.clamp} onChange={(e) => setOutput({ clamp: e.target.checked })} /> Clamp</label>
            </Row>
          </Rollout>

          <div className="mt-2 flex justify-end gap-1">
            <R3Button width={80} onClick={onClose}>OK</R3Button>
          </div>
        </div>
      </div>
    </div>
  );
}
