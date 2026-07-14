import { useState } from 'react';
import { R3Dialog, GroupBox, R3Button } from './R3Dialog';

interface MaterialMapBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MATERIALS = [
  'Standard', 'Architectural', 'Blend', 'Composite', 'Double Sided',
  'Matte/Shadow', 'Morpher', 'Multi/Sub-Object', 'Raytrace', 'Shell Material',
  'Shellac', 'Top/Bottom', 'Advanced Lighting Override', 'Ink \'n Paint',
];

const MAPS_2D = ['Bitmap', 'Checker', 'Combustion', 'Gradient', 'Gradient Ramp', 'Swirl', 'Tiles'];
const MAPS_3D = ['Cellular', 'Dent', 'Falloff', 'Marble', 'Noise', 'Particle Age', 'Particle MBlur', 'Perlin Marble', 'Planet', 'Smoke', 'Speckle', 'Splat', 'Stucco', 'Waves', 'Wood'];
const COMPOSITORS = ['Composite', 'Mask', 'Mix', 'RGB Multiply'];
const COLOR_MODS = ['Output', 'RGB Tint', 'Vertex Color'];
const REFLECT_MAPS = ['Flat Mirror', 'Raytrace', 'Reflect/Refract', 'Thin Wall Refraction'];

export const MaterialMapBrowser = ({ open, onOpenChange }: MaterialMapBrowserProps) => {
  const [browseFrom, setBrowseFrom] = useState<'mtl-library' | 'mtl-editor' | 'active-slot' | 'selected' | 'scene' | 'new'>('new');
  const [showMaterials, setShowMaterials] = useState(true);
  const [showMaps, setShowMaps] = useState(true);
  const [show2d, setShow2d] = useState(true);
  const [show3d, setShow3d] = useState(true);
  const [showCompositors, setShowCompositors] = useState(true);
  const [showColorMods, setShowColorMods] = useState(true);
  const [showReflect, setShowReflect] = useState(true);
  const [selected, setSelected] = useState<string>('Standard');

  const section = (title: string, items: string[], icon: string) => (
    <>
      <div className="text-[11px] font-bold px-1 py-[1px] bg-menu-hover text-menu-hover-fg">{title}</div>
      {items.map((m) => (
        <div
          key={m}
          onClick={() => setSelected(m)}
          className={`px-1 py-[1px] text-[11px] cursor-default flex items-center gap-1 ${selected === m ? 'bg-menu-active text-white' : ''}`}
        >
          <span>{icon}</span>{m}
        </div>
      ))}
    </>
  );

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Material/Map Browser" width={500}>
      <div className="flex gap-2">
        {/* Left column: list */}
        <div className="bevel-inset bg-white flex-1" style={{ height: 360, overflow: 'auto' }}>
          {showMaterials && section('Materials', MATERIALS, '●')}
          {showMaps && show2d && section('Maps · 2D', MAPS_2D, '◆')}
          {showMaps && show3d && section('Maps · 3D', MAPS_3D, '◆')}
          {showMaps && showCompositors && section('Maps · Compositors', COMPOSITORS, '◆')}
          {showMaps && showColorMods && section('Maps · Color Mods', COLOR_MODS, '◆')}
          {showMaps && showReflect && section('Maps · Reflect/Refract', REFLECT_MAPS, '◆')}
        </div>

        {/* Right column: filters */}
        <div className="space-y-2" style={{ width: 180 }}>
          <GroupBox title="Browse From:">
            <div className="space-y-[2px]">
              {[
                ['mtl-library', 'Mtl Library'],
                ['mtl-editor', 'Mtl Editor'],
                ['active-slot', 'Active Slot'],
                ['selected', 'Selected'],
                ['scene', 'Scene'],
                ['new', 'New'],
              ].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1 text-[11px]">
                  <input type="radio" checked={browseFrom === k} onChange={() => setBrowseFrom(k as typeof browseFrom)} />
                  {l}
                </label>
              ))}
            </div>
          </GroupBox>

          <GroupBox title="Show">
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showMaterials} onChange={(e)=>setShowMaterials(e.target.checked)} />Materials</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showMaps} onChange={(e)=>setShowMaps(e.target.checked)} />Maps</label>
            <div className="pl-3 space-y-[1px]">
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={show2d} onChange={(e)=>setShow2d(e.target.checked)} />2D maps</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={show3d} onChange={(e)=>setShow3d(e.target.checked)} />3D maps</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showCompositors} onChange={(e)=>setShowCompositors(e.target.checked)} />Compositors</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showColorMods} onChange={(e)=>setShowColorMods(e.target.checked)} />Color Mods</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showReflect} onChange={(e)=>setShowReflect(e.target.checked)} />Reflect/Refract</label>
            </div>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" defaultChecked />Root Only</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" />By Object</label>
          </GroupBox>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px]">Selected: <b>{selected}</b></span>
        <div className="flex-1" />
        <R3Button width={60} onClick={() => onOpenChange(false)}>OK</R3Button>
        <R3Button width={60} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
