import { R3Dialog, GroupBox, Spinner, R3Button, Row } from './R3Dialog';
import { useState, useEffect } from 'react';

export interface ObjectProperties {
  renderable?: boolean;
  castShadows?: boolean;
  receiveShadows?: boolean;
  motionBlur?: 'none' | 'object' | 'image';
  motionBlurMultiplier?: number;
  visibility?: number;             // 0..1
  vertexTicks?: boolean;
  displayAsBox?: boolean;
  backfaceCull?: boolean;
  edgesOnly?: boolean;
  wireframeColor?: string;
  gBufferId?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object?: { id: string; name?: string; color: string; properties?: ObjectProperties } | null;
  onSave: (id: string, updates: { name?: string; color?: string; properties: ObjectProperties }) => void;
}

const DEFAULTS: Required<ObjectProperties> = {
  renderable: true,
  castShadows: true,
  receiveShadows: true,
  motionBlur: 'none',
  motionBlurMultiplier: 1,
  visibility: 1,
  vertexTicks: false,
  displayAsBox: false,
  backfaceCull: false,
  edgesOnly: false,
  wireframeColor: '#00bfff',
  gBufferId: 0,
};

export const ObjectPropertiesDialog = ({ open, onOpenChange, object, onSave }: Props) => {
  const [name, setName] = useState('');
  const [objColor, setObjColor] = useState('#3b82f6');
  const [wireColor, setWireColor] = useState('#00bfff');
  const [props, setProps] = useState<Required<ObjectProperties>>(DEFAULTS);

  useEffect(() => {
    if (object) {
      setName(object.name || object.id);
      setObjColor(object.color || '#3b82f6');
      const p = { ...DEFAULTS, ...(object.properties || {}) };
      setProps(p);
      setWireColor(p.wireframeColor);
    }
  }, [object]);


  if (!object) return null;
  const set = <K extends keyof ObjectProperties>(k: K, v: ObjectProperties[K]) =>
    setProps((p) => ({ ...p, [k]: v as any }));

  const commit = () => {
    onSave(object.id, { name, color: objColor, properties: { ...props, wireframeColor: wireColor } });
    onOpenChange(false);
  };


  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Object Properties" width={480}>
      <div className="space-y-2">
        <GroupBox title="Object Information">
          <Row label="Name:" labelWidth={80}>
            <input value={name} onChange={(e) => setName(e.target.value)} className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]" style={{ width: 240 }} />
          </Row>
          <Row label="Dimensions:" labelWidth={80}>
            <span className="text-[11px]">X: — Y: — Z: —</span>
          </Row>
          <Row label="Vertices:" labelWidth={80}><span className="text-[11px]">—</span></Row>
          <Row label="Faces:" labelWidth={80}><span className="text-[11px]">—</span></Row>
          <Row label="Parent:" labelWidth={80}><span className="text-[11px]">Scene Root</span></Row>
          <Row label="Object Color:" labelWidth={80}>
            <label className="bevel-inset cursor-pointer inline-block" style={{ width: 40, height: 16 }} title="Click to change object color">
              <span className="block w-full h-full" style={{ background: objColor }} />
              <input type="color" value={objColor} onChange={(e) => setObjColor(e.target.value)} className="hidden" />
            </label>
            <span className="text-[11px] ml-2">{objColor}</span>
          </Row>

          <Row label="Layer:" labelWidth={80}><span className="text-[11px]">0 (default)</span></Row>
        </GroupBox>

        <div className="grid grid-cols-2 gap-2">
          <GroupBox title="Rendering Control">
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.renderable} onChange={(e) => set('renderable', e.target.checked)} />Renderable</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.castShadows} onChange={(e) => set('castShadows', e.target.checked)} />Cast Shadows</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.receiveShadows} onChange={(e) => set('receiveShadows', e.target.checked)} />Receive Shadows</label>
            <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />Inherit Visibility</label>
            <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />Visible to Camera</label>
            <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />Visible to Reflection/Refraction</label>
            <Row label="Visibility:" labelWidth={70}>
              <Spinner value={props.visibility} onChange={(v) => set('visibility', Math.max(0, Math.min(1, v)))} step={0.05} min={0} max={1} width={56} />
            </Row>
            <Row label="G-Buffer ID:" labelWidth={80}>
              <Spinner value={props.gBufferId} onChange={(v) => set('gBufferId', Math.max(0, Math.floor(v)))} min={0} width={44} />
            </Row>
          </GroupBox>

          <GroupBox title="Display Properties">
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.displayAsBox} onChange={(e) => set('displayAsBox', e.target.checked)} />Display as Box</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.backfaceCull} onChange={(e) => set('backfaceCull', e.target.checked)} />Backface Cull</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.edgesOnly} onChange={(e) => set('edgesOnly', e.target.checked)} />Edges Only</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={props.vertexTicks} onChange={(e) => set('vertexTicks', e.target.checked)} />Vertex Ticks</label>
            <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />See-Through</label>
            <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />Trajectory</label>
            <Row label="Wire Color:" labelWidth={80}>
              <label className="bevel-inset cursor-pointer inline-block" style={{ width: 40, height: 16 }}>
                <span className="block w-full h-full" style={{ background: wireColor }} />
                <input type="color" value={wireColor} onChange={(e) => setWireColor(e.target.value)} className="hidden" />
              </label>
            </Row>
          </GroupBox>
        </div>

        <GroupBox title="Motion Blur">
          <div className="flex gap-3">
            <label className="flex items-center gap-1"><input type="radio" checked={props.motionBlur === 'none'} onChange={() => set('motionBlur', 'none')} />None</label>
            <label className="flex items-center gap-1"><input type="radio" checked={props.motionBlur === 'object'} onChange={() => set('motionBlur', 'object')} />Object</label>
            <label className="flex items-center gap-1"><input type="radio" checked={props.motionBlur === 'image'} onChange={() => set('motionBlur', 'image')} />Image</label>
            <Row label="Multiplier:" labelWidth={70}>
              <Spinner value={props.motionBlurMultiplier} onChange={(v) => set('motionBlurMultiplier', v)} step={0.1} width={56} />
            </Row>
          </div>
        </GroupBox>
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={commit}>OK</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
