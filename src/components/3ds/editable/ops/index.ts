/**
 * Op registry for Edit Poly / Edit Mesh. Each op is a pure function that
 * takes an EditableMesh + current selection + params, and returns the
 * updated mesh + selection. Ops record themselves in the modifier's
 * `ops[]` so the stack stays non-destructive.
 *
 * Phase 1: only stubs are wired here so the UI can dispatch without
 * runtime errors. Real geometry work lands in Phase 2/3.
 */
import { EditableMesh } from '../EditableMesh';
import { Selection, selectionToVertexIds } from '../selection';
import * as THREE from 'three';

export type OpKind =
  | 'move' | 'rotate' | 'scale'
  | 'delete' | 'detach' | 'attach'
  | 'weld' | 'break' | 'chamfer'
  | 'extrude' | 'bevel' | 'inset' | 'outline' | 'bridge' | 'flip'
  | 'tessellate' | 'msmooth' | 'divide' | 'slice' | 'cut'
  | 'hide' | 'unhide' | 'hideUnselected'
  | 'setMaterialId' | 'selectByMaterialId'
  | 'autoSmooth' | 'clearSmoothing' | 'setSmoothingGroup';

export interface OpRecord {
  kind: OpKind;
  params?: any;
  /** Snapshot of selection ids the op was applied to. */
  selection?: { level: Selection['level']; ids: number[] };
}

export interface OpResult {
  mesh: EditableMesh;
  selection: Selection;
}

/**
 * Apply an op. Phase 1 implements only the safe/simple ones; the rest are
 * marked TODO and returned unchanged so the UI can be wired without breaking.
 */
export function applyOp(mesh: EditableMesh, sel: Selection, op: OpRecord): OpResult {
  const out = mesh.clone();
  switch (op.kind) {
    case 'flip': {
      sel.ids.forEach((fid) => {
        const f = out.faces.get(fid as number);
        if (f) f.verts.reverse();
      });
      return { mesh: out, selection: sel };
    }
    case 'hide': {
      if (sel.level === 'vertex') sel.ids.forEach((id) => { const v = out.vertices.get(id as number); if (v) v.hidden = true; });
      else if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element')
        sel.ids.forEach((id) => { const f = out.faces.get(id as number); if (f) f.hidden = true; });
      return { mesh: out, selection: sel };
    }
    case 'unhide': {
      out.vertices.forEach((v) => { v.hidden = false; });
      out.faces.forEach((f) => { f.hidden = false; });
      return { mesh: out, selection: sel };
    }
    case 'hideUnselected': {
      if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
        out.faces.forEach((f) => { f.hidden = !sel.ids.has(f.id); });
      }
      return { mesh: out, selection: sel };
    }
    case 'delete': {
      if (sel.level === 'face' || sel.level === 'polygon' || sel.level === 'element') {
        sel.ids.forEach((fid) => out.faces.delete(fid as number));
      } else if (sel.level === 'vertex') {
        const vids = new Set(sel.ids);
        out.faces.forEach((f) => { if (f.verts.some((v) => vids.has(v))) out.faces.delete(f.id); });
        vids.forEach((v) => out.vertices.delete(v as number));
      }
      return { mesh: out, selection: { level: sel.level, ids: new Set() } };
    }
    case 'setMaterialId': {
      const id = Math.max(1, Math.floor(op.params?.id ?? 1));
      sel.ids.forEach((fid) => { const f = out.faces.get(fid as number); if (f) f.materialId = id; });
      return { mesh: out, selection: sel };
    }
    case 'setSmoothingGroup': {
      const mask = op.params?.mask | 0;
      sel.ids.forEach((fid) => { const f = out.faces.get(fid as number); if (f) f.smoothingGroup = mask; });
      return { mesh: out, selection: sel };
    }
    case 'move': {
      const [dx, dy, dz] = op.params?.delta ?? [0, 0, 0];
      const vids = selectionToVertexIds(out, sel);
      vids.forEach((vid) => {
        const v = out.vertices.get(vid);
        if (v) v.position.add(new THREE.Vector3(dx, dy, dz));
      });
      return { mesh: out, selection: sel };
    }
    // TODO Phase 2/3: extrude, bevel, inset, outline, weld, break, chamfer,
    // tessellate, msmooth, divide, slice, cut, detach, attach, bridge,
    // autoSmooth. Each becomes a case here and gets a button in the panel.
    default:
      return { mesh: out, selection: sel };
  }
}

export function replay(base: EditableMesh, initialSel: Selection, ops: OpRecord[]): OpResult {
  let mesh = base;
  let sel = initialSel;
  for (const op of ops) {
    const r = applyOp(mesh, sel, op);
    mesh = r.mesh;
    sel = r.selection;
  }
  return { mesh, selection: sel };
}
