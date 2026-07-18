/**
 * WaltSculpt viewport controller. When sculpt mode is active, intercepts
 * pointer events on all registered viewport canvases, raycasts against the
 * target mesh, and applies the current brush every mousemove frame.
 *
 * Disables OrbitControls during drag so panning/orbiting doesn't fight the
 * brush stroke. Right-click / ALT still allows rotate to preserve navigation.
 */
import { useEffect, useSyncExternalStore, useRef } from 'react';
import * as THREE from 'three';
import { sculptStore } from './sculptStore';
import { applyBrushSymmetric } from './brushes';
import { getAllViewportHandles } from '../r3/viewportRegistry';

export const WaltSculptController = () => {
  const state = useSyncExternalStore(sculptStore.subscribe, sculptStore.getState);
  const strokingRef = useRef(false);
  const lastLocalRef = useRef<THREE.Vector3 | null>(null);

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
        if (!strokingRef.current) return;
        doStroke(canvas, h.camera, h.scene, ev);
        ev.stopPropagation();
      };
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
      canvas.style.cursor = 'crosshair';
      cleanups.push(() => {
        canvas.removeEventListener('pointerdown', onDown, true);
        canvas.removeEventListener('pointermove', onMove, true);
        canvas.removeEventListener('pointerup', onUp, true);
        canvas.removeEventListener('pointercancel', onUp, true);
        canvas.style.cursor = '';
        if (h.controls) h.controls.enabled = true;
      });
    }
    return () => { cleanups.forEach((c) => c()); };
  }, [state.active, state.targetId, state.brush, state.radius, state.strength,
      state.falloff, state.invert, state.symmetry, state.masks]);

  return null;
};
