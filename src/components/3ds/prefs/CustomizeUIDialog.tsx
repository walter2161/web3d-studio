/**
 * CustomizeUIDialog — 3ds Max `Customize → Customize User Interface...` clone.
 *
 * Tabs:
 *  • Keyboard — full editable list of commands. Click a chord field, press
 *    a key combo, and the binding is remembered. The global hotkey dispatcher
 *    in Studio3D uses this map on every keydown.
 *  • Colors — color pickers for accent, selection, wireframe, axes and
 *    viewport background. Values are pushed to CSS variables + window.__uiColors
 *    so both DOM chrome and the three.js scene consume them live.
 *  • Toolbars / Menus — read-only summary of the current layout (Walt3D uses
 *    fixed toolbars, matching the 3ds Max R3 profile).
 *  • Scheme — export / import the whole scheme (colors + hotkeys) as JSON.
 */
import { useSyncExternalStore, useRef, useState } from 'react';
import { R3Dialog } from '../r3/R3Dialog';
import {
  getHotkeys, subscribeHotkeys, setChord, resetHotkeys, replaceHotkeys,
  eventToChord, type HotkeyBinding,
} from './hotkeysStore';
import {
  getUIColors, subscribeUIColors, setUIColor, resetUIColors, replaceUIColors,
  type UIColors,
} from './uiColorsStore';

type TabKey = 'keyboard' | 'colors' | 'toolbars' | 'menus' | 'scheme';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'keyboard', label: 'Keyboard' },
  { key: 'colors', label: 'Colors' },
  { key: 'toolbars', label: 'Toolbars' },
  { key: 'menus', label: 'Menus' },
  { key: 'scheme', label: 'Scheme' },
];

export const CustomizeUIDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const hotkeys = useSyncExternalStore<HotkeyBinding[]>(subscribeHotkeys, getHotkeys, getHotkeys);
  const colors = useSyncExternalStore<UIColors>(subscribeUIColors, getUIColors, getUIColors);
  const [tab, setTab] = useState<TabKey>('keyboard');
  const [filter, setFilter] = useState('');
  const [capturing, setCapturing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- keyboard capture ----------------------------------------------------
  const onCaptureKey = (cmd: string) => (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const chord = eventToChord(e.nativeEvent);
    if (!chord) return; // ignore lone modifier presses
    if (e.nativeEvent.key === 'Escape') {
      setCapturing(null);
      return;
    }
    if (e.nativeEvent.key === 'Backspace' || e.nativeEvent.key === 'Delete') {
      setChord(cmd, '');
      setCapturing(null);
      return;
    }
    setChord(cmd, chord);
    setCapturing(null);
  };

  const grouped = groupBy(
    hotkeys.filter((b) =>
      !filter ||
      b.label.toLowerCase().includes(filter.toLowerCase()) ||
      b.command.toLowerCase().includes(filter.toLowerCase()) ||
      b.chord.toLowerCase().includes(filter.toLowerCase())
    ),
    (b) => b.category,
  );

  // --- scheme export / import ---------------------------------------------
  const exportScheme = () => {
    const scheme = { colors: getUIColors(), hotkeys: getHotkeys() };
    const blob = new Blob([JSON.stringify(scheme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'walt3d-ui-scheme.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importScheme = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.colors) replaceUIColors(parsed.colors);
        if (parsed.hotkeys && Array.isArray(parsed.hotkeys)) replaceHotkeys(parsed.hotkeys);
      } catch (err) {
        alert('Invalid scheme file: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <R3Dialog open={open} onClose={onClose} title="Customize User Interface" width={700}>
      <div className="flex text-win-text" style={{ height: 480 }}>
        {/* Left tab column */}
        <div className="w-[120px] shrink-0 bevel-sunken bg-win-face-shadow/40 overflow-y-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full text-left px-2 h-[24px] text-[11px] ${tab === t.key ? 'bg-yellow-200 text-black' : 'hover:bg-win-face/70'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Right pane */}
        <div className="flex-1 min-w-0 flex flex-col">
          {tab === 'keyboard' && (
            <>
              <div className="p-2 border-b border-win-shadow flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter commands or keys..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="flex-1 h-[22px] px-2 text-[11px] bevel-sunken bg-win-face text-win-text"
                />
                <button
                  onClick={() => { if (confirm('Reset all hotkeys to defaults?')) resetHotkeys(); }}
                  className="h-[22px] px-2 text-[11px] bevel-raised hover:brightness-105"
                >
                  Reset
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-3">
                {Object.entries(grouped).map(([cat, list]) => (
                  <div key={cat}>
                    <div className="text-[10px] uppercase tracking-wide text-win-text/60 mb-1">{cat}</div>
                    <div className="bevel-raised">
                      {list.map((b) => (
                        <div key={b.command} className="flex items-center gap-2 px-2 h-[22px] border-b border-win-shadow/40 last:border-0">
                          <div className="flex-1 text-[11px] truncate">{b.label}</div>
                          <input
                            type="text"
                            readOnly
                            value={capturing === b.command ? 'Press keys… (Esc to cancel, Del to clear)' : (b.chord || '—')}
                            onFocus={() => setCapturing(b.command)}
                            onBlur={() => setCapturing((c) => (c === b.command ? null : c))}
                            onKeyDown={onCaptureKey(b.command)}
                            className={`w-[220px] h-[20px] text-[11px] bevel-sunken px-1 text-center cursor-pointer ${capturing === b.command ? 'bg-yellow-200 text-black' : 'bg-win-face'}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'colors' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {(Object.keys(colors) as (keyof UIColors)[]).map((k) => (
                <div key={k} className="flex items-center gap-3 min-h-[24px]">
                  <label className="w-[200px] text-right pr-1 text-[11px] text-win-text/85 capitalize">
                    {humanize(k)}:
                  </label>
                  <input
                    type="color"
                    value={colors[k]}
                    onChange={(e) => setUIColor(k, e.target.value)}
                    className="h-[22px] w-[54px] bevel-sunken"
                  />
                  <input
                    type="text"
                    value={colors[k]}
                    onChange={(e) => setUIColor(k, e.target.value)}
                    className="h-[22px] w-[100px] bevel-sunken bg-win-face px-1 text-[11px] font-mono"
                  />
                  <div
                    className="h-[22px] w-[22px] bevel-sunken"
                    style={{ background: colors[k] }}
                    aria-hidden
                  />
                </div>
              ))}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => { if (confirm('Reset colors to defaults?')) resetUIColors(); }}
                  className="h-[22px] px-3 text-[11px] bevel-raised hover:brightness-105"
                >
                  Reset Colors
                </button>
              </div>
            </div>
          )}

          {tab === 'toolbars' && (
            <div className="flex-1 overflow-y-auto p-3 text-[11px] space-y-2">
              <div className="text-win-text/85">
                Walt3D uses a fixed toolbar layout matching the 3ds Max R3 profile.
                The following toolbars are always visible:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-win-text/80">
                <li>Main Toolbar — Undo / Redo / Selection / Transform / Snap</li>
                <li>Transform Toolbar (top-left of viewport) — Move / Rotate / Scale</li>
                <li>Status Bar (bottom) — Navigation controls (Zoom / Pan / Orbit / Walkthrough)</li>
                <li>Command Panel (right side) — Create / Modify / Hierarchy / Motion / Display / Utilities</li>
                <li>Track Bar (above timeline) — key summary</li>
              </ul>
              <div className="text-win-text/60 pt-2">
                Custom toolbar authoring is planned for a future release.
              </div>
            </div>
          )}

          {tab === 'menus' && (
            <div className="flex-1 overflow-y-auto p-3 text-[11px] space-y-2">
              <div className="text-win-text/85">Top-level menus in Walt3D:</div>
              <ul className="list-disc pl-5 space-y-1 text-win-text/80">
                {['File','Edit','Tools','Group','Views','Create','Modifiers','Character','Animation','Graph Editors','Rendering','Customize','MAXScript','Help'].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <div className="text-win-text/60 pt-2">
                Menu customization can be scripted via MAXScript Listener — rewriting the
                menu order at runtime is planned.
              </div>
            </div>
          )}

          {tab === 'scheme' && (
            <div className="flex-1 overflow-y-auto p-3 text-[11px] space-y-3">
              <div className="text-win-text/85">
                Export the current colors + hotkey bindings as a JSON file to share your
                scheme, or import a file to replace them.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportScheme}
                  className="h-[24px] px-3 text-[11px] bevel-raised hover:brightness-105"
                >
                  Save Scheme…
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-[24px] px-3 text-[11px] bevel-raised hover:brightness-105"
                >
                  Load Scheme…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importScheme(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="text-win-text/60">
                Files are plain JSON of shape <code>{'{ colors, hotkeys }'}</code>. They persist
                in <code>localStorage</code> after import.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end items-center p-2 border-t border-win-shadow bg-win-face/70">
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

function groupBy<T, K extends string>(list: T[], keyFn: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of list) {
    const k = keyFn(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

function humanize(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
