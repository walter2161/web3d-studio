import { useEffect, useState, useCallback } from 'react';
import { R3Dialog, R3Button, Row } from './R3Dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Folder, FileText, ChevronLeft, FolderPlus, Trash2, Pencil } from 'lucide-react';

interface FolderRow { id: string; name: string; parent_id: string | null; updated_at: string; }
interface SceneRow { id: string; name: string; folder_id: string | null; updated_at: string; }
type Crumb = { id: string | null; name: string };

interface Props {
  open: boolean;
  mode: 'save' | 'open' | 'export' | 'import';
  onOpenChange: (open: boolean) => void;
  onSave?: (name: string, folderId: string | null) => Promise<any> | any;
  onLoad?: (payload: any, meta?: { id: string; name: string; folderId: string | null }) => void;
  /** For 'import' mode: payload parsed from a local file to upload into the cloud. */
  importPayload?: any;
  /** For 'import' mode: default filename (without extension). */
  importDefaultName?: string;
}

export const CloudSceneDialog = ({ open, mode, onOpenChange, onSave, onLoad, importPayload, importDefaultName }: Props) => {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Home' }]);
  const [selected, setSelected] = useState<{ kind: 'folder' | 'scene'; id: string } | null>(null);
  const [name, setName] = useState('untitled scene');
  const [busy, setBusy] = useState(false);

  const currentFolder = crumbs[crumbs.length - 1].id;

  const refresh = useCallback(async () => {
    const [f, s] = await Promise.all([
      supabase.from('scene_folders').select('id,name,parent_id,updated_at').order('name'),
      supabase.from('scenes').select('id,name,folder_id,updated_at').order('updated_at', { ascending: false }),
    ]);
    if (f.error || s.error) { toast.error('Falha ao listar'); return; }
    setFolders((f.data || []) as FolderRow[]);
    setScenes((s.data || []) as SceneRow[]);
  }, []);

  useEffect(() => { if (open) { refresh(); setSelected(null); if (mode === 'import' && importDefaultName) setName(importDefaultName); } }, [open, refresh, mode, importDefaultName]);

  const childFolders = folders.filter((f) => (f.parent_id ?? null) === currentFolder);
  const childScenes = scenes.filter((s) => (s.folder_id ?? null) === currentFolder);

  const enterFolder = (f: FolderRow) => {
    setCrumbs((c) => [...c, { id: f.id, name: f.name }]);
    setSelected(null);
  };
  const goUp = () => { if (crumbs.length > 1) { setCrumbs((c) => c.slice(0, -1)); setSelected(null); } };
  const goTo = (idx: number) => { setCrumbs((c) => c.slice(0, idx + 1)); setSelected(null); };

  const newFolder = async () => {
    const n = window.prompt('Nome da pasta:', 'Nova pasta');
    if (!n?.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Login requerido'); return; }
    const { error } = await supabase.from('scene_folders').insert({
      user_id: user.id, parent_id: currentFolder, name: n.trim(),
    });
    if (error) { toast.error('Falha ao criar pasta'); return; }
    await refresh();
  };

  const renameItem = async () => {
    if (!selected) return;
    const table = selected.kind === 'folder' ? 'scene_folders' : 'scenes';
    const item = selected.kind === 'folder'
      ? folders.find((f) => f.id === selected.id)
      : scenes.find((s) => s.id === selected.id);
    if (!item) return;
    const n = window.prompt('Novo nome:', item.name);
    if (!n?.trim()) return;
    const { error } = await supabase.from(table).update({ name: n.trim() }).eq('id', selected.id);
    if (error) { toast.error('Falha ao renomear'); return; }
    await refresh();
  };

  const deleteItem = async () => {
    if (!selected) return;
    if (!window.confirm('Excluir item selecionado?')) return;
    const table = selected.kind === 'folder' ? 'scene_folders' : 'scenes';
    const { error } = await supabase.from(table).delete().eq('id', selected.id);
    if (error) { toast.error('Falha ao excluir'); return; }
    setSelected(null);
    await refresh();
  };

  const doSave = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    setBusy(true);
    try { await onSave?.(name.trim(), currentFolder); toast.success('Cena salva'); onOpenChange(false); }
    catch (e: any) { toast.error(e?.message || 'Falha ao salvar'); }
    finally { setBusy(false); }
  };

  const doOpen = async (id?: string) => {
    const targetId = id ?? (selected?.kind === 'scene' ? selected.id : null);
    if (!targetId) return;
    setBusy(true);
    const { data, error } = await supabase.from('scenes').select('data,name,folder_id').eq('id', targetId).maybeSingle();
    setBusy(false);
    if (error || !data) { toast.error('Falha ao abrir cena'); return; }
    onLoad?.(data.data, { id: targetId, name: (data as any).name, folderId: (data as any).folder_id ?? null });
    toast.success('Cena carregada');
    onOpenChange(false);
  };

  const doExport = async (id?: string) => {
    const targetId = id ?? (selected?.kind === 'scene' ? selected.id : null);
    if (!targetId) return;
    setBusy(true);
    const { data, error } = await supabase.from('scenes').select('name, data').eq('id', targetId).maybeSingle();
    setBusy(false);
    if (error || !data) { toast.error('Falha ao exportar cena'); return; }
    const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${data.name || 'scene'}.3dsled.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success('Exportado');
    onOpenChange(false);
  };

  const doImport = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    if (!importPayload) { toast.error('Nenhum arquivo para importar'); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Login requerido');
      const { error } = await supabase.from('scenes').insert({
        user_id: user.id, name: name.trim(), folder_id: currentFolder, data: importPayload,
      });
      if (error) throw error;
      toast.success('Importado para a nuvem');
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message || 'Falha ao importar'); }
    finally { setBusy(false); }
  };

  const title =
    mode === 'save' ? 'Save Cloud' :
    mode === 'open' ? 'Open Cloud' :
    mode === 'export' ? 'Export Cloud' : 'Import Cloud';

  return (
    <R3Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      width={520}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-1">
        <button
          onClick={goUp}
          disabled={crumbs.length <= 1}
          className="bevel-raised bg-win-face h-[20px] px-1 text-[11px] disabled:opacity-40"
          title="Voltar"
        >
          <ChevronLeft size={12} />
        </button>
        <button onClick={newFolder} className="bevel-raised bg-win-face h-[20px] px-1 text-[11px]" title="Nova pasta">
          <FolderPlus size={12} />
        </button>
        <button
          onClick={renameItem}
          disabled={!selected}
          className="bevel-raised bg-win-face h-[20px] px-1 text-[11px] disabled:opacity-40"
          title="Renomear"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={deleteItem}
          disabled={!selected}
          className="bevel-raised bg-win-face h-[20px] px-1 text-[11px] disabled:opacity-40"
          title="Excluir"
        >
          <Trash2 size={12} />
        </button>
        {/* Breadcrumbs */}
        <div className="bevel-inset bg-white flex-1 h-[20px] flex items-center px-1 text-[11px] overflow-x-auto whitespace-nowrap">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && <span className="mx-1 opacity-60">/</span>}
              <button
                onClick={() => goTo(i)}
                className="hover:underline"
              >{c.name}</button>
            </span>
          ))}
        </div>
      </div>

      {/* Explorer list */}
      <div className="bevel-inset bg-white" style={{ height: 240, overflowY: 'auto' }}>
        {childFolders.length === 0 && childScenes.length === 0 && (
          <div className="text-[11px] text-win-text-disabled p-2">Pasta vazia.</div>
        )}
        {childFolders.map((f) => {
          const isSel = selected?.kind === 'folder' && selected.id === f.id;
          return (
            <div
              key={f.id}
              onClick={() => setSelected({ kind: 'folder', id: f.id })}
              onDoubleClick={() => enterFolder(f)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[11px] cursor-default ${isSel ? 'bg-menu-hover text-menu-hover-fg' : ''}`}
            >
              <Folder size={12} className="text-yellow-600" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="opacity-60">pasta</span>
            </div>
          );
        })}
        {childScenes.map((s) => {
          const isSel = selected?.kind === 'scene' && selected.id === s.id;
          return (
            <div
              key={s.id}
              onClick={() => { setSelected({ kind: 'scene', id: s.id }); if (mode === 'save') setName(s.name); }}
              onDoubleClick={() => {
                if (mode === 'open') doOpen(s.id);
                else if (mode === 'export') doExport(s.id);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 text-[11px] cursor-default ${isSel ? 'bg-menu-hover text-menu-hover-fg' : ''}`}
            >
              <FileText size={12} className="text-blue-700" />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="opacity-60">{new Date(s.updated_at).toLocaleDateString()}</span>
            </div>
          );
        })}
      </div>

      {(mode === 'save' || mode === 'import') && (
        <Row label="Nome:" labelWidth={50}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]"
            style={{ width: 380 }}
          />
        </Row>
      )}

      <div className="flex justify-end gap-1 mt-2">
        {mode === 'save' && <R3Button width={80} onClick={doSave} disabled={busy}>Salvar</R3Button>}
        {mode === 'open' && <R3Button width={80} onClick={() => doOpen()} disabled={busy || selected?.kind !== 'scene'}>Abrir</R3Button>}
        {mode === 'export' && <R3Button width={90} onClick={() => doExport()} disabled={busy || selected?.kind !== 'scene'}>Exportar</R3Button>}
        {mode === 'import' && <R3Button width={90} onClick={doImport} disabled={busy || !importPayload}>Importar aqui</R3Button>}
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
