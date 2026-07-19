import { cn } from '@/lib/utils';
import {
  Undo2, Redo2, MousePointer2, Move, RotateCw, Maximize as ScaleIcon,
  Link2, Unlink, FlipHorizontal, AlignCenter, Layers, Palette, Camera,
  Play, Magnet, Grid3x3, Percent, RotateCcw, Search, LayoutGrid, Square as SquareIcon,
  ListTree, LibraryBig, Circle as CircleIcon, Waves, Lasso, Paintbrush, Eye,
  ChevronDown,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  getRegionState, setRegionState, subscribeRegion, RegionMode,
} from './r3/selectionRegionStore';


interface ToolButtonProps {
  title: string;
  active?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export const ToolButton = ({ title, active, onClick, onContextMenu, children, disabled }: ToolButtonProps) => (
  <button
    title={title}
    onClick={onClick}
    onContextMenu={onContextMenu}
    disabled={disabled}
    className={cn(
      'w-[24px] h-[24px] flex items-center justify-center text-win-text disabled:text-win-text-disabled',
      active ? 'bevel-sunken' : 'bevel-raised hover:brightness-105'
    )}
  >
    {children}
  </button>
);

const Sep = () => <div className="w-px h-[20px] bg-win-shadow mx-1 self-center" />;

interface MainToolbarProps {
  transformMode: 'translate' | 'rotate' | 'scale';
  onTransformMode: (m: 'translate' | 'rotate' | 'scale') => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenMaterialEditor: () => void;
  onQuickRender: () => void;
  onMirror?: () => void;
  onAlign?: () => void;
  onArray?: () => void;
  onLayerManager?: () => void;
  onSelectByName?: () => void;
  onRenderSetup?: () => void;
  viewportLayout?: 'single' | 'quad' | '2col-top-persp' | '2col-front-persp' | '2col-left-persp' | '2row-top-persp';
  onToggleViewportLayout?: () => void;
  onOpenHierarchy?: () => void;
  onOpenLibrary?: () => void;
  onSelectAndLink?: () => void;
  onUnlinkSelection?: () => void;
  linkToolActive?: boolean;
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  angleSnapEnabled?: boolean;
  onToggleAngleSnap?: () => void;
  onOpenGridSettings?: () => void;
}

export const MainToolbar = ({
  transformMode, onTransformMode, onUndo, onRedo, onOpenMaterialEditor, onQuickRender,
  onMirror, onAlign, onArray, onLayerManager, onSelectByName, onRenderSetup,
  viewportLayout, onToggleViewportLayout, onOpenHierarchy, onOpenLibrary,
  onSelectAndLink, onUnlinkSelection, linkToolActive,
  snapEnabled, onToggleSnap, angleSnapEnabled, onToggleAngleSnap, onOpenGridSettings,
}: MainToolbarProps) => {


  return (
    <div className="bevel-raised px-1 py-0.5 flex items-center gap-0.5">
      <ToolButton title="Undo (Ctrl+Z)" onClick={onUndo}><Undo2 size={14} /></ToolButton>
      <ToolButton title="Redo (Ctrl+Y)" onClick={onRedo}><Redo2 size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Select Object (H)" onClick={onSelectByName}><MousePointer2 size={14} /></ToolButton>
      <SelectionRegionButtons />
      <ToolButton title="Select and Move (W) — Right-click: Transform Type-In" active={transformMode === 'translate'} onClick={() => onTransformMode('translate')} onContextMenu={(e) => { e.preventDefault(); onTransformMode('translate'); window.dispatchEvent(new CustomEvent('walt3d:menu-action', { detail: 'Transform Type-In' })); }}><Move size={14} /></ToolButton>
      <ToolButton title="Select and Rotate (E) — Right-click: Transform Type-In" active={transformMode === 'rotate'} onClick={() => onTransformMode('rotate')} onContextMenu={(e) => { e.preventDefault(); onTransformMode('rotate'); window.dispatchEvent(new CustomEvent('walt3d:menu-action', { detail: 'Transform Type-In' })); }}><RotateCw size={14} /></ToolButton>
      <ToolButton title="Select and Scale (R) — Right-click: Transform Type-In" active={transformMode === 'scale'} onClick={() => onTransformMode('scale')} onContextMenu={(e) => { e.preventDefault(); onTransformMode('scale'); window.dispatchEvent(new CustomEvent('walt3d:menu-action', { detail: 'Transform Type-In' })); }}><ScaleIcon size={14} /></ToolButton>
      <Sep />
      <ToolButton
        title={linkToolActive ? 'Select and Link — click parent to link to (Esc to cancel)' : 'Select and Link'}
        active={linkToolActive}
        onClick={onSelectAndLink}
      ><Link2 size={14} /></ToolButton>
      <ToolButton title="Unlink Selection" onClick={onUnlinkSelection}><Unlink size={14} /></ToolButton>

      <Sep />
      <ToolButton title="Mirror" onClick={onMirror}><FlipHorizontal size={14} /></ToolButton>
      <ToolButton title="Array" onClick={onArray}><Grid3x3 size={14} /></ToolButton>
      <ToolButton title="Align (A)" onClick={onAlign}><AlignCenter size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Layer Manager" onClick={onLayerManager}><Layers size={14} /></ToolButton>
      <ToolButton title="Scene Hierarchy (List)" onClick={onOpenHierarchy}><ListTree size={14} /></ToolButton>
      <ToolButton title="Object Library" onClick={onOpenLibrary}><LibraryBig size={14} /></ToolButton>
      <ToolButton title="Material Editor (M)" onClick={onOpenMaterialEditor}><Palette size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Render Setup" onClick={onRenderSetup}><Camera size={14} /></ToolButton>
      <ToolButton title="Quick Render (Shift+Q)" onClick={onQuickRender}><Play size={14} /></ToolButton>
      <Sep />
      <ToolButton
        title={viewportLayout === 'quad' ? 'Min/Max Toggle (W) — Single View' : 'Min/Max Toggle (W) — Quad View (Top/Front/Left/Perspective)'}
        active={viewportLayout === 'quad'}
        onClick={onToggleViewportLayout}
      >
        {viewportLayout === 'quad' ? <SquareIcon size={14} /> : <LayoutGrid size={14} />}
      </ToolButton>
    </div>
  );
};


// ────────────────────────────────────────────────────────────────────────────
// Selection Region cluster — Rectangle / Circle / Fence / Lasso / Paint,
// Window vs Crossing toggle and Ignore Backfacing (matches 3ds Max).
// ────────────────────────────────────────────────────────────────────────────
const MODE_META: Record<RegionMode, { title: string; Icon: React.ComponentType<any> }> = {
  rectangle: { title: 'Rectangular Selection Region', Icon: SquareIcon },
  circle:    { title: 'Circular Selection Region',    Icon: CircleIcon },
  fence:     { title: 'Fence Selection Region',       Icon: Waves },
  lasso:     { title: 'Lasso Selection Region',       Icon: Lasso },
  paint:     { title: 'Paint Selection Region',       Icon: Paintbrush },
};

const SelectionRegionButtons = () => {
  const region = useSyncExternalStore(subscribeRegion, () => getRegionState(), () => getRegionState());
  const CurrentIcon = MODE_META[region.regionMode].Icon;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title={`${MODE_META[region.regionMode].title} — click to change`}
            className="h-[24px] px-1 flex items-center bevel-raised hover:brightness-105 text-win-text"
          >
            <CurrentIcon size={14} />
            <ChevronDown size={9} className="ml-0.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-xs">
          <DropdownMenuLabel>Selection Region</DropdownMenuLabel>
          {(Object.keys(MODE_META) as RegionMode[]).map((m) => {
            const Icon = MODE_META[m].Icon;
            return (
              <DropdownMenuItem key={m} onClick={() => setRegionState({ regionMode: m })}>
                <Icon size={12} className="mr-2" />
                {MODE_META[m].title}{region.regionMode === m ? '  ✓' : ''}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Window / Crossing</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={region.windowCrossing === 'window'}
            onCheckedChange={() => setRegionState({ windowCrossing: 'window' })}
          >
            Window — fully inside
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={region.windowCrossing === 'crossing'}
            onCheckedChange={() => setRegionState({ windowCrossing: 'crossing' })}
          >
            Crossing — touches region
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={region.ignoreBackfacing}
            onCheckedChange={(v) => setRegionState({ ignoreBackfacing: !!v })}
          >
            Ignore Backfacing
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolButton
        title={`Window/Crossing Toggle (currently ${region.windowCrossing})`}
        active={region.windowCrossing === 'window'}
        onClick={() => setRegionState({ windowCrossing: region.windowCrossing === 'window' ? 'crossing' : 'window' })}
      >
        <span className="text-[10px] font-mono leading-none">{region.windowCrossing === 'window' ? 'W' : 'C'}</span>
      </ToolButton>

      <ToolButton
        title="Ignore Backfacing"
        active={region.ignoreBackfacing}
        onClick={() => setRegionState({ ignoreBackfacing: !region.ignoreBackfacing })}
      >
        <Eye size={14} />
      </ToolButton>
    </>
  );
};





interface SnapsToolbarProps {
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  angleSnapEnabled?: boolean;
  onToggleAngleSnap?: () => void;
  onOpenGridSettings?: () => void;
}

export const SnapsToolbar = ({ snapEnabled, onToggleSnap, angleSnapEnabled, onToggleAngleSnap, onOpenGridSettings }: SnapsToolbarProps) => {
  return (
    <div className="bevel-raised px-1 py-0.5 flex items-center gap-0.5">
      <ToolButton title="Snap Toggle (S)" active={!!snapEnabled} onClick={onToggleSnap}><Magnet size={14} /></ToolButton>
      <ToolButton title="Angle Snap Toggle" active={!!angleSnapEnabled} onClick={onToggleAngleSnap}><RotateCcw size={14} /></ToolButton>
      <ToolButton title="Percent Snap Toggle"><Percent size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Grid and Snap Settings..." onClick={onOpenGridSettings}><Grid3x3 size={14} /></ToolButton>
      <ToolButton title="Zoom Region"><Search size={14} /></ToolButton>
    </div>
  );
};
