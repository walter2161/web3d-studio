import { useState, useEffect } from 'react';
import { R3Dialog, GroupBox, R3Button } from './R3Dialog';

export type UnitSystem = 'Generic' | 'Metric' | 'US Standard';
export type MetricUnit = 'mm' | 'cm' | 'm' | 'km';
export type USUnit = 'Inches' | 'Feet' | 'Miles';

export interface UnitsSettings {
  system: UnitSystem;
  metric: MetricUnit;
  us: USUnit;
  precision: number;
}

const DEFAULT: UnitsSettings = { system: 'Generic', metric: 'm', us: 'Feet', precision: 3 };

const STORAGE = '3dsled-units';

export const loadUnits = (): UnitsSettings => {
  try { const s = localStorage.getItem(STORAGE); return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT; } catch { return DEFAULT; }
};
export const saveUnits = (u: UnitsSettings) => { try { localStorage.setItem(STORAGE, JSON.stringify(u)); } catch {} };

export const formatUnit = (value: number, u: UnitsSettings = loadUnits()): string => {
  const suffix = u.system === 'Generic' ? '' : u.system === 'Metric' ? ` ${u.metric}` : ` ${u.us === 'Inches' ? '"' : u.us === 'Feet' ? "'" : ' mi'}`;
  return value.toFixed(u.precision) + suffix;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply?: (u: UnitsSettings) => void;
}

export const UnitsSetup = ({ open, onOpenChange, onApply }: Props) => {
  const [u, setU] = useState<UnitsSettings>(loadUnits);
  useEffect(() => { if (open) setU(loadUnits()); }, [open]);

  const commit = () => { saveUnits(u); onApply?.(u); onOpenChange(false); };

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Units Setup" width={340}>
      <GroupBox title="Display Unit Scale">
        <label className="flex items-center gap-1"><input type="radio" checked={u.system === 'Metric'} onChange={() => setU({ ...u, system: 'Metric' })} />Metric</label>
        <div className="pl-4">
          <select value={u.metric} onChange={(e) => setU({ ...u, metric: e.target.value as MetricUnit, system: 'Metric' })} className="bevel-inset bg-white text-[11px] h-[18px] w-32">
            <option value="mm">Millimeters</option>
            <option value="cm">Centimeters</option>
            <option value="m">Meters</option>
            <option value="km">Kilometers</option>
          </select>
        </div>
        <label className="flex items-center gap-1 mt-1"><input type="radio" checked={u.system === 'US Standard'} onChange={() => setU({ ...u, system: 'US Standard' })} />US Standard</label>
        <div className="pl-4">
          <select value={u.us} onChange={(e) => setU({ ...u, us: e.target.value as USUnit, system: 'US Standard' })} className="bevel-inset bg-white text-[11px] h-[18px] w-32">
            <option>Inches</option>
            <option>Feet</option>
            <option>Miles</option>
          </select>
        </div>
        <label className="flex items-center gap-1 mt-1"><input type="radio" checked={u.system === 'Generic'} onChange={() => setU({ ...u, system: 'Generic' })} />Generic Units</label>
      </GroupBox>

      <GroupBox title="System Unit Setup" className="mt-2">
        <div className="text-[11px]">1 Unit = 1.0 {u.system === 'Metric' ? u.metric : u.system === 'US Standard' ? u.us : 'unit'}</div>
        <div className="flex items-center gap-1 mt-1 text-[11px]">
          <span>Decimal Places:</span>
          <select value={u.precision} onChange={(e) => setU({ ...u, precision: parseInt(e.target.value) })} className="bevel-inset bg-white text-[11px] h-[18px]">
            {[0,1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </GroupBox>

      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={70} onClick={commit}>OK</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
