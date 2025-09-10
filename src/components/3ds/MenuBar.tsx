import { Button } from '@/components/ui/button';
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
}

const menuItems = [
  {
    label: 'File',
    items: ['New Scene', 'Open', 'Save', 'Save As', 'Import', 'Export', 'Exit']
  },
  {
    label: 'Edit',
    items: ['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Delete', 'Select All']
  },
  {
    label: 'Tools',
    items: ['Move', 'Rotate', 'Scale', 'Select', 'Snap Settings']
  },
  {
    label: 'Create',
    items: ['Geometry', 'Lights', 'Cameras', 'Helpers']
  },
  {
    label: 'Modify',
    items: ['Edit Poly', 'Edit Mesh', 'Modifiers']
  },
  {
    label: 'Animation',
    items: ['Set Key', 'Auto Key', 'Track View', 'Curve Editor']
  },
  {
    label: 'Rendering',
    items: ['Render Setup', 'Material Editor', 'Environment']
  },
  {
    label: 'Views',
    items: ['Viewport Config', 'Show Grid', 'Show Helpers']
  }
];

export const MenuBar = ({ onOpenMaterialEditor, onFileOperation }: MenuBarProps) => {
  return (
    <div className="h-8 bg-menu border-b border-panel-border flex items-center px-2 gap-1">
      {menuItems.map((menu) => (
        <DropdownMenu key={menu.label}>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-3 text-xs font-medium hover:bg-menu-hover"
            >
              {menu.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="bg-popover border-panel-border"
            align="start"
          >
            {menu.items.map((item, index) => (
              <div key={item}>
                <DropdownMenuItem 
                  className="text-xs hover:bg-menu-hover cursor-pointer"
                  onClick={() => {
                    if (item === 'Material Editor') onOpenMaterialEditor();
                    if (item === 'Save' || item === 'Save As') onFileOperation('save');
                    if (item === 'Open') onFileOperation('open');
                    if (item === 'Export') onFileOperation('export');
                    if (item === 'Import') onFileOperation('import');
                  }}
                >
                  {item}
                </DropdownMenuItem>
                {(item === 'Exit' || item === 'Select All' || item === 'Snap Settings' || 
                  item === 'Helpers' || item === 'Modifiers' || item === 'Curve Editor' || 
                  item === 'Environment' || item === 'Show Helpers') && 
                  index < menu.items.length - 1 && <DropdownMenuSeparator />}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  );
};