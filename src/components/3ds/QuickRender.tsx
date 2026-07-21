import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, Sparkles, Pause, Play, X, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getViewportHandle } from './r3/viewportRegistry';
import { ENGINES, RenderEngine, useRenderEngine } from './r3/RenderEngineContext';
import { cn } from '@/lib/utils';

/** 3ds Max style pipeline phases with weighted percentages (sum = 100). */
const RENDER_PHASES: { key: string; label: string; weight: number }[] = [
  { key: 'parse', label: 'Parsing Scene...', weight: 6 },
  { key: 'modifiers', label: 'Evaluating Modifier Stack...', weight: 8 },
  { key: 'tri', label: 'Triangulating Meshes...', weight: 6 },
  { key: 'bvh', label: 'Building BVH / Spatial Acceleration...', weight: 10 },
  { key: 'materials', label: 'Preparing Materials & Textures...', weight: 8 },
  { key: 'lights', label: 'Building Lights...', weight: 6 },
  { key: 'shadows', label: 'Calculating Shadow Maps...', weight: 12 },
  { key: 'gi', label: 'Rendering Global Illumination...', weight: 10 },
  { key: 'raster', label: 'Rendering Scanlines...', weight: 20 },
  { key: 'refl', label: 'Reflections / Refractions...', weight: 6 },
  { key: 'aa', label: 'Applying Anti-Aliasing...', weight: 5 },
  { key: 'denoise', label: 'Denoising...', weight: 2 },
  { key: 'save', label: 'Saving Frame Buffer...', weight: 1 },
];

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

interface SceneStats {
  objects: number;
  polygons: number;
  textures: number;
  lights: number;
  ram: string;
}

const gatherSceneStats = (scene: THREE.Scene): SceneStats => {
  let objects = 0;
  let polygons = 0;
  let lights = 0;
  const texSet = new Set<THREE.Texture>();
  scene.traverse((o) => {
    if ((o as any).isMesh) {
      objects++;
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g) {
        const idx = g.index ? g.index.count : g.attributes.position?.count ?? 0;
        polygons += Math.floor(idx / 3);
      }
      const mats = ([] as THREE.Material[]).concat((o as THREE.Mesh).material as any);
      mats.forEach((m: any) => {
        if (!m) return;
        ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','bumpMap','displacementMap']
          .forEach((k) => { if (m[k] && m[k].isTexture) texSet.add(m[k]); });
      });
    }
    if ((o as any).isLight) lights++;
  });
  const perf = (performance as any).memory;
  const ram = perf?.usedJSHeapSize
    ? `${(perf.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB`
    : '—';
  return { objects, polygons, textures: texSet.size, lights, ram };
};

interface QuickRenderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Output resolution requested by the user in Render Setup. When omitted
   *  the offscreen render falls back to the viewport canvas size. */
  width?: number;
  height?: number;
}

export type { RenderEngine };


/**
 * "Production" render:
 * - Uses the perspective viewport's three.js scene/camera
 * - Hides all viewport helpers (grid, gizmo, transform controls, selection outlines)
 * - Renders offscreen at 2× with the selected engine's tone mapping + exposure
 * Result is drawn back into the dialog as a PNG image.
 */
const doOfflineRender = async (
  engine: RenderEngine,
  overrideWidth?: number,
  overrideHeight?: number,
): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  const handle = getViewportHandle('perspective') ?? getViewportHandle();
  if (!handle) return null;
  const { gl, scene, camera } = handle;
  const preset = ENGINES[engine];

  const canvasEl = gl.domElement;
  const vw = canvasEl.clientWidth || canvasEl.width;
  const vh = canvasEl.clientHeight || canvasEl.height;
  // If the user chose a specific output resolution in Render Setup, honor it
  // exactly — otherwise fall back to the current viewport size (Quick Render).
  const useOverride = !!(overrideWidth && overrideHeight);
  const outW = useOverride ? Math.max(1, Math.floor(overrideWidth!)) : Math.max(1, Math.floor(vw * Math.min(2, window.devicePixelRatio || 1)));
  const outH = useOverride ? Math.max(1, Math.floor(overrideHeight!)) : Math.max(1, Math.floor(vh * Math.min(2, window.devicePixelRatio || 1)));

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

  // Force the camera's aspect to match the requested output so the image
  // fills the full width/height instead of showing black bars when the user
  // picks a resolution whose aspect differs from the live viewport.
  const persp = camera as THREE.PerspectiveCamera;
  const prevAspect = persp.aspect;
  if ((persp as any).isPerspectiveCamera) {
    persp.aspect = outW / outH;
    persp.updateProjectionMatrix();
  }
  offscreen.render(scene, camera);
  const dataUrl = offscreen.domElement.toDataURL('image/png');
  if ((persp as any).isPerspectiveCamera) {
    persp.aspect = prevAspect;
    persp.updateProjectionMatrix();
  }

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

interface PhaseLog { key: string; label: string; done: boolean; }

export const QuickRender = ({ open, onOpenChange, width, height }: QuickRenderProps) => {
  const [image, setImage] = useState<string | null>(null);
  const [refRender, setRefRender] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [mode, setMode] = useState<Mode>('standard');
  const { engine, setEngine } = useRenderEngine();
  const [prompt, setPrompt] = useState('a modern building');

  // ------ 3ds Max-style progress state ------
  const [progress, setProgress] = useState(0);
  const [phases, setPhases] = useState<PhaseLog[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [stats, setStats] = useState<SceneStats>({ objects: 0, polygons: 0, textures: 0, lights: 0, ram: '—' });
  const [background, setBackground] = useState(false);
  const cancelRef = useRef(false);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const startRef = useRef(0);

  const waitWhilePaused = async () => {
    while (pausedRef.current && !cancelRef.current) {
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const runPipeline = async (doRender: () => Promise<any>) => {
    cancelRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setPhases(RENDER_PHASES.map((p) => ({ key: p.key, label: p.label, done: false })));
    setCurrentPhase(RENDER_PHASES[0].label);
    setProgress(0);
    setElapsedMs(0);
    setRemainingMs(0);
    startRef.current = performance.now();

    // Snapshot scene stats up front so the panel matches 3ds Max
    const handle = getViewportHandle('perspective') ?? getViewportHandle();
    if (handle) setStats(gatherSceneStats(handle.scene));

    const totalWeight = RENDER_PHASES.reduce((a, p) => a + p.weight, 0);
    let acc = 0;
    let renderResult: any = null;

    for (let i = 0; i < RENDER_PHASES.length; i++) {
      if (cancelRef.current) break;
      const phase = RENDER_PHASES[i];
      setCurrentPhase(phase.label);
      await waitWhilePaused();

      // Do the actual render on the rasterization phase; the surrounding
      // phases are visual instrumentation of what the pipeline is doing.
      if (phase.key === 'raster') {
        renderResult = await doRender();
      } else {
        // simulate work: a few small ticks so the bar animates smoothly
        const ticks = 4;
        for (let t = 0; t < ticks; t++) {
          if (cancelRef.current) break;
          await waitWhilePaused();
          await new Promise((r) => setTimeout(r, 30 + Math.random() * 60));
          const partial = acc + (phase.weight * (t + 1)) / ticks;
          const pct = Math.min(99, (partial / totalWeight) * 100);
          setProgress(pct);
          const now = performance.now();
          const el = now - startRef.current;
          setElapsedMs(el);
          if (pct > 1) setRemainingMs((el / pct) * (100 - pct));
        }
      }
      acc += phase.weight;
      const pct = Math.min(100, (acc / totalWeight) * 100);
      setProgress(pct);
      setPhases((prev) => prev.map((p) => (p.key === phase.key ? { ...p, done: true } : p)));
      const now = performance.now();
      const el = now - startRef.current;
      setElapsedMs(el);
      if (pct > 1 && pct < 100) setRemainingMs((el / pct) * (100 - pct));
    }

    if (!cancelRef.current) {
      setProgress(100);
      setRemainingMs(0);
      setCurrentPhase('Done.');
    } else {
      setCurrentPhase('Cancelled.');
    }
    return renderResult;
  };

  const render = async (eng: RenderEngine = engine) => {
    setRendering(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const res = await runPipeline(async () => {
        return await doOfflineRender(eng, width, height);
      });
      if (res && !cancelRef.current) {
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
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const aiResult = await runPipeline(async () => {
        const ref = await doOfflineRender(engine, width, height);
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
        return imgUrl;
      });
      if (aiResult && !cancelRef.current) {
        if (typeof aiResult === 'string') {
          if (aiResult.startsWith('http')) setImage(aiResult);
          else setImage(`data:image/png;base64,${aiResult}`);
        }
      }
    } catch (e) {
      console.error('Render AI failed', e);
      setCurrentPhase(`Error: ${(e as Error).message}`);
    } finally {
      setRendering(false);
    }
  };

  useEffect(() => {
    if (open) {
      setMode('standard');
      setBackground(false);
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

  const handleCancel = () => {
    cancelRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (!pausedRef.current) setCurrentPhase((c) => c.replace(' (Paused)', ''));
    else setCurrentPhase((c) => (c.includes('(Paused)') ? c : `${c} (Paused)`));
  };

  const currentPreset = ENGINES[engine];

  return (
    <Dialog open={open && !background} onOpenChange={(o) => { if (!o) { handleCancel(); onOpenChange(false); } }}>
      <DialogContent className="quick-render-dialog max-w-none w-[min(60rem,calc(100vw-2rem))] bg-panel border-panel-border overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8 gap-2">
            <span>Rendered Frame Window — {currentPreset.label}</span>
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
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-[11px] min-w-0 w-full">
          <label className="whitespace-nowrap font-semibold shrink-0">Engine:</label>
          <div className="min-w-0">
            <div className="flex flex-wrap bevel-inset bg-win-face w-full max-w-full">
              {(Object.keys(ENGINES) as RenderEngine[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setEngine(k);
                    if (mode === 'standard') render(k);
                  }}
                  title={ENGINES[k].description}
                  className={cn(
                    'px-2 py-[2px] flex-none',
                    engine === k ? 'bevel-inset bg-white font-semibold' : 'bevel-raised',
                  )}
                >
                  {ENGINES[k].label}
                </button>
              ))}
            </div>
            <div className="text-muted-foreground truncate min-w-0 w-full mt-[2px]">{currentPreset.description}</div>
          </div>
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

        {/* Preview + Progress side-by-side on wider screens */}
        <div className="grid gap-2 grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="quick-render-preview bg-black rounded border border-panel-border overflow-hidden grid place-items-center min-h-[400px] w-full min-w-0">
            {image ? (
              <img
                src={image}
                alt="Rendered viewport"
                className="quick-render-image block w-auto h-auto max-w-full max-h-[70vh] mx-auto justify-self-center self-center"
                style={{ filter: currentPreset.cssFilter }}
              />
            ) : (
              <span className="text-muted-foreground text-sm">
                {rendering ? 'Preparing frame buffer...' : 'No render yet'}
              </span>
            )}
          </div>

          {/* Rendering Progress Panel — 3ds Max style */}
          <div className="bevel-inset bg-win-face p-2 text-[11px] flex flex-col gap-2 min-w-0">
            <div className="font-semibold border-b border-panel-border pb-1">
              WaltRender Progress
            </div>

            {/* Phase log */}
            <div className="bevel-inset bg-white h-[130px] overflow-y-auto font-mono text-[10.5px] leading-[14px] px-1.5 py-1">
              {phases.length === 0 ? (
                <div className="text-muted-foreground">Idle.</div>
              ) : (
                phases.map((p) => (
                  <div key={p.key} className={p.done ? 'text-foreground' : 'text-muted-foreground'}>
                    {p.done ? '✓' : '·'} {p.label}
                  </div>
                ))
              )}
              {currentPhase && rendering && (
                <div className="text-primary font-semibold mt-1">▶ {currentPhase}</div>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div className="bevel-inset bg-white h-3 w-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-100"
                  style={{ width: `${progress.toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between mt-0.5">
                <span>{progress.toFixed(0)}%</span>
                <span className="text-muted-foreground">
                  {width && height ? `${width}×${height}` : 'viewport'}
                </span>
              </div>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span className="text-muted-foreground">Elapsed:</span>
              <span className="font-mono">{fmtTime(elapsedMs)}</span>
              <span className="text-muted-foreground">Remaining:</span>
              <span className="font-mono">{fmtTime(remainingMs)}</span>
            </div>

            {/* Scene stats */}
            <div className="border-t border-panel-border pt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span className="text-muted-foreground">Objects:</span>
              <span className="font-mono text-right">{stats.objects}</span>
              <span className="text-muted-foreground">Polygons:</span>
              <span className="font-mono text-right">{stats.polygons.toLocaleString()}</span>
              <span className="text-muted-foreground">Textures:</span>
              <span className="font-mono text-right">{stats.textures}</span>
              <span className="text-muted-foreground">Lights:</span>
              <span className="font-mono text-right">{stats.lights}</span>
              <span className="text-muted-foreground">RAM:</span>
              <span className="font-mono text-right">{stats.ram}</span>
            </div>

            {/* Controls */}
            <div className="flex gap-1 mt-auto pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-6 text-[10px] px-1"
                onClick={togglePause}
                disabled={!rendering}
              >
                {paused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-6 text-[10px] px-1"
                onClick={handleCancel}
                disabled={!rendering}
              >
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-6 text-[10px] px-1"
                onClick={() => setBackground(true)}
                disabled={!rendering}
                title="Hide window — render continues in the background"
              >
                <EyeOff className="w-3 h-3 mr-1" /> Hide
              </Button>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          {mode === 'ai'
            ? `Render AI uses Pollinations with the ${currentPreset.label} style guiding tone, lighting and materials; the current render is used as strict compositional reference.`
            : `${currentPreset.label} preset: tone mapping + exposure + color response tuned to match the engine's signature look. Pipeline phases mirror the 3ds Max Rendering Progress dialog.`}
        </p>
      </DialogContent>
    </Dialog>
  );
};
