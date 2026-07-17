import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface LinkTarget {
  id: string;
  ref?: React.RefObject<any>;
  parentId?: string | null;
}

interface Props {
  objects: LinkTarget[];
  selectedIds: string[];
  onLink: (parentId: string) => void;
}

/**
 * 3ds Max "Select and Link" drag & drop.
 *
 * When window.__r3LinkTool === 'link' this overlay swallows pointer events on
 * the current viewport's canvas: pointer-down starts a rubber-band anchored at
 * the press point; a dotted line follows the cursor; on pointer-up we raycast
 * against every object ref, and if the drop target is a valid parent we call
 * onLink(dropTargetId). Cancels on Escape or right-click.
 */
export function LinkDragController({ objects, selectedIds, onLink }: Props) {
  const { gl, camera, scene } = useThree();
  const [drag, setDrag] = useState<{ x0: number; y0: number; x: number; y: number; hoverId: string | null } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;

  useEffect(() => {
    const dom = gl.domElement as HTMLCanvasElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const isLinkActive = () => (window as any).__r3LinkTool === 'link';

    const localFromEvent = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, r };
    };

    const pickAt = (localX: number, localY: number, r: DOMRect): string | null => {
      ndc.x = (localX / r.width) * 2 - 1;
      ndc.y = -(localY / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      // Build a target list from object refs so we ignore gizmos, overlays, etc.
      const targets: THREE.Object3D[] = [];
      const idByNode = new Map<THREE.Object3D, string>();
      for (const o of objects) {
        const n = o.ref?.current as THREE.Object3D | null | undefined;
        if (!n) continue;
        targets.push(n);
        n.traverse((c) => idByNode.set(c, o.id));
      }
      const hits = ray.intersectObjects(targets, true);
      for (const h of hits) {
        // Walk up until we find a mapped id.
        let n: THREE.Object3D | null = h.object;
        while (n) {
          const id = idByNode.get(n);
          if (id) return id;
          n = n.parent;
        }
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      if (!isLinkActive()) return;
      if (e.button !== 0) {
        (window as any).__r3LinkTool = null;
        setDrag(null);
        return;
      }
      const { x, y } = localFromEvent(e);
      e.preventDefault();
      e.stopPropagation();
      dom.setPointerCapture?.(e.pointerId);
      setDrag({ x0: x, y0: y, x, y, hoverId: null });
    };
    const onMove = (e: PointerEvent) => {
      if (!isLinkActive() || !dragRef.current) return;
      const { x, y, r } = localFromEvent(e);
      const hover = pickAt(x, y, r);
      // Reject self / descendants of the selection as valid drop targets.
      const invalid = hover && (selectedIds.includes(hover) || isDescendantOfAny(hover, selectedIds, objects));
      setDrag({ x0: dragRef.current.x0, y0: dragRef.current.y0, x, y, hoverId: invalid ? null : hover });
      dom.style.cursor = hover ? (invalid ? 'not-allowed' : 'crosshair') : 'crosshair';
    };
    const onUp = (e: PointerEvent) => {
      if (!isLinkActive()) return;
      const d = dragRef.current;
      setDrag(null);
      dom.style.cursor = '';
      try { dom.releasePointerCapture?.(e.pointerId); } catch {}
      if (d && d.hoverId) onLink(d.hoverId);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLinkActive()) {
        (window as any).__r3LinkTool = null;
        setDrag(null);
        dom.style.cursor = '';
      }
    };
    dom.addEventListener('pointerdown', onDown, true);
    dom.addEventListener('pointermove', onMove, true);
    dom.addEventListener('pointerup', onUp, true);
    dom.addEventListener('pointercancel', onUp, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      dom.removeEventListener('pointerdown', onDown, true);
      dom.removeEventListener('pointermove', onMove, true);
      dom.removeEventListener('pointerup', onUp, true);
      dom.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      dom.style.cursor = '';
    };
  }, [gl, camera, scene, objects, selectedIds, onLink]);

  if (!drag) return null;
  const dx = drag.x - drag.x0;
  const dy = drag.y - drag.y0;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <Html
      fullscreen
      transform={false}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: drag.x0,
            top: drag.y0,
            width: len,
            height: 0,
            borderTop: `2px dashed ${drag.hoverId ? '#ffee00' : '#ffffff'}`,
            transform: `rotate(${ang}deg)`,
            transformOrigin: '0 0',
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: drag.x - 6,
            top: drag.y - 6,
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: `2px solid ${drag.hoverId ? '#ffee00' : '#ffffff'}`,
            background: drag.hoverId ? 'rgba(255,238,0,0.25)' : 'transparent',
          }}
        />
        {drag.hoverId && (
          <div
            style={{
              position: 'absolute',
              left: drag.x + 12,
              top: drag.y + 12,
              font: '10px monospace',
              color: '#ffee00',
              background: 'rgba(0,0,0,0.7)',
              padding: '2px 5px',
              borderRadius: 2,
              whiteSpace: 'nowrap',
            }}
          >
            Link → {drag.hoverId.slice(0, 8)}
          </div>
        )}
      </div>
    </Html>
  );
}

function isDescendantOfAny(candidate: string, ancestors: string[], objects: LinkTarget[]): boolean {
  const byId = new Map(objects.map((o) => [o.id, o] as const));
  const set = new Set(ancestors);
  let cur: string | null | undefined = candidate;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return false;
    seen.add(cur);
    const p = byId.get(cur)?.parentId ?? null;
    if (p && set.has(p)) return true;
    cur = p;
  }
  return false;
}
