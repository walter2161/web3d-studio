/**
 * WaltSculpt floating panel — brush picker, symmetry, layers, remesh.
 * Follows the R3Dialog / MapToolsPanel visual pattern.
 */
import { useSyncExternalStore, useState } from 'react';
import * as THREE from 'three';
import { R3Dialog, GroupBox, Row, Spinner, R3Button } from '../r3/R3Dialog';
import { sculptStore, BrushKind, StrokeKind } from './sculptStore';
import { decimateMesh, uniformRemesh } from './brushes';
import { toast } from '@/hooks/use-toast';

interface Props { open: boolean; onClose: () => void; }

const BRUSHES: Array<{ id: BrushKind; label: string }> = [
  { id: 'move', label: 'Move' },
  { id: 'clay', label: 'Clay' },
  { id: 'clayBuildup', label: 'Clay Buildup' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'inflate', label: 'Inflate' },
  { id: 'pinch', label: 'Pinch' },
  { id: 'crease', label: 'Crease' },
  { id: 'flatten', label: 'Flatten' },
  { id: 'polish', label: 'Polish' },
  { id: 'trim', label: 'Trim' },
  { id: 'mask', label: 'Mask' },
];

const STROKES: StrokeKind[] = ['freehand', 'dots', 'drag', 'spray'];

function getSelectedMesh(): { mesh: THREE.Mesh | null; targetId: string | null } {
  const scene: THREE.Scene | undefined = (window as any).__r3Scene;
  const sel: string[] = (window as any).__r3SelectedIds ?? [];
  const targetId = sel[0] ?? null;
  if (!scene || !targetId) return { mesh: null, targetId };
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (mesh) return;
    if ((o as THREE.Mesh).isMesh) {
      let p: any = o;
      while (p) {
        if (p.userData?.objectId === targetId) { mesh = o as THREE.Mesh; break; }
        p = p.parent;
      }
    }
  });
  return { mesh, targetId };
}

export const WaltSculptPanel = ({ open, onClose }: Props) => {
  const st = useSyncExternalStore(sculptStore.subscribe, sculptStore.getState);
  const [remeshEdge, setRemeshEdge] = useState(0.15);
  const [decRatio, setDecRatio] = useState(0.5);

  const enterSculpt = () => {
    const { targetId } = getSelectedMesh();
    if (!targetId) { toast({ title: 'WaltSculpt', description: 'Select a mesh first.' }); return; }
    sculptStore.set({ active: true, targetId });
  };
  const exitSculpt = () => sculptStore.set({ active: false, targetId: null });

  const doRemesh = () => {
    const { mesh } = getSelectedMesh();
    if (!mesh) return;
    uniformRemesh(mesh, remeshEdge);
    toast({ title: 'WaltRemesh', description: `Edge target ${remeshEdge}` });
  };
  const doDecimate = () => {
    const { mesh } = getSelectedMesh();
    if (!mesh) return;
    decimateMesh(mesh, decRatio);
    toast({ title: 'WaltDecimate', description: `Ratio ${decRatio}` });
  };
  const clearMask = () => {
    if (!st.targetId) return;
    const m = st.masks.get(st.targetId);
    if (m) m.fill(0);
    sculptStore.set({}); // notify
  };
  const invertMask = () => {
    if (!st.targetId) return;
    const m = st.masks.get(st.targetId);
    if (!m) return;
    for (let i = 0; i < m.length; i++) m[i] = 1 - m[i];
    sculptStore.set({});
  };

  const layers = st.targetId ? (st.layers.get(st.targetId) ?? []) : [];

  return (
    <R3Dialog open={open} onClose={onClose} title="WaltSculpt" width={320}>
      <div className="flex flex-col gap-1">
        <GroupBox title="Mode">
          <div className="flex gap-1">
            <R3Button active={st.active} onClick={enterSculpt}>Enter Sculpt</R3Button>
            <R3Button active={!st.active} onClick={exitSculpt}>Exit</R3Button>
          </div>
          <div className="text-[10px] text-win-text mt-1">
            Target: <b>{st.targetId ?? '— none —'}</b>
          </div>
        </GroupBox>

        <GroupBox title="Brushes">
          <div className="grid grid-cols-3 gap-[2px]">
            {BRUSHES.map((b) => (
              <R3Button
                key={b.id}
                width={90}
                active={st.brush === b.id}
                onClick={() => {
                  const { targetId } = getSelectedMesh();
                  const patch: any = { brush: b.id };
                  if (!st.active && targetId) { patch.active = true; patch.targetId = targetId; }
                  sculptStore.set(patch);
                  if (!targetId && !st.active) {
                    toast({ title: 'WaltSculpt', description: 'Select a mesh to start sculpting.' });
                  }
                }}
              >
                {b.label}
              </R3Button>
            ))}
          </div>
        </GroupBox>

        <GroupBox title="Brush Settings">
          <Row label="Radius"><Spinner value={st.radius} onChange={(v) => sculptStore.set({ radius: v })} min={0.01} max={100} step={0.05} /></Row>
          <Row label="Strength"><Spinner value={st.strength} onChange={(v) => sculptStore.set({ strength: v })} min={0} max={1} step={0.05} /></Row>
          <Row label="Falloff"><Spinner value={st.falloff} onChange={(v) => sculptStore.set({ falloff: v })} min={0} max={1} step={0.05} /></Row>
          <Row label="Invert">
            <input type="checkbox" checked={st.invert} onChange={(e) => sculptStore.set({ invert: e.target.checked })} />
          </Row>
          <Row label="Stroke">
            <select className="bevel-inset bg-white text-[11px]" value={st.stroke}
              onChange={(e) => sculptStore.set({ stroke: e.target.value as StrokeKind })}>
              {STROKES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Row>
        </GroupBox>

        <GroupBox title="Symmetry">
          <div className="flex gap-2">
            {(['x', 'y', 'z'] as const).map((a) => (
              <label key={a} className="flex items-center gap-1 text-[11px]">
                <input type="checkbox" checked={st.symmetry[a]}
                  onChange={(e) => sculptStore.setSym(a, e.target.checked)} />
                {a.toUpperCase()}
              </label>
            ))}
          </div>
        </GroupBox>

        <GroupBox title="Mask">
          <div className="flex gap-1">
            <R3Button onClick={() => sculptStore.set({ brush: 'mask' })} active={st.brush === 'mask'}>Paint Mask</R3Button>
            <R3Button onClick={clearMask}>Clear</R3Button>
            <R3Button onClick={invertMask}>Invert</R3Button>
          </div>
        </GroupBox>

        <GroupBox title="Layers">
          <div className="flex gap-1 mb-1">
            <R3Button onClick={() => { if (st.targetId) sculptStore.addLayer(st.targetId, `Layer ${layers.length + 1}`); }}>+ Add</R3Button>
          </div>
          <div className="max-h-[80px] overflow-auto bevel-inset bg-white">
            {layers.length === 0 && <div className="text-[10px] text-win-text px-1 py-[2px]">— no layers —</div>}
            {layers.map((l) => (
              <div key={l.id} className="flex items-center gap-1 px-1 text-[11px]">
                <input type="checkbox" checked={l.enabled} onChange={(e) => { l.enabled = e.target.checked; sculptStore.set({}); }} />
                <span className="flex-1">{l.name}</span>
                <button className="text-[10px]" onClick={() => sculptStore.removeLayer(st.targetId!, l.id)}>✕</button>
              </div>
            ))}
          </div>
        </GroupBox>

        <GroupBox title="Remesh / Decimate">
          <Row label="Edge Target"><Spinner value={remeshEdge} onChange={setRemeshEdge} min={0.01} max={5} step={0.01} /></Row>
          <div className="flex gap-1 mb-1">
            <R3Button onClick={doRemesh}>Uniform Remesh</R3Button>
          </div>
          <Row label="Decimate %"><Spinner value={decRatio} onChange={setDecRatio} min={0.05} max={1} step={0.05} /></Row>
          <div className="flex gap-1">
            <R3Button onClick={doDecimate}>Decimate</R3Button>
          </div>
        </GroupBox>

        <div className="text-[10px] text-win-text opacity-70 mt-1">
          Tip: enter Sculpt, then click-drag on the mesh in any viewport. Hold Alt to orbit.
        </div>
      </div>
    </R3Dialog>
  );
};
