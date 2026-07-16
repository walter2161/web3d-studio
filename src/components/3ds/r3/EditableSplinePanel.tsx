/**
 * EditableSplinePanel — Modify-panel UI for `editable_spline` objects.
 *
 * Rebuilds the 3ds Max R3 Editable Spline rollouts:
 *   Selection (sub-object buttons + status),
 *   Vertex Type,
 *   Geometry (Break, Refine, Weld, Delete, Close/Open, Reverse),
 *   Rendering + Interpolation (reuse existing spinners).
 *
 * All ops go through `onUpdate` which patches `object.geometry.editableSpline`
 * with the serialized snapshot. Object3D rebuilds the tube on every change.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { MaxRollout, MaxSpinner, MaxCheck } from './MaxParamPanel';
import { EditableSpline, KnotType, SplineSubLevel } from '../editable/EditableSpline';
import {
  getSplineSel, setSplineSel, subscribeSplineSel, SplineSelState,
} from '../editable/splineSelStore';

interface Props {
  object: any;
  onUpdate: (patch: any) => void;
}

const SUBSCRIBE = (cb: () => void) => subscribeSplineSel(cb);
function useSplineSel(objectId: string): SplineSelState {
  return useSyncExternalStore(SUBSCRIBE, () => getSplineSel(objectId), () => getSplineSel(objectId));
}

export const EditableSplinePanel = ({ object, onUpdate }: Props) => {
  const geom = object.geometry || {};
  const es = EditableSpline.deserialize(geom.editableSpline);
  const sel = useSplineSel(object.id);
  const level: SplineSubLevel | null = sel.level;

  // Commit the current EditableSpline back to storage.
  const commit = (mut: (es: EditableSpline) => void) => {
    mut(es);
    onUpdate({ editableSpline: es.serialize() });
  };

  const setLevel = (l: SplineSubLevel | null) => {
    setSplineSel(object.id, { level: l, knots: new Set(), segments: new Set(), splines: new Set() });
  };

  // --- Selection ---------------------------------------------------------
  const totalKnots = es.knots.size;
  const anyClosed = Array.from(es.splines.values()).some((s) => s.closed);
  const selectedKnotIds = Array.from(sel.knots);
  const selectedSegIds = Array.from(sel.segments);
  const selectedSplineIds = Array.from(sel.splines);

  // --- Handlers ----------------------------------------------------------
  const applyVertexType = (t: KnotType) => {
    if (!selectedKnotIds.length) return;
    commit((s) => selectedKnotIds.forEach((id) => s.setKnotType(id, t)));
  };
  const deleteKnots = () => {
    if (!selectedKnotIds.length) return;
    commit((s) => selectedKnotIds.forEach((id) => s.deleteKnot(id)));
    setSplineSel(object.id, { knots: new Set() });
  };
  const breakKnots = () => {
    if (!selectedKnotIds.length) return;
    commit((s) => selectedKnotIds.forEach((id) => s.breakAtKnot(id)));
  };
  const weld = (thr: number) => commit((s) => s.weld(thr));
  const refineSelected = () => {
    if (!selectedSegIds.length) return;
    commit((s) => selectedSegIds.forEach((id) => s.refineSegment(id, 0.5)));
  };
  const closeOpenSplines = () => {
    const ids = selectedSplineIds.length ? selectedSplineIds : Array.from(es.splines.keys());
    commit((s) => ids.forEach((sid) => {
      const sp = s.splines.get(sid); if (!sp) return;
      s.setClosed(sid, !sp.closed);
    }));
  };
  const reverseSplines = () => {
    const ids = selectedSplineIds.length ? selectedSplineIds : Array.from(es.splines.keys());
    commit((s) => ids.forEach((sid) => s.reverseSpline(sid)));
  };

  const [weldThr, setWeldThr] = useState(0.02);

  // On unmount / object change, clear the sub-level so the overlay stops drawing.
  useEffect(() => () => setSplineSel(object.id, { level: null }), [object.id]);

  const Btn = ({ label, active, onClick, disabled }: any) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2 h-[20px] text-[11px] border border-panel-border rounded-[2px] ${active ? 'bg-primary/40 text-foreground' : 'bg-panel/50 hover:bg-panel/80'} disabled:opacity-40`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-1 mt-4">
      <MaxRollout title="Selection">
        <div className="flex gap-1">
          <Btn label="• Vertex"  active={level === 'sknot'}    onClick={() => setLevel(level === 'sknot'    ? null : 'sknot')} />
          <Btn label="— Segment" active={level === 'ssegment'} onClick={() => setLevel(level === 'ssegment' ? null : 'ssegment')} />
          <Btn label="~ Spline"  active={level === 'sspline'}  onClick={() => setLevel(level === 'sspline'  ? null : 'sspline')} />
        </div>
        <div className="text-[11px] font-mono pt-2 space-y-[2px]">
          <div>Vertices: <span className="text-foreground">{totalKnots}</span></div>
          <div>Closed: <span className="text-foreground">{anyClosed ? 'Yes' : 'No'}</span></div>
          <div>Selected: {level === 'sknot' ? `${selectedKnotIds.length} vertex` : level === 'ssegment' ? `${selectedSegIds.length} segment` : level === 'sspline' ? `${selectedSplineIds.length} spline` : '—'}</div>
        </div>
        <div className="text-[10px] text-muted-foreground pt-1 font-sans leading-snug">
          Edit vertices in sub-object mode. Vertex type (Corner / Smooth / Bezier / Bezier Corner) is set per-knot.
        </div>
      </MaxRollout>

      {level === 'sknot' && (
        <MaxRollout title="Vertex Type">
          <div className="grid grid-cols-2 gap-1">
            <Btn label="Corner"        onClick={() => applyVertexType('corner')}      disabled={!selectedKnotIds.length} />
            <Btn label="Smooth"        onClick={() => applyVertexType('smooth')}      disabled={!selectedKnotIds.length} />
            <Btn label="Bezier"        onClick={() => applyVertexType('bezier')}      disabled={!selectedKnotIds.length} />
            <Btn label="Bezier Corner" onClick={() => applyVertexType('bezierCorner')} disabled={!selectedKnotIds.length} />
          </div>
        </MaxRollout>
      )}

      <MaxRollout title="Geometry">
        <div className="grid grid-cols-2 gap-1">
          <Btn label="Break"       onClick={breakKnots}       disabled={level !== 'sknot' || !selectedKnotIds.length} />
          <Btn label="Delete"      onClick={deleteKnots}      disabled={level !== 'sknot' || !selectedKnotIds.length} />
          <Btn label="Refine"      onClick={refineSelected}   disabled={level !== 'ssegment' || !selectedSegIds.length} />
          <Btn label="Weld"        onClick={() => weld(weldThr)} />
          <Btn label="Close/Open"  onClick={closeOpenSplines} />
          <Btn label="Reverse"     onClick={reverseSplines} />
        </div>
        <MaxSpinner label="Weld Thr" value={weldThr} step={0.01} min={0.001} onChange={setWeldThr} />
      </MaxRollout>

      <MaxRollout title="Rendering">
        <MaxCheck label="Enable In Viewport" checked={!!es.render.renderableViewport} onChange={(v) => commit((s) => { s.render.renderableViewport = v; })} />
        <MaxCheck label="Enable In Renderer" checked={!!es.render.renderableRender}   onChange={(v) => commit((s) => { s.render.renderableRender = v; })} />
        <MaxCheck label="Rectangular"        checked={!!es.render.renderRectangular}  onChange={(v) => commit((s) => { s.render.renderRectangular = v; })} />
        <MaxSpinner label="Thickness" value={es.render.thickness} step={0.005} min={0.001} onChange={(v) => commit((s) => { s.render.thickness = v; })} />
        <MaxSpinner label="Sides"     value={es.render.sides}     step={1}   min={3}    isInt onChange={(v) => commit((s) => { s.render.sides = v; })} />
      </MaxRollout>
      <MaxRollout title="Interpolation">
        <MaxSpinner label="Steps"     value={es.render.interpolationSteps} step={1} min={1} isInt onChange={(v) => commit((s) => { s.render.interpolationSteps = v; })} />
        <MaxCheck   label="Adaptive"  checked={!!es.render.adaptive} onChange={(v) => commit((s) => { s.render.adaptive = v; })} />
        <MaxCheck   label="Optimize"  checked={!!es.render.optimize} onChange={(v) => commit((s) => { s.render.optimize = v; })} />
      </MaxRollout>
    </div>
  );
};
