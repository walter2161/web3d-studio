import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Save, 
  Upload, 
  Download, 
  FileText, 
  Box, 
  Image,
  Settings,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';

interface FileOperationsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'save' | 'open' | 'export' | 'import';
  onSaveProject: (filename: string) => void;
  onLoadProject: (file: File) => void;
  onExportScene: (format: string, settings: any) => void;
  onImportModel: (file: File) => void;
}

export const FileOperations = ({
  open,
  onOpenChange,
  type,
  onSaveProject,
  onLoadProject,
  onExportScene,
  onImportModel
}: FileOperationsProps) => {
  const [filename, setFilename] = useState('untitled_scene.3dsled');
  const [exportFormat, setExportFormat] = useState('gltf');
  const [exportSettings, setExportSettings] = useState({
    includeTextures: true,
    includeMaterials: true,
    includeAnimations: true,
    compression: false
  });

  const handleSave = () => {
    onSaveProject(filename);
    onOpenChange(false);
    toast.success(`Project saved as ${filename}`);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, fileType: 'project' | 'model') => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (fileType === 'project') {
      onLoadProject(file);
      toast.success(`Project ${file.name} loaded`);
    } else {
      onImportModel(file);
    }

    onOpenChange(false);

  };

  const handleExport = () => {
    onExportScene(exportFormat, exportSettings);
    onOpenChange(false);
    toast.success(`Scene exported as ${exportFormat.toUpperCase()}`);
  };

  const getDialogTitle = () => {
    switch (type) {
      case 'save': return 'Save Project';
      case 'open': return 'Open Project';
      case 'export': return 'Export Scene';
      case 'import': return 'Import Model';
      default: return 'File Operations';
    }
  };

  const getDialogIcon = () => {
    switch (type) {
      case 'save': return <Save className="w-5 h-5" />;
      case 'open': return <FolderOpen className="w-5 h-5" />;
      case 'export': return <Download className="w-5 h-5" />;
      case 'import': return <Upload className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-panel border-panel-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getDialogIcon()}
            {getDialogTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {type === 'save' && (
            <Card className="bg-card border-panel-border">
              <CardHeader>
                <CardTitle className="text-sm">Save Project As</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Filename</Label>
                  <Input
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="Enter filename..."
                    className="bg-input border-panel-border"
                  />
                </div>
                <Button onClick={handleSave} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  Save Project
                </Button>
              </CardContent>
            </Card>
          )}

          {type === 'open' && (
            <Card className="bg-card border-panel-border">
              <CardHeader>
                <CardTitle className="text-sm">Open Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Select .3dsled file</Label>
                  <Input
                    type="file"
                    accept=".3dsled,.json"
                    onChange={(e) => handleFileUpload(e, 'project')}
                    className="bg-input border-panel-border"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {type === 'import' && (
            <Card className="bg-card border-panel-border">
              <CardHeader>
                <CardTitle className="text-sm">Import 3D Model / CAD</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Select model or CAD file</Label>
                  <Input
                    type="file"
                    accept=".obj,.fbx,.gltf,.glb,.dae,.3ds,.max,.dxf,.dwg"
                    onChange={(e) => handleFileUpload(e, 'model')}
                    className="bg-input border-panel-border"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>3D: OBJ, FBX, GLTF, GLB, DAE, 3DS, MAX</div>
                  <div>CAD (2D): <span className="font-mono">DXF, DWG</span> — LINE / POLYLINE viram paredes paramétricas.</div>
                  <div className="opacity-70">DWG (binário Autodesk) é convertido automaticamente para DXF via LibreDWG (WASM) no próprio navegador.</div>
                </div>
              </CardContent>
            </Card>
          )}

          {type === 'export' && (
            <Card className="bg-card border-panel-border">
              <CardHeader>
                <CardTitle className="text-sm">Export Scene</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={exportFormat} onValueChange={setExportFormat}>
                  <TabsList className="grid w-full grid-cols-4 bg-panel-header">
                    <TabsTrigger value="gltf">GLTF</TabsTrigger>
                    <TabsTrigger value="obj">OBJ</TabsTrigger>
                    <TabsTrigger value="fbx">FBX</TabsTrigger>
                    <TabsTrigger value="stl">STL</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="gltf" className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Include Textures</Label>
                        <input
                          type="checkbox"
                          checked={exportSettings.includeTextures}
                          onChange={(e) => setExportSettings(prev => ({
                            ...prev,
                            includeTextures: e.target.checked
                          }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>Include Materials</Label>
                        <input
                          type="checkbox"
                          checked={exportSettings.includeMaterials}
                          onChange={(e) => setExportSettings(prev => ({
                            ...prev,
                            includeMaterials: e.target.checked
                          }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>Include Animations</Label>
                        <input
                          type="checkbox"
                          checked={exportSettings.includeAnimations}
                          onChange={(e) => setExportSettings(prev => ({
                            ...prev,
                            includeAnimations: e.target.checked
                          }))}
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="obj" className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      OBJ format exports geometry only. Materials will be exported as .mtl file.
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="fbx" className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      FBX format supports materials, textures, and animations.
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="stl" className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      STL format exports geometry only. Ideal for 3D printing.
                    </div>
                  </TabsContent>
                </Tabs>
                
                <Button onClick={handleExport} className="w-full mt-4">
                  <Download className="w-4 h-4 mr-2" />
                  Export {exportFormat.toUpperCase()}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};