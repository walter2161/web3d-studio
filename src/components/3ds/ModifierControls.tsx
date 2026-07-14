import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { X } from 'lucide-react';

interface ModifierControlsProps {
  modifier: any;
  onUpdateModifier: (params: any) => void;
  onRemoveModifier: () => void;
}

export const ModifierControls = ({ modifier, onUpdateModifier, onRemoveModifier }: ModifierControlsProps) => {
  const [params, setParams] = useState(modifier.params || {});

  const updateParam = (key: string, value: any) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    onUpdateModifier(newParams);
  };

  const renderBendControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Angle</Label>
        <Slider
          value={[params.angle || 0]}
          onValueChange={(value) => updateParam('angle', value[0])}
          min={-180}
          max={180}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.angle || 0}°</div>
      </div>
      <div>
        <Label className="text-xs">Direction</Label>
        <Slider
          value={[params.direction || 0]}
          onValueChange={(value) => updateParam('direction', value[0])}
          min={-180}
          max={180}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.direction || 0}°</div>
      </div>
      <div>
        <Label className="text-xs">Bend Axis</Label>
        <Select value={params.bendAxis || 'Z'} onValueChange={(value) => updateParam('bendAxis', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="X">X</SelectItem>
            <SelectItem value="Y">Y</SelectItem>
            <SelectItem value="Z">Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="limits" 
          checked={params.limits || false}
          onCheckedChange={(checked) => updateParam('limits', checked)}
        />
        <Label htmlFor="limits" className="text-xs">Limits</Label>
      </div>
    </div>
  );

  const renderTwistControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Angle</Label>
        <Slider
          value={[params.angle || 0]}
          onValueChange={(value) => updateParam('angle', value[0])}
          min={-360}
          max={360}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.angle || 0}°</div>
      </div>
      <div>
        <Label className="text-xs">Bias</Label>
        <Slider
          value={[params.bias || 0]}
          onValueChange={(value) => updateParam('bias', value[0])}
          min={-1}
          max={1}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.bias || 0}</div>
      </div>
      <div>
        <Label className="text-xs">Twist Axis</Label>
        <Select value={params.twistAxis || 'Z'} onValueChange={(value) => updateParam('twistAxis', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="X">X</SelectItem>
            <SelectItem value="Y">Y</SelectItem>
            <SelectItem value="Z">Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderTaperControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Amount</Label>
        <Slider
          value={[params.amount || 0]}
          onValueChange={(value) => updateParam('amount', value[0])}
          min={-2}
          max={2}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.amount || 0}</div>
      </div>
      <div>
        <Label className="text-xs">Curve</Label>
        <Slider
          value={[params.curve || 0]}
          onValueChange={(value) => updateParam('curve', value[0])}
          min={-1}
          max={1}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.curve || 0}</div>
      </div>
      <div>
        <Label className="text-xs">Primary Axis</Label>
        <Select value={params.primaryAxis || 'Z'} onValueChange={(value) => updateParam('primaryAxis', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="X">X</SelectItem>
            <SelectItem value="Y">Y</SelectItem>
            <SelectItem value="Z">Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Effect Axis</Label>
        <Select value={params.effectAxis || 'XY'} onValueChange={(value) => updateParam('effectAxis', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="X">X</SelectItem>
            <SelectItem value="Y">Y</SelectItem>
            <SelectItem value="XY">XY</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderNoiseControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Scale</Label>
        <Slider
          value={[params.scale || 1]}
          onValueChange={(value) => updateParam('scale', value[0])}
          min={0.1}
          max={10}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.scale || 1}</div>
      </div>
      <div>
        <Label className="text-xs">Strength X</Label>
        <Slider
          value={[params.strengthX || 0]}
          onValueChange={(value) => updateParam('strengthX', value[0])}
          min={0}
          max={5}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.strengthX || 0}</div>
      </div>
      <div>
        <Label className="text-xs">Strength Y</Label>
        <Slider
          value={[params.strengthY || 0]}
          onValueChange={(value) => updateParam('strengthY', value[0])}
          min={0}
          max={5}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.strengthY || 0}</div>
      </div>
      <div>
        <Label className="text-xs">Strength Z</Label>
        <Slider
          value={[params.strengthZ || 0]}
          onValueChange={(value) => updateParam('strengthZ', value[0])}
          min={0}
          max={5}
          step={0.1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.strengthZ || 0}</div>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="fractal" 
          checked={params.fractal || false}
          onCheckedChange={(checked) => updateParam('fractal', checked)}
        />
        <Label htmlFor="fractal" className="text-xs">Fractal</Label>
      </div>
      <div>
        <Label className="text-xs">Seed</Label>
        <Input
          type="number"
          value={params.seed || 1}
          onChange={(e) => updateParam('seed', parseInt(e.target.value))}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );

  const renderTurboSmoothControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Iterations</Label>
        <Slider
          value={[params.iterations || 1]}
          onValueChange={(value) => updateParam('iterations', value[0])}
          min={1}
          max={4}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.iterations || 1}</div>
      </div>
      <div>
        <Label className="text-xs">Render Iterations</Label>
        <Slider
          value={[params.renderIterations || 2]}
          onValueChange={(value) => updateParam('renderIterations', value[0])}
          min={1}
          max={6}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.renderIterations || 2}</div>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="isoline" 
          checked={params.isolineDisplay || false}
          onCheckedChange={(checked) => updateParam('isolineDisplay', checked)}
        />
        <Label htmlFor="isoline" className="text-xs">Isoline Display</Label>
      </div>
    </div>
  );

  const renderSymmetryControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Mirror Axis</Label>
        <Select value={params.mirrorAxis || 'X'} onValueChange={(value) => updateParam('mirrorAxis', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="X">X</SelectItem>
            <SelectItem value="Y">Y</SelectItem>
            <SelectItem value="Z">Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="weldSeam" 
          checked={params.weldSeam || true}
          onCheckedChange={(checked) => updateParam('weldSeam', checked)}
        />
        <Label htmlFor="weldSeam" className="text-xs">Weld Seam</Label>
      </div>
      <div>
        <Label className="text-xs">Threshold</Label>
        <Slider
          value={[params.threshold || 0.1]}
          onValueChange={(value) => updateParam('threshold', value[0])}
          min={0.001}
          max={1}
          step={0.001}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.threshold || 0.1}</div>
      </div>
    </div>
  );

  const renderEditPolyControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Selection Level</Label>
        <Select value={params.selectionLevel || 'vertex'} onValueChange={(value) => updateParam('selectionLevel', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vertex">Vertex</SelectItem>
            <SelectItem value="edge">Edge</SelectItem>
            <SelectItem value="face">Face</SelectItem>
            <SelectItem value="element">Element</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Segments X</Label>
        <Slider
          value={[params.segmentsX || 1]}
          onValueChange={(value) => updateParam('segmentsX', value[0])}
          min={1}
          max={20}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.segmentsX || 1}</div>
      </div>
      <div>
        <Label className="text-xs">Segments Y</Label>
        <Slider
          value={[params.segmentsY || 1]}
          onValueChange={(value) => updateParam('segmentsY', value[0])}
          min={1}
          max={20}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.segmentsY || 1}</div>
      </div>
      <div>
        <Label className="text-xs">Segments Z</Label>
        <Slider
          value={[params.segmentsZ || 1]}
          onValueChange={(value) => updateParam('segmentsZ', value[0])}
          min={1}
          max={20}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.segmentsZ || 1}</div>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="showVertices" 
          checked={params.showVertices || false}
          onCheckedChange={(checked) => updateParam('showVertices', checked)}
        />
        <Label htmlFor="showVertices" className="text-xs">Show Vertices</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="showEdges" 
          checked={params.showEdges || false}
          onCheckedChange={(checked) => updateParam('showEdges', checked)}
        />
        <Label htmlFor="showEdges" className="text-xs">Show Edges</Label>
      </div>
    </div>
  );

  const renderEditMeshControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Selection Level</Label>
        <Select value={params.selectionLevel || 'vertex'} onValueChange={(value) => updateParam('selectionLevel', value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vertex">Vertex</SelectItem>
            <SelectItem value="face">Face</SelectItem>
            <SelectItem value="polygon">Polygon</SelectItem>
            <SelectItem value="element">Element</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Tessellation</Label>
        <Slider
          value={[params.tessellation || 1]}
          onValueChange={(value) => updateParam('tessellation', value[0])}
          min={1}
          max={10}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.tessellation || 1}</div>
      </div>
      <div>
        <Label className="text-xs">Smoothing Groups</Label>
        <Slider
          value={[params.smoothingGroups || 1]}
          onValueChange={(value) => updateParam('smoothingGroups', value[0])}
          min={1}
          max={32}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.smoothingGroups || 1}</div>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="autoSmooth" 
          checked={params.autoSmooth || false}
          onCheckedChange={(checked) => updateParam('autoSmooth', checked)}
        />
        <Label htmlFor="autoSmooth" className="text-xs">Auto Smooth</Label>
      </div>
      <div>
        <Label className="text-xs">Crease Threshold</Label>
        <Slider
          value={[params.creaseThreshold || 30]}
          onValueChange={(value) => updateParam('creaseThreshold', value[0])}
          min={0}
          max={180}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.creaseThreshold || 30}°</div>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="showNormals" 
          checked={params.showNormals || false}
          onCheckedChange={(checked) => updateParam('showNormals', checked)}
        />
        <Label htmlFor="showNormals" className="text-xs">Show Normals</Label>
      </div>
    </div>
  );

  const renderDefaultControls = () => (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Controles para {modifier.type} em desenvolvimento...
      </div>
    </div>
  );

  const renderExtrudeControls = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Amount</Label>
        <Slider
          value={[params.amount ?? 1]}
          onValueChange={(v) => updateParam('amount', v[0])}
          min={-20}
          max={20}
          step={0.01}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{(params.amount ?? 1).toFixed(2)}</div>
      </div>
      <div>
        <Label className="text-xs">Segments</Label>
        <Slider
          value={[params.segments ?? 1]}
          onValueChange={(v) => updateParam('segments', Math.round(v[0]))}
          min={1}
          max={64}
          step={1}
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">{params.segments ?? 1}</div>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="capStart"
          checked={params.capStart !== false}
          onCheckedChange={(c) => updateParam('capStart', !!c)}
        />
        <Label htmlFor="capStart" className="text-xs">Cap Start</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="capEnd"
          checked={params.capEnd !== false}
          onCheckedChange={(c) => updateParam('capEnd', !!c)}
        />
        <Label htmlFor="capEnd" className="text-xs">Cap End</Label>
      </div>
    </div>
  );

  const getControlsForModifier = () => {
    switch (modifier.type) {
      case 'Bend': return renderBendControls();
      case 'Twist': return renderTwistControls();
      case 'Taper': return renderTaperControls();
      case 'Noise': return renderNoiseControls();
      case 'TurboSmooth': return renderTurboSmoothControls();
      case 'Symmetry': return renderSymmetryControls();
      case 'Edit Poly': return renderEditPolyControls();
      case 'Edit Mesh': return renderEditMeshControls();
      case 'Extrude': return renderExtrudeControls();
      default: return renderDefaultControls();
    }
  };

  return (
    <Card className="bg-card border-panel-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{modifier.type}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemoveModifier}
            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {getControlsForModifier()}
        <Separator />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs">
            Reset
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            Collapse
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};