import { Viewport } from './Viewport';
import { AnimationTrack, Keyframe } from './AnimationTimeline';

export type ViewportLayout =
  | 'single'
  | 'quad'
  | '2col-top-persp'
  | '2col-front-persp'
  | '2col-left-persp'
  | '2row-top-persp';
export type ViewportType = 'perspective' | 'top' | 'front' | 'left';

interface ViewportGridProps {
  layout: ViewportLayout;
  activeViewport: ViewportType;
  onActiveViewportChange: (v: ViewportType) => void;
  // Passthrough props
  objects: any[];
  selectedObject: string | null;
  selectedObjectIds?: string[];
  selectedSubUuid?: string | null;
  onSelectObject: (id: string | null, additive?: boolean, remove?: boolean) => void;
  onTransformObject: (id: string, transform: any) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
  animationTracks?: AnimationTrack[];
  selectedKeyframe?: Keyframe | null;
  onUpdateKeyframe?: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onSelectKeyframe?: (kf: Keyframe | null) => void;
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
  snapEnabled?: boolean;
  snapGridSpacing?: number;
  snapAngleDeg?: number;
  snapPercent?: number;
  showGrid?: boolean;
  // Per-viewport camera view (R3 "View from Camera")
  viewportCameras?: Record<string, string | null>;
  onSetViewportCamera?: (vp: ViewportType, camId: string | null) => void;
  availableCameras?: any[];
}

// Multi-viewport layouts default the perspective cell to Smooth+Highlights and
// the orthographic cells to Wireframe — matches the classic 3ds Max quad-view
// working setup.
const initialModeFor = (t: ViewportType): 'solid' | 'wireframe' =>
  t === 'perspective' ? 'solid' : 'wireframe';

export const ViewportGrid = (props: ViewportGridProps) => {
  const { layout, activeViewport, onActiveViewportChange, viewportCameras, onSetViewportCamera, availableCameras, ...vp } = props;

  const cell = (t: ViewportType, forceMode?: 'solid' | 'wireframe') => (
    <Viewport
      key={t}
      type={t}
      isActive={activeViewport === t}
      onActivate={() => onActiveViewportChange(t)}
      cameraObjectId={viewportCameras?.[t] ?? null}
      onChangeCameraObject={(id) => onSetViewportCamera?.(t, id)}
      availableCameras={availableCameras || []}
      initialRenderMode={forceMode ?? (layout === 'single' ? 'solid' : initialModeFor(t))}
      {...vp}
    />
  );

  if (layout === 'single') {
    return <div className="w-full h-full">{cell(activeViewport, 'solid')}</div>;
  }

  if (layout === 'quad') {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-win-dark">
        <div className="min-w-0 min-h-0">{cell('top')}</div>
        <div className="min-w-0 min-h-0">{cell('front')}</div>
        <div className="min-w-0 min-h-0">{cell('left')}</div>
        <div className="min-w-0 min-h-0">{cell('perspective')}</div>
      </div>
    );
  }

  // Two-cell layouts: an orthographic (wire) on one side + perspective (smooth)
  // on the other. Column layouts split left/right; row layout splits top/bottom.
  if (layout === '2col-top-persp') {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-px bg-win-dark">
        <div className="min-w-0 min-h-0">{cell('top')}</div>
        <div className="min-w-0 min-h-0">{cell('perspective')}</div>
      </div>
    );
  }
  if (layout === '2col-front-persp') {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-px bg-win-dark">
        <div className="min-w-0 min-h-0">{cell('front')}</div>
        <div className="min-w-0 min-h-0">{cell('perspective')}</div>
      </div>
    );
  }
  if (layout === '2col-left-persp') {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-px bg-win-dark">
        <div className="min-w-0 min-h-0">{cell('left')}</div>
        <div className="min-w-0 min-h-0">{cell('perspective')}</div>
      </div>
    );
  }
  // '2row-top-persp'
  return (
    <div className="w-full h-full grid grid-rows-2 gap-px bg-win-dark">
      <div className="min-w-0 min-h-0">{cell('top')}</div>
      <div className="min-w-0 min-h-0">{cell('perspective')}</div>
    </div>
  );
};
