import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModifierControls } from './ModifierControls';
import { cn } from '@/lib/utils';
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
  onUpdateObjectGeometry
}: SidePanelProps) => {
  const [internalTab, setInternalTab] = useState('create');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: string) => { onActiveTabChange ? onActiveTabChange(t) : setInternalTab(t); };
  const [createCat, setCreateCat] = useState<'geometry' | 'shapes' | 'lights' | 'cameras' | 'helpers' | 'warps' | 'systems'>('geometry');
  const [createCategory, setCreateCategory] = useState<'standard' | 'extended' | 'shapes' | 'lights' | 'cameras'>('standard');
  // 'base' selects the base object parameters; a modifier id selects that modifier.
  const [selectedStackItem, setSelectedStackItem] = useState<string>('base');
  const [modifierListOpen, setModifierListOpen] = useState(false);

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
    { type: 'helix',     label: 'Helix' },
  ];

  const modifiers = [
    { name: 'Bend', description: 'Entorta o objeto em torno de um eixo' },
    { name: 'Twist', description: 'Torce o objeto em torno de um eixo' },
    { name: 'Taper', description: 'Afunila a forma, estreitando ou expandindo' },
    { name: 'Stretch', description: 'Estica ou comprime o objeto' },
    { name: 'Skew', description: 'Inclina a geometria' },
    { name: 'Noise', description: 'Adiciona irregularidades aleatórias na malha' },
    { name: 'FFD', description: 'Deforma o objeto usando caixas de controle' },
    { name: 'Shell', description: 'Adiciona espessura a superfícies planas' },
    { name: 'Edit Poly', description: 'Permite editar vértices, arestas, polígonos' },
    { name: 'Edit Mesh', description: 'Edição direta de malhas triangulares' },
    { name: 'TurboSmooth', description: 'Suaviza e aumenta o número de polígonos' },
    { name: 'MeshSmooth', description: 'Subdivide suavizando a malha' },
    { name: 'Symmetry', description: 'Espelha o objeto em um eixo' },
    { name: 'Mirror', description: 'Reflete a geometria' },
    { name: 'UVW Map', description: 'Mapeamento simples de coordenadas de textura' },
    { name: 'Unwrap UVW', description: 'Controle avançado de mapeamento UV' },
    { name: 'Lathe', description: 'Revolve uma spline para criar formas cilíndricas' },
    { name: 'Extrude', description: 'Extruda uma spline para gerar volume' },
    { name: 'Bevel', description: 'Extrusão com controle de perfis chanfrados' },
    { name: 'Slice', description: 'Corta o objeto em partes' },
  ];

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

                  {/* Modifier List dropdown */}
                  <div className="relative">
                    <button
                      className="w-full h-[22px] text-[11px] text-left px-2 bevel-raised hover:brightness-105 text-win-text flex items-center justify-between"
                      onClick={() => setModifierListOpen((v) => !v)}
                    >
                      <span className="truncate">Modifier List</span>
                      <span className="text-[10px]">▼</span>
                    </button>
                    {modifierListOpen && (
                      <div className="absolute z-50 left-0 right-0 mt-[1px] bevel-raised bg-panel max-h-56 overflow-y-auto">
                        {modifiers.map((m) => (
                          <button
                            key={m.name}
                            title={m.description}
                            onClick={() => {
                              onAddModifier(selectedObject.id, m.name);
                              setModifierListOpen(false);
                            }}
                            className="w-full h-[20px] text-[11px] text-left px-2 truncate text-win-text hover:bg-win-highlight hover:text-white"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

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

                {/* Base Geometry Controls */}
                <Card className="bg-card border-panel-border mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Geometry Parameters</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedObject.type === 'box' && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Width</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.width || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { width: parseFloat(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Height</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.height || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { height: parseFloat(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Depth</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.depth || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { depth: parseFloat(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">W Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.widthSegments || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { widthSegments: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="1"
                              min="1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">H Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.heightSegments || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { heightSegments: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="1"
                              min="1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">D Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.depthSegments || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { depthSegments: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="1"
                              min="1"
                            />
                          </div>
                        </div>
                      </>
                    )}
                    
                    {selectedObject.type === 'sphere' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Radius</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.radius || 0.5}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { radius: parseFloat(e.target.value) || 0.5 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">W Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.widthSegments || 32}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { widthSegments: parseInt(e.target.value) || 32 })}
                              className="h-7 text-xs"
                              step="1"
                              min="3"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">H Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.heightSegments || 32}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { heightSegments: parseInt(e.target.value) || 32 })}
                              className="h-7 text-xs"
                              step="1"
                              min="2"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {selectedObject.type === 'cylinder' && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Top Radius</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.radiusTop || 0.5}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { radiusTop: parseFloat(e.target.value) || 0.5 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Bottom Radius</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.radiusBottom || 0.5}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { radiusBottom: parseFloat(e.target.value) || 0.5 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Height</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.height || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { height: parseFloat(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Radial Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.radialSegments || 32}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { radialSegments: parseInt(e.target.value) || 32 })}
                              className="h-7 text-xs"
                              step="1"
                              min="3"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Height Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.heightSegments || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { heightSegments: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="1"
                              min="1"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {selectedObject.type === 'plane' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Width</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.width || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { width: parseFloat(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Height</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.height || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { height: parseFloat(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">W Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.widthSegments || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { widthSegments: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="1"
                              min="1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">H Segments</Label>
                            <Input
                              type="number"
                              value={selectedObject.geometry?.heightSegments || 1}
                              onChange={(e) => onUpdateObjectGeometry(selectedObject.id, { heightSegments: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs"
                              step="1"
                              min="1"
                            />
                          </div>
                        </div>
                      </>
                    )}
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