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
  selectedObject: any;
  onOpenMaterialEditor?: () => void;
  onAddModifier: (objectId: string, modifierType: string) => void;
  onUpdateModifier: (objectId: string, modifierId: string, params: any) => void;
  onRemoveModifier: (objectId: string, modifierId: string) => void;
  onUpdateObjectGeometry: (objectId: string, params: any) => void;
}

export const SidePanel = ({ 
  onCreateObject, 
  selectedObject, 
  onOpenMaterialEditor,
  onAddModifier,
  onUpdateModifier,
  onRemoveModifier,
  onUpdateObjectGeometry
}: SidePanelProps) => {
  const [activeTab, setActiveTab] = useState('create');

  const primitives = [
    { type: 'box', icon: Box, label: 'Box' },
    { type: 'sphere', icon: Circle, label: 'Sphere' },
    { type: 'cylinder', icon: Cylinder, label: 'Cylinder' },
    { type: 'cone', icon: Triangle, label: 'Cone' },
    { type: 'torus', icon: Torus, label: 'Torus' },
    { type: 'plane', icon: Square, label: 'Plane' },
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

  return (
    <div className="w-80 bg-panel border-l border-panel-border h-full overflow-y-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <TabsList className="grid w-full grid-cols-5 bg-panel-header">
          <TabsTrigger value="create" className="text-xs">Create</TabsTrigger>
          <TabsTrigger value="modify" className="text-xs">Modify</TabsTrigger>
          <TabsTrigger value="hierarchy" className="text-xs">Hierarchy</TabsTrigger>
          <TabsTrigger value="motion" className="text-xs">Motion</TabsTrigger>
          <TabsTrigger value="display" className="text-xs">Display</TabsTrigger>
        </TabsList>

        <div className="p-3 space-y-4">
          <TabsContent value="create" className="mt-0">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Standard Primitives</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {primitives.map((primitive) => {
                  const IconComponent = primitive.icon;
                  return (
                    <Button
                      key={primitive.type}
                      variant="outline"
                      size="sm"
                      className="h-16 flex-col gap-1 bg-gradient-button border-panel-border hover:bg-menu-hover"
                      onClick={() => onCreateObject(primitive.type)}
                    >
                      <IconComponent className="w-6 h-6" />
                      <span className="text-xs">{primitive.label}</span>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Lights & Cameras</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
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

          <TabsContent value="hierarchy" className="mt-0">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Scene Hierarchy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Hierarchy management coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="motion" className="mt-0">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Animation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Animation tools coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="display" className="mt-0">
            <Card className="bg-card border-panel-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Display Options</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Display settings coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};