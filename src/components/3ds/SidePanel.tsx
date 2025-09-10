import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Move,
  RotateCw,
  Scale
} from 'lucide-react';

interface SidePanelProps {
  onCreateObject: (type: string) => void;
  selectedObject: any;
  onTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  transformMode: string;
}

export const SidePanel = ({ 
  onCreateObject, 
  selectedObject, 
  onTransformMode, 
  transformMode 
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

  const tools = [
    { mode: 'translate', icon: Move, label: 'Move (W)', key: 'W' },
    { mode: 'rotate', icon: RotateCw, label: 'Rotate (E)', key: 'E' },
    { mode: 'scale', icon: Scale, label: 'Scale (R)', key: 'R' },
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
                <CardTitle className="text-sm">Transform Tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tools.map((tool) => {
                  const IconComponent = tool.icon;
                  return (
                    <Button
                      key={tool.mode}
                      variant={transformMode === tool.mode ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start gap-2 bg-gradient-button border-panel-border hover:bg-menu-hover"
                      onClick={() => onTransformMode(tool.mode as any)}
                    >
                      <IconComponent className="w-4 h-4" />
                      {tool.label}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {selectedObject && (
              <Card className="bg-card border-panel-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Object Properties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <div className="text-sm font-mono">{selectedObject.type}_{selectedObject.id.slice(0, 8)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Position</label>
                    <div className="text-xs font-mono space-y-1">
                      <div>X: {selectedObject.position[0].toFixed(2)}</div>
                      <div>Y: {selectedObject.position[1].toFixed(2)}</div>
                      <div>Z: {selectedObject.position[2].toFixed(2)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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