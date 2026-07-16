import { useEffect, useState } from 'react';
import { R3Dialog, R3Button, Row } from './R3Dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CloudSceneRow {
  id: string;
  name: string;
  updated_at: string;
}

interface Props {
  open: boolean;
  mode: 'save' | 'open';
  onOpenChange: (open: boolean) => void;
  onSave?: (name: string) => Promise<any> | any;             // called for save mode; parent provides payload
  onLoad?: (payload: any) => void;                            // called with loaded scene data
}

export const CloudSceneDialog = ({ open, mode, onOpenChange, onSave, onLoad }: Props) => {
  const [rows, setRows] = useState<CloudSceneRow[]>([]);
  const [name, setName] = useState('untitled scene');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from('scenes')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false });
      if (error) { toast.error('Falha ao listar cenas'); return; }
      setRows(data || []);
    })();
  }, [open]);

  const doSave = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    setBusy(true);
    try { await onSave?.(name.trim()); toast.success('Cena salva na nuvem'); onOpenChange(false); }
    catch (e: any) { toast.error(e?.message || 'Falha ao salvar'); }
    finally { setBusy(false); }
  };

  const doOpen = async () => {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.from('scenes').select('data').eq('id', selected).maybeSingle();
    setBusy(false);
    if (error || !data) { toast.error('Falha ao abrir cena'); return; }
    onLoad?.(data.data);
    toast.success('Cena carregada');
    onOpenChange(false);
  };

  const doDelete = async (id: string) => {
    const { error } = await supabase.from('scenes').delete().eq('id', id);
    if (error) { toast.error('Falha ao excluir'); return; }
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast.success('Excluído');
  };

  return (
    <R3Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={mode === 'save' ? 'Save Cloud' : 'Open Cloud'}
      width={460}
    >
      {mode === 'save' && (
        <Row label="Nome:" labelWidth={70}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]"
          />
        </Row>
      )}

      <div className="bevel-inset bg-white mt-2" style={{ maxHeight: 240, overflowY: 'auto' }}>
        {rows.length === 0 && (
          <div className="text-[11px] text-win-text-disabled p-2">Nenhuma cena salva na nuvem.</div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            onClick={() => setSelected(r.id)}
            onDoubleClick={() => { setSelected(r.id); if (mode === 'open') doOpen(); }}
            className={`flex items-center justify-between px-2 py-0.5 text-[11px] cursor-default ${
              selected === r.id ? 'bg-menu-hover text-menu-hover-fg' : ''
            }`}
          >
            <span className="truncate">{r.name}</span>
            <span className="flex items-center gap-2">
              <span className="opacity-70">{new Date(r.updated_at).toLocaleString()}</span>
              <button
                onClick={(e) => { e.stopPropagation(); doDelete(r.id); }}
                className="bevel-raised px-1 text-[10px]"
              >
                del
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-1 mt-2">
        {mode === 'save' ? (
          <R3Button width={80} onClick={doSave} disabled={busy}>Salvar</R3Button>
        ) : (
          <R3Button width={80} onClick={doOpen} disabled={busy || !selected}>Abrir</R3Button>
        )}
        <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
      </div>
    </R3Dialog>
  );
};
