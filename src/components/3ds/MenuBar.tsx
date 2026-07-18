import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
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
type MenuEntry = string | 'sep' | { label: string; sub: string[] };
const menuItems: { label: string; access: string; items: MenuEntry[] }[] = [
  { label: 'File', access: 'F', items: ['New Scene', 'Reset', 'sep', 'Open...', 'Save', 'Save As...', 'sep', 'Save Cloud...', 'Open Cloud...', 'Export Cloud...', 'Import Cloud...', 'sep', 'Import...', 'Export...', 'sep', 'Login...', 'Logout', 'Admin — Liberar usuário...', 'sep', 'Exit'] },
  { label: 'Edit', access: 'E', items: ['Undo', 'Redo', 'sep', 'Hold', 'Fetch', 'sep', 'Delete', 'Clone', 'sep', 'Select All', 'Select None', 'Select Invert', 'sep', 'Region', 'Object Properties...'] },
  { label: 'Group', access: 'G', items: ['Group', 'Ungroup', 'Open', 'Close', 'Attach', 'Detach', 'Explode'] },
  { label: 'Views', access: 'V', items: ['Perspective', 'Top', 'Front', 'Left', 'sep', 'Layout: Single', 'Layout: Quad (3 Wire + Persp)', 'Layout: 2 Cols — Top (Wire) + Persp', 'Layout: 2 Cols — Front (Wire) + Persp', 'Layout: 2 Cols — Left (Wire) + Persp', 'Layout: 2 Rows — Top (Wire) + Persp', 'sep', 'Viewport Configuration...', 'Show Grid', 'Show Statistics', 'sep', 'Update During Spinner Drag'] },
  { label: 'Create', access: 'C', items: ['Standard Primitives', 'Extended Primitives', 'AEC Objects', 'Compound Objects', 'Particle Systems', 'sep', 'Lights', 'Cameras', 'Helpers'] },
  { label: 'Modifiers', access: 'M', items: ['Selection Modifiers', 'Parametric Deformers', 'Free Form Deformers', 'sep', 'Edit Poly', 'Edit Mesh', 'Bend', 'Twist', 'Taper', 'Noise', 'TurboSmooth', 'sep', 'WaltSculpt...'] },
  { label: 'Character', access: 'H', items: ['Create Character', 'Insert Character...', 'Save Character...', 'sep', 'Bone Tools...', 'IK Solvers'] },
  { label: 'Animation', access: 'A', items: ['Set Key', 'Auto Key', 'sep', 'Track View', 'Curve Editor', 'sep', 'Position Constraint', 'LookAt Constraint'] },
  { label: 'Graph Editors', access: 'D', items: ['Track View - Curve Editor', 'Track View - Dope Sheet', 'sep', 'Schematic View'] },
  { label: 'Rendering', access: 'R', items: ['Render...', 'Render Setup...', 'Environment...', 'sep', 'Material Editor...', 'Material/Map Browser...', 'MapTools...', 'sep', 'View Image File...'] },
  { label: 'Customize', access: 'U', items: ['Customize User Interface...', 'Load Custom UI Scheme...', 'Save Custom UI Scheme...', 'sep', { label: 'Interface', sub: ['Interface: Classic', 'Interface: Flat', 'Interface: Game'] }, { label: 'Language', sub: ['Language: English', 'Language: Português', 'Language: Español'] }, 'sep', 'Preferences...', 'Units Setup...', 'Grid and Snap Settings...'] },
  { label: 'MAXScript', access: 'X', items: ['New Script', 'Open Script...', 'Run Script...', 'sep', 'MAXScript Listener'] },
  { label: 'Help', access: 'H', items: ['User Reference', 'MAXScript Reference', 'Tutorials', 'sep', 'Welcome...', 'About Walt3D...'] },
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
            {menu.items.map((item, index) => {
              if (item === 'sep') {
                return <DropdownMenuSeparator key={`sep-${index}`} className="my-0 bg-win-shadow h-px" />;
              }
              const handleClick = (label: string) => {
                if (label.startsWith('Material Editor')) onOpenMaterialEditor();
                if (label.startsWith('Material/Map Browser')) onMaterialBrowser?.();
                if (label === 'Render...') onQuickRender?.();
                if (label.startsWith('Render Setup')) onRenderSetup?.();
                if (label.startsWith('Environment')) onEnvironment?.();
                if (label.startsWith('View Image File')) onViewImageFile?.();
                if (label.startsWith('Save As')) onFileOperation('save');
                if (label === 'Open...') onFileOperation('open');
                if (label === 'Export...') onFileOperation('export');
                if (label === 'Import...') onFileOperation('import');
                if (label === 'Perspective') onViewportChange('perspective');
                if (label === 'Top') onViewportChange('top');
                if (label === 'Front') onViewportChange('front');
                if (label === 'Left') onViewportChange('left');
                if (label === 'Interface: Classic') setTheme('classic');
                if (label === 'Interface: Flat') setTheme('flat');
                if (label === 'Interface: Game') setTheme('game');
                if (label === 'Language: English') setLang('en');
                if (label === 'Language: Português') setLang('pt');
                if (label === 'Language: Español') setLang('es');
                onMenuAction?.(label);
              };
              const itemClass = (label: string) => `text-[11px] rounded-none px-4 py-0.5 cursor-default focus:bg-menu-hover focus:text-menu-hover-fg ${
                (label === 'Perspective' && activeViewport === 'perspective') ||
                (label === 'Top' && activeViewport === 'top') ||
                (label === 'Front' && activeViewport === 'front') ||
                (label === 'Left' && activeViewport === 'left') ||
                (label === 'Interface: Classic' && theme === 'classic') ||
                (label === 'Interface: Flat' && theme === 'flat') ||
                (label === 'Interface: Game' && theme === 'game') ||
                (label === 'Language: English' && lang === 'en') ||
                (label === 'Language: Português' && lang === 'pt') ||
                (label === 'Language: Español' && lang === 'es')
                  ? 'bg-menu-active text-menu-hover-fg'
                  : ''
              }`;
              if (typeof item === 'object') {
                // Strip common prefix like "Interface: " or "Language: " from display
                const displayLabel = (s: string) => {
                  const i = s.indexOf(': ');
                  return i >= 0 ? s.slice(i + 2) : s;
                };
                return (
                  <DropdownMenuSub key={item.label}>
                    <DropdownMenuSubTrigger className={`text-[11px] rounded-none px-4 py-0.5 cursor-default focus:bg-menu-hover focus:text-menu-hover-fg data-[state=open]:bg-menu-hover data-[state=open]:text-menu-hover-fg`}>
                      {t(item.label)}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="min-w-[140px] rounded-none p-0 bevel-raised text-win-text">
                        {item.sub.map((sub) => (
                          <DropdownMenuItem
                            key={sub}
                            className={itemClass(sub)}
                            onClick={() => handleClick(sub)}
                          >
                            {t(displayLabel(sub))}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                );
              }
              return (
                <DropdownMenuItem
                  key={item}
                  className={itemClass(item)}
                  onClick={() => handleClick(item)}
                >
                  {t(item)}
                </DropdownMenuItem>
              );
            })}

          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  );
};
