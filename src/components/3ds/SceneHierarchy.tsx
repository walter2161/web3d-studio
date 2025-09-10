import { useState } from 'react';
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
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SceneHierarchyProps {
  objects: any[];
  selectedObject: string | null;
  onSelectObject: (id: string | null) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRenameObject: (id: string, name: string) => void;
}

export const SceneHierarchy = ({
  objects,
  selectedObject,
  onSelectObject,
  onDeleteObject,
  onDuplicateObject,
  onToggleVisibility,
  onToggleLock,
  onRenameObject
}: SceneHierarchyProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const startRename = (id: string, currentName: string) => {
    setEditingName(id);
    setTempName(currentName);
  };

  const finishRename = () => {
    if (editingName && tempName.trim()) {
      onRenameObject(editingName, tempName.trim());
    }
    setEditingName(null);
    setTempName('');
  };

  const getObjectName = (obj: any) => {
    return obj.name || `${obj.type}_${obj.id.slice(0, 8)}`;
  };

  const renderObject = (obj: any, depth: number = 0) => {
    const isSelected = selectedObject === obj.id;
    const isExpanded = expandedNodes.has(obj.id);
    const isEditing = editingName === obj.id;
    const hasChildren = obj.children && obj.children.length > 0;

    return (
      <div key={obj.id} className="select-none">
        <div
          className={cn(
            "flex items-center gap-1 py-1 px-2 text-sm hover:bg-menu-hover cursor-pointer",
            isSelected && "bg-primary/20 border-l-2 border-primary",
            depth > 0 && "ml-4"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectObject(obj.id)}
          onDoubleClick={() => startRename(obj.id, getObjectName(obj))}
        >
          {/* Expand/Collapse Icon */}
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
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </Button>
            )}
          </div>

          {/* Object Type Icon */}
          <Layers className="w-4 h-4 text-muted-foreground" />

          {/* Object Name */}
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
              <span className="truncate text-foreground">
                {getObjectName(obj)}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-5 h-5 p-0 hover:bg-menu-hover"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(obj.id);
              }}
            >
              {obj.visible !== false ? (
                <Eye className="w-3 h-3" />
              ) : (
                <EyeOff className="w-3 h-3 text-muted-foreground" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="w-5 h-5 p-0 hover:bg-menu-hover"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(obj.id);
              }}
            >
              {obj.locked ? (
                <Lock className="w-3 h-3 text-muted-foreground" />
              ) : (
                <Unlock className="w-3 h-3" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="w-5 h-5 p-0 hover:bg-menu-hover"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateObject(obj.id);
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="w-5 h-5 p-0 hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteObject(obj.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {obj.children.map((child: any) => renderObject(child, depth + 1))}
          </div>
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
        <div className="max-h-96 overflow-y-auto panel-scroll">
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