/**
 * WaltSculpt viewport controller. When sculpt mode is active, intercepts
 * pointer events on all registered viewport canvases, raycasts against the
 * target mesh, and applies the current brush every mousemove frame.
 *
 * Also renders a screen-space brush cursor (radius circle) so the user sees
 * the brush footprint over the mesh.
 */
import { useEffect, useSyncExternalStore, useRef, useState } from 'react';
import * as THREE from 'three';
import { sculptStore } from './sculptStore';
import { applyBrushSymmetric } from './brushes';
import { getAllViewportHandles } from '../r3/viewportRegistry';

export const WaltSculptController = () => {
  const state = useSyncExternalStore(sculptStore.subscribe, sculptStore.getState);
  const strokingRef = useRef(false);
  const lastLocalRef = useRef<THREE.Vector3 | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; r: number; visible: boolean } | null>(null);

  useEffect(() => {
    if (!state.active || !state.targetId) return;
    const handles = getAllViewportHandles();
    if (!handles.length) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const findMesh = (scene: THREE.Scene): THREE.Mesh | null => {
      let out: THREE.Mesh | null = null;
      scene.traverse((o) => {
        if (out) return;
        if ((o as any).userData?.objectId === state.targetId && (o as THREE.Mesh).isMesh) {
          out = o as THREE.Mesh;
        }
      });
      if (!out) {
        // fallback: any mesh whose ancestor has that id
        scene.traverse((o) => {
          if (out) return;
          if ((o as THREE.Mesh).isMesh) {
            let p: any = o;
            while (p) {
              if (p.userData?.objectId === state.targetId) { out = o as THREE.Mesh; break; }
              p = p.parent;
            }
          }
        });
      }
      return out;
    };

    const doStroke = (canvas: HTMLCanvasElement, camera: THREE.Camera, scene: THREE.Scene, ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const mesh = findMesh(scene);
      if (!mesh) return;
      const hits = raycaster.intersectObject(mesh, false);
      if (!hits.length) { lastLocalRef.current = null; return; }
      const hit = hits[0];
      const hitLocal = mesh.worldToLocal(hit.point.clone());
      // normal in local space
      const nLocal = hit.face
        ? hit.face.normal.clone()
        : new THREE.Vector3(0, 1, 0);
      // radius in local space (approximate by inverse scale)
      const invScale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
      const localRadius = state.radius / Math.max(0.001, (invScale.x + invScale.y + invScale.z) / 3);

      const posAttr = (mesh.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const mask = state.brush === 'mask'
        ? sculptStore.ensureMask(state.targetId!, posAttr.count)
        : (state.masks.get(state.targetId!) ?? null);

      let dir: THREE.Vector3 | undefined;
      if (state.brush === 'move' && lastLocalRef.current) {
        dir = hitLocal.clone().sub(lastLocalRef.current);
      }
      applyBrushSymmetric(mesh, {
        brush: state.brush,
        hit: hitLocal,
        normal: nLocal,
        dir,
        radius: localRadius,
        strength: state.strength * 0.5,
        falloff: state.falloff,
        invert: state.invert,
        mask,
      }, state.symmetry);
      lastLocalRef.current = hitLocal;
    };

    const cleanups: Array<() => void> = [];
    for (const h of handles) {
      const canvas = h.gl.domElement as HTMLCanvasElement;
      const onDown = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        if (ev.altKey) return; // preserve navigation
        strokingRef.current = true;
        lastLocalRef.current = null;
        if (h.controls) h.controls.enabled = false;
        canvas.setPointerCapture(ev.pointerId);
        doStroke(canvas, h.camera, h.scene, ev);
        ev.stopPropagation();
        ev.preventDefault();
      };
      const onMove = (ev: PointerEvent) => {
        // Update cursor overlay: project brush radius to screen pixels.
        const rect = canvas.getBoundingClientRect();
        // Raycast to find hover point and screen radius
        const mouse = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const rc = new THREE.Raycaster();
        rc.setFromCamera(mouse, h.camera);
        const mesh = findMesh(h.scene);
        let screenR = state.radius * 40;
        let visible = false;
        if (mesh) {
          const hits = rc.intersectObject(mesh, false);
          if (hits.length) {
            visible = true;
            // Project a point at hit + radius offset in camera-right direction
            const cam = h.camera as THREE.Camera;
            const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
            const p1 = hits[0].point.clone();
            const p2 = p1.clone().add(right.multiplyScalar(state.radius));
            const s1 = p1.clone().project(cam);
            const s2 = p2.clone().project(cam);
            screenR = Math.abs((s2.x - s1.x)) * rect.width * 0.5;
          }
        }
        setCursor({
          x: ev.clientX,
          y: ev.clientY,
          r: screenR,
          visible,
        });
        if (!strokingRef.current) return;
        doStroke(canvas, h.camera, h.scene, ev);
        ev.stopPropagation();
      };
      const onLeave = () => setCursor(null);
      const onUp = (ev: PointerEvent) => {
        if (!strokingRef.current) return;
        strokingRef.current = false;
        lastLocalRef.current = null;
        if (h.controls) h.controls.enabled = true;
        try { canvas.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      };
      canvas.addEventListener('pointerdown', onDown, true);
      canvas.addEventListener('pointermove', onMove, true);
      canvas.addEventListener('pointerup', onUp, true);
      canvas.addEventListener('pointercancel', onUp, true);
      canvas.addEventListener('pointerleave', onLeave, true);
      canvas.style.cursor = 'crosshair';
      cleanups.push(() => {
        canvas.removeEventListener('pointerdown', onDown, true);
        canvas.removeEventListener('pointermove', onMove, true);
        canvas.removeEventListener('pointerup', onUp, true);
        canvas.removeEventListener('pointercancel', onUp, true);
        canvas.removeEventListener('pointerleave', onLeave, true);
        canvas.style.cursor = '';
        if (h.controls) h.controls.enabled = true;
      });
    }
    return () => { cleanups.forEach((c) => c()); };
  }, [state.active, state.targetId, state.brush, state.radius, state.strength,
      state.falloff, state.invert, state.symmetry, state.masks]);

  if (!state.active || !cursor) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: cursor.x - cursor.r,
        top: cursor.y - cursor.r,
        width: cursor.r * 2,
        height: cursor.r * 2,
        borderRadius: '50%',
        border: `2px solid ${state.brush === 'mask' ? '#ff4444' : (state.invert ? '#44aaff' : '#ffdd00')}`,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.7) inset',
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: cursor.visible ? 1 : 0.4,
      }}
    />
  );
};
