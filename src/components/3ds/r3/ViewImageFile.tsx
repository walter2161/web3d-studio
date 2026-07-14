import { useRef, useState } from 'react';
import { R3Dialog, GroupBox, R3Button } from './R3Dialog';

interface ViewImageFileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ViewImageFile = ({ open, onOpenChange }: ViewImageFileProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [info, setInfo] = useState<{ w: number; h: number } | null>(null);

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFilename(f.name);
    setPreview(url);
    const img = new Image();
    img.onload = () => setInfo({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  };

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="View File" width={520}>
      <GroupBox title="History:">
        <div className="flex gap-1">
          <select className="bevel-inset bg-white text-[11px] h-[18px] flex-1"><option /></select>
        </div>
      </GroupBox>

      <div className="flex gap-2 mt-2">
        <GroupBox className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[11px]">File name:</span>
            <input value={filename} readOnly className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px]">Files of type:</span>
            <select className="bevel-inset bg-white text-[11px] h-[18px] flex-1">
              <option>All Formats</option>
              <option>JPEG (*.jpg)</option>
              <option>PNG (*.png)</option>
              <option>Targa (*.tga)</option>
              <option>Windows Bitmap (*.bmp)</option>
              <option>TIF Image File (*.tif)</option>
              <option>Kodak Cineon (*.cin)</option>
            </select>
          </div>
        </GroupBox>
        <div className="flex flex-col gap-1">
          <R3Button width={80} onClick={() => inputRef.current?.click()}>Open</R3Button>
          <R3Button width={80} onClick={() => onOpenChange(false)}>Cancel</R3Button>
          <R3Button width={80}>Setup...</R3Button>
          <R3Button width={80}>Info...</R3Button>
          <R3Button width={80}>View</R3Button>
        </div>
      </div>

      <GroupBox title="Preview" className="mt-2">
        <div className="bevel-inset bg-black flex items-center justify-center" style={{ height: 200 }}>
          {preview ? (
            <img src={preview} alt="preview" className="max-w-full max-h-full" />
          ) : (
            <span className="text-[11px] text-win-text-disabled">Devices</span>
          )}
        </div>
        {info && (
          <div className="text-[11px] mt-1">Statistics: {info.w} x {info.h}, 24 bits (RGB)</div>
        )}
      </GroupBox>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" defaultChecked /> Gamma:</label>
        <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="gamma" defaultChecked /> Use image's own gamma</label>
        <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="gamma" /> Use system default gamma</label>
      </div>
    </R3Dialog>
  );
};
