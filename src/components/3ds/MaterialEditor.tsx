import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette, Upload, Sparkles } from 'lucide-react';

interface MaterialEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedObject: any;
  onMaterialChange: (objectId: string, material: any) => void;
}

export const MaterialEditor = ({ 
  open, 
  onOpenChange, 
  selectedObject, 
  onMaterialChange 
}: MaterialEditorProps) => {
  const [material, setMaterial] = useState({
    color: '#3b82f6',
    metalness: 0,
    roughness: 0.5,
    opacity: 1,
    emissive: '#000000',
    emissiveIntensity: 0
  });

  const handleMaterialUpdate = (property: string, value: any) => {
    const updatedMaterial = { ...material, [property]: value };
    setMaterial(updatedMaterial);
    
    if (selectedObject) {
      onMaterialChange(selectedObject.id, updatedMaterial);
    }
  };

  const presetMaterials = [
    { name: 'Metal', color: '#8c8c8c', metalness: 1, roughness: 0.1 },
    { name: 'Plastic', color: '#ff4444', metalness: 0, roughness: 0.8 },
    { name: 'Glass', color: '#88ccff', metalness: 0, roughness: 0, opacity: 0.3 },
    { name: 'Wood', color: '#8b4513', metalness: 0, roughness: 0.9 },
    { name: 'Concrete', color: '#666666', metalness: 0, roughness: 1 },
    { name: 'Gold', color: '#ffd700', metalness: 1, roughness: 0.2 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-panel border-panel-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Material Editor
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-6">
          {/* Material Properties */}
          <div className="col-span-2 space-y-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-panel-header">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
                <TabsTrigger value="textures">Textures</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4">
                <Card className="bg-card border-panel-border">
                  <CardHeader>
                    <CardTitle className="text-sm">Base Properties</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Diffuse Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={material.color}
                          onChange={(e) => handleMaterialUpdate('color', e.target.value)}
                          className="w-16 h-8 p-0 border-panel-border"
                        />
                        <Input
                          value={material.color}
                          onChange={(e) => handleMaterialUpdate('color', e.target.value)}
                          className="flex-1 bg-input border-panel-border"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label>Metalness: {material.metalness}</Label>
                      <Slider
                        value={[material.metalness]}
                        onValueChange={(value) => handleMaterialUpdate('metalness', value[0])}
                        max={1}
                        step={0.01}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <Label>Roughness: {material.roughness}</Label>
                      <Slider
                        value={[material.roughness]}
                        onValueChange={(value) => handleMaterialUpdate('roughness', value[0])}
                        max={1}
                        step={0.01}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <Label>Opacity: {material.opacity}</Label>
                      <Slider
                        value={[material.opacity]}
                        onValueChange={(value) => handleMaterialUpdate('opacity', value[0])}
                        max={1}
                        step={0.01}
                        className="w-full"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-4">
                <Card className="bg-card border-panel-border">
                  <CardHeader>
                    <CardTitle className="text-sm">Advanced Properties</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Emissive Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={material.emissive}
                          onChange={(e) => handleMaterialUpdate('emissive', e.target.value)}
                          className="w-16 h-8 p-0 border-panel-border"
                        />
                        <Input
                          value={material.emissive}
                          onChange={(e) => handleMaterialUpdate('emissive', e.target.value)}
                          className="flex-1 bg-input border-panel-border"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label>Emissive Intensity: {material.emissiveIntensity}</Label>
                      <Slider
                        value={[material.emissiveIntensity]}
                        onValueChange={(value) => handleMaterialUpdate('emissiveIntensity', value[0])}
                        max={2}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="textures" className="space-y-4">
                <Card className="bg-card border-panel-border">
                  <CardHeader>
                    <CardTitle className="text-sm">Texture Maps</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button variant="outline" className="w-full gap-2 border-panel-border">
                      <Upload className="w-4 h-4" />
                      Load Diffuse Map
                    </Button>
                    <Button variant="outline" className="w-full gap-2 border-panel-border">
                      <Upload className="w-4 h-4" />
                      Load Normal Map
                    </Button>
                    <Button variant="outline" className="w-full gap-2 border-panel-border">
                      <Upload className="w-4 h-4" />
                      Load Roughness Map
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          
          {/* Material Library */}
          <div className="space-y-4">
            <Card className="bg-card border-panel-border">
              <CardHeader>
                <CardTitle className="text-sm">Material Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {presetMaterials.map((preset, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 border-panel-border hover:bg-menu-hover"
                    onClick={() => {
                      const newMaterial = { ...material, ...preset };
                      setMaterial(newMaterial);
                      if (selectedObject) {
                        onMaterialChange(selectedObject.id, newMaterial);
                      }
                    }}
                  >
                    <div 
                      className="w-4 h-4 rounded border" 
                      style={{ backgroundColor: preset.color }}
                    />
                    {preset.name}
                  </Button>
                ))}
              </CardContent>
            </Card>
            
            {/* Material Preview */}
            <Card className="bg-card border-panel-border">
              <CardHeader>
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-square bg-viewport-bg rounded border border-panel-border flex items-center justify-center">
                  <div 
                    className="w-16 h-16 rounded-full border-2"
                    style={{ 
                      backgroundColor: material.color,
                      opacity: material.opacity,
                      boxShadow: `0 0 20px ${material.emissive}`
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};