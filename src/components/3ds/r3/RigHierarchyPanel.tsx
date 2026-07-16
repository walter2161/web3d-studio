/**
 * RigHierarchyPanel — shows the internal node tree (bones, meshes, groups)
 * of an imported rigged model as a nested list inside the Modify tab.
 * Clicking a node sub-selects it so TransformControls attach to that node
 * (Scene3D already supports this via `selectedSubUuid`), enabling
 * hierarchical FK manipulation of bones/members.
 */

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Bone, Box as BoxIcon, Circle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getImportedModel } from '../utils/modelImport';

interface SubNode {
  uuid: string;
  name: string;
  kind: 'mesh' | 'skinnedMesh' | 'bone' | 'group' | 'object';
  children: SubNode[];
}

function build(root: any): SubNode[] {
  const walk = (n: any): SubNode => {
    let kind: SubNode['kind'] = 'object';
    if (n.isSkinnedMesh) kind = 'skinnedMesh';
    else if (n.isMesh) kind = 'mesh';
    else if (n.isBone) kind = 'bone';
    else if (n.isGroup) kind = 'group';
    return {
      uuid: n.uuid,
      name: n.name || kind,
      kind,
      children: (n.children || []).map(walk),
    };
  };
  return (root?.children || []).map(walk);
}

const NodeIcon = ({ kind }: { kind: SubNode['kind'] }) => {
  if (kind === 'bone') return <Bone className="w-3.5 h-3.5 text-amber-400" />;
  if (kind === 'group') return <Layers className="w-3.5 h-3.5 text-sky-400" />;
  if (kind === 'skinnedMesh') return <Circle className="w-3.5 h-3.5 text-emerald-400" />;
  if (kind === 'mesh') return <BoxIcon className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
};

interface Props {
  objectId: string;
  selectedSubUuid?: string | null;
  onSelectSubObject?: (objectId: string, uuid: string | null) => void;
}

export const RigHierarchyPanel = ({ objectId, selectedSubUuid, onSelectSubObject }: Props) => {
  const imported = getImportedModel(objectId);
  const tree = useMemo(() => (imported ? build(imported.root) : []), [imported, objectId]);

  // Default: expand bone roots so the rig is visible right away.
  const initialExpanded = useMemo(() => {
    const s = new Set<string>();
    const seed = (nodes: SubNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'bone' || n.kind === 'group' || n.kind === 'skinnedMesh') {
          s.add(n.uuid);
        }
        seed(n.children);
      }
    };
    seed(tree);
    return s;
  }, [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const toggle = (uuid: string) => {
    const s = new Set(expanded);
    s.has(uuid) ? s.delete(uuid) : s.add(uuid);
    setExpanded(s);
  };

  if (!imported) {
    return (
      <div className="text-[11px] text-muted-foreground p-2">
        Model not loaded yet — hierarchy will appear once the import finishes.
      </div>
    );
  }
  if (tree.length === 0) {
    return <div className="text-[11px] text-muted-foreground p-2">No sub-nodes.</div>;
  }

  const render = (node: SubNode, depth: number) => {
    const isExpanded = expanded.has(node.uuid);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedSubUuid === node.uuid;
    return (
      <div key={node.uuid} className="select-none">
        <div
          className={cn(
            'flex items-center gap-1 py-0.5 pr-2 text-xs hover:bg-menu-hover cursor-pointer',
            isSelected && 'bg-primary/20 border-l-2 border-primary'
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={(e) => {
            e.stopPropagation();
            onSelectSubObject?.(objectId, isSelected ? null : node.uuid);
          }}
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center">
            {hasChildren ? (
              <button
                className="w-3.5 h-3.5"
                onClick={(e) => { e.stopPropagation(); toggle(node.uuid); }}
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : null}
          </div>
          <NodeIcon kind={node.kind} />
          <span className="truncate text-foreground/90" title={node.name}>{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map((c) => render(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="max-h-[320px] overflow-y-auto panel-scroll -mx-1">
      {tree.map((n) => render(n, 0))}
      {selectedSubUuid && (
        <button
          className="mt-2 mx-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-menu-hover rounded w-[calc(100%-8px)] text-left"
          onClick={() => onSelectSubObject?.(objectId, null)}
        >
          ← Deselect sub-object (edit whole model)
        </button>
      )}
    </div>
  );
};
