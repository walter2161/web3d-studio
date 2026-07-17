import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Layers,
  Box as BoxIcon,
  Bone,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getImportedModel } from './utils/modelImport';

interface SceneHierarchyProps {
  objects: any[];
  selectedObject: string | null;
  selectedObjectIds?: string[];
  selectedSubUuid?: string | null;
  onSelectObject: (id: string | null, additive?: boolean, remove?: boolean) => void;
  onSelectSubObject?: (objectId: string, uuid: string | null) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRenameObject: (id: string, name: string) => void;
}

interface SubNode {
  uuid: string;
  name: string;
  kind: 'mesh' | 'skinnedMesh' | 'bone' | 'group' | 'object';
  children: SubNode[];
}

function buildSubTree(root: any): SubNode[] {
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

export const SceneHierarchy = ({
  objects,
  selectedObject,
  selectedObjectIds = [],
  selectedSubUuid,
  onSelectObject,
  onSelectSubObject,
  onDeleteObject,
  onDuplicateObject,
  onToggleVisibility,
  onToggleLock,
  onRenameObject,
}: SceneHierarchyProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');

  const toggleExpanded = (key: string) => {
    const s = new Set(expandedNodes);
    s.has(key) ? s.delete(key) : s.add(key);
    setExpandedNodes(s);
  };

  const startRename = (id: string, currentName: string) => {
    setEditingName(id);
    setTempName(currentName);
  };

  const finishRename = () => {
    if (editingName && tempName.trim()) onRenameObject(editingName, tempName.trim());
    setEditingName(null);
    setTempName('');
  };

  const getObjectName = (obj: any) =>
    obj.name || `${obj.type}_${obj.id.slice(0, 8)}`;

  const SubIcon = ({ kind }: { kind: SubNode['kind'] }) => {
    if (kind === 'bone') return <Bone className="w-3.5 h-3.5 text-amber-400" />;
    if (kind === 'group') return <Layers className="w-3.5 h-3.5 text-sky-400" />;
    if (kind === 'skinnedMesh') return <Circle className="w-3.5 h-3.5 text-emerald-400" />;
    if (kind === 'mesh') return <BoxIcon className="w-3.5 h-3.5 text-muted-foreground" />;
    return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const renderSubNode = (objectId: string, node: SubNode, depth: number) => {
    const key = `${objectId}::${node.uuid}`;
    const isExpanded = expandedNodes.has(key);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedObject === objectId && selectedSubUuid === node.uuid;

    return (
      <div key={key} className="select-none">
        <div
          className={cn(
            'flex items-center gap-1 py-0.5 px-2 text-xs hover:bg-menu-hover cursor-pointer',
            isSelected && 'bg-primary/20 border-l-2 border-primary'
          )}
          style={{ paddingLeft: `${depth * 14 + 20}px` }}
          onClick={(e) => {
            e.stopPropagation();
            onSelectObject(objectId, e.ctrlKey || e.metaKey, e.altKey);
            onSelectSubObject?.(objectId, node.uuid);
          }}
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center">
            {hasChildren ? (
              <button
                className="w-3.5 h-3.5"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(key);
                }}
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : null}
          </div>
          <SubIcon kind={node.kind} />
          <span className="truncate text-foreground/90">{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map((c) => renderSubNode(objectId, c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const renderObject = (obj: any, depth: number = 0) => {
    const isSelected = (selectedObject === obj.id || selectedObjectIds.includes(obj.id)) && !selectedSubUuid;
    const isExpanded = expandedNodes.has(obj.id);
    const isEditing = editingName === obj.id;

    // Compute sub-tree for imported objects
    const importedModel = obj.type === 'imported' ? getImportedModel(obj.id) : undefined;
    const subTree: SubNode[] = importedModel ? buildSubTree(importedModel.root) : [];
    const hasChildren = subTree.length > 0;

    return (
      <div key={obj.id} className="select-none">
        <div
          className={cn(
            'flex items-center gap-1 py-1 px-2 text-sm hover:bg-menu-hover cursor-pointer',
            isSelected && 'bg-primary/20 border-l-2 border-primary'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={(e) => {
            onSelectObject(obj.id, e.ctrlKey || e.metaKey, e.altKey);
            onSelectSubObject?.(obj.id, null);
          }}
          onDoubleClick={() => startRename(obj.id, getObjectName(obj))}
        >
          <div className="w-4 h-4 flex items-center justify-center">
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="w-4 h-4 p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(obj.id);
                }}
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </Button>
            )}
          </div>

          <Layers className="w-4 h-4 text-muted-foreground" />

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishRename();
                  if (e.key === 'Escape') {
                    setEditingName(null);
                    setTempName('');
                  }
                }}
                className="h-6 text-xs px-1 bg-input border-panel-border"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate text-foreground">{getObjectName(obj)}</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="w-5 h-5 p-0 hover:bg-menu-hover"
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(obj.id); }}>
              {obj.visible !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
            </Button>
            <Button variant="ghost" size="sm" className="w-5 h-5 p-0 hover:bg-menu-hover"
              onClick={(e) => { e.stopPropagation(); onToggleLock(obj.id); }}>
              {obj.locked ? <Lock className="w-3 h-3 text-muted-foreground" /> : <Unlock className="w-3 h-3" />}
            </Button>
            <Button variant="ghost" size="sm" className="w-5 h-5 p-0 hover:bg-menu-hover"
              onClick={(e) => { e.stopPropagation(); onDuplicateObject(obj.id); }}>
              <Copy className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" className="w-5 h-5 p-0 hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => { e.stopPropagation(); onDeleteObject(obj.id); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>{subTree.map((n) => renderSubNode(obj.id, n, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <Card className="bg-card border-panel-border h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Scene Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto panel-scroll">
          {objects.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No objects in scene
            </div>
          ) : (
            objects.map((obj) => renderObject(obj))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
