import { useState } from 'react';
import { R3Dialog, R3Button, GroupBox, Row, Spinner } from './R3Dialog';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (opts: { count: number; incX: number; incY: number; incZ: number; incRotX: number; incRotY: number; incRotZ: number; incScale: number; type: '1D' }) => void;
}

export const ArrayDialog = ({ open, onOpenChange, onApply }: Props) => {
  const [count, setCount] = useState(5);
  const [incX, setIncX] = useState(2);
  const [incY, setIncY] = useState(0);
  const [incZ, setIncZ] = useState(0);
  const [incRotX, setIncRotX] = useState(0);
  const [incRotY, setIncRotY] = useState(0);
  const [incRotZ, setIncRotZ] = useState(0);
  const [incScale, setIncScale] = useState(1);

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Array" width={440}>
      <GroupBox title="Array Transformation: World Coordinates (Use Pivot Point Center)">
        <Row label="Move (units) X:" labelWidth={110}><Spinner value={incX} onChange={setIncX} step={0.1} /></Row>
        <Row label="Y:" labelWidth={110}><Spinner value={incY} onChange={setIncY} step={0.1} /></Row>
        <Row label="Z:" labelWidth={110}><Spinner value={incZ} onChange={setIncZ} step={0.1} /></Row>
        <Row label="Rotate (deg) X:" labelWidth={110}><Spinner value={incRotX} onChange={setIncRotX} step={1} /></Row>
        <Row label="Y:" labelWidth={110}><Spinner value={incRotY} onChange={setIncRotY} step={1} /></Row>
        <Row label="Z:" labelWidth={110}><Spinner value={incRotZ} onChange={setIncRotZ} step={1} /></Row>
        <Row label="Scale factor:" labelWidth={110}><Spinner value={incScale} onChange={setIncScale} step={0.05} min={0.01} /></Row>
      </GroupBox>
      <GroupBox title="Array Dimensions">
        <Row label="Count (1D):" labelWidth={110}><Spinner value={count} onChange={(v) => setCount(Math.max(1, Math.floor(v)))} min={1} step={1} /></Row>
      </GroupBox>
      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={() => { onApply({ count, incX, incY, incZ, incRotX, incRotY, incRotZ, incScale, type: '1D' }); onOpenChange(false); }}>OK</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
