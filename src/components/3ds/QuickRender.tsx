import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface QuickRenderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const captureViewport = (): string | null => {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

export const QuickRender = ({ open, onOpenChange }: QuickRenderProps) => {
  const [image, setImage] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const render = () => {
    setRendering(true);
    // Small delay so the canvas finishes drawing the current frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setImage(captureViewport());
        setRendering(false);
      });
    });
  };

  useEffect(() => {
    if (open) render();
  }, [open]);

  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image;
    a.download = `render-${Date.now()}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-panel border-panel-border">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Rendered Frame Window</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={render} disabled={rendering}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${rendering ? 'animate-spin' : ''}`} />
                Render
              </Button>
              <Button size="sm" variant="outline" onClick={download} disabled={!image}>
                <Download className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="bg-black rounded border border-panel-border overflow-hidden flex items-center justify-center min-h-[400px]">
          {image ? (
            <img src={image} alt="Rendered viewport" className="max-w-full max-h-[70vh]" />
          ) : (
            <span className="text-muted-foreground text-sm">Rendering...</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
