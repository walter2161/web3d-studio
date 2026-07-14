import { useState } from 'react';
import { R3Dialog, GroupBox, Spinner, R3Button, Row } from './R3Dialog';
import { useEnvironment } from './EnvironmentContext';

interface EnvironmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EFFECT_TYPES = ['Fog', 'Volume Fog', 'Volume Light', 'Fire Effect'];

type Tab = 'Environment' | 'Effects';

export const EnvironmentDialog = ({ open, onOpenChange }: EnvironmentDialogProps) => {
  const [tab, setTab] = useState<Tab>('Environment');
  const [bgColor, setBgColor] = useState('#000000');
  const [useMap, setUseMap] = useState(true);
  const [tint, setTint] = useState('#ffffff');
  const [level, setLevel] = useState(1.0);
  const [ambient, setAmbient] = useState('#000000');
  const [exposure, setExposure] = useState<'<no exposure control>' | 'Automatic Exposure Control' | 'Linear Exposure Control' | 'Logarithmic Exposure Control'>('<no exposure control>');
  const [processBackground, setProcessBackground] = useState(false);

  const [effects, setEffects] = useState<{ name: string; type: string; active: boolean }[]>([]);
  const [selectedEffect, setSelectedEffect] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const addEffect = (type: string) => {
    setEffects((e) => [...e, { name: type, type, active: true }]);
    setAddOpen(false);
  };

  const label = (t: string) => <span className="text-[11px]">{t}</span>;

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Environment" width={480}>
      <div className="flex gap-[2px] mb-1">
        {(['Environment', 'Effects'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-[2px] text-[11px] ${tab === t ? 'bevel-inset bg-white' : 'bevel-raised bg-win-face'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bevel-inset bg-win-face p-2 space-y-2" style={{ minHeight: 340 }}>
        {tab === 'Environment' && (
          <>
            <GroupBox title="Common Parameters">
              <div className="text-[11px] font-bold mt-1 mb-1">Background:</div>
              <Row label="Color:" labelWidth={60}>
                <label className="bevel-inset inline-block cursor-pointer" style={{ width: 40, height: 16 }}>
                  <span className="block w-full h-full" style={{ background: bgColor }} />
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="hidden" />
                </label>
                <label className="flex items-center gap-1 ml-3">
                  <input type="checkbox" checked={useMap} onChange={(e) => setUseMap(e.target.checked)} />
                  {label('Use Map')}
                </label>
              </Row>
              <Row label="Environment Map:" labelWidth={120}>
                <button className="bevel-raised bg-win-face text-[11px] px-1 text-left" style={{ width: 240, height: 18 }}>
                  None
                </button>
              </Row>

              <div className="text-[11px] font-bold mt-2 mb-1">Global Lighting:</div>
              <div className="flex gap-4">
                <Row label="Tint:" labelWidth={40}>
                  <label className="bevel-inset inline-block cursor-pointer" style={{ width: 40, height: 16 }}>
                    <span className="block w-full h-full" style={{ background: tint }} />
                    <input type="color" value={tint} onChange={(e) => setTint(e.target.value)} className="hidden" />
                  </label>
                </Row>
                <Row label="Level:" labelWidth={40}>
                  <Spinner value={level} onChange={setLevel} step={0.1} min={0} width={56} />
                </Row>
                <Row label="Ambient:" labelWidth={60}>
                  <label className="bevel-inset inline-block cursor-pointer" style={{ width: 40, height: 16 }}>
                    <span className="block w-full h-full" style={{ background: ambient }} />
                    <input type="color" value={ambient} onChange={(e) => setAmbient(e.target.value)} className="hidden" />
                  </label>
                </Row>
              </div>
            </GroupBox>

            <GroupBox title="Exposure Control">
              <select
                value={exposure}
                onChange={(e) => setExposure(e.target.value as typeof exposure)}
                className="bevel-inset bg-white text-[11px] h-[18px] w-full"
              >
                <option>{'<no exposure control>'}</option>
                <option>Automatic Exposure Control</option>
                <option>Linear Exposure Control</option>
                <option>Logarithmic Exposure Control</option>
              </select>
              <label className="flex items-center gap-1 mt-1">
                <input type="checkbox" checked={!useMap ? false : processBackground} onChange={(e) => setProcessBackground(e.target.checked)} />
                {label('Active')}
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" />{label('Process Background and Environment Maps')}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <div className="bevel-inset bg-black" style={{ width: 96, height: 64 }} />
                <div className="text-[11px]">Render Preview</div>
              </div>
            </GroupBox>
          </>
        )}

        {tab === 'Effects' && (
          <GroupBox title="Effects">
            <div className="flex gap-2">
              <div className="bevel-inset bg-white flex-1" style={{ height: 120, overflow: 'auto' }}>
                {effects.length === 0 && (
                  <div className="text-[11px] text-win-text-disabled p-1">(no effects)</div>
                )}
                {effects.map((eff, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedEffect(i)}
                    className={`px-1 text-[11px] cursor-default ${selectedEffect === i ? 'bg-menu-active text-white' : ''}`}
                  >
                    {eff.name}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <R3Button width={80} onClick={() => setAddOpen(true)}>Add...</R3Button>
                <R3Button width={80} onClick={() => {
                  if (selectedEffect !== null) {
                    setEffects((e) => e.filter((_, i) => i !== selectedEffect));
                    setSelectedEffect(null);
                  }
                }}>Delete</R3Button>
                <div className="mt-1">
                  <label className="flex items-center gap-1"><input type="checkbox" defaultChecked />{label('Active')}</label>
                </div>
                <R3Button width={80}>Merge...</R3Button>
              </div>
            </div>

            <Row label="Name:" labelWidth={50}>
              <input className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]" defaultValue={selectedEffect !== null ? effects[selectedEffect]?.name : ''} />
            </Row>
          </GroupBox>
        )}
      </div>

      <div className="mt-2 flex justify-end">
        <R3Button width={80} onClick={() => onOpenChange(false)}>Close</R3Button>
      </div>

      {/* Add Effect popup */}
      {addOpen && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bevel-raised bg-win-face p-2" style={{ width: 220 }}>
            <div className="text-[11px] font-bold mb-1">Add Atmospheric Effect</div>
            <div className="bevel-inset bg-white" style={{ height: 100 }}>
              {EFFECT_TYPES.map((t) => (
                <div
                  key={t}
                  onClick={() => addEffect(t)}
                  className="px-1 text-[11px] cursor-default hover:bg-menu-active hover:text-white"
                >
                  {t}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-1 mt-2">
              <R3Button width={60} onClick={() => setAddOpen(false)}>Cancel</R3Button>
            </div>
          </div>
        </div>
      )}
    </R3Dialog>
  );
};
