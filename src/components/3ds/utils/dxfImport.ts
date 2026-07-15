// DXF import — parses AutoCAD DXF text files into wall paths.
//
// Strategy:
//   - LWPOLYLINE and POLYLINE with more than one vertex → one Wall each.
//   - LINE segments are grouped into "wall chains" by merging endpoints that
//     share the same location (within a small epsilon). Each chain becomes a
//     Wall. Isolated LINEs become 2-vertex walls.
//   - CIRCLE / ARC / SPLINE and hatches / text are ignored (Fase 2 scope).
//
// DWG is a proprietary binary format from Autodesk and cannot be parsed
// in-browser without a heavyweight converter; the caller shows a message
// asking the user to convert to DXF via any free tool (e.g. ODA Converter,
// LibreCAD, or Autodesk's own online converter).

import DxfParser from 'dxf-parser';

export interface DxfWallSpec {
  // Local vertices centered on the wall's centroid; the wall's world
  // position is stored separately so multiple walls can share a scene origin.
  path: [number, number, number][];
  position: [number, number, number];
  closed: boolean;
  layer?: string;
}

export interface DxfImportResult {
  walls: DxfWallSpec[];
  ignoredEntities: Record<string, number>;
  units: 'unknown' | 'mm' | 'cm' | 'm' | 'in' | 'ft';
  scale: number;   // scale applied to convert to metres
  bounds: { min: [number, number]; max: [number, number] };
}

// AutoCAD $INSUNITS codes → metric scale factor to metres.
const INSUNITS_TO_METERS: Record<number, { name: DxfImportResult['units']; scale: number }> = {
  0: { name: 'unknown', scale: 1 },
  1: { name: 'in', scale: 0.0254 },
  2: { name: 'ft', scale: 0.3048 },
  4: { name: 'mm', scale: 0.001 },
  5: { name: 'cm', scale: 0.01 },
  6: { name: 'm',  scale: 1 },
};

function centroidOf(pts: [number, number][]): [number, number] {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  return [cx / pts.length, cy / pts.length];
}

function isDxf(name: string): boolean {
  return name.toLowerCase().endsWith('.dxf');
}
function isDwg(name: string): boolean {
  return name.toLowerCase().endsWith('.dwg');
}

export function isCadFile(name: string): boolean {
  return isDxf(name) || isDwg(name);
}

/**
 * Merge LINE segments that share endpoints into continuous polylines. Runs a
 * simple union-find on grid-bucketed endpoints so we don't need pairwise
 * O(n²) comparisons for large DXFs.
 */
function chainLines(lines: Array<{ a: [number, number]; b: [number, number]; layer?: string }>, eps: number): Array<{ pts: [number, number][]; closed: boolean; layer?: string }> {
  if (lines.length === 0) return [];
  const bucket = (p: [number, number]) => `${Math.round(p[0] / eps)}:${Math.round(p[1] / eps)}`;

  // Build adjacency: for each endpoint bucket, list (lineIndex, side) pairs.
  const adj = new Map<string, Array<{ i: number; side: 'a' | 'b' }>>();
  lines.forEach((ln, i) => {
    for (const side of ['a', 'b'] as const) {
      const key = bucket(ln[side]);
      if (!adj.has(key)) adj.set(key, []);
      adj.get(key)!.push({ i, side });
    }
  });

  const visited = new Array<boolean>(lines.length).fill(false);
  const chains: Array<{ pts: [number, number][]; closed: boolean; layer?: string }> = [];

  for (let start = 0; start < lines.length; start++) {
    if (visited[start]) continue;
    visited[start] = true;
    let pts: [number, number][] = [lines[start].a, lines[start].b];
    const layer = lines[start].layer;

    // Extend forward (from current tail)
    for (;;) {
      const tail = pts[pts.length - 1];
      const key = bucket(tail);
      const neigh = (adj.get(key) || []).find(({ i }) => i !== start && !visited[i]);
      if (!neigh) break;
      visited[neigh.i] = true;
      const ln = lines[neigh.i];
      const other = neigh.side === 'a' ? ln.b : ln.a;
      pts.push(other);
    }
    // Extend backward (from current head)
    for (;;) {
      const head = pts[0];
      const key = bucket(head);
      const neigh = (adj.get(key) || []).find(({ i }) => !visited[i]);
      if (!neigh) break;
      visited[neigh.i] = true;
      const ln = lines[neigh.i];
      const other = neigh.side === 'a' ? ln.b : ln.a;
      pts.unshift(other);
    }

    // Detect closed loops
    const first = pts[0], last = pts[pts.length - 1];
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < eps && pts.length >= 3;
    if (closed) pts = pts.slice(0, -1);

    chains.push({ pts, closed, layer });
  }
  return chains;
}

export async function parseDxfFile(file: File): Promise<DxfImportResult> {
  const text = await file.text();
  const parser = new DxfParser();
  const dxf: any = parser.parseSync(text);
  if (!dxf) throw new Error('Could not parse DXF file');

  const insunits = (dxf.header && dxf.header.$INSUNITS) || 0;
  const unitInfo = INSUNITS_TO_METERS[insunits] || INSUNITS_TO_METERS[0];
  const scale = unitInfo.scale;

  const rawLines: Array<{ a: [number, number]; b: [number, number]; layer?: string }> = [];
  const polylines: Array<{ pts: [number, number][]; closed: boolean; layer?: string }> = [];
  const ignored: Record<string, number> = {};

  for (const ent of (dxf.entities || [])) {
    const t = ent.type;
    const layer = ent.layer;
    if (t === 'LINE') {
      const a: [number, number] = [ent.vertices[0].x * scale, ent.vertices[0].y * scale];
      const b: [number, number] = [ent.vertices[1].x * scale, ent.vertices[1].y * scale];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-4) rawLines.push({ a, b, layer });
    } else if (t === 'LWPOLYLINE' || t === 'POLYLINE') {
      const verts = (ent.vertices || []).map((v: any) => [v.x * scale, v.y * scale] as [number, number]);
      if (verts.length >= 2) polylines.push({ pts: verts, closed: !!(ent.shape || ent.closed), layer });
    } else {
      ignored[t] = (ignored[t] || 0) + 1;
    }
  }

  // Chain isolated LINE segments so an autocad wall drawn as segments becomes
  // one continuous wall instead of dozens of two-vertex walls.
  const eps = 0.005; // 5 mm tolerance for endpoint matching
  const chained = chainLines(rawLines, eps);
  const allChains = [...polylines, ...chained].filter((c) => c.pts.length >= 2);

  // Bounds (for the toast)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walls: DxfWallSpec[] = allChains.map((c) => {
    const [cx, cy] = centroidOf(c.pts);
    const local: [number, number, number][] = c.pts.map(([x, y]) => [x - cx, 0, y - cy]);
    for (const [x, y] of c.pts) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    return {
      path: local,
      position: [cx, 0, cy],
      closed: c.closed,
      layer: c.layer,
    };
  });

  return {
    walls,
    ignoredEntities: ignored,
    units: unitInfo.name,
    scale,
    bounds: {
      min: [Number.isFinite(minX) ? minX : 0, Number.isFinite(minY) ? minY : 0],
      max: [Number.isFinite(maxX) ? maxX : 0, Number.isFinite(maxY) ? maxY : 0],
    },
  };
}
