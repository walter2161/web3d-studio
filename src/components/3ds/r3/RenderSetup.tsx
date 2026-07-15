import { useState, useMemo, useEffect } from 'react';
import { R3Dialog, GroupBox, Spinner, R3Button, Row } from './R3Dialog';
import { ENGINES, RenderEngine, useRenderEngine } from './RenderEngineContext';
import { renderAnimation, downloadBlob, suggestFilename, VideoFormat, CameraPose } from '../utils/animationRender';
import { toast } from 'sonner';

interface CameraOption {
  id: string;
  name: string;
}

interface RenderSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRender?: () => void;
  currentFrame?: number;
  totalFrames?: number;
  setCurrentFrame?: (f: number) => void;
  /** Live cameras from the scene (id + display name). */
  cameras?: CameraOption[];
  /** Returns the live objects array — used by the animation renderer to
   *  read the animated camera / target pose at each frame. */
  getObjects?: () => any[];
  /** Camera currently active in the perspective viewport (if any). Used as
   *  the default selection when the Render Scene dialog opens. */
  activeViewportCameraId?: string | null;
}

type Tab = 'Common' | 'Renderer' | 'Raytracer' | 'Advanced Lighting';

const TABS: Tab[] = ['Common', 'Renderer', 'Raytracer', 'Advanced Lighting'];

const OUTPUT_SIZES = [
  { label: '320x240', w: 320, h: 240 },
  { label: '640x480', w: 640, h: 480 },
  { label: '720x486', w: 720, h: 486 },
  { label: '800x600', w: 800, h: 600 },
  { label: '1024x768', w: 1024, h: 768 },
  { label: '1280x1024', w: 1280, h: 1024 },
];

/** Special sentinel meaning "use the active viewport orbit camera". */
const VIEWPORT_CAM_ID = '__viewport__';

export const RenderSetup = ({
  open, onOpenChange, onRender, currentFrame = 0, totalFrames = 100, setCurrentFrame,
  cameras = [], getObjects, activeViewportCameraId = null,
}: RenderSetupProps) => {
  const { engine, setEngine } = useRenderEngine();
  const [tab, setTab] = useState<Tab>('Common');
  const [timeMode, setTimeMode] = useState<'single' | 'active' | 'range' | 'frames'>('single');
  const [rangeFrom, setRangeFrom] = useState(0);
  const [rangeTo, setRangeTo] = useState(100);
  const [everyNth, setEveryNth] = useState(1);
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(480);
  const [pixelAspect, setPixelAspect] = useState(1.0);
  const [imageAspect, setImageAspect] = useState(1.333);
  const [viewport, setViewport] = useState<'Perspective' | 'Top' | 'Front' | 'Left'>('Perspective');
  const [renderer, setRenderer] = useState<'Default Scanline' | 'VUE File Renderer'>('Default Scanline');
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('mp4');
  const [videoFps, setVideoFps] = useState(30);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [renderCameraId, setRenderCameraId] = useState<string>(VIEWPORT_CAM_ID);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  // Reset preview URL when dialog closes.
  useEffect(() => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
    }
  }, [open]);

  // When the dialog opens, default the "View to Render" picker to whatever
  // camera the active viewport is currently looking through. If none, use the
  // orbit view. Users can still change it via the dropdowns.
  useEffect(() => {
    if (!open) return;
    if (activeViewportCameraId && cameras.some((c) => c.id === activeViewportCameraId)) {
      setRenderCameraId(activeViewportCameraId);
    } else {
      setRenderCameraId(VIEWPORT_CAM_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeViewportCameraId]);



  // Renderer tab options
  const [antialiasing, setAntialiasing] = useState(true);
  const [filterMaps, setFilterMaps] = useState(true);
  const [shadows, setShadows] = useState(true);
  const [mapping, setMapping] = useState(true);
  const [autoReflect, setAutoReflect] = useState(true);
  const [forceWireframe, setForceWireframe] = useState(false);
  const [wireThickness, setWireThickness] = useState(1.0);

  // Raytracer tab
  const [rtEnable, setRtEnable] = useState(true);
  const [rtMaxDepth, setRtMaxDepth] = useState(9);
  const [rtCutoff, setRtCutoff] = useState(0.01);

  // Advanced Lighting tab
  const [advMode, setAdvMode] = useState<'None' | 'Light Tracer' | 'Radiosity'>('None');

  const label = (t: string) => <span className="text-[11px]">{t}</span>;

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Render Scene" width={560}>
      {/* Tabs */}
      <div className="flex gap-[2px] mb-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-[2px] text-[11px] ${tab === t ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bevel-inset bg-win-face p-2 space-y-2" style={{ minHeight: 380 }}>
        {tab === 'Common' && (
          <>
            <GroupBox title="View to Render">
              <Row label="Camera / View:" labelWidth={90}>
                <select
                  value={renderCameraId}
                  onChange={(e) => setRenderCameraId(e.target.value)}
                  className="bevel-inset bg-white text-[11px] h-[18px]"
                  style={{ width: 300 }}
                >
                  <option value={VIEWPORT_CAM_ID}>Active Viewport (orbit)</option>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>Camera: {c.name}</option>
                  ))}
                </select>
              </Row>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                {cameras.length === 0
                  ? 'No scene cameras yet — create a Target/Free camera to render through it.'
                  : renderCameraId === VIEWPORT_CAM_ID
                  ? 'Renders through the current perspective orbit view.'
                  : 'Renders through the selected camera and follows its animated path across the timeline.'}
              </div>
            </GroupBox>
            <GroupBox title="Time Output">
              <div className="space-y-[2px]">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={timeMode === 'single'} onChange={() => setTimeMode('single')} />
                  {label(`Single  Frame # ${currentFrame}`)}
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={timeMode === 'active'} onChange={() => setTimeMode('active')} />
                  {label(`Active Time Segment: 0 To ${totalFrames}`)}
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={timeMode === 'range'} onChange={() => setTimeMode('range')} />
                  {label('Range:')}
                  <Spinner value={rangeFrom} onChange={setRangeFrom} width={44} />
                  <span>To</span>
                  <Spinner value={rangeTo} onChange={setRangeTo} width={44} />
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={timeMode === 'frames'} onChange={() => setTimeMode('frames')} />
                  {label('Frames  1,3,5-12')}
                </label>
                <Row label="Every Nth Frame:" labelWidth={110}>
                  <Spinner value={everyNth} onChange={setEveryNth} min={1} width={44} />
                </Row>
              </div>
            </GroupBox>

            <GroupBox title="Output Size">
              <Row label="Aperture Width (mm):" labelWidth={140}>
                <Spinner value={36} onChange={() => {}} width={44} />
                <select className="bevel-inset bg-white text-[11px] h-[18px] ml-2">
                  <option>Custom</option>
                  <option>35mm 1.333:1 (Movie)</option>
                  <option>PAL</option>
                  <option>NTSC</option>
                </select>
              </Row>
              <div className="flex gap-2 items-start mt-1">
                <div className="grid grid-cols-3 gap-[2px]">
                  {OUTPUT_SIZES.map((s) => (
                    <R3Button
                      key={s.label}
                      width={72}
                      active={width === s.w && height === s.h}
                      onClick={() => { setWidth(s.w); setHeight(s.h); }}
                    >
                      {s.label}
                    </R3Button>
                  ))}
                </div>
                <div className="space-y-[2px]">
                  <Row label="Width:" labelWidth={50}><Spinner value={width} onChange={setWidth} min={1} width={56} /></Row>
                  <Row label="Height:" labelWidth={50}><Spinner value={height} onChange={setHeight} min={1} width={56} /></Row>
                  <Row label="Image Aspect:" labelWidth={80}><Spinner value={imageAspect} onChange={setImageAspect} step={0.001} width={56} /></Row>
                  <Row label="Pixel Aspect:" labelWidth={80}><Spinner value={pixelAspect} onChange={setPixelAspect} step={0.001} width={56} /></Row>
                </div>
              </div>
            </GroupBox>

            <GroupBox title="Options">
              <div className="grid grid-cols-2 gap-x-2">
                <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Video Color Check')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" />{label('Force 2-Sided')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" />{label('Atmospherics')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Super Black')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Effects')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" />{label('Render Hidden Geometry')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Displacement')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" />{label('Render to Fields')}</label>
              </div>
            </GroupBox>

            <GroupBox title="Render Output">
              <div className="flex items-center gap-1">
                <R3Button width={56}>Files...</R3Button>
                <input className="flex-1 bevel-inset bg-white text-[11px] px-1 h-[18px]" placeholder="(no file)" />
                <label className="flex items-center gap-1 ml-2"><input type="checkbox" defaultChecked />{label('Save File')}</label>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <label className="flex items-center gap-1"><input type="checkbox" />{label('Use Device')}</label>
                <R3Button width={56}>Devices...</R3Button>
                <label className="flex items-center gap-1 ml-2"><input type="checkbox" />{label('Virtual Frame Buffer')}</label>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <label className="flex items-center gap-1"><input type="checkbox" />{label('Net Render')}</label>
                <label className="flex items-center gap-1 ml-2"><input type="checkbox" />{label('Skip Existing Images')}</label>
              </div>
            </GroupBox>
          </>
        )}

        {tab === 'Renderer' && (
          <>
            <GroupBox title="Current Renderers">
              <Row label="Production:" labelWidth={80}>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as RenderEngine)}
                  className="bevel-inset bg-white text-[11px] h-[18px]"
                  style={{ width: 220 }}
                >
                  {(Object.keys(ENGINES) as RenderEngine[]).map((k) => (
                    <option key={k} value={k}>{ENGINES[k].label}</option>
                  ))}
                </select>
                <R3Button>Assign...</R3Button>
              </Row>
              <Row label="Draft:" labelWidth={80}>
                <span className="bevel-inset bg-white px-1 h-[18px] flex items-center" style={{ width: 220 }}>
                  {ENGINES[engine].label} Renderer
                </span>
                <R3Button>Assign...</R3Button>
              </Row>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                {ENGINES[engine].description} The chosen engine drives Quick Render and adjusts the scene Environment (level / tint / ambient).
              </div>
            </GroupBox>


            <GroupBox title="Options">
              <div className="grid grid-cols-2 gap-x-2 gap-y-[2px]">
                <label className="flex items-center gap-1"><input type="checkbox" checked={mapping} onChange={(e)=>setMapping(e.target.checked)} />{label('Mapping')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={shadows} onChange={(e)=>setShadows(e.target.checked)} />{label('Shadows')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={autoReflect} onChange={(e)=>setAutoReflect(e.target.checked)} />{label('Auto-Reflect/Refract and Mirrors')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={forceWireframe} onChange={(e)=>setForceWireframe(e.target.checked)} />{label('Force Wireframe')}</label>
                <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Enable SSE')}</label>
              </div>
              <Row label="Wire Thickness:" labelWidth={100}>
                <Spinner value={wireThickness} onChange={setWireThickness} step={0.1} min={0} width={56} />
                <span className="text-[11px]">(pixels)</span>
              </Row>
            </GroupBox>

            <GroupBox title="Anti-Aliasing">
              <label className="flex items-center gap-1"><input type="checkbox" checked={antialiasing} onChange={(e)=>setAntialiasing(e.target.checked)} />{label('Anti-Aliasing')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={filterMaps} onChange={(e)=>setFilterMaps(e.target.checked)} />{label('Filter Maps')}</label>
              <Row label="Filter:" labelWidth={60}>
                <select className="bevel-inset bg-white text-[11px] h-[18px]" style={{ width: 140 }}>
                  <option>Area</option>
                  <option>Blackman</option>
                  <option>Blend</option>
                  <option>Catmull-Rom</option>
                  <option>Cook Variable</option>
                  <option>Cubic</option>
                  <option>Mitchell-Netravali</option>
                  <option>Plate Match/MAX R2</option>
                  <option>Quadratic</option>
                  <option>Sharp Quadratic</option>
                  <option>Soften</option>
                  <option>Video</option>
                </select>
                <Row label="Filter Size:" labelWidth={70}>
                  <Spinner value={1.5} onChange={() => {}} step={0.1} width={56} />
                </Row>
              </Row>
            </GroupBox>

            <GroupBox title="Global SuperSampling">
              <label className="flex items-center gap-1"><input type="checkbox" />{label('Disable all Samplers')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Enable Global Supersampler')}</label>
            </GroupBox>
          </>
        )}

        {tab === 'Raytracer' && (
          <>
            <GroupBox title="Ray Depth Control">
              <label className="flex items-center gap-1"><input type="checkbox" checked={rtEnable} onChange={(e)=>setRtEnable(e.target.checked)} />{label('Enable Raytracing')}</label>
              <Row label="Maximum Depth:" labelWidth={110}><Spinner value={rtMaxDepth} onChange={setRtMaxDepth} min={0} width={44} /></Row>
              <Row label="Cutoff Threshold:" labelWidth={110}><Spinner value={rtCutoff} onChange={setRtCutoff} step={0.001} width={56} /></Row>
              <Row label="Color at Max Depth:" labelWidth={130}>
                <div className="bevel-inset" style={{ width: 40, height: 16, background: '#000' }} />
                <label className="flex items-center gap-1 ml-2"><input type="radio" name="cmd" defaultChecked />{label('Background')}</label>
              </Row>
            </GroupBox>
            <GroupBox title="Global Raytrace Engine Options">
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Enable Raytracing')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Raytrace Atmospherics')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Enable Self Reflect/Refract')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Reflect/Refract Material IDs')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" />{label('Show Progress Dialog')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" />{label('Show Messages')}</label>
            </GroupBox>
            <div className="flex justify-end">
              <R3Button>Global Ray Antialiaser...</R3Button>
            </div>
          </>
        )}

        {tab === 'Advanced Lighting' && (
          <GroupBox title="Select Advanced Lighting">
            <select
              value={advMode}
              onChange={(e) => setAdvMode(e.target.value as typeof advMode)}
              className="bevel-inset bg-white text-[11px] h-[18px]"
              style={{ width: 200 }}
            >
              <option>None</option>
              <option>Light Tracer</option>
              <option>Radiosity</option>
            </select>
            <label className="flex items-center gap-1 mt-1"><input type="checkbox" defaultChecked />{label('Active')}</label>

            {advMode === 'Light Tracer' && (
              <div className="mt-2 space-y-[2px]">
                <Row label="Global Multiplier:" labelWidth={120}><Spinner value={1.0} onChange={() => {}} step={0.1} width={56} /></Row>
                <Row label="Object Mult:" labelWidth={120}><Spinner value={1.0} onChange={() => {}} step={0.1} width={56} /></Row>
                <Row label="Color Bleed:" labelWidth={120}><Spinner value={1.0} onChange={() => {}} step={0.1} width={56} /></Row>
                <Row label="Rays / Sample:" labelWidth={120}><Spinner value={250} onChange={() => {}} min={1} width={56} /></Row>
                <Row label="Ray Bias:" labelWidth={120}><Spinner value={0.03} onChange={() => {}} step={0.01} width={56} /></Row>
                <Row label="Cone Angle:" labelWidth={120}><Spinner value={88.0} onChange={() => {}} step={0.5} width={56} /></Row>
              </div>
            )}
            {advMode === 'Radiosity' && (
              <div className="mt-2 space-y-[2px]">
                <Row label="Initial Quality:" labelWidth={120}><Spinner value={85.0} onChange={() => {}} step={0.5} width={56} /><span>%</span></Row>
                <Row label="Refine Iterations:" labelWidth={120}><Spinner value={0} onChange={() => {}} min={0} width={44} /></Row>
                <Row label="Indirect Light:" labelWidth={120}><Spinner value={1.0} onChange={() => {}} step={0.1} width={56} /></Row>
              </div>
            )}
          </GroupBox>
        )}
      </div>

      {/* Bottom bar */}
      <div className="mt-2 flex items-end gap-2">
        <div className="flex-1" />

        <GroupBox title="Animation Output">
          <Row label="Format:" labelWidth={54}>
            <select
              value={videoFormat}
              onChange={(e) => setVideoFormat(e.target.value as VideoFormat)}
              className="bevel-inset bg-white text-[11px] h-[18px]"
              style={{ width: 90 }}
              disabled={timeMode === 'single'}
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="webp">WebP</option>
            </select>
          </Row>
          <Row label="FPS:" labelWidth={54}>
            <Spinner value={videoFps} onChange={setVideoFps} min={1} max={120} width={56} />
          </Row>
          {rendering && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Rendering frame {progress.done} / {progress.total}…
            </div>
          )}
        </GroupBox>
        <div className="flex flex-col gap-1">
          <R3Button
            width={100}
            onClick={async () => {
              if (rendering) return;
              if (timeMode === 'single') { onRender?.(); onOpenChange(false); return; }
              if (!setCurrentFrame) {
                toast.error('Animation render not available in this context');
                return;
              }
              let from = 0;
              let to = totalFrames;
              if (timeMode === 'range') { from = Math.min(rangeFrom, rangeTo); to = Math.max(rangeFrom, rangeTo); }
              if (timeMode === 'frames') { from = 0; to = totalFrames; }

              // Build a camera-pose resolver from the live objects when a
              // scene camera is chosen. Otherwise fall back to the viewport.
              let resolveCameraPose: ((f: number) => CameraPose | null) | undefined;
              if (renderCameraId !== VIEWPORT_CAM_ID && getObjects) {
                resolveCameraPose = () => {
                  const objs = getObjects();
                  const cam = objs.find((o) => o.id === renderCameraId);
                  if (!cam) return null;
                  const tid = cam.cameraData?.targetObjectId;
                  const targetObj = tid ? objs.find((o) => o.id === tid) : null;
                  return {
                    position: cam.position,
                    rotation: cam.rotation,
                    target: targetObj ? targetObj.position : undefined,
                    fov: cam.cameraData?.fov ?? 45,
                    near: cam.cameraData?.near ?? 0.1,
                    far: cam.cameraData?.far ?? 1000,
                  };
                };
              }

              setRendering(true);
              setProgress({ done: 0, total: 0 });
              const toastId = toast.loading('Rendering animation…');
              try {
                const blob = await renderAnimation({
                  from, to, step: Math.max(1, everyNth),
                  width, height, fps: videoFps, format: videoFormat,
                  engine,
                  setFrame: setCurrentFrame,
                  resolveCameraPose,
                  onProgress: (done, total) => setProgress({ done, total }),
                });
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewBlob(blob);
                setPreviewUrl(URL.createObjectURL(blob));
                toast.success('Render complete — review the preview', { id: toastId });
              } catch (e: any) {
                console.error('Animation render failed', e);
                toast.error(`Render failed: ${e?.message || 'unknown error'}`, { id: toastId });
              } finally {
                setRendering(false);
              }
            }}
          >
            {rendering ? 'Rendering…' : 'Render'}
          </R3Button>
          <R3Button width={100} onClick={() => onOpenChange(false)}>Close</R3Button>
          <R3Button width={100} onClick={() => onOpenChange(false)}>Cancel</R3Button>
        </div>
      </div>

      {/* Preview dialog — the user must confirm before the file is saved. */}
      {previewUrl && previewBlob && (
        <R3Dialog
          open={!!previewUrl}
          onClose={() => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setPreviewBlob(null);
          }}
          title="Render Preview"
          width={720}
        >
          <div className="bevel-inset bg-black mb-2 flex items-center justify-center" style={{ minHeight: 360 }}>
            <video
              src={previewUrl}
              controls
              autoPlay
              loop
              className="max-w-full max-h-[60vh]"
            />
          </div>
          <div className="text-[11px] text-muted-foreground mb-2">
            {(previewBlob.size / (1024 * 1024)).toFixed(2)} MB · {previewBlob.type || 'video'}
          </div>
          <div className="flex justify-end gap-1">
            <R3Button
              width={110}
              onClick={() => {
                if (!previewBlob) return;
                downloadBlob(previewBlob, suggestFilename(previewBlob, videoFormat));
                toast.success('Video saved');
              }}
            >
              Save Video
            </R3Button>
            <R3Button
              width={110}
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setPreviewBlob(null);
              }}
            >
              Discard
            </R3Button>
          </div>
        </R3Dialog>
      )}
    </R3Dialog>
  );
};
