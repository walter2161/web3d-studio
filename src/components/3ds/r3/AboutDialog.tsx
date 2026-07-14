import { R3Dialog, R3Button } from './R3Dialog';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export const AboutDialog = ({ open, onOpenChange }: Props) => (
  <R3Dialog open={open} onClose={() => onOpenChange(false)} title="About 3ds Max" width={420}>
    <div className="flex gap-3">
      <div className="bevel-inset bg-black text-white text-center px-4 py-6" style={{ width: 140 }}>
        <div className="text-[24px] font-bold" style={{ fontFamily: 'serif' }}>3ds</div>
        <div className="text-[14px] tracking-widest">MAX</div>
        <div className="text-[10px] mt-1 opacity-70">R3</div>
      </div>
      <div className="text-[11px] flex-1">
        <div className="font-bold">3ds Max R3 · Web Edition (3dsLed)</div>
        <div className="mt-1">Version 3.0.1 · Build 2026.07</div>
        <div className="mt-2">Copyright © 2026 3dsLed</div>
        <div className="mt-2">Real-time 3D authoring, non-destructive modifiers, animation timeline, and integrated scanline renderer — running fully in the browser via WebGL / three.js.</div>
        <div className="mt-2 opacity-70">This product is licensed to: <b>Local User</b></div>
      </div>
    </div>
    <div className="mt-3 flex justify-end">
      <R3Button width={80} onClick={() => onOpenChange(false)}>OK</R3Button>
    </div>
  </R3Dialog>
);
