import { useState, useEffect } from 'react';
import { R3Dialog, GroupBox, Spinner, R3Button, Row } from './R3Dialog';

export interface GridSnapSettings {
  gridSpacing: number;
  majorEvery: number;
  angleSnap: number;
  percentSnap: number;
  snapMode: '2D' | '2.5D' | '3D';
  snapGrid: boolean;
  snapVertex: boolean;
  snapEdge: boolean;
  snapFace: boolean;
  snapMidpoint: boolean;
  snapPivot: boolean;
}

const DEFAULT: GridSnapSettings = {
  gridSpacing: 1,
  majorEvery: 10,
  angleSnap: 5,
  percentSnap: 10,
  snapMode: '3D',
  snapGrid: true, snapVertex: false, snapEdge: false, snapFace: false, snapMidpoint: false, snapPivot: false,
};

const STORAGE = '3dsled-snap';
export const loadSnap = (): GridSnapSettings => {
  try { const s = localStorage.getItem(STORAGE); return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT; } catch { return DEFAULT; }
};
export const saveSnap = (s: GridSnapSettings) => { try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch {} };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply?: (s: GridSnapSettings) => void;
}

export const GridAndSnapSettings = ({ open, onOpenChange, onApply }: Props) => {
  const [s, setS] = useState<GridSnapSettings>(loadSnap);
  const [tab, setTab] = useState<'Snaps' | 'Options' | 'Home Grid' | 'User Grids'>('Snaps');
  useEffect(() => { if (open) setS(loadSnap()); }, [open]);
  const commit = () => { saveSnap(s); onApply?.(s); onOpenChange(false); };

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Grid and Snap Settings" width={380}>
      <div className="flex gap-[2px] mb-1">
        {(['Snaps', 'Options', 'Home Grid', 'User Grids'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-2 py-[2px] text-[11px] ${tab === t ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'}`}>{t}</button>
        ))}
      </div>

      <div className="bevel-inset bg-win-face p-2" style={{ minHeight: 220 }}>
        {tab === 'Snaps' && (
          <>
            <div className="flex gap-1 mb-2">
              {(['2D', '2.5D', '3D'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1 text-[11px]">
                  <input type="radio" checked={s.snapMode === m} onChange={() => setS({ ...s, snapMode: m })} />{m}
                </label>
              ))}
            </div>
            <GroupBox title="Standard">
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={s.snapGrid} onChange={(e) => setS({ ...s, snapGrid: e.target.checked })} />Grid Points</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={s.snapPivot} onChange={(e) => setS({ ...s, snapPivot: e.target.checked })} />Pivot</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={s.snapVertex} onChange={(e) => setS({ ...s, snapVertex: e.target.checked })} />Vertex</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={s.snapEdge} onChange={(e) => setS({ ...s, snapEdge: e.target.checked })} />Edge/Segment</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={s.snapMidpoint} onChange={(e) => setS({ ...s, snapMidpoint: e.target.checked })} />Midpoint</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={s.snapFace} onChange={(e) => setS({ ...s, snapFace: e.target.checked })} />Face</label>
            </GroupBox>
            <div className="mt-2 flex justify-end gap-1"><R3Button>Clear All</R3Button></div>
          </>
        )}
        {tab === 'Options' && (
          <>
            <Row label="Angle (deg):" labelWidth={100}><Spinner value={s.angleSnap} onChange={(v) => setS({ ...s, angleSnap: v })} step={1} min={0} /></Row>
            <Row label="Percent:" labelWidth={100}><Spinner value={s.percentSnap} onChange={(v) => setS({ ...s, percentSnap: v })} step={1} min={0} /></Row>
            <label className="flex items-center gap-1 text-[11px] mt-2"><input type="checkbox" defaultChecked />Use Axis Constraints</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" defaultChecked />Display Rubber Band</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" defaultChecked />Snap to Frozen Objects</label>
          </>
        )}
        {tab === 'Home Grid' && (
          <>
            <Row label="Grid Spacing:" labelWidth={110}><Spinner value={s.gridSpacing} onChange={(v) => setS({ ...s, gridSpacing: v })} step={0.1} min={0.001} /></Row>
            <Row label="Major Lines every Nth:" labelWidth={150}><Spinner value={s.majorEvery} onChange={(v) => setS({ ...s, majorEvery: Math.max(1, Math.floor(v)) })} min={1} /></Row>
            <label className="flex items-center gap-1 text-[11px] mt-2"><input type="checkbox" defaultChecked />Inhibit Grid Subdivision Below Grid Spacing</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" />Dynamic Update All Viewports</label>
          </>
        )}
        {tab === 'User Grids' && (
          <div className="text-[11px] text-win-text-disabled">Activate grids when created — user grids appear here.</div>
        )}
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={commit}>OK</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
