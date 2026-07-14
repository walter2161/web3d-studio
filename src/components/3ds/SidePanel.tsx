import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModifierControls } from './ModifierControls';
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
  Palette
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
  onUpdateObjectGeometry
}: SidePanelProps) => {
  const [internalTab, setInternalTab] = useState('create');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: string) => { onActiveTabChange ? onActiveTabChange(t) : setInternalTab(t); };
  const [createCategory, setCreateCategory] = useState<'standard' | 'extended' | 'shapes' | 'lights'>('standard');


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
    { name: 'Slice', description: 'Corta o objeto em partes' }
  ];

  const categoryLabel: Record<typeof createCategory, string> = {
    standard: 'Standard Primitives',
    extended: 'Extended Primitives',
    shapes: 'Shapes',
    lights: 'Lights & Cameras',
  };

  return (
    <div className="w-full h-full bg-panel border-l border-panel-border overflow-y-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <TabsList className="grid w-full grid-cols-5 bg-panel-header">
          <TabsTrigger value="create" className="text-xs">Create</TabsTrigger>
          <TabsTrigger value="modify" className="text-xs">Modify</TabsTrigger>
          <TabsTrigger value="hierarchy" className="text-xs">Hierarchy</TabsTrigger>
          <TabsTrigger value="motion" className="text-xs">Motion</TabsTrigger>
          <TabsTrigger value="display" className="text-xs">Display</TabsTrigger>
        </TabsList>

        <div className="p-3 space-y-4">
          <TabsContent value="create" className="mt-0 space-y-3">
            {/* R3-style category selector */}
            <select
              value={createCategory}
              onChange={(e) => setCreateCategory(e.target.value as any)}
              className="w-full h-7 text-xs bg-card border border-panel-border rounded px-2"
            >
              <option value="standard">Standard Primitives</option>
              <option value="extended">Extended Primitives</option>
              <option value="shapes">Shapes</option>
              <option value="lights">Lights &amp; Cameras</option>
            </select>

            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{categoryLabel[createCategory]}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {createCategory === 'standard' && standardPrimitives.map((primitive) => {
                  const IconComponent = primitive.icon;
                  const pressed = armedTool === primitive.type;
                  return (
                    <Button
                      key={primitive.type}
                      variant="outline"
                      size="sm"
                      className={`h-16 flex-col gap-1 bg-gradient-button border-panel-border hover:bg-menu-hover ${pressed ? 'ring-2 ring-yellow-400 bevel-inset' : ''}`}
                      onClick={() => (onArmTool ? onArmTool(primitive.type) : onCreateObject(primitive.type))}
                      title={pressed ? 'Armed — click & drag in the viewport (ESC to cancel)' : `Create ${primitive.label}`}
                    >
                      <IconComponent className="w-6 h-6" />
                      <span className="text-xs">{primitive.label}</span>
                    </Button>
                  );
                })}

                {createCategory === 'extended' && extendedPrimitives.map((p) => {
                  const pressed = armedTool === p.type;
                  return (
                    <Button
                      key={p.type}
                      variant="outline"
                      size="sm"
                      className={`h-12 flex-col gap-0.5 bg-gradient-button border-panel-border hover:bg-menu-hover text-[11px] ${pressed ? 'ring-2 ring-yellow-400 bevel-inset' : ''}`}
                      onClick={() => (onArmTool ? onArmTool(p.type) : onCreateObject(p.type))}
                    >
                      {p.label}
                    </Button>
                  );
                })}

                {createCategory === 'shapes' && shapes.map((s) => {
                  const pressed = armedTool === s.type;
                  return (
                    <Button
                      key={s.type}
                      variant="outline"
                      size="sm"
                      className={`h-12 flex-col gap-0.5 bg-gradient-button border-panel-border hover:bg-menu-hover text-[11px] ${pressed ? 'ring-2 ring-yellow-400 bevel-inset' : ''}`}
                      onClick={() => (onArmTool ? onArmTool(s.type) : onCreateObject(s.type))}
                    >
                      {s.label}
                    </Button>
                  );
                })}


                {createCategory === 'lights' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-16 flex-col gap-1 bg-gradient-button border-panel-border hover:bg-menu-hover"
                      onClick={() => onCreateObject('light')}
                    >
                      <Lightbulb className="w-6 h-6" />
                      <span className="text-xs">Light</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-16 flex-col gap-1 bg-gradient-button border-panel-border hover:bg-menu-hover"
                      onClick={() => onCreateObject('camera')}
                    >
                      <Camera className="w-6 h-6" />
                      <span className="text-xs">Camera</span>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modify" className="mt-0">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Add Modifiers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-60 overflow-y-auto">
                {modifiers.map((modifier) => (
                  <Button
                    key={modifier.name}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-left bg-gradient-button border-panel-border hover:bg-menu-hover"
                    onClick={() => {
                      if (selectedObject) {
                        onAddModifier(selectedObject.id, modifier.name);
                      }
                    }}
                    disabled={!selectedObject}
                    title={modifier.description}
                  >
                    {modifier.name}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Applied Modifiers */}
            {selectedObject && selectedObject.modifiers && selectedObject.modifiers.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-medium">Applied Modifiers</h3>
                {selectedObject.modifiers.map((modifier: any) => (
                  <ModifierControls
                    key={modifier.id}
                    modifier={modifier}
                    onUpdateModifier={(params) => onUpdateModifier(selectedObject.id, modifier.id, params)}
                    onRemoveModifier={() => onRemoveModifier(selectedObject.id, modifier.id)}
                  />
                ))}
              </div>
            )}

            {selectedObject && (
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