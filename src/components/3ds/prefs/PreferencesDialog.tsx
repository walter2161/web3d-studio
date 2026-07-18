/**
 * PreferencesDialog — tabbed 3ds Max-style Preferences panel.
 *
 * Every field writes through the persistent `preferencesStore`. Values that
 * are consumed at runtime (spinner drag, statistics HUD, undo cap, gizmo size,
 * FPS cap, wireframe silhouette angle) update instantly via the global window
 * bridges exposed by the store; the rest are simply persisted for future use.
 */
import { useSyncExternalStore, useState } from 'react';
import { R3Dialog } from '../r3/R3Dialog';
import {
  getPrefs,
  subscribe as subscribePrefs,
  updateSection,
  resetToDefaults,
  type Preferences,
} from './preferencesStore';

type TabKey =
  | 'general' | 'files' | 'viewports' | 'gamma' | 'rendering'
  | 'animation' | 'inverseKinematics' | 'gizmos' | 'maxscript';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'files', label: 'Files' },
  { key: 'viewports', label: 'Viewports' },
  { key: 'gamma', label: 'Gamma / LUT' },
  { key: 'rendering', label: 'Rendering' },
  { key: 'animation', label: 'Animation' },
  { key: 'inverseKinematics', label: 'Inverse Kinematics' },
  { key: 'gizmos', label: 'Gizmos' },
  { key: 'maxscript', label: 'MAXScript' },
];

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 min-h-[22px]">
    <label className="w-[160px] text-right text-[11px] text-win-text/85 shrink-0">{label}:</label>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

const Num = ({ value, onChange, step = 1, min, max, int }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; int?: boolean;
}) => (
  <input
    type="number"
    value={value}
    step={step}
    min={min}
    max={max}
    onChange={(e) => {
      let v = int ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
      if (Number.isNaN(v)) return;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onChange(v);
    }}
    className="h-[20px] w-[100px] bevel-sunken bg-win-face px-1 text-[11px] text-win-text"
  />
);

const Chk = ({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) => (
  <label className="flex items-center gap-1 text-[11px] text-win-text cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Sel = <T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value as T)}
    className="h-[20px] w-[140px] bevel-sunken bg-win-face px-1 text-[11px] text-win-text"
  >
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const PreferencesDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const prefs = useSyncExternalStore<Preferences>(subscribePrefs, getPrefs, getPrefs);
  const [tab, setTab] = useState<TabKey>('general');

  return (
    <R3Dialog open={open} onClose={onClose} title="Preference Settings" width={620}>
      <div className="flex text-win-text" style={{ height: 440 }}>
        {/* Left tab column */}
        <div className="w-[140px] shrink-0 bevel-sunken bg-win-face-shadow/40 overflow-y-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full text-left px-2 h-[22px] text-[11px] truncate ${tab === t.key ? 'bg-yellow-200 text-black' : 'hover:bg-win-face/70'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Right content pane */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tab === 'general' && (
            <>
              <Row label="Levels of Undo">
                <Num int min={0} max={500} value={prefs.general.undoLevels}
                  onChange={(v) => updateSection('general', { undoLevels: v })} />
              </Row>
              <Row label="Auto Backup">
                <Chk label="Enabled" checked={prefs.general.autoBackupEnabled}
                  onChange={(v) => updateSection('general', { autoBackupEnabled: v })} />
              </Row>
              <Row label="Backup Interval (min)">
                <Num int min={1} max={60} value={prefs.general.autoBackupIntervalMin}
                  onChange={(v) => updateSection('general', { autoBackupIntervalMin: v })} />
              </Row>
              <Row label="Activation Hint">
                <Chk label="Show hint on viewport click" checked={prefs.general.showActivationHint}
                  onChange={(v) => updateSection('general', { showActivationHint: v })} />
              </Row>
            </>
          )}

          {tab === 'files' && (
            <>
              <Row label="Recent Files Max">
                <Num int min={0} max={40} value={prefs.files.recentFilesMax}
                  onChange={(v) => updateSection('files', { recentFilesMax: v })} />
              </Row>
              <Row label="Compress on Save">
                <Chk label="" checked={prefs.files.compressOnSave}
                  onChange={(v) => updateSection('files', { compressOnSave: v })} />
              </Row>
              <Row label="Incremental Save">
                <Chk label="" checked={prefs.files.incrementalSave}
                  onChange={(v) => updateSection('files', { incrementalSave: v })} />
              </Row>
            </>
          )}

          {tab === 'viewports' && (
            <>
              <Row label="FPS Cap">
                <Num int min={0} max={240} value={prefs.viewports.fpsCap}
                  onChange={(v) => updateSection('viewports', { fpsCap: v })} />
                <span className="text-[10px] text-win-text/70 ml-2">0 = uncapped</span>
              </Row>
              <Row label="Statistics HUD">
                <Chk label="Show FPS / tris / verts" checked={prefs.viewports.showStatistics}
                  onChange={(v) => updateSection('viewports', { showStatistics: v })} />
              </Row>
              <Row label="Axis Triad">
                <Chk label="Show XYZ gnomon" checked={prefs.viewports.showAxisTriad}
                  onChange={(v) => updateSection('viewports', { showAxisTriad: v })} />
              </Row>
              <Row label="Home Grid">
                <Chk label="Visible" checked={prefs.viewports.showGrid}
                  onChange={(v) => updateSection('viewports', { showGrid: v })} />
              </Row>
              <Row label="Spinner Live Update">
                <Chk label="Update scene during drag" checked={prefs.viewports.updateDuringSpinnerDrag}
                  onChange={(v) => updateSection('viewports', { updateDuringSpinnerDrag: v })} />
              </Row>
              <Row label="Wireframe Angle°">
                <Num step={0.5} min={0} max={45} value={prefs.viewports.wireframeAngle}
                  onChange={(v) => updateSection('viewports', { wireframeAngle: v })} />
              </Row>
            </>
          )}

          {tab === 'gamma' && (
            <>
              <Row label="Enable Gamma/LUT">
                <Chk label="" checked={prefs.gamma.enabled}
                  onChange={(v) => updateSection('gamma', { enabled: v })} />
              </Row>
              <Row label="Display Gamma">
                <Num step={0.05} min={1} max={3} value={prefs.gamma.displayGamma}
                  onChange={(v) => updateSection('gamma', { displayGamma: v })} />
              </Row>
              <Row label="Input Gamma">
                <Num step={0.05} min={1} max={3} value={prefs.gamma.inputGamma}
                  onChange={(v) => updateSection('gamma', { inputGamma: v })} />
              </Row>
              <Row label="Output Gamma">
                <Num step={0.05} min={1} max={3} value={prefs.gamma.outputGamma}
                  onChange={(v) => updateSection('gamma', { outputGamma: v })} />
              </Row>
            </>
          )}

          {tab === 'rendering' && (
            <>
              <Row label="Output Width">
                <Num int min={16} max={7680} value={prefs.rendering.outputWidth}
                  onChange={(v) => updateSection('rendering', { outputWidth: v })} />
              </Row>
              <Row label="Output Height">
                <Num int min={16} max={4320} value={prefs.rendering.outputHeight}
                  onChange={(v) => updateSection('rendering', { outputHeight: v })} />
              </Row>
              <Row label="AA Samples">
                <Num int min={0} max={8} value={prefs.rendering.aaSamples}
                  onChange={(v) => updateSection('rendering', { aaSamples: v })} />
              </Row>
              <Row label="Shadows">
                <Chk label="Enable shadow maps" checked={prefs.rendering.shadows}
                  onChange={(v) => updateSection('rendering', { shadows: v })} />
              </Row>
            </>
          )}

          {tab === 'animation' && (
            <>
              <Row label="Default In Tangent">
                <Sel value={prefs.animation.defaultInTangent}
                  options={[
                    { value: 'auto',   label: 'Auto' },
                    { value: 'linear', label: 'Linear' },
                    { value: 'step',   label: 'Step' },
                    { value: 'bezier', label: 'Bezier' },
                  ]}
                  onChange={(v) => updateSection('animation', { defaultInTangent: v })} />
              </Row>
              <Row label="Default Out Tangent">
                <Sel value={prefs.animation.defaultOutTangent}
                  options={[
                    { value: 'auto',   label: 'Auto' },
                    { value: 'linear', label: 'Linear' },
                    { value: 'step',   label: 'Step' },
                    { value: 'bezier', label: 'Bezier' },
                  ]}
                  onChange={(v) => updateSection('animation', { defaultOutTangent: v })} />
              </Row>
              <Row label="Playback Speed">
                <Num step={0.1} min={0.1} max={4} value={prefs.animation.playbackSpeed}
                  onChange={(v) => updateSection('animation', { playbackSpeed: v })} />
              </Row>
              <Row label="Key Brightness">
                <Num step={0.05} min={0.2} max={1} value={prefs.animation.keyBrightness}
                  onChange={(v) => updateSection('animation', { keyBrightness: v })} />
              </Row>
            </>
          )}

          {tab === 'inverseKinematics' && (
            <>
              <Row label="Position Threshold">
                <Num step={0.0005} min={0.00001} max={1} value={prefs.inverseKinematics.positionThreshold}
                  onChange={(v) => updateSection('inverseKinematics', { positionThreshold: v })} />
              </Row>
              <Row label="Rotation Threshold°">
                <Num step={0.1} min={0.01} max={10} value={prefs.inverseKinematics.rotationThreshold}
                  onChange={(v) => updateSection('inverseKinematics', { rotationThreshold: v })} />
              </Row>
              <Row label="Iterations">
                <Num int min={1} max={200} value={prefs.inverseKinematics.iterations}
                  onChange={(v) => updateSection('inverseKinematics', { iterations: v })} />
              </Row>
              <Row label="Use Dampening">
                <Chk label="" checked={prefs.inverseKinematics.useDampening}
                  onChange={(v) => updateSection('inverseKinematics', { useDampening: v })} />
              </Row>
            </>
          )}

          {tab === 'gizmos' && (
            <>
              <Row label="Transform Gizmo Size">
                <Num int min={40} max={300} value={prefs.gizmos.transformSize}
                  onChange={(v) => updateSection('gizmos', { transformSize: v })} />
              </Row>
              <Row label="Sub-Object Gizmos">
                <Chk label="Show at Vertex / Edge / Face levels" checked={prefs.gizmos.showSubObjectGizmos}
                  onChange={(v) => updateSection('gizmos', { showSubObjectGizmos: v })} />
              </Row>
              <Row label="Tint with Accent">
                <Chk label="Use UI accent color for gizmos" checked={prefs.gizmos.tintWithAccent}
                  onChange={(v) => updateSection('gizmos', { tintWithAccent: v })} />
              </Row>
            </>
          )}

          {tab === 'maxscript' && (
            <>
              <Row label="Auto-Print Results">
                <Chk label="" checked={prefs.maxscript.autoPrint}
                  onChange={(v) => updateSection('maxscript', { autoPrint: v })} />
              </Row>
              <Row label="Line Numbers">
                <Chk label="" checked={prefs.maxscript.lineNumbers}
                  onChange={(v) => updateSection('maxscript', { lineNumbers: v })} />
              </Row>
              <Row label="Font Size">
                <Num int min={8} max={24} value={prefs.maxscript.fontSize}
                  onChange={(v) => updateSection('maxscript', { fontSize: v })} />
              </Row>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center p-2 border-t border-win-shadow bg-win-face/70">
        <button
          onClick={() => { if (confirm('Reset all preferences to defaults?')) resetToDefaults(); }}
          className="h-[22px] px-3 text-[11px] bevel-raised hover:brightness-105"
        >
          Reset to Defaults
        </button>
        <button
          onClick={onClose}
          className="h-[22px] px-4 text-[11px] bevel-raised hover:brightness-105"
        >
          OK
        </button>
      </div>
    </R3Dialog>
  );
};
