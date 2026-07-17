import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUITheme } from './r3/UIThemeContext';
import { useLanguage } from './r3/LanguageContext';

interface MenuBarProps {
  onOpenMaterialEditor: () => void;
  onFileOperation: (type: 'save' | 'open' | 'export' | 'import') => void;
  onViewportChange: (viewport: 'perspective' | 'top' | 'front' | 'left') => void;
  activeViewport: 'perspective' | 'top' | 'front' | 'left';
  onQuickRender?: () => void;
  onRenderSetup?: () => void;
  onEnvironment?: () => void;
  onMaterialBrowser?: () => void;
  onViewImageFile?: () => void;
  onMenuAction?: (action: string) => void;
}

// R3 menu list. Underlined access-key hint via <u>.
const menuItems: { label: string; access: string; items: (string | 'sep')[] }[] = [
  { label: 'File', access: 'F', items: ['New Scene', 'Reset', 'sep', 'Open...', 'Save', 'Save As...', 'sep', 'Save Cloud...', 'Open Cloud...', 'Export Cloud...', 'Import Cloud...', 'sep', 'Import...', 'Export...', 'sep', 'Login...', 'Logout', 'Admin — Liberar usuário...', 'sep', 'Exit'] },
  { label: 'Edit', access: 'E', items: ['Undo', 'Redo', 'sep', 'Hold', 'Fetch', 'sep', 'Delete', 'Clone', 'sep', 'Select All', 'Select None', 'Select Invert', 'sep', 'Region', 'Object Properties...'] },
  { label: 'Group', access: 'G', items: ['Group', 'Ungroup', 'Open', 'Close', 'Attach', 'Detach', 'Explode'] },
  { label: 'Views', access: 'V', items: ['Perspective', 'Top', 'Front', 'Left', 'sep', 'Layout: Single', 'Layout: Quad (3 Wire + Persp)', 'Layout: 2 Cols — Top (Wire) + Persp', 'Layout: 2 Cols — Front (Wire) + Persp', 'Layout: 2 Cols — Left (Wire) + Persp', 'Layout: 2 Rows — Top (Wire) + Persp', 'sep', 'Viewport Configuration...', 'Show Grid', 'Show Statistics', 'sep', 'Update During Spinner Drag'] },
  { label: 'Create', access: 'C', items: ['Standard Primitives', 'Extended Primitives', 'AEC Objects', 'Compound Objects', 'Particle Systems', 'sep', 'Lights', 'Cameras', 'Helpers'] },
  { label: 'Modifiers', access: 'M', items: ['Selection Modifiers', 'Parametric Deformers', 'Free Form Deformers', 'sep', 'Edit Poly', 'Edit Mesh', 'Bend', 'Twist', 'Taper', 'Noise', 'TurboSmooth'] },
  { label: 'Character', access: 'H', items: ['Create Character', 'Insert Character...', 'Save Character...', 'sep', 'Bone Tools...', 'IK Solvers'] },
  { label: 'Animation', access: 'A', items: ['Set Key', 'Auto Key', 'sep', 'Track View', 'Curve Editor', 'sep', 'Position Constraint', 'LookAt Constraint'] },
  { label: 'Graph Editors', access: 'D', items: ['Track View - Curve Editor', 'Track View - Dope Sheet', 'sep', 'Schematic View'] },
  { label: 'Rendering', access: 'R', items: ['Render...', 'Render Setup...', 'Environment...', 'sep', 'Material Editor...', 'Material/Map Browser...', 'sep', 'View Image File...'] },
  { label: 'Customize', access: 'U', items: ['Customize User Interface...', 'Load Custom UI Scheme...', 'Save Custom UI Scheme...', 'sep', 'Interface: Classic', 'Interface: Flat', 'Interface: Game', 'sep', 'Language: English', 'Language: Português', 'Language: Español', 'sep', 'Preferences...', 'Units Setup...', 'Grid and Snap Settings...'] },
  { label: 'MAXScript', access: 'X', items: ['New Script', 'Open Script...', 'Run Script...', 'sep', 'MAXScript Listener'] },
  { label: 'Help', access: 'H', items: ['User Reference', 'MAXScript Reference', 'Tutorials', 'sep', 'Welcome...', 'About 3De...'] },
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

export const MenuBar = ({ onOpenMaterialEditor, onFileOperation, onViewportChange, activeViewport, onQuickRender, onRenderSetup, onEnvironment, onMaterialBrowser, onViewImageFile, onMenuAction }: MenuBarProps) => {
  const { theme, setTheme } = useUITheme();
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="h-[22px] bg-win-face flex items-stretch px-1 border-b border-win-shadow">
      {menuItems.map((menu) => (
        <DropdownMenu key={menu.label}>
          <DropdownMenuTrigger asChild>
            <button
              className="px-2 text-[11px] text-win-text hover:bg-menu-hover hover:text-menu-hover-fg data-[state=open]:bg-menu-hover data-[state=open]:text-menu-hover-fg outline-none flex items-center"
            >
              {renderLabel(t(menu.label), menu.access)}
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
                    (item === 'Left' && activeViewport === 'left') ||
                    (item === 'Interface: Classic' && theme === 'classic') ||
                    (item === 'Interface: Flat' && theme === 'flat') ||
                    (item === 'Interface: Game' && theme === 'game') ||
                    (item === 'Language: English' && lang === 'en') ||
                    (item === 'Language: Português' && lang === 'pt') ||
                    (item === 'Language: Español' && lang === 'es')
                      ? 'bg-menu-active text-menu-hover-fg'
                      : ''
                  }`}
                  onClick={() => {
                    if (item.startsWith('Material Editor')) onOpenMaterialEditor();
                    if (item.startsWith('Material/Map Browser')) onMaterialBrowser?.();
                    if (item === 'Render...') onQuickRender?.();
                    if (item.startsWith('Render Setup')) onRenderSetup?.();
                    if (item.startsWith('Environment')) onEnvironment?.();
                    if (item.startsWith('View Image File')) onViewImageFile?.();
                    if (item.startsWith('Save As')) onFileOperation('save');
                    if (item === 'Open...') onFileOperation('open');
                    if (item === 'Export...') onFileOperation('export');
                    if (item === 'Import...') onFileOperation('import');
                    if (item === 'Perspective') onViewportChange('perspective');
                    if (item === 'Top') onViewportChange('top');
                    if (item === 'Front') onViewportChange('front');
                    if (item === 'Left') onViewportChange('left');
                    if (item === 'Interface: Classic') setTheme('classic');
                    if (item === 'Interface: Flat') setTheme('flat');
                    if (item === 'Interface: Game') setTheme('game');
                    // Broadcast raw label for any handler wired via onMenuAction
                    onMenuAction?.(item);
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
