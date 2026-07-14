import { useEffect, useState } from 'react';
import { R3Dialog, GroupBox, Spinner, Row } from './R3Dialog';

type Mode = 'translate' | 'rotate' | 'scale';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  object: {
    id: string;
    name?: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  } | null;
  onCommit: (id: string, transform: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }) => void;
}

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

/**
 * 3ds Max-style "Type-In" transform window (F12).
 * Shows Absolute:World and Offset:World triplets for the active transform
 * (Move / Rotate / Scale). Opens in the top-left of the viewport.
 */
export const TransformTypeInDialog = ({ open, onClose, mode, object, onCommit }: Props) => {
  const title =
    mode === 'translate' ? 'Move Transform Type-In' :
    mode === 'rotate' ? 'Rotate Transform Type-In' :
    'Scale Transform Type-In';

  const [abs, setAbs] = useState<[number, number, number]>([0, 0, 0]);
  const [off, setOff] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (!object) return;
    if (mode === 'translate') setAbs([...object.position] as any);
    else if (mode === 'rotate') setAbs([object.rotation[0] * R2D, object.rotation[1] * R2D, object.rotation[2] * R2D]);
    else setAbs([...object.scale] as any);
    setOff([0, 0, 0]);
  }, [object, mode, object?.position, object?.rotation, object?.scale]);

  if (!object) return null;

  const commitAbs = (axis: 0 | 1 | 2, v: number) => {
    const next: [number, number, number] = [...abs] as any;
    next[axis] = v;
    setAbs(next);
    if (mode === 'translate') onCommit(object.id, { position: next });
    else if (mode === 'rotate') onCommit(object.id, { rotation: [next[0] * D2R, next[1] * D2R, next[2] * D2R] });
    else onCommit(object.id, { scale: next });
  };

  const commitOff = (axis: 0 | 1 | 2, v: number) => {
    const next: [number, number, number] = [...off] as any;
    next[axis] = v;
    setOff(next);
    if (mode === 'translate') {
      const p: [number, number, number] = [object.position[0] + next[0], object.position[1] + next[1], object.position[2] + next[2]];
      onCommit(object.id, { position: p });
    } else if (mode === 'rotate') {
      const r: [number, number, number] = [object.rotation[0] + next[0] * D2R, object.rotation[1] + next[1] * D2R, object.rotation[2] + next[2] * D2R];
      onCommit(object.id, { rotation: r });
    } else {
      const factor = (n: number) => (n === 0 ? 1 : 1 + n / 100);
      const s: [number, number, number] = [object.scale[0] * factor(next[0]), object.scale[1] * factor(next[1]), object.scale[2] * factor(next[2])];
      onCommit(object.id, { scale: s });
    }
  };

  const unit = mode === 'translate' ? '' : mode === 'rotate' ? '°' : '%';
  const absLabel = mode === 'scale' ? 'Absolute:Local' : 'Absolute:World';
  const offLabel = mode === 'scale' ? 'Offset:Local' : 'Offset:Screen';
  const step = mode === 'rotate' ? 1 : mode === 'scale' ? 1 : 0.1;

  return (
    <R3Dialog open={open} onClose={onClose} title={title} width={320} initialPosition={{ x: 8, y: 92 }}>
      <div className="grid grid-cols-2 gap-2">
        <GroupBox title={absLabel}>
          <Row label={`X:`} labelWidth={20}>
            <Spinner value={Number(abs[0].toFixed(3))} onChange={(v) => commitAbs(0, v)} step={step} width={80} />
            {unit && <span className="text-[10px]">{unit}</span>}
          </Row>
          <Row label={`Y:`} labelWidth={20}>
            <Spinner value={Number(abs[1].toFixed(3))} onChange={(v) => commitAbs(1, v)} step={step} width={80} />
            {unit && <span className="text-[10px]">{unit}</span>}
          </Row>
          <Row label={`Z:`} labelWidth={20}>
            <Spinner value={Number(abs[2].toFixed(3))} onChange={(v) => commitAbs(2, v)} step={step} width={80} />
            {unit && <span className="text-[10px]">{unit}</span>}
          </Row>
        </GroupBox>
        <GroupBox title={offLabel}>
          <Row label={`X:`} labelWidth={20}>
            <Spinner value={off[0]} onChange={(v) => commitOff(0, v)} step={step} width={80} />
            {unit && <span className="text-[10px]">{unit}</span>}
          </Row>
          <Row label={`Y:`} labelWidth={20}>
            <Spinner value={off[1]} onChange={(v) => commitOff(1, v)} step={step} width={80} />
            {unit && <span className="text-[10px]">{unit}</span>}
          </Row>
          <Row label={`Z:`} labelWidth={20}>
            <Spinner value={off[2]} onChange={(v) => commitOff(2, v)} step={step} width={80} />
            {unit && <span className="text-[10px]">{unit}</span>}
          </Row>
        </GroupBox>
      </div>
    </R3Dialog>
  );
};
