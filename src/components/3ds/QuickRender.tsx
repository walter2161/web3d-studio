import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { getViewportHandle } from './r3/viewportRegistry';

interface QuickRenderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Production" render:
 * - Uses the perspective viewport's three.js scene/camera
 * - Hides all viewport helpers (grid, gizmo, transform controls, selection outlines)
 * - Renders offscreen at 2× at ACES filmic tone mapping + sRGB output
 * - No caustics / no fake reflections — a clean shaded pass
 * Result is drawn back into the dialog as a PNG image.
 */
const doOfflineRender = async (): Promise<string | null> => {
  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) return null;
  const { gl, scene, camera } = handle;

  // Offscreen renderer for pristine output (viewport pixels stay untouched).
  const canvasEl = gl.domElement;
  const w = canvasEl.clientWidth || canvasEl.width;
  const h = canvasEl.clientHeight || canvasEl.height;
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const outW = Math.max(1, Math.floor(w * scale));
  const outH = Math.max(1, Math.floor(h * scale));

  const offscreen = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  offscreen.setPixelRatio(1);
  offscreen.setSize(outW, outH, false);
  offscreen.toneMapping = THREE.ACESFilmicToneMapping;
  offscreen.toneMappingExposure = 1.0;
  offscreen.outputColorSpace = THREE.SRGBColorSpace;
  offscreen.shadowMap.enabled = true;
  offscreen.shadowMap.type = THREE.PCFSoftShadowMap;

  // Match the on-screen clear color / background
  const bg = scene.background instanceof THREE.Color ? scene.background : null;
  if (bg) offscreen.setClearColor(bg);

  // Hide viewport helpers: grid, gizmo, transform controls, selection wires.
  const hidden: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    const ud = obj.userData || {};
    const t = obj.type || '';
    const isHelperType =
      t === 'GridHelper' || t === 'AxesHelper' || t === 'BoxHelper' ||
      t === 'CameraHelper' || t === 'DirectionalLightHelper' || t === 'PointLightHelper' ||
      t === 'SpotLightHelper' || t === 'PolarGridHelper' || t === 'HemisphereLightHelper' ||
      t.endsWith('Helper');
    const isTransformCtrl = t === 'TransformControls' || (obj as any).isTransformControls;
    if (ud.__helper || ud.__selectionWire || isHelperType || isTransformCtrl) {
      if (obj.visible) {
        hidden.push(obj);
        obj.visible = false;
      }
    }
  });

  // Cast/receive shadows on real meshes so the offline pass looks polished.
  const meshTouched: { mesh: THREE.Mesh; cast: boolean; receive: boolean }[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      meshTouched.push({ mesh: m, cast: m.castShadow, receive: m.receiveShadow });
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  // Enable shadow casting on directional lights temporarily.
  const lightTouched: { light: THREE.Light; cast: boolean }[] = [];
  scene.traverse((obj) => {
    const l = obj as THREE.DirectionalLight;
    if ((l as any).isDirectionalLight || (l as any).isSpotLight || (l as any).isPointLight) {
      lightTouched.push({ light: l, cast: l.castShadow });
      l.castShadow = true;
      const dl = l as THREE.DirectionalLight;
      if (dl.shadow) {
        dl.shadow.mapSize.set(1024, 1024);
        dl.shadow.bias = -0.0005;
      }
    }
  });

  // Render
  offscreen.render(scene, camera);
  const dataUrl = offscreen.domElement.toDataURL('image/png');

  // Restore everything
  hidden.forEach((o) => { o.visible = true; });
  meshTouched.forEach(({ mesh, cast, receive }) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
  lightTouched.forEach(({ light, cast }) => { light.castShadow = cast; });
  offscreen.dispose();

  return dataUrl;
};

export const QuickRender = ({ open, onOpenChange }: QuickRenderProps) => {
  const [image, setImage] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const render = async () => {
    setRendering(true);
    try {
      // Wait a frame so the viewport is up to date before capturing.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const url = await doOfflineRender();
      setImage(url);
    } finally {
      setRendering(false);
    }
  };

  useEffect(() => {
    if (open) render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image;
    a.download = `render-${Date.now()}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-panel border-panel-border">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Rendered Frame Window</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={render} disabled={rendering}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${rendering ? 'animate-spin' : ''}`} />
                Render
              </Button>
              <Button size="sm" variant="outline" onClick={download} disabled={!image}>
                <Download className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="bg-black rounded border border-panel-border overflow-hidden flex items-center justify-center min-h-[400px]">
          {image ? (
            <img src={image} alt="Rendered viewport" className="max-w-full max-h-[70vh]" />
          ) : (
            <span className="text-muted-foreground text-sm">Rendering...</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
