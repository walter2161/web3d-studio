import { Viewport } from './Viewport';
import { AnimationTrack, Keyframe } from './AnimationTimeline';

export type ViewportLayout = 'single' | 'quad';
export type ViewportType = 'perspective' | 'top' | 'front' | 'left';

interface ViewportGridProps {
  layout: ViewportLayout;
  activeViewport: ViewportType;
  onActiveViewportChange: (v: ViewportType) => void;
  // Passthrough props
  objects: any[];
  selectedObject: string | null;
  selectedSubUuid?: string | null;
  onSelectObject: (id: string | null) => void;
  onTransformObject: (id: string, transform: any) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
  animationTracks?: AnimationTrack[];
  selectedKeyframe?: Keyframe | null;
  onUpdateKeyframe?: (objectId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  currentFrame?: number;
  totalFrames?: number;
  isPlaying?: boolean;
}

export const ViewportGrid = (props: ViewportGridProps) => {
  const { layout, activeViewport, onActiveViewportChange, ...vp } = props;

  const cell = (t: ViewportType) => (
    <Viewport
      type={t}
      isActive={activeViewport === t}
      onActivate={() => onActiveViewportChange(t)}
      {...vp}
    />
  );

  if (layout === 'single') {
    return <div className="w-full h-full">{cell(activeViewport)}</div>;
  }

  // 2x2 classic (Top / Front / Left / Perspective)
  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-win-dark">
      <div className="min-w-0 min-h-0">{cell('top')}</div>
      <div className="min-w-0 min-h-0">{cell('front')}</div>
      <div className="min-w-0 min-h-0">{cell('left')}</div>
      <div className="min-w-0 min-h-0">{cell('perspective')}</div>
    </div>
  );
};
