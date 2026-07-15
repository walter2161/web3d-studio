import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModifierControls } from './ModifierControls';
import { cn } from '@/lib/utils';
import { EXT_PRIM_DEFAULTS, SHAPE_DEFAULTS } from './utils/extendedGeometry';

// -------- Geometry parameter schema (drives the Base object panel) --------
type ParamKind = 'float' | 'int';
interface ParamDef { key: string; label: string; kind: ParamKind; default: number; min?: number; step?: number; }

const GEOM_SCHEMA: Record<string, ParamDef[]> = {
  // Standard primitives
  box: [
    { key: 'width',  label: 'Width',  kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'depth',  label: 'Depth',  kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'widthSegments',  label: 'W Segs', kind: 'int', default: 1, min: 1 },
    { key: 'heightSegments', label: 'H Segs', kind: 'int', default: 1, min: 1 },
    { key: 'depthSegments',  label: 'D Segs', kind: 'int', default: 1, min: 1 },
  ],
  sphere: [
    { key: 'radius', label: 'Radius', kind: 'float', default: 0.5, min: 0.001, step: 0.1 },
    { key: 'widthSegments',  label: 'W Segs', kind: 'int', default: 32, min: 3 },
    { key: 'heightSegments', label: 'H Segs', kind: 'int', default: 32, min: 2 },
  ],
  cylinder: [
    { key: 'radiusTop',    label: 'Top R',    kind: 'float', default: 0.5, min: 0, step: 0.1 },
    { key: 'radiusBottom', label: 'Bottom R', kind: 'float', default: 0.5, min: 0, step: 0.1 },
    { key: 'height',       label: 'Height',   kind: 'float', default: 1,   min: 0.001, step: 0.1 },
    { key: 'radialSegments', label: 'Radial Segs', kind: 'int', default: 32, min: 3 },
    { key: 'heightSegments', label: 'Height Segs', kind: 'int', default: 1,  min: 1 },
  ],
  cone: [
    { key: 'radius', label: 'Radius', kind: 'float', default: 0.5, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: 1,   min: 0.001, step: 0.1 },
    { key: 'radialSegments', label: 'Radial Segs', kind: 'int', default: 32, min: 3 },
    { key: 'heightSegments', label: 'Height Segs', kind: 'int', default: 1,  min: 1 },
  ],
  torus: [
    { key: 'radius', label: 'Radius',    kind: 'float', default: 0.5,  min: 0.001, step: 0.1 },
    { key: 'tube',   label: 'Tube',      kind: 'float', default: 0.15, min: 0.001, step: 0.05 },
    { key: 'radialSegments',   label: 'Radial Segs',   kind: 'int', default: 16, min: 3 },
    { key: 'tubularSegments',  label: 'Tubular Segs',  kind: 'int', default: 48, min: 3 },
  ],
  plane: [
    { key: 'width',  label: 'Width',  kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: 1, min: 0.001, step: 0.1 },
    { key: 'widthSegments',  label: 'W Segs', kind: 'int', default: 1, min: 1 },
    { key: 'heightSegments', label: 'H Segs', kind: 'int', default: 1, min: 1 },
  ],
  // Extended primitives — derived from EXT_PRIM_DEFAULTS
  hedra: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.hedra.radius, min: 0.001, step: 0.1 },
    { key: 'family', label: 'Family (0-4)', kind: 'int', default: EXT_PRIM_DEFAULTS.hedra.family, min: 0 },
  ],
  chamferBox: [
    { key: 'width',  label: 'Width',  kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.width, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.height, min: 0.001, step: 0.1 },
    { key: 'depth',  label: 'Depth',  kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.depth, min: 0.001, step: 0.1 },
    { key: 'fillet', label: 'Fillet', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferBox.fillet, min: 0, step: 0.01 },
    { key: 'segments', label: 'Fillet Segs', kind: 'int', default: EXT_PRIM_DEFAULTS.chamferBox.segments, min: 1 },
  ],
  chamferCyl: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferCyl.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferCyl.height, min: 0.001, step: 0.1 },
    { key: 'fillet', label: 'Fillet', kind: 'float', default: EXT_PRIM_DEFAULTS.chamferCyl.fillet, min: 0, step: 0.01 },
    { key: 'sides',    label: 'Sides',      kind: 'int', default: EXT_PRIM_DEFAULTS.chamferCyl.sides, min: 3 },
    { key: 'segments', label: 'Fillet Segs', kind: 'int', default: EXT_PRIM_DEFAULTS.chamferCyl.segments, min: 1 },
  ],
  oilTank: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.oilTank.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.oilTank.height, min: 0.001, step: 0.1 },
    { key: 'capHeight', label: 'Cap Height', kind: 'float', default: EXT_PRIM_DEFAULTS.oilTank.capHeight, min: 0.001, step: 0.05 },
    { key: 'sides', label: 'Sides', kind: 'int', default: EXT_PRIM_DEFAULTS.oilTank.sides, min: 3 },
  ],
  spindle: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.spindle.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.spindle.height, min: 0.001, step: 0.1 },
    { key: 'capHeight', label: 'Cap Height', kind: 'float', default: EXT_PRIM_DEFAULTS.spindle.capHeight, min: 0.001, step: 0.05 },
    { key: 'sides', label: 'Sides', kind: 'int', default: EXT_PRIM_DEFAULTS.spindle.sides, min: 3 },
  ],
  gengon: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.gengon.radius, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.gengon.height, min: 0.001, step: 0.1 },
    { key: 'sides',  label: 'Sides',  kind: 'int',   default: EXT_PRIM_DEFAULTS.gengon.sides,  min: 3 },
    { key: 'fillet', label: 'Fillet', kind: 'float', default: EXT_PRIM_DEFAULTS.gengon.fillet, min: 0, step: 0.01 },
  ],
  torusKnot: [
    { key: 'radius', label: 'Radius', kind: 'float', default: EXT_PRIM_DEFAULTS.torusKnot.radius, min: 0.001, step: 0.1 },
    { key: 'tube',   label: 'Tube',   kind: 'float', default: EXT_PRIM_DEFAULTS.torusKnot.tube,   min: 0.001, step: 0.05 },
    { key: 'tubularSegments', label: 'Tubular Segs', kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.tubularSegments, min: 3 },
    { key: 'radialSegments',  label: 'Radial Segs',  kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.radialSegments,  min: 3 },
    { key: 'p', label: 'P', kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.p, min: 1 },
    { key: 'q', label: 'Q', kind: 'int', default: EXT_PRIM_DEFAULTS.torusKnot.q, min: 1 },
  ],
  ringWave: [
    { key: 'outerRadius', label: 'Outer R', kind: 'float', default: EXT_PRIM_DEFAULTS.ringWave.outerRadius, min: 0.001, step: 0.1 },
    { key: 'innerRadius', label: 'Inner R', kind: 'float', default: EXT_PRIM_DEFAULTS.ringWave.innerRadius, min: 0,     step: 0.1 },
    { key: 'sides',       label: 'Sides',   kind: 'int',   default: EXT_PRIM_DEFAULTS.ringWave.sides, min: 3 },
    { key: 'height',      label: 'Height',  kind: 'float', default: EXT_PRIM_DEFAULTS.ringWave.height, min: 0, step: 0.05 },
  ],
  prism: [
    { key: 'side1',  label: 'Side 1', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.side1, min: 0.001, step: 0.1 },
    { key: 'side2',  label: 'Side 2', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.side2, min: 0.001, step: 0.1 },
    { key: 'side3',  label: 'Side 3', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.side3, min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: EXT_PRIM_DEFAULTS.prism.height, min: 0.001, step: 0.1 },
  ],
  // Shapes
  rectangle: [
    { key: 'width',  label: 'Width',  kind: 'float', default: SHAPE_DEFAULTS.rectangle.width,  min: 0.001, step: 0.1 },
    { key: 'height', label: 'Height', kind: 'float', default: SHAPE_DEFAULTS.rectangle.height, min: 0.001, step: 0.1 },
    { key: 'cornerRadius', label: 'Corner R', kind: 'float', default: SHAPE_DEFAULTS.rectangle.cornerRadius, min: 0, step: 0.01 },
  ],
  circle:  [{ key: 'radius', label: 'Radius', kind: 'float', default: SHAPE_DEFAULTS.circle.radius, min: 0.001, step: 0.1 }],
  ellipse: [
    { key: 'radiusX', label: 'Radius X', kind: 'float', default: SHAPE_DEFAULTS.ellipse.radiusX, min: 0.001, step: 0.1 },
    { key: 'radiusY', label: 'Radius Y', kind: 'float', default: SHAPE_DEFAULTS.ellipse.radiusY, min: 0.001, step: 0.1 },
  ],
  arc: [
    { key: 'radius', label: 'Radius', kind: 'float', default: SHAPE_DEFAULTS.arc.radius, min: 0.001, step: 0.1 },
    { key: 'from',   label: 'From °', kind: 'float', default: SHAPE_DEFAULTS.arc.from, step: 1 },
    { key: 'to',     label: 'To °',   kind: 'float', default: SHAPE_DEFAULTS.arc.to,   step: 1 },
  ],
  donut: [
    { key: 'radius1', label: 'Radius 1', kind: 'float', default: SHAPE_DEFAULTS.donut.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Radius 2', kind: 'float', default: SHAPE_DEFAULTS.donut.radius2, min: 0.001, step: 0.1 },
  ],
  ngon: [
    { key: 'radius', label: 'Radius', kind: 'float', default: SHAPE_DEFAULTS.ngon.radius, min: 0.001, step: 0.1 },
    { key: 'sides',  label: 'Sides',  kind: 'int',   default: SHAPE_DEFAULTS.ngon.sides,  min: 3 },
  ],
  star: [
    { key: 'radius1', label: 'Radius 1', kind: 'float', default: SHAPE_DEFAULTS.star.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Radius 2', kind: 'float', default: SHAPE_DEFAULTS.star.radius2, min: 0.001, step: 0.1 },
    { key: 'points',  label: 'Points',   kind: 'int',   default: SHAPE_DEFAULTS.star.points,  min: 3 },
  ],
  helix: [
    { key: 'radius1', label: 'Radius 1', kind: 'float', default: SHAPE_DEFAULTS.helix.radius1, min: 0.001, step: 0.1 },
    { key: 'radius2', label: 'Radius 2', kind: 'float', default: SHAPE_DEFAULTS.helix.radius2, min: 0.001, step: 0.1 },
    { key: 'height',  label: 'Height',   kind: 'float', default: SHAPE_DEFAULTS.helix.height,  min: 0.001, step: 0.1 },
    { key: 'turns',   label: 'Turns',    kind: 'int',   default: SHAPE_DEFAULTS.helix.turns,   min: 1 },
  ],
  line: [
    { key: '__knotCount', label: 'Vertices (read-only)', kind: 'int', default: 0 },
  ],
};
import {
  Box,
  Circle,
  Cylinder,
  Triangle,
  Torus,
  Square,
  Lightbulb,
  Camera,
  Settings,
  Palette,
  Wrench,
  Move3d,
  Eye,
  GitBranch,
  Spline,
  Waves,
  Sparkles,
} from 'lucide-react';

interface SidePanelProps {
  onCreateObject: (type: string) => void;
  onArmTool?: (type: string) => void;
  armedTool?: string | null;
  activeTab?: string;
  onActiveTabChange?: (tab: string) => void;
  selectedObject: any;
  onOpenMaterialEditor?: () => void;
  onAddModifier: (objectId: string, modifierType: string) => void;
  onUpdateModifier: (objectId: string, modifierId: string, params: any) => void;
  onRemoveModifier: (objectId: string, modifierId: string) => void;
  onToggleModifier?: (objectId: string, modifierId: string) => void;
  onReorderModifier?: (objectId: string, modifierId: string, direction: -1 | 1) => void;
  onRenameObject?: (objectId: string, name: string) => void;
  onUpdateObjectGeometry: (objectId: string, params: any) => void;
  onUpdateObjectLightData?: (objectId: string, params: any) => void;
  onUpdateObjectCameraData?: (objectId: string, params: any) => void;
  onUpdateObjectColor?: (objectId: string, color: string) => void;

}

export const SidePanel = ({
  onCreateObject,
  onArmTool,
  armedTool,
  activeTab: activeTabProp,
  onActiveTabChange,
  selectedObject,
  onOpenMaterialEditor,
  onAddModifier,
  onUpdateModifier,
  onRemoveModifier,
  onToggleModifier,
  onReorderModifier,
  onRenameObject,
  onUpdateObjectGeometry,
  onUpdateObjectLightData,
  onUpdateObjectCameraData,
  onUpdateObjectColor,

}: SidePanelProps) => {
  const [internalTab, setInternalTab] = useState('create');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: string) => { onActiveTabChange ? onActiveTabChange(t) : setInternalTab(t); };
  const [createCat, setCreateCat] = useState<'geometry' | 'shapes' | 'lights' | 'cameras' | 'helpers' | 'warps' | 'systems'>('geometry');
  const [createCategory, setCreateCategory] = useState<'standard' | 'extended' | 'shapes' | 'lights' | 'cameras'>('standard');
  // 'base' selects the base object parameters; a modifier id selects that modifier.
  const [selectedStackItem, setSelectedStackItem] = useState<string>('base');

  const standardPrimitives = [
    { type: 'box', icon: Box, label: 'Box' },
    { type: 'sphere', icon: Circle, label: 'Sphere' },
    { type: 'cylinder', icon: Cylinder, label: 'Cylinder' },
    { type: 'cone', icon: Triangle, label: 'Cone' },
    { type: 'torus', icon: Torus, label: 'Torus' },
    { type: 'plane', icon: Square, label: 'Plane' },
  ];

  const extendedPrimitives = [
    { type: 'hedra',      label: 'Hedra' },
    { type: 'chamferBox', label: 'ChamferBox' },
    { type: 'chamferCyl', label: 'ChamferCyl' },
    { type: 'oilTank',    label: 'OilTank' },
    { type: 'spindle',    label: 'Spindle' },
    { type: 'gengon',     label: 'Gengon' },
    { type: 'torusKnot',  label: 'Torus Knot' },
    { type: 'ringWave',   label: 'RingWave' },
    { type: 'prism',      label: 'Prism' },
  ];

  const shapes = [
    { type: 'line',      label: 'Line' },
    { type: 'rectangle', label: 'Rectangle' },
    { type: 'circle',    label: 'Circle' },
    { type: 'ellipse',   label: 'Ellipse' },
    { type: 'arc',       label: 'Arc' },
    { type: 'donut',     label: 'Donut' },
    { type: 'ngon',      label: 'NGon' },
    { type: 'star',      label: 'Star' },
    { type: 'text',      label: 'Text' },
    { type: 'helix',     label: 'Helix' },
  ];


  // category: 'shape' → apply only to SplineShape; 'mesh' → apply only to Mesh/Poly;
  // 'universal' → apply to anything geometric. 'converts' marks modifiers that
  // change the current pipeline class (e.g. Extrude turns a shape into a mesh).
  const modifiers: Array<{ name: string; description: string; category: 'shape' | 'mesh' | 'universal'; converts?: 'mesh' }> = [
    { name: 'Bend', description: 'Entorta o objeto em torno de um eixo', category: 'universal' },
    { name: 'Twist', description: 'Torce o objeto em torno de um eixo', category: 'universal' },
    { name: 'Taper', description: 'Afunila a forma, estreitando ou expandindo', category: 'universal' },
    { name: 'Stretch', description: 'Estica ou comprime o objeto', category: 'universal' },
    { name: 'Skew', description: 'Inclina a geometria', category: 'universal' },
    { name: 'Noise', description: 'Adiciona irregularidades aleatórias na malha', category: 'universal' },
    { name: 'FFD', description: 'Deforma o objeto usando caixas de controle', category: 'universal' },
    { name: 'Shell', description: 'Adiciona espessura a superfícies planas', category: 'mesh' },
    { name: 'Edit Poly', description: 'Permite editar vértices, arestas, polígonos', category: 'mesh' },
    { name: 'Edit Mesh', description: 'Edição direta de malhas triangulares', category: 'mesh' },
    { name: 'TurboSmooth', description: 'Suaviza e aumenta o número de polígonos', category: 'mesh' },
    { name: 'MeshSmooth', description: 'Subdivide suavizando a malha', category: 'mesh' },
    { name: 'Symmetry', description: 'Espelha o objeto em um eixo', category: 'mesh' },
    { name: 'Mirror', description: 'Reflete a geometria', category: 'universal' },
    { name: 'UVW Map', description: 'Mapeamento simples de coordenadas de textura', category: 'mesh' },
    { name: 'Unwrap UVW', description: 'Controle avançado de mapeamento UV', category: 'mesh' },
    { name: 'Lathe', description: 'Revolve uma spline para criar formas cilíndricas', category: 'shape', converts: 'mesh' },
    { name: 'Extrude', description: 'Extruda uma spline para gerar volume', category: 'shape', converts: 'mesh' },
    { name: 'Bevel', description: 'Extrusão com controle de perfis chanfrados', category: 'shape', converts: 'mesh' },
    { name: 'Slice', description: 'Corta o objeto em partes', category: 'universal' },
  ];

  // Base-object class. Shapes (Line/Rectangle/Circle/...) are SplineShape until
  // Extrude/Lathe/Bevel turns them into a Mesh. Lights/cameras/helpers → none.
  const SHAPE_TYPES = new Set(['line', 'rectangle', 'circle', 'ellipse', 'arc', 'donut', 'ngon', 'star', 'helix', 'text']);
  const NON_GEOM_PREFIXES = ['light_', 'camera_', 'helper_'];
  const classifyBase = (t: string): 'shape' | 'mesh' | 'none' => {
    if (!t) return 'none';
    if (NON_GEOM_PREFIXES.some((p) => t.startsWith(p))) return 'none';
    if (SHAPE_TYPES.has(t)) return 'shape';
    return 'mesh';
  };

  // Walks the stack (evaluation order = array order) to find the current pipeline
  // class, exactly like the 3ds Max stack (Shape → Extrude → Mesh → Edit Poly → Poly).
  const currentObjectClass = (obj: any): 'shape' | 'mesh' | 'none' => {
    let cls = classifyBase(obj?.type);
    const stack: any[] = obj?.modifiers || [];
    for (const m of stack) {
      if (m?.active === false) continue;
      const def = modifiers.find((x) => x.name === m.type);
      if (def?.converts) cls = def.converts;
    }
    return cls;
  };

  const availableModifiers = selectedObject
    ? (() => {
        const cls = currentObjectClass(selectedObject);
        if (cls === 'none') return [] as typeof modifiers;
        return modifiers.filter((m) => m.category === 'universal' || m.category === cls);
      })()
    : modifiers;

  const lightSubtypes = [
    { type: 'light_omni',        label: 'Omni' },
    { type: 'light_spot',        label: 'Target Spot' },
    { type: 'light_spot_free',   label: 'Free Spot' },
    { type: 'light_direct',      label: 'Target Direct' },
    { type: 'light_direct_free', label: 'Free Direct' },
    { type: 'light_skylight',    label: 'Skylight' },
    { type: 'light_ambient',     label: 'Ambient' },
  ];
  const cameraSubtypes = [
    { type: 'camera_target', label: 'Target Camera' },
    { type: 'camera_free',   label: 'Free Camera' },
  ];

  // R3 command-panel top tabs (icon buttons)
  const panelTabs = [
    { id: 'create', label: 'Create', icon: Sparkles },
    { id: 'modify', label: 'Modify', icon: Wrench },
    { id: 'hierarchy', label: 'Hierarchy', icon: GitBranch },
    { id: 'motion', label: 'Motion', icon: Move3d },
    { id: 'display', label: 'Display', icon: Eye },
    { id: 'utilities', label: 'Utilities', icon: Settings },
  ] as const;

  const createCats = [
    { id: 'geometry', label: 'Geometry',    icon: Box },
    { id: 'shapes',   label: 'Shapes',      icon: Spline },
    { id: 'lights',   label: 'Lights',      icon: Lightbulb },
    { id: 'cameras',  label: 'Cameras',     icon: Camera },
    { id: 'helpers',  label: 'Helpers',     icon: Triangle },
    { id: 'warps',    label: 'Space Warps', icon: Waves },
    { id: 'systems',  label: 'Systems',     icon: Settings },
  ] as const;


  const R3TabBtn = ({ active, onClick, title, children }: any) => (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'flex-1 min-w-0 h-[26px] flex items-center justify-center gap-1 text-[11px] text-win-text',
        active ? 'bevel-sunken' : 'bevel-raised hover:brightness-105'
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="w-full h-full bg-panel border-l border-panel-border overflow-y-auto">
      {/* R3-style command panel tab row */}
      <div className="bevel-raised p-[2px] flex gap-[2px]">
        {panelTabs.map((t) => {
          const Icon = t.icon;
          return (
            <R3TabBtn
              key={t.id}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              title={t.label}
            >
              <Icon size={13} />
            </R3TabBtn>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">

        <div className="p-2 space-y-2">
          <TabsContent value="create" className="mt-0 space-y-2">
            {/* Category icon row (Geometry / Shapes / Lights / Cameras / Helpers / Warps / Systems) */}
            <div className="bevel-raised p-[2px] flex gap-[2px]">
              {createCats.map((c) => {
                const Icon = c.icon;
                const active = createCat === c.id;
                return (
                  <R3TabBtn
                    key={c.id}
                    active={active}
                    onClick={() => {
                      setCreateCat(c.id as any);
                      if (c.id === 'geometry') setCreateCategory('standard');
                      if (c.id === 'shapes')   setCreateCategory('shapes');
                      if (c.id === 'lights')   setCreateCategory('lights');
                      if (c.id === 'cameras')  setCreateCategory('cameras');
                    }}
                    title={c.label}
                  >
                    <Icon size={13} />
                  </R3TabBtn>
                );
              })}
            </div>

            {/* Sub-category dropdown (Standard / Extended Primitives, etc.) */}
            {createCat === 'geometry' && (
              <select
                value={createCategory === 'extended' ? 'extended' : 'standard'}
                onChange={(e) => setCreateCategory(e.target.value as any)}
                className="w-full h-[22px] text-[11px] bevel-sunken bg-win-face px-1 text-win-text"
              >
                <option value="standard">Standard Primitives</option>
                <option value="extended">Extended Primitives</option>
              </select>
            )}

            {/* Object Type rollout — R3-style beveled 2-column button grid */}
            <div className="bevel-raised">
              <div className="bg-win-face-shadow/40 text-[11px] font-semibold px-2 py-[2px] text-win-text border-b border-win-shadow">
                Object Type
              </div>
              <div className="p-1 grid grid-cols-2 gap-[3px]">
                {createCategory === 'standard' && standardPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <button
                      key={p.type}
                      onClick={() => (onArmTool ? onArmTool(p.type) : onCreateObject(p.type))}
                      title={pressed ? 'Armed — click & drag in the viewport (ESC)' : `Create ${p.label}`}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCategory === 'extended' && extendedPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <button
                      key={p.type}
                      onClick={() => (onArmTool ? onArmTool(p.type) : onCreateObject(p.type))}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {createCategory === 'shapes' && shapes.map((s) => {
                  const pressed = armedTool === s.type;
                  return (
                    <button
                      key={s.type}
                      onClick={() => (onArmTool ? onArmTool(s.type) : onCreateObject(s.type))}
                      className={cn(
                        'h-[22px] text-[11px] text-win-text px-1 truncate',
                        pressed ? 'bevel-sunken bg-yellow-200' : 'bevel-raised hover:brightness-105'
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
                {createCategory === 'lights' && lightSubtypes.map((l) => (
                  <button
                    key={l.type}
                    onClick={() => onCreateObject(l.type)}
                    title={`Create ${l.label}`}
                    className="h-[22px] text-[11px] text-win-text px-1 truncate bevel-raised hover:brightness-105"
                  >
                    {l.label}
                  </button>
                ))}
                {createCategory === 'cameras' && cameraSubtypes.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => onCreateObject(c.type)}
                    title={`Create ${c.label}`}
                    className="h-[22px] text-[11px] text-win-text px-1 truncate bevel-raised hover:brightness-105"
                  >
                    {c.label}
                  </button>
                ))}
                {(createCat === 'helpers' || createCat === 'warps' || createCat === 'systems') && (
                  <div className="col-span-2 text-[11px] text-win-text-disabled px-1 py-2 text-center">
                    (Em desenvolvimento)
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="modify" className="mt-0 space-y-2">
            {!selectedObject && (
              <div className="bevel-inset bg-win-face-shadow/40 text-[11px] text-win-text-disabled px-2 py-3 text-center">
                No object selected
              </div>
            )}

            {selectedObject && (() => {
              const objName = selectedObject.name || `${selectedObject.type}_${(selectedObject.id || '').slice(0, 6)}`;
              const mods: any[] = selectedObject.modifiers || [];
              // Display stack top-first (last modifier appears on top), like 3ds Max.
              const stackDisplay = [...mods].reverse();
              const baseLabel = String(selectedObject.type || 'Object').replace(/^./, (c) => c.toUpperCase());
              const activeModifier = mods.find((m) => m.id === selectedStackItem);

              return (
                <>
                  {/* Object name */}
                  <div className="bevel-inset px-1 py-[2px]">
                    <input
                      className="w-full h-[20px] text-[11px] bg-white border border-win-shadow px-1 text-win-text"
                      value={objName}
                      onChange={(e) => onRenameObject?.(selectedObject.id, e.target.value)}
                    />
                  </div>

                  {/* Modifier List — classic R3 combobox (native select) */}
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (name) onAddModifier(selectedObject.id, name);
                      e.target.value = '';
                    }}
                    className="w-full h-[22px] text-[11px] bevel-sunken bg-white px-1 text-win-text border border-win-shadow"
                    disabled={availableModifiers.length === 0}
                    title={availableModifiers.length === 0
                      ? 'No modifiers available for this object class'
                      : 'Modifier List — pick to add on top of the stack'}
                  >
                    <option value="">
                      {availableModifiers.length === 0 ? '— No modifiers available —' : 'Modifier List'}
                    </option>
                    {(() => {
                      const cls = currentObjectClass(selectedObject);
                      const groups: Array<{ label: string; items: typeof modifiers }> = [];
                      if (cls === 'shape') {
                        groups.push({ label: 'SELECTION MODIFIERS', items: [] });
                        groups.push({ label: 'OBJECT-SPACE MODIFIERS', items: availableModifiers.filter((m) => m.category === 'shape' || m.category === 'universal') });
                      } else {
                        groups.push({ label: 'OBJECT-SPACE MODIFIERS', items: availableModifiers });
                      }
                      return groups.filter((g) => g.items.length > 0).map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.items.map((m) => (
                            <option key={m.name} value={m.name} title={m.description}>{m.name}</option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>

                  {/* Modifier Stack */}
                  <div className="bevel-inset bg-white">
                    {stackDisplay.map((m: any) => {
                      const selected = selectedStackItem === m.id;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'flex items-center gap-1 h-[20px] px-1 text-[11px] text-win-text border-b border-win-shadow/40 cursor-pointer',
                            selected ? 'bg-win-highlight text-white' : 'hover:bg-win-face-shadow/40'
                          )}
                          onClick={() => setSelectedStackItem(m.id)}
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3"
                            checked={m.active !== false}
                            onChange={(e) => { e.stopPropagation(); onToggleModifier?.(selectedObject.id, m.id); }}
                            onClick={(e) => e.stopPropagation()}
                            title="Enable/disable modifier"
                          />
                          <span className="flex-1 truncate">{m.type}</span>
                        </div>
                      );
                    })}
                    {/* Base object row */}
                    <div
                      className={cn(
                        'flex items-center gap-1 h-[20px] px-1 text-[11px] font-semibold text-win-text cursor-pointer',
                        selectedStackItem === 'base' ? 'bg-win-highlight text-white' : 'hover:bg-win-face-shadow/40'
                      )}
                      onClick={() => setSelectedStackItem('base')}
                    >
                      <span className="w-3" />
                      <span className="flex-1 truncate">{baseLabel}</span>
                    </div>
                  </div>

                  {/* Stack action row */}
                  <div className="flex items-center gap-[2px]">
                    <button
                      className="flex-1 h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text disabled:opacity-50"
                      disabled={!activeModifier}
                      title="Move modifier up (later in evaluation)"
                      onClick={() => activeModifier && onReorderModifier?.(selectedObject.id, activeModifier.id, 1)}
                    >
                      ▲
                    </button>
                    <button
                      className="flex-1 h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text disabled:opacity-50"
                      disabled={!activeModifier}
                      title="Move modifier down (earlier in evaluation)"
                      onClick={() => activeModifier && onReorderModifier?.(selectedObject.id, activeModifier.id, -1)}
                    >
                      ▼
                    </button>
                    <button
                      className="flex-1 h-[20px] text-[11px] bevel-raised hover:brightness-105 text-win-text disabled:opacity-50"
                      disabled={!activeModifier}
                      title="Delete modifier"
                      onClick={() => {
                        if (!activeModifier) return;
                        onRemoveModifier(selectedObject.id, activeModifier.id);
                        setSelectedStackItem('base');
                      }}
                    >
                      🗑
                    </button>
                  </div>

                  {/* Selected modifier parameters */}
                  {activeModifier && (
                    <ModifierControls
                      key={activeModifier.id}
                      modifier={activeModifier}
                      onUpdateModifier={(params) => onUpdateModifier(selectedObject.id, activeModifier.id, params)}
                      onRemoveModifier={() => {
                        onRemoveModifier(selectedObject.id, activeModifier.id);
                        setSelectedStackItem('base');
                      }}
                    />
                  )}
                </>
              );
            })()}

            {/* Base object parameters — visible only when the base is selected in the stack */}
            {selectedObject && selectedStackItem === 'base' && (
              <>
                {/* Light Parameters — R3-style General / Intensity/Color / Attenuation / Spot / Shadows */}
                {String(selectedObject.type || '').startsWith('light_') && (
                  <LightParameters
                    object={selectedObject}
                    onUpdateColor={(c) => onUpdateObjectColor?.(selectedObject.id, c)}
                    onUpdateLightData={(patch) => onUpdateObjectLightData?.(selectedObject.id, patch)}
                  />
                )}

                {/* Camera Parameters — R3-style panel for Target / Free cameras */}
                {String(selectedObject.type || '').startsWith('camera_') && (
                  <CameraParameters
                    object={selectedObject}
                    onUpdateCameraData={(patch) => onUpdateObjectCameraData?.(selectedObject.id, patch)}
                  />
                )}





                {/* Base Geometry Controls — schema-driven, real values from selectedObject.geometry */}
                <Card className="bg-card border-panel-border mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                      Geometry Parameters
                      <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                        {selectedObject.type}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(() => {
                      const schema = GEOM_SCHEMA[selectedObject.type];
                      if (!schema) {
                        return (
                          <div className="text-xs text-muted-foreground">
                            No editable parameters for type <span className="font-mono">{selectedObject.type}</span>.
                          </div>
                        );
                      }
                      const geom = selectedObject.geometry || {};
                      // Read-only badges for line: vertex count
                      const isLine = selectedObject.type === 'line';
                      if (isLine) {
                        const knots = Array.isArray(geom.knots) ? geom.knots.length : 0;
                        return (
                          <div className="text-xs space-y-1 font-mono">
                            <div>Vertices: <span className="text-foreground">{knots}</span></div>
                            <div>Closed: <span className="text-foreground">{geom.closed ? 'Yes' : 'No'}</span></div>
                            <div className="text-muted-foreground text-[10px] mt-1">
                              Line vertices are edited in sub-object mode.
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-2 gap-2">
                          {schema.map((p) => {
                            const rawVal = geom[p.key];
                            const displayVal = rawVal !== undefined && rawVal !== null ? rawVal : p.default;
                            return (
                              <div key={p.key}>
                                <Label className="text-[10px]">{p.label}</Label>
                                <Input
                                  type="number"
                                  value={displayVal}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const parsed = p.kind === 'int' ? parseInt(raw, 10) : parseFloat(raw);
                                    const next = Number.isFinite(parsed)
                                      ? (p.min !== undefined ? Math.max(p.min, parsed) : parsed)
                                      : p.default;
                                    onUpdateObjectGeometry(selectedObject.id, { [p.key]: next });
                                  }}
                                  className="h-7 text-xs"
                                  step={p.step ?? (p.kind === 'int' ? 1 : 0.1)}
                                  min={p.min}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Object Properties */}
                <Card className="bg-card border-panel-border mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Object Properties</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Name</label>
                      <div className="text-sm font-mono">
                        {selectedObject.name || `${selectedObject.type}_${selectedObject.id.slice(0, 8)}`}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Position</label>
                      <div className="text-xs font-mono space-y-1">
                        <div>X: {selectedObject.position[0].toFixed(2)}</div>
                        <div>Y: {selectedObject.position[1].toFixed(2)}</div>
                        <div>Z: {selectedObject.position[2].toFixed(2)}</div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Material</label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-1 gap-2 border-panel-border hover:bg-menu-hover"
                        onClick={onOpenMaterialEditor}
                      >
                        <Palette className="w-4 h-4" />
                        Edit Material
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="hierarchy" className="mt-0 space-y-3">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Pivot</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => onUpdateObjectGeometry(selectedObject?.id, { __pivotMode: 'affectPivot' })}>
                  Affect Pivot Only
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => onUpdateObjectGeometry(selectedObject?.id, { __pivotMode: 'affectObject' })}>
                  Affect Object Only
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => onUpdateObjectGeometry(selectedObject?.id, { __pivotMode: 'affectHierarchy' })}>
                  Affect Hierarchy Only
                </Button>
                <div className="border-t border-panel-border my-1" />
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Center to Object
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Align to Object
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Align to World
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Reset Pivot
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Link Info</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <div>Parent: <span className="text-muted-foreground">{selectedObject?.groupId || '— none —'}</span></div>
                <div>Locks: Move X ☐ Y ☐ Z ☐</div>
                <div>Locks: Rotate X ☐ Y ☐ Z ☐</div>
                <div>Locks: Scale X ☐ Y ☐ Z ☐</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="motion" className="mt-0 space-y-3">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Parameters</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs">Controllers per axis (R3):</div>
                <div className="text-xs pl-2 space-y-1">
                  <div>Position: <span className="font-mono">Bezier</span></div>
                  <div>Rotation: <span className="font-mono">Euler XYZ</span></div>
                  <div>Scale: <span className="font-mono">Bezier</span></div>
                </div>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}>
                  Assign Controller...
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Trajectories</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Enable per-object trajectories from the Animation Timeline panel.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="display" className="mt-0 space-y-3">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Hide</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'hideSelection' })}>
                  Hide Selection
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'unhideAll' })}>
                  Unhide All
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'hideUnselected' })}>
                  Hide Unselected
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Freeze</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'freezeSelection' })}>
                  Freeze Selection
                </Button>
                <Button variant="outline" size="sm" className="w-full border-panel-border" disabled={!selectedObject}
                  onClick={() => selectedObject && onUpdateObjectGeometry(selectedObject.id, { __display: 'unfreezeAll' })}>
                  Unfreeze All
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Display Properties</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Display as Box</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Backface Cull</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Edges Only</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Vertex Ticks</label>
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Trajectory</label>
              </CardContent>
            </Card>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
};

// ------------------------------------------------------------------
// R3-style Light Parameters rollout — matches the 3ds Max R3 panel layout:
// General Parameters / Intensity / Color / Attenuation / Spot Parameters /
// Shadow Parameters. Applies to Omni, Spot (target & free), Direct (target &
// free), Skylight and Ambient — irrelevant sections are hidden per type.
// ------------------------------------------------------------------
interface LightParamsProps {
  object: any;
  onUpdateColor: (color: string) => void;
  onUpdateLightData: (patch: any) => void;
}

const LightParameters = ({ object, onUpdateColor, onUpdateLightData }: LightParamsProps) => {
  const t: string = object.type;
  const ld = object.lightData || {};
  const isSpot = t === 'light_spot';
  const isDirect = t === 'light_direct';
  const isOmni = t === 'light_omni';
  const isSky = t === 'light_skylight';
  const isAmbient = t === 'light_ambient';
  const hasCone = isSpot;
  const hasAtten = isOmni || isSpot || isDirect;
  const hasShadow = isOmni || isSpot || isDirect;

  const numRow = (label: string, key: string, def: number, min = 0, step = 0.1) => (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[10px] flex-1">{label}</Label>
      <Input
        type="number"
        value={ld[key] ?? def}
        step={step}
        min={min}
        className="h-6 w-20 text-xs"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onUpdateLightData({ [key]: Number.isFinite(v) ? Math.max(min, v) : def });
        }}
      />
    </div>
  );

  return (
    <>
      <Card className="bg-card border-panel-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">General Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={ld.on !== false}
              onChange={(e) => onUpdateLightData({ on: e.target.checked })}
            />
            On
          </label>
          {hasShadow && (
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={!!ld.castShadow}
                onChange={(e) => onUpdateLightData({ castShadow: e.target.checked })}
              />
              Cast Shadows
            </label>
          )}
          <div className="text-[10px] text-muted-foreground font-mono uppercase">Type: {t.replace('light_', '')}</div>
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Intensity / Color / Attenuation</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] flex-1">Multiplier</Label>
            <Input
              type="number"
              value={ld.intensity ?? 1}
              step={0.1}
              className="h-6 w-20 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onUpdateLightData({ intensity: Number.isFinite(v) ? v : 1 });
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] flex-1">Color</Label>
            <input
              type="color"
              value={object.color || '#ffffff'}
              onChange={(e) => onUpdateColor(e.target.value)}
              className="h-6 w-12 border border-win-shadow"
            />
          </div>
          {isSky && (
            <>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] flex-1">Ground Color</Label>
                <input
                  type="color"
                  value={ld.groundColor || '#4a3a2a'}
                  onChange={(e) => onUpdateLightData({ groundColor: e.target.value })}
                  className="h-6 w-12 border border-win-shadow"
                />
              </div>
            </>
          )}
          {hasAtten && (
            <>
              <div className="text-[10px] uppercase text-muted-foreground pt-1">Far Attenuation</div>
              {numRow('Distance', 'distance', 0, 0, 0.5)}
              {numRow('Decay', 'decay', 2, 0, 0.1)}
            </>
          )}
        </CardContent>
      </Card>

      {hasCone && (
        <Card className="bg-card border-panel-border mt-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Spot Parameters</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] flex-1">Hotspot (rad)</Label>
              <Input
                type="number"
                value={ld.hotspot ?? (ld.angle ?? Math.PI / 6) * 0.8}
                step={0.01}
                min={0}
                className="h-6 w-20 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateLightData({ hotspot: Number.isFinite(v) ? Math.max(0, v) : 0.4 });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] flex-1">Falloff (angle)</Label>
              <Input
                type="number"
                value={ld.angle ?? Math.PI / 6}
                step={0.01}
                min={0}
                className="h-6 w-20 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateLightData({ angle: Number.isFinite(v) ? Math.max(0.01, v) : Math.PI / 6 });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] flex-1">Penumbra</Label>
              <Input
                type="number"
                value={ld.penumbra ?? 0.2}
                step={0.05}
                min={0}
                className="h-6 w-20 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateLightData({ penumbra: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.2 });
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isAmbient && (
        <div className="text-[10px] text-muted-foreground px-1 pt-1">
          Ambient light has no direction — only Color and Multiplier apply.
        </div>
      )}
    </>
  );
};

// ---------------- Camera Parameters (R3-style) ----------------
// Panel matching 3ds Max R3 Modify panel for Target / Free cameras:
// Parameters (Lens, FOV, Show Cone/Horizon), Environment Ranges,
// Clipping Planes, Multi-Pass Depth of Field.
interface CameraParamsProps {
  object: any;
  onUpdateCameraData: (patch: any) => void;
}

// Standard 3ds Max lens<->fov relation (35mm film, ~43.27mm diagonal).
// The Max R3 default is Lens 43.456 mm ≈ FOV 45° (horizontal).
const APERTURE_WIDTH = 36; // mm (horizontal aperture, matches Max defaults)
const lensToFov = (lens: number) =>
  (2 * Math.atan(APERTURE_WIDTH / (2 * lens)) * 180) / Math.PI;
const fovToLens = (fov: number) =>
  APERTURE_WIDTH / (2 * Math.tan((fov * Math.PI) / 180 / 2));

const CameraParameters = ({ object, onUpdateCameraData }: CameraParamsProps) => {
  const t = object.type as string;
  const isTarget = t === 'camera_target';
  const cd = object.cameraData || {};
  const fov = cd.fov ?? 45;
  const lens = cd.lens ?? fovToLens(fov);
  const near = cd.near ?? 0.1;
  const far = cd.far ?? 1000;
  const showCone = cd.showCone !== false;
  const showHorizon = !!cd.showHorizon;
  const manualClip = !!cd.manualClip;
  const nearRange = cd.nearRange ?? 0;
  const farRange = cd.farRange ?? 1000;
  const dof = !!cd.dofEnabled;
  const focus = cd.focusDistance ?? 100;
  const aperture = cd.aperture ?? 2.0;
  const targetDist = cd.targetDistance ?? 100;

  const setFov = (v: number) => {
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(1, Math.min(175, v));
    onUpdateCameraData({ fov: clamped, lens: fovToLens(clamped) });
  };
  const setLens = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return;
    onUpdateCameraData({ lens: v, fov: lensToFov(v) });
  };

  // Stock 3ds Max R3 "Stock Lenses" buttons.
  const stockLenses = [15, 20, 24, 28, 35, 50, 85, 135, 200];

  return (
    <>
      <Card className="bg-card border-panel-border mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Parameters
            <span className="ml-2 text-[10px] text-muted-foreground font-mono">
              {isTarget ? 'Target Camera' : 'Free Camera'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Label className="w-16">Lens:</Label>
            <Input
              type="number"
              value={Number(lens.toFixed(3))}
              step={0.5}
              min={1}
              className="h-6 w-24 text-xs"
              onChange={(e) => setLens(parseFloat(e.target.value))}
            />
            <span className="text-[10px] text-muted-foreground">mm</span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-16">FOV:</Label>
            <Input
              type="number"
              value={Number(fov.toFixed(2))}
              step={1}
              min={1}
              max={175}
              className="h-6 w-24 text-xs"
              onChange={(e) => setFov(parseFloat(e.target.value))}
            />
            <span className="text-[10px] text-muted-foreground">degrees</span>
          </div>

          <div className="pt-1">
            <div className="text-[10px] text-muted-foreground mb-1">Stock Lenses</div>
            <div className="grid grid-cols-3 gap-1">
              {stockLenses.map((l) => (
                <Button
                  key={l}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-1 border-panel-border"
                  onClick={() => setLens(l)}
                >
                  {l}mm
                </Button>
              ))}
            </div>
          </div>

          <div className="pt-1 space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showCone}
                onChange={(e) => onUpdateCameraData({ showCone: e.target.checked })}
              />
              Show Cone
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showHorizon}
                onChange={(e) => onUpdateCameraData({ showHorizon: e.target.checked })}
              />
              Show Horizon
            </label>
          </div>

          {!isTarget && (
            <div className="flex items-center gap-2 pt-1">
              <Label className="w-24">Target Dist:</Label>
              <Input
                type="number"
                value={targetDist}
                step={1}
                min={0.001}
                className="h-6 w-24 text-xs"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0) onUpdateCameraData({ targetDistance: v });
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Environment Ranges</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Label className="w-20">Near Range:</Label>
            <Input
              type="number"
              value={nearRange}
              step={1}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onUpdateCameraData({ nearRange: v });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-20">Far Range:</Label>
            <Input
              type="number"
              value={farRange}
              step={1}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onUpdateCameraData({ farRange: v });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Clipping Planes</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={manualClip}
              onChange={(e) => onUpdateCameraData({ manualClip: e.target.checked })}
            />
            Clip Manually
          </label>
          <div className="flex items-center gap-2">
            <Label className="w-20">Near Clip:</Label>
            <Input
              type="number"
              value={near}
              step={0.1}
              min={0.001}
              disabled={!manualClip}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ near: v });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-20">Far Clip:</Label>
            <Input
              type="number"
              value={far}
              step={1}
              min={0.01}
              disabled={!manualClip}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ far: v });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-panel-border mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Multi-Pass Depth of Field</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dof}
              onChange={(e) => onUpdateCameraData({ dofEnabled: e.target.checked })}
            />
            Enable
          </label>
          <div className="flex items-center gap-2">
            <Label className="w-24">Focus Dist:</Label>
            <Input
              type="number"
              value={focus}
              step={1}
              min={0.001}
              disabled={!dof}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ focusDistance: v });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-24">Aperture:</Label>
            <Input
              type="number"
              value={aperture}
              step={0.1}
              min={0.1}
              disabled={!dof}
              className="h-6 w-24 text-xs"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onUpdateCameraData({ aperture: v });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
};
