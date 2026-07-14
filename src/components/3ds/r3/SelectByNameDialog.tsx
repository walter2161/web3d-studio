import { useEffect, useMemo, useState } from 'react';
import { R3Dialog, R3Button, GroupBox } from './R3Dialog';

interface Obj { id: string; name?: string; type: string; visible?: boolean; isGroup?: boolean; }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  objects: Obj[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}

/** 3ds Max R3 "Select Objects" dialog (H shortcut) — filter, sort and pick. */
export const SelectByNameDialog = ({ open, onOpenChange, objects, selectedId, onSelect }: Props) => {
  const [filter, setFilter] = useState('*');
  const [sortBy, setSortBy] = useState<'name' | 'type'>('name');
  const [showGeometry, setShowGeometry] = useState(true);
  const [showGroups, setShowGroups] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [pick, setPick] = useState<string | null>(selectedId ?? null);

  useEffect(() => { if (open) setPick(selectedId ?? null); }, [open, selectedId]);

  const filtered = useMemo(() => {
    const rx = new RegExp('^' + filter.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    return objects
      .filter((o) => (o.isGroup ? showGroups : showGeometry))
      .filter((o) => (showHidden ? true : o.visible !== false))
      .filter((o) => rx.test(o.name || o.type))
      .sort((a, b) => (sortBy === 'name' ? (a.name || '').localeCompare(b.name || '') : a.type.localeCompare(b.type)));
  }, [objects, filter, sortBy, showGeometry, showGroups, showHidden]);

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Select Objects" width={420}>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[11px]">Find:</span>
            <input
              className="flex-1 bevel-inset bg-white px-1 text-[11px] h-[18px]"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="bevel-inset bg-white h-[240px] overflow-auto text-[11px]">
            {filtered.map((o) => (
              <div
                key={o.id}
                onClick={() => setPick(o.id)}
                onDoubleClick={() => { onSelect(o.id); onOpenChange(false); }}
                className={`px-1 cursor-default ${pick === o.id ? 'bg-menu-active text-menu-hover-fg' : 'hover:bg-menu-hover hover:text-menu-hover-fg'}`}
              >
                {o.isGroup ? '📁 ' : ''}{o.name || o.type} <span className="text-win-text-disabled">[{o.type}]</span>
              </div>
            ))}
            {filtered.length === 0 && <div className="p-1 text-win-text-disabled">No matches</div>}
          </div>
        </div>

        <div className="w-[150px] space-y-1">
          <GroupBox title="Sort">
            <label className="flex items-center gap-1 text-[11px]"><input type="radio" checked={sortBy === 'name'} onChange={() => setSortBy('name')} />Alphabetical</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="radio" checked={sortBy === 'type'} onChange={() => setSortBy('type')} />By Type</label>
          </GroupBox>
          <GroupBox title="List Types">
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showGeometry} onChange={(e) => setShowGeometry(e.target.checked)} />Geometry</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showGroups} onChange={(e) => setShowGroups(e.target.checked)} />Groups</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />Show Hidden</label>
          </GroupBox>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <R3Button width={80} onClick={() => { onSelect(pick); onOpenChange(false); }}>Select</R3Button>
        <R3Button width={80} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
