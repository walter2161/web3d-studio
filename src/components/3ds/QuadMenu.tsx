// Walt3D viewport quad-menu — the 3ds Max right-click contextual menu.
//
// Listens for `walt3d:open-quad-menu` events (dispatched by viewport wrappers)
// and builds a context-sensitive menu based on the current selection and edit
// state. Actions are dispatched back through `walt3d:menu-action` so that
// `Studio3D.handleMenuAction` remains the single dispatch point.
import { useEffect } from 'react';
import { openContextMenu, MenuSection, MenuItem } from './ContextMenu';

const emit = (action: string) => window.dispatchEvent(new CustomEvent('walt3d:menu-action', { detail: action }));

const getSelection = (clickedObjectId?: string): { objects: any[]; selected: any[]; multi: boolean } => {
  const all: any[] = (window as any).__objects || [];
  const ids: string[] = (window as any).__r3SelectedIds || [];
  let selected = all.filter((o) => ids.includes(o.id));
  // React selection state updates after the RMB event. When the user right-clicks
  // an unselected viewport object, build the menu for that object immediately so
  // object-specific items are enabled before the next render tick.
  if (clickedObjectId && !ids.includes(clickedObjectId)) {
    const clicked = all.find((o) => o.id === clickedObjectId);
    if (clicked) selected = [clicked];
  }
  return { objects: all, selected, multi: selected.length > 1 };
};

// Build the sections. The 3ds Max "Quad Menu" has four quadrants; we render
// them as titled sections in a single column (functionally identical, works
// with our menu primitive and is far more readable on small viewports).
const buildSections = (clickedObjectId?: string): MenuSection[] => {
  const { selected, multi } = getSelection(clickedObjectId);
  const sel = selected[0];
  const anySel = selected.length > 0;
  const isGroup = !!sel?.isGroup;
  const isGroupOpen = !!sel?.groupOpen;
  const isMember = !!sel?.groupId;
  const isShape = sel?.type === 'shape' || sel?.type === 'line' || sel?.type === 'spline';
  const subMode: string | null = (window as any).__subObjectMode || null; // 'vertex'|'edge'|'face'|null

  const item = (label: string, action: string, extra: Partial<Exclude<MenuItem, 'separator'>> = {}): MenuItem => ({
    label,
    onClick: () => emit(action),
    ...extra,
  });

  // ---------- Tools quadrant ----------
  const tools: MenuItem[] = [
    item('Move',   'Move',   { hint: 'W' }),
    item('Rotate', 'Rotate', { hint: 'E' }),
    item('Scale',  'Scale',  { hint: 'R' }),
    'separator',
    item('Select All',    'Select All',    { hint: 'Ctrl+A' }),
    item('Select None',   'Select None',   { hint: 'Ctrl+D' }),
    item('Select Invert', 'Select Invert', { hint: 'Ctrl+I' }),
    'separator',
    item('Transform Type-In...', 'Transform Type-In'),
    item('Align...',              'Align', { disabled: !anySel, hint: 'A' }),
  ];

  // ---------- Display quadrant ----------
  const display: MenuItem[] = [
    item('Hide Selection',   'Hide Selection',   { disabled: !anySel }),
    item('Hide Unselected',  'Hide Unselected',  { disabled: !anySel }),
    item('Unhide All',       'Unhide All'),
    'separator',
    item('Freeze Selection', 'Freeze Selection', { disabled: !anySel }),
    item('Unfreeze All',     'Unfreeze All'),
    'separator',
    item('Isolate Selection', 'Isolate Selection', { disabled: !anySel, hint: 'Alt+Q' }),
  ];

  // ---------- Transform quadrant ----------
  const transform: MenuItem[] = [
    item('Clone...',          'Clone',            { disabled: !anySel, hint: 'Ctrl+V' }),
    item('Object Properties...','Object Properties...',{ disabled: !anySel }),
    item('Curve Editor...',   'Curve Editor'),
    item('Dope Sheet...',     'Dope Sheet'),
    'separator',
    item('Wire Parameters...','Wire Parameters', { disabled: true }),
    item('Convert To:', 'noop', {
      disabled: !anySel,
      submenu: [
        item('Editable Mesh',   'Convert To Editable Mesh'),
        item('Editable Poly',   'Convert To Editable Poly'),
        item('Editable Spline', 'Convert To Editable Spline'),
      ],
    }),
    'separator',
    item('Export JSON...', 'Export JSON', { disabled: !anySel }),
    item('Delete',            'Delete', { disabled: !anySel, danger: true, hint: 'Del' }),
  ];

  // ---------- Create / Group quadrant ----------
  const create: MenuItem[] = anySel ? [
    item('Group',   'Group',   { disabled: !multi }),
    item('Ungroup', 'Ungroup', { disabled: !isGroup && !isMember }),
    item('Open',    'Open',    { disabled: !isGroup || isGroupOpen }),
    item('Close',   'Close',   { disabled: !isGroup || !isGroupOpen }),
    item('Attach',  'Attach'),
    item('Detach',  'Detach',  { disabled: !isMember }),
    item('Explode', 'Explode', { disabled: !isGroup }),
    'separator',
    item('Select and Link',   'Select and Link'),
    item('Unlink Selection',  'Unlink Selection'),
  ] : [
    item('Create Box...',      'Create Box'),
    item('Create Sphere...',   'Create Sphere'),
    item('Create Cylinder...', 'Create Cylinder'),
    item('Create Plane...',    'Create Plane'),
    'separator',
    item('Undo',               'Undo', { hint: 'Ctrl+Z' }),
    item('Redo',               'Redo', { hint: 'Ctrl+Y' }),
  ];

  // ---------- Sub-object contextual quadrant (Editable Poly / Spline) ----------
  const subSection: MenuSection | null = subMode ? {
    title: `${subMode.toUpperCase()} Tools`,
    items: subMode === 'vertex' ? [
      item('Chamfer',     'SubObj Chamfer'),
      item('Weld',        'SubObj Weld'),
      item('Target Weld', 'SubObj Target Weld'),
      item('Break',       'SubObj Break'),
      item('Remove',      'SubObj Remove'),
      ...(isShape ? [
        'separator' as const,
        item('Corner',        'Spline Vertex Corner'),
        item('Smooth',        'Spline Vertex Smooth'),
        item('Bezier',        'Spline Vertex Bezier'),
        item('Bezier Corner', 'Spline Vertex Bezier Corner'),
      ] : []),
    ] : subMode === 'edge' ? [
      item('Connect',      'SubObj Connect'),
      item('Chamfer',      'SubObj Chamfer'),
      item('Create Shape', 'SubObj Create Shape'),
      item('Remove',       'SubObj Remove'),
    ] : /* face/poly */ [
      item('Extrude',  'SubObj Extrude'),
      item('Inset',    'SubObj Inset'),
      item('Bevel',    'SubObj Bevel'),
      item('Outline',  'SubObj Outline'),
      item('Chamfer',  'SubObj Chamfer'),
      item('Bridge',   'SubObj Bridge'),
      item('Detach',   'SubObj Detach'),
      item('Flip Normal', 'SubObj Flip'),
    ],
  } : null;

  const sections: MenuSection[] = [];
  if (subSection) sections.push(subSection);
  sections.push({ title: 'Tools',     items: tools });
  sections.push({ title: 'Display',   items: display });
  if (anySel) sections.push({ title: 'Transform', items: transform });
  sections.push({ title: anySel ? 'Group / Link' : 'Create', items: create });
  return sections;
};

export const QuadMenu = () => {
  useEffect(() => {
    const open = (e: Event) => {
      const ce = e as CustomEvent<{ x: number; y: number; objectId?: string }>;
      const { x, y } = ce.detail || { x: 0, y: 0 };
      openContextMenu({ x, y, sections: buildSections(ce.detail?.objectId) });
    };
    window.addEventListener('walt3d:open-quad-menu', open as EventListener);
    return () => window.removeEventListener('walt3d:open-quad-menu', open as EventListener);
  }, []);
  return null;
};
