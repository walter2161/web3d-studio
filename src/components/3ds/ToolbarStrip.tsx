import { cn } from '@/lib/utils';
import {
  Undo2, Redo2, MousePointer2, Move, RotateCw, Maximize as ScaleIcon,
  Link2, Unlink, FlipHorizontal, AlignCenter, Layers, Palette, Camera,
  Play, Magnet, Grid3x3, Percent, RotateCcw, Search, LayoutGrid, Square as SquareIcon,
} from 'lucide-react';


interface ToolButtonProps {
  title: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export const ToolButton = ({ title, active, onClick, children, disabled }: ToolButtonProps) => (
  <button
    title={title}
    onClick={onClick}
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
}

export const MainToolbar = ({
  transformMode, onTransformMode, onUndo, onRedo, onOpenMaterialEditor, onQuickRender,
  onMirror, onAlign, onArray, onLayerManager, onSelectByName, onRenderSetup,
}: MainToolbarProps) => {
  return (
    <div className="bevel-raised px-1 py-0.5 flex items-center gap-0.5">
      <ToolButton title="Undo (Ctrl+Z)" onClick={onUndo}><Undo2 size={14} /></ToolButton>
      <ToolButton title="Redo (Ctrl+Y)" onClick={onRedo}><Redo2 size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Select Object (H)" onClick={onSelectByName}><MousePointer2 size={14} /></ToolButton>
      <ToolButton title="Select and Move (W)" active={transformMode === 'translate'} onClick={() => onTransformMode('translate')}><Move size={14} /></ToolButton>
      <ToolButton title="Select and Rotate (E)" active={transformMode === 'rotate'} onClick={() => onTransformMode('rotate')}><RotateCw size={14} /></ToolButton>
      <ToolButton title="Select and Scale (R)" active={transformMode === 'scale'} onClick={() => onTransformMode('scale')}><ScaleIcon size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Select and Link"><Link2 size={14} /></ToolButton>
      <ToolButton title="Unlink Selection"><Unlink size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Mirror" onClick={onMirror}><FlipHorizontal size={14} /></ToolButton>
      <ToolButton title="Array" onClick={onArray}><Grid3x3 size={14} /></ToolButton>
      <ToolButton title="Align (A)" onClick={onAlign}><AlignCenter size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Layer Manager" onClick={onLayerManager}><Layers size={14} /></ToolButton>
      <ToolButton title="Material Editor (M)" onClick={onOpenMaterialEditor}><Palette size={14} /></ToolButton>
      <Sep />
      <ToolButton title="Render Setup" onClick={onRenderSetup}><Camera size={14} /></ToolButton>
      <ToolButton title="Quick Render (Shift+Q)" onClick={onQuickRender}><Play size={14} /></ToolButton>
    </div>
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
