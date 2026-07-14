import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { getViewportHandle } from './r3/viewportRegistry';

interface QuickRenderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Render engines simulate the "look" of the three industry-leading engines
 * for 3ds Max. Each preset tweaks three.js tone mapping + exposure and
 * applies a CSS filter pass over the final image to emulate the engine's
 * signature response, and enriches the AI prompt with the engine's style.
 */
export type RenderEngine = 'scanline' | 'vray' | 'corona' | 'arnold';

interface EnginePreset {
  label: string;
  description: string;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  /** CSS filter applied to the <img> so the preset is visible even after render */
  cssFilter: string;
  /** Extra prompt fragment appended for Render AI */
  aiStyle: string;
}

const ENGINES: Record<RenderEngine, EnginePreset> = {
  scanline: {
    label: 'Scanline',
    description: 'Default 3ds Max Scanline renderer — flat shaded pass, no tricks.',
    toneMapping: THREE.NoToneMapping,
    exposure: 1.0,
    cssFilter: 'none',
    aiStyle: 'clean flat 3d render, neutral studio lighting, no post-processing',
  },
  vray: {
    label: 'V-Ray',
    description: 'V-Ray — physically-based, punchy contrast and rich reflections (ArchViz standard).',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.15,
    cssFilter: 'contrast(1.12) saturate(1.15) brightness(1.02)',
    aiStyle:
      'V-Ray photorealistic architectural render, physically based materials, VRaySun and VRaySky lighting, ' +
      'glossy reflections, subtle GI bounce, sharp contact shadows, ArchViz cinematic look',
  },
  corona: {
    label: 'Corona',
    description: 'Chaos Corona — unbiased path tracing, soft cinematic tones, LightMix warmth.',
    toneMapping: THREE.CineonToneMapping,
    exposure: 1.05,
    cssFilter: 'contrast(1.05) saturate(1.08) brightness(1.04) sepia(0.05)',
    aiStyle:
      'Chaos Corona unbiased path traced render, soft cinematic tone mapping, warm LightMix balance, ' +
      'creamy highlights, physically accurate soft shadows, artistic ArchViz mood',
  },
  arnold: {
    label: 'Arnold',
    description: 'Autodesk Arnold — Monte Carlo ray tracing, filmic VFX/cinema quality with deep volumes.',
    toneMapping: THREE.AgXToneMapping,
    exposure: 1.0,
    cssFilter: 'contrast(1.08) saturate(0.98) brightness(0.98)',
    aiStyle:
      'Autodesk Arnold Monte Carlo ray traced render, filmic VFX cinema quality, subsurface scattering, ' +
      'volumetric lighting, deep blacks, subtle grain, Hollywood studio VFX look',
  },
};

/**
 * "Production" render:
 * - Uses the perspective viewport's three.js scene/camera
 * - Hides all viewport helpers (grid, gizmo, transform controls, selection outlines)
 * - Renders offscreen at 2× with the selected engine's tone mapping + exposure
 * Result is drawn back into the dialog as a PNG image.
 */
const doOfflineRender = async (
  engine: RenderEngine,
): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) return null;
  const { gl, scene, camera } = handle;
  const preset = ENGINES[engine];

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
  offscreen.toneMapping = preset.toneMapping;
  offscreen.toneMappingExposure = preset.exposure;
  offscreen.outputColorSpace = THREE.SRGBColorSpace;
  offscreen.shadowMap.enabled = true;
  offscreen.shadowMap.type = THREE.PCFSoftShadowMap;

  const bg = scene.background instanceof THREE.Color ? scene.background : null;
  if (bg) offscreen.setClearColor(bg);

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

  const meshTouched: { mesh: THREE.Mesh; cast: boolean; receive: boolean }[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      meshTouched.push({ mesh: m, cast: m.castShadow, receive: m.receiveShadow });
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

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

  offscreen.render(scene, camera);
  const dataUrl = offscreen.domElement.toDataURL('image/png');

  hidden.forEach((o) => { o.visible = true; });
  meshTouched.forEach(({ mesh, cast, receive }) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
  lightTouched.forEach(({ light, cast }) => { light.castShadow = cast; });
  offscreen.dispose();

  return { dataUrl, width: outW, height: outH };
};

type Mode = 'standard' | 'ai';

export const QuickRender = ({ open, onOpenChange }: QuickRenderProps) => {
  const [image, setImage] = useState<string | null>(null);
  const [refRender, setRefRender] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [mode, setMode] = useState<Mode>('standard');
  const [engine, setEngine] = useState<RenderEngine>('vray');
  const [prompt, setPrompt] = useState('a modern building');

  const render = async (eng: RenderEngine = engine) => {
    setRendering(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const res = await doOfflineRender(eng);
      if (res) {
        setRefRender(res);
        setImage(res.dataUrl);
      }
    } finally {
      setRendering(false);
    }
  };

  // NOTE: this frontend-only app has no backend to keep the key server-side,
  // so the Pollinations key is embedded in the bundle. Rotate it in
  // enter.pollinations.ai whenever the app is published publicly.
  const POLLINATIONS_API_KEY = 'sk_Sb8MsBioP705HyKkjSTbBdMbf0lhOM2E';

  const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  };

  const renderAI = async () => {
    if (!prompt.trim()) return;
    setRendering(true);
    try {
      // Always take a fresh render so the reference matches the current scene.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ref = await doOfflineRender(engine);
      if (!ref) throw new Error('No viewport render available');
      setRefRender(ref);

      const refFile = await dataUrlToFile(ref.dataUrl, `viewport-${Date.now()}.png`);
      const enginePreset = ENGINES[engine];
      const enrichedPrompt =
        `${prompt.trim()}, ${enginePreset.aiStyle}, highly detailed, photorealistic. ` +
        `Use the input image as a strict compositional reference: keep object positions, proportions, ` +
        `silhouettes, camera angle and perspective, replacing the primitive shapes with the described subject.`;

      const formData = new FormData();
      formData.append('image', refFile);
      formData.append('prompt', enrichedPrompt);
      formData.append('model', 'nanobanana-pro');

      const resp = await fetch('https://gen.pollinations.ai/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}` },
        body: formData,
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Pollinations ${resp.status}: ${errText}`);
      }
      const data = await resp.json();
      const imgUrl: string | undefined = data?.data?.[0]?.url ?? data?.data?.[0]?.b64_json;
      if (!imgUrl) throw new Error('Pollinations response missing image data');
      if (imgUrl.startsWith('http')) {
        setImage(imgUrl);
      } else {
        setImage(`data:image/png;base64,${imgUrl}`);
      }
    } catch (e) {
      console.error('Render AI failed', e);
    } finally {
      setRendering(false);
    }
  };

  useEffect(() => {
    if (open) {
      setMode('standard');
      render(engine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image;
    a.download = `render-${engine}-${Date.now()}.png`;
    a.click();
  };

  const currentPreset = ENGINES[engine];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-panel border-panel-border">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8 gap-2">
            <span>Rendered Frame Window</span>
            <div className="flex gap-2 items-center">
              <div className="flex bevel-inset bg-win-face text-[11px]">
                <button
                  onClick={() => setMode('standard')}
                  className={`px-2 py-[2px] ${mode === 'standard' ? 'bevel-inset bg-white' : 'bevel-raised'}`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setMode('ai')}
                  className={`px-2 py-[2px] flex items-center gap-1 ${mode === 'ai' ? 'bevel-inset bg-white' : 'bevel-raised'}`}
                >
                  <Sparkles className="w-3 h-3" /> Render AI
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={mode === 'ai' ? renderAI : () => render(engine)}
                disabled={rendering || (mode === 'ai' && !prompt.trim())}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${rendering ? 'animate-spin' : ''}`} />
                Render
              </Button>
              <Button size="sm" variant="outline" onClick={download} disabled={!image}>
                <Download className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Engine selector */}
        <div className="flex items-center gap-2 text-[11px]">
          <label className="whitespace-nowrap font-semibold">Engine:</label>
          <div className="flex bevel-inset bg-win-face">
            {(Object.keys(ENGINES) as RenderEngine[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setEngine(k);
                  if (mode === 'standard') render(k);
                }}
                title={ENGINES[k].description}
                className={`px-2 py-[2px] ${engine === k ? 'bevel-inset bg-white font-semibold' : 'bevel-raised'}`}
              >
                {ENGINES[k].label}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground truncate">{currentPreset.description}</span>
        </div>

        {mode === 'ai' && (
          <div className="flex items-center gap-2 text-[11px]">
            <label className="whitespace-nowrap">Prompt:</label>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !rendering) renderAI(); }}
              placeholder="e.g. a tall glass skyscraper, cinematic lighting"
              className="flex-1 bevel-inset bg-white px-2 h-[22px]"
            />
          </div>
        )}

        <div className="bg-black rounded border border-panel-border overflow-hidden flex items-center justify-center min-h-[400px]">
          {rendering ? (
            <span className="text-muted-foreground text-sm">
              {mode === 'ai'
                ? `Generating with AI (${currentPreset.label} style)...`
                : `Rendering with ${currentPreset.label}...`}
            </span>
          ) : image ? (
            <img
              src={image}
              alt="Rendered viewport"
              className="max-w-full max-h-[70vh]"
              style={{ filter: currentPreset.cssFilter }}
            />
          ) : (
            <span className="text-muted-foreground text-sm">No render yet</span>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          {mode === 'ai'
            ? `Render AI uses Pollinations with the ${currentPreset.label} style guiding tone, lighting and materials; the current render is used as strict compositional reference.`
            : `${currentPreset.label} preset: tone mapping + exposure + color response tuned to match the engine's signature look.`}
        </p>
      </DialogContent>
    </Dialog>
  );
};
