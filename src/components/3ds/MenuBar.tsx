import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MenuBarProps {
  onOpenMaterialEditor: () => void;
  onFileOperation: (type: 'save' | 'open' | 'export' | 'import') => void;
  onViewportChange: (viewport: 'perspective' | 'top' | 'front' | 'left') => void;
  activeViewport: 'perspective' | 'top' | 'front' | 'left';
}

// R3 menu list. Underlined access-key hint via <u>.
const menuItems: { label: string; access: string; items: (string | 'sep')[] }[] = [
  { label: 'File', access: 'F', items: ['New Scene', 'Reset', 'sep', 'Open...', 'Save', 'Save As...', 'sep', 'Import...', 'Export...', 'sep', 'Exit'] },
  { label: 'Edit', access: 'E', items: ['Undo', 'Redo', 'sep', 'Hold', 'Fetch', 'sep', 'Delete', 'Clone', 'sep', 'Select All', 'Select None', 'Select Invert', 'sep', 'Region', 'Object Properties...'] },
  { label: 'Group', access: 'G', items: ['Group', 'Ungroup', 'Open', 'Close', 'Attach', 'Detach', 'Explode'] },
  { label: 'Views', access: 'V', items: ['Perspective', 'Top', 'Front', 'Left', 'sep', 'Viewport Configuration...', 'Show Grid', 'Show Statistics', 'sep', 'Update During Spinner Drag'] },
  { label: 'Create', access: 'C', items: ['Standard Primitives', 'Extended Primitives', 'AEC Objects', 'Compound Objects', 'Particle Systems', 'sep', 'Lights', 'Cameras', 'Helpers'] },
  { label: 'Modifiers', access: 'M', items: ['Selection Modifiers', 'Parametric Deformers', 'Free Form Deformers', 'sep', 'Edit Poly', 'Edit Mesh', 'Bend', 'Twist', 'Taper', 'Noise', 'TurboSmooth'] },
  { label: 'Character', access: 'H', items: ['Create Character', 'Insert Character...', 'Save Character...', 'sep', 'Bone Tools...', 'IK Solvers'] },
  { label: 'Animation', access: 'A', items: ['Set Key', 'Auto Key', 'sep', 'Track View', 'Curve Editor', 'sep', 'Position Constraint', 'LookAt Constraint'] },
  { label: 'Graph Editors', access: 'D', items: ['Track View - Curve Editor', 'Track View - Dope Sheet', 'sep', 'Schematic View'] },
  { label: 'Rendering', access: 'R', items: ['Render...', 'Render Setup...', 'Environment...', 'sep', 'Material Editor...', 'Material/Map Browser...', 'sep', 'View Image File...'] },
  { label: 'Customize', access: 'U', items: ['Customize User Interface...', 'Load Custom UI Scheme...', 'Save Custom UI Scheme...', 'sep', 'Preferences...', 'Units Setup...', 'Grid and Snap Settings...'] },
  { label: 'MAXScript', access: 'X', items: ['New Script', 'Open Script...', 'Run Script...', 'sep', 'MAXScript Listener'] },
  { label: 'Help', access: 'H', items: ['User Reference', 'MAXScript Reference', 'Tutorials', 'sep', 'About 3ds Max...'] },
];

const renderLabel = (label: string, access: string) => {
  const idx = label.toUpperCase().indexOf(access.toUpperCase());
  if (idx < 0) return label;
  return (
    <>
      {label.slice(0, idx)}
      <u>{label[idx]}</u>
      {label.slice(idx + 1)}
    </>
  );
};

export const MenuBar = ({ onOpenMaterialEditor, onFileOperation, onViewportChange, activeViewport }: MenuBarProps) => {
  return (
    <div className="h-[22px] bg-win-face flex items-stretch px-1 border-b border-win-shadow">
      {menuItems.map((menu) => (
        <DropdownMenu key={menu.label}>
          <DropdownMenuTrigger asChild>
            <button
              className="px-2 text-[11px] text-win-text hover:bg-menu-hover hover:text-menu-hover-fg data-[state=open]:bg-menu-hover data-[state=open]:text-menu-hover-fg outline-none flex items-center"
            >
              {renderLabel(menu.label, menu.access)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={0}
            className="min-w-[180px] rounded-none p-0 bevel-raised text-win-text"
          >
            {menu.items.map((item, index) =>
              item === 'sep' ? (
                <DropdownMenuSeparator key={`sep-${index}`} className="my-0 bg-win-shadow h-px" />
              ) : (
                <DropdownMenuItem
                  key={item}
                  className={`text-[11px] rounded-none px-4 py-0.5 cursor-default focus:bg-menu-hover focus:text-menu-hover-fg ${
                    (item === 'Perspective' && activeViewport === 'perspective') ||
                    (item === 'Top' && activeViewport === 'top') ||
                    (item === 'Front' && activeViewport === 'front') ||
                    (item === 'Left' && activeViewport === 'left')
                      ? 'bg-menu-active text-menu-hover-fg'
                      : ''
                  }`}
                  onClick={() => {
                    if (item.startsWith('Material Editor')) onOpenMaterialEditor();
                    if (item === 'Save' || item.startsWith('Save As')) onFileOperation('save');
                    if (item.startsWith('Open')) onFileOperation('open');
                    if (item.startsWith('Export')) onFileOperation('export');
                    if (item.startsWith('Import')) onFileOperation('import');
                    if (item === 'Perspective') onViewportChange('perspective');
                    if (item === 'Top') onViewportChange('top');
                    if (item === 'Front') onViewportChange('front');
                    if (item === 'Left') onViewportChange('left');
                  }}
                >
                  {item}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  );
};
