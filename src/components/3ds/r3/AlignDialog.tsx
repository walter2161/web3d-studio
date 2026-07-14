import { useState } from 'react';
import { R3Dialog, R3Button, GroupBox } from './R3Dialog';

export interface AlignOpts {
  x: boolean; y: boolean; z: boolean;
  currentPoint: 'min' | 'center' | 'pivot' | 'max';
  targetPoint: 'min' | 'center' | 'pivot' | 'max';
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  targetName?: string;
  onApply: (opts: AlignOpts) => void;
}

export const AlignDialog = ({ open, onOpenChange, targetName, onApply }: Props) => {
  const [x, setX] = useState(true);
  const [y, setY] = useState(false);
  const [z, setZ] = useState(false);
  const [cur, setCur] = useState<AlignOpts['currentPoint']>('center');
  const [tgt, setTgt] = useState<AlignOpts['targetPoint']>('center');

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title={`Align Selection${targetName ? ` (${targetName})` : ''}`} width={320}>
      <GroupBox title="Align Position (World)">
        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={x} onChange={(e) => setX(e.target.checked)} />X Position</label>
        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={y} onChange={(e) => setY(e.target.checked)} />Y Position</label>
        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={z} onChange={(e) => setZ(e.target.checked)} />Z Position</label>
      </GroupBox>
      <div className="flex gap-2">
        <GroupBox title="Current Object">
          {(['min', 'center', 'pivot', 'max'] as const).map((p) => (
            <label key={p} className="flex items-center gap-1 text-[11px]"><input type="radio" checked={cur === p} onChange={() => setCur(p)} />{p[0].toUpperCase() + p.slice(1)}</label>
          ))}
        </GroupBox>
        <GroupBox title="Target Object">
          {(['min', 'center', 'pivot', 'max'] as const).map((p) => (
            <label key={p} className="flex items-center gap-1 text-[11px]"><input type="radio" checked={tgt === p} onChange={() => setTgt(p)} />{p[0].toUpperCase() + p.slice(1)}</label>
          ))}
        </GroupBox>
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={() => { onApply({ x, y, z, currentPoint: cur, targetPoint: tgt }); onOpenChange(false); }}>OK</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
