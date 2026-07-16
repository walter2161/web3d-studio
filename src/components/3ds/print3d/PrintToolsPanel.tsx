import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { listPrinters, getPrinter, DEFAULT_PRINTER_ID } from './printers';
import { bedSizeUnits, PrintBedGeom } from './PrintBedObject';
import {
  centerOnPlate, dropToBed, scaleForPrint, countOutOfBounds, exportSTL, exportOBJ, PrintObject,
} from './ops';

interface Props {
  objects: PrintObject[];
  selectedObject: PrintObject | null;
  onCreateBed: () => void;
  onUpdateBedGeometry: (bedId: string, patch: Partial<PrintBedGeom>) => void;
  onTransformObject: (id: string, patch: { position?: [number, number, number]; scale?: [number, number, number] }) => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bevel-raised">
    <div className="bg-win-face-shadow/40 text-[11px] font-semibold px-2 py-[2px] text-win-text border-b border-win-shadow">
      {title}
    </div>
    <div className="p-1 space-y-1">{children}</div>
  </div>
);

const Btn = ({ onClick, disabled, children, title }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-full h-[22px] text-[11px] text-win-text px-2 bevel-raised hover:brightness-105 active:bevel-inset disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

export const PrintToolsPanel = ({
  objects, selectedObject, onCreateBed, onUpdateBedGeometry, onTransformObject,
}: Props) => {
  const bed = objects.find((o) => o.type === 'print_bed') || null;
  const bedGeom: PrintBedGeom = (bed?.geometry as PrintBedGeom) || {};
  const printerId = bedGeom.printerId ?? DEFAULT_PRINTER_ID;
  const printer = getPrinter(printerId);
  const [scaleFactor, setScaleFactor] = useState<string>('1');
  const outOfBounds = useMemo(() => countOutOfBounds(objects, bed), [objects, bed]);
  const isMeshTarget = !!selectedObject && selectedObject.type !== 'print_bed';

  const [wMM, dMM, hMM] = bedGeom.sizeMM ?? printer?.size ?? [129, 80, 160];
  const [wU, dU, hU] = bed ? bedSizeUnits(bedGeom) : [0, 0, 0];

  const applyCenter = () => {
    if (!bed || !isMeshTarget) return;
    const pos = centerOnPlate(selectedObject!, bed);
    onTransformObject(selectedObject!.id, { position: pos });
    toast.success('Centered on plate');
  };
  const applyDrop = () => {
    if (!bed || !isMeshTarget) return;
    const pos = dropToBed(selectedObject!, bed);
    onTransformObject(selectedObject!.id, { position: pos });
    toast.success('Dropped to bed');
  };
  const applyScale = () => {
    if (!isMeshTarget) return;
    const f = parseFloat(scaleFactor);
    if (!Number.isFinite(f) || f <= 0) { toast.error('Invalid factor'); return; }
    const s = scaleForPrint(selectedObject!, f);
    onTransformObject(selectedObject!.id, { scale: s });
    toast.success(`Scaled ×${f}`);
  };

  return (
    <div className="space-y-2">
      <Section title="Printer">
        <div className="flex items-center gap-1">
          <select
            value={printerId}
            disabled={!bed}
            onChange={(e) => bed && onUpdateBedGeometry(bed.id, { printerId: e.target.value, sizeMM: undefined })}
            className="flex-1 h-[20px] text-[11px] bevel-inset bg-white text-win-text px-1"
          >
            {listPrinters().map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="text-[10px] text-win-text-disabled font-mono">
          Volume: {wMM} × {dMM} × {hMM} mm
        </div>
        {bed && (
          <div className="text-[10px] text-win-text-disabled font-mono">
            Scene: {wU.toFixed(2)} × {dU.toFixed(2)} × {hU.toFixed(2)} units
          </div>
        )}
      </Section>

      <Section title="Build Plate">
        {bed ? (
          <div className="text-[10px] text-win-text">
            Bed active: <span className="font-mono">{bed.id.slice(0, 12)}</span>
          </div>
        ) : (
          <Btn onClick={onCreateBed} title="Create a virtual Elegoo Mars 2 Pro build plate">
            Create Build Plate
          </Btn>
        )}
      </Section>

      <Section title="Bounds Check">
        <div className={`text-[11px] font-semibold ${outOfBounds > 0 ? 'text-red-600' : 'text-green-700'}`}>
          {bed
            ? outOfBounds > 0
              ? `❌ ${outOfBounds} object${outOfBounds > 1 ? 's' : ''} out of volume`
              : '✔ All objects inside volume'
            : '— no bed —'}
        </div>
      </Section>

      <Section title="Placement">
        <Btn onClick={applyCenter} disabled={!bed || !isMeshTarget} title="Center selected on plate (X/Z)">
          Center On Plate
        </Btn>
        <Btn onClick={applyDrop} disabled={!bed || !isMeshTarget} title="Drop selected onto the bed">
          Drop to Bed
        </Btn>
      </Section>

      <Section title="Scale for Print">
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            min={0.0001}
            value={scaleFactor}
            onChange={(e) => setScaleFactor(e.target.value)}
            className="w-16 h-[20px] text-[11px] bevel-inset bg-white text-win-text px-1"
          />
          <button
            onClick={applyScale}
            disabled={!isMeshTarget}
            className="flex-1 h-[20px] text-[11px] text-win-text px-2 bevel-raised hover:brightness-105 active:bevel-inset disabled:opacity-40"
          >
            Apply Factor
          </button>
        </div>
        <div className="grid grid-cols-3 gap-[2px]">
          {[
            { label: '1:50',  f: 0.02 },
            { label: '1:100', f: 0.01 },
            { label: '1:200', f: 0.005 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => setScaleFactor(String(p.f))}
              className="h-[18px] text-[10px] text-win-text bevel-raised hover:brightness-105 active:bevel-inset"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Export">
        <Btn
          onClick={() => exportSTL(isMeshTarget ? selectedObject : null, objects) || toast.error('Nothing to export')}
          title="Export selected (or scene) as STL"
        >
          Export STL
        </Btn>
        <Btn
          onClick={() => exportOBJ(isMeshTarget ? selectedObject : null, objects) || toast.error('Nothing to export')}
          title="Export selected (or scene) as OBJ"
        >
          Export OBJ
        </Btn>
      </Section>

      <div className="text-[10px] text-win-text-disabled px-1 italic">
        Fase 1 — próximas fases: Mesh Repair, Thickness, Remesh, Cut, Diorama.
      </div>
    </div>
  );
};
