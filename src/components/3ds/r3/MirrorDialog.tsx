import { useState } from 'react';
import { R3Dialog, R3Button, GroupBox, Row, Spinner } from './R3Dialog';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (opts: { axis: 'X' | 'Y' | 'Z' | 'XY' | 'YZ' | 'ZX'; offset: number; cloneMode: 'no' | 'copy' | 'instance' | 'reference' }) => void;
}

export const MirrorDialog = ({ open, onOpenChange, onApply }: Props) => {
  const [axis, setAxis] = useState<'X' | 'Y' | 'Z' | 'XY' | 'YZ' | 'ZX'>('X');
  const [offset, setOffset] = useState(0);
  const [cloneMode, setCloneMode] = useState<'no' | 'copy' | 'instance' | 'reference'>('no');

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Mirror: Screen Coordinates" width={280}>
      <GroupBox title="Mirror Axis">
        {(['X', 'Y', 'Z', 'XY', 'YZ', 'ZX'] as const).map((a) => (
          <label key={a} className="flex items-center gap-1 text-[11px]"><input type="radio" checked={axis === a} onChange={() => setAxis(a)} />{a}</label>
        ))}
        <Row label="Offset:" labelWidth={60}><Spinner value={offset} onChange={setOffset} step={0.1} /></Row>
      </GroupBox>
      <GroupBox title="Clone Selection">
        {(['no', 'copy', 'instance', 'reference'] as const).map((c) => (
          <label key={c} className="flex items-center gap-1 text-[11px]"><input type="radio" checked={cloneMode === c} onChange={() => setCloneMode(c)} />{c === 'no' ? 'No Clone' : c[0].toUpperCase() + c.slice(1)}</label>
        ))}
      </GroupBox>
      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={() => { onApply({ axis, offset, cloneMode }); onOpenChange(false); }}>OK</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
